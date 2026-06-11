import os

APP_DIR = os.path.dirname(__file__)

print("APP_DIR =", APP_DIR)
print("APP CONTENTS =", os.listdir(APP_DIR))

public_dir = os.path.join(APP_DIR, "public")

print("PUBLIC EXISTS =", os.path.exists(public_dir))

if os.path.exists(public_dir):
    print("PUBLIC CONTENTS =", os.listdir(public_dir))
    
import logging

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from app.auth.router import router as auth_router
from app.config import get_settings
from app.core.logging import setup_logging
from app.database import Base, engine, SessionLocal
from app.resumes.router import router as resumes_router
from app.templates.router import router as templates_router
from app.subscription.router import router as sub_router
from app.admin.router import router as admin_router
from app.public_routes.router import router as public_router

settings = get_settings()
logger = logging.getLogger(__name__)


def _seed_admin():
    """Auto-create admin user from ADMIN_EMAIL/ADMIN_PASSWORD env vars."""
    if not settings.ADMIN_EMAIL or not settings.ADMIN_PASSWORD:
        return
    from app.models import User
    from app.core.security import hash_password
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
        if not existing:
            user = User(
                email=settings.ADMIN_EMAIL,
                full_name="Admin",
                hashed_password=hash_password(settings.ADMIN_PASSWORD),
                is_admin=True,
            )
            db.add(user)
            db.commit()
            logger.info("Admin user created: %s", settings.ADMIN_EMAIL)
        elif not existing.is_admin:
            existing.is_admin = True
            db.commit()
            logger.info("User promoted to admin: %s", settings.ADMIN_EMAIL)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_logging(settings.LOG_LEVEL)
    logger.info("ResumeGPT API starting up — log level: %s", settings.LOG_LEVEL)

    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created/verified successfully")
    except Exception as e:
        err = str(e)
        if "DatatypeMismatch" in err or "incompatible types" in err:
            logger.error(
                "Database tables exist with incompatible column types. "
                "Run schema.sql to recreate tables correctly. Error: %s", err
            )
        else:
            logger.error("Table creation failed: %s", err)
        # Don't crash — let the app start so the health endpoint works

    try:
        _seed_admin()
    except Exception as e:
        logger.warning("Admin seed skipped: %s", e)

    logger.info("Startup complete — all routers mounted")
    yield
    # Shutdown
    logger.info("ResumeGPT API shutting down")


# ── Security headers middleware ────────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app = FastAPI(title="ResumeGPT API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN, "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.include_router(auth_router)
app.include_router(resumes_router)
app.include_router(templates_router)
app.include_router(sub_router)
app.include_router(admin_router)
app.include_router(public_router)


@app.get("/api/health")
def health():
    db_url = settings.database_url
    db_type = "sqlite" if "sqlite" in db_url else "mysql" if "mysql" in db_url else "postgresql" if "postgres" in db_url else "unknown"
    return {"status": "ok", "ai_enabled": bool(settings.ANTHROPIC_API_KEY), "db": db_type}