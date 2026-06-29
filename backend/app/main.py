import os
import logging

APP_DIR = os.path.dirname(__file__)
FRONTEND_DIST = os.path.normpath(os.path.join(APP_DIR, "..", "..", "frontend", "dist"))

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.rate_limit import limiter
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
from app.agent.router import router as agent_router
from app.profile.router import router as profile_router

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
    logger.info("resumes-gpt API starting up — log level: %s", settings.LOG_LEVEL)

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
    logger.info("resumes-gpt API shutting down")


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


app = FastAPI(title="resumes-gpt API", version="1.0.0", lifespan=lifespan)

# Rate limiting (slowapi) — limiter is shared with the auth router via app.core.rate_limit
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
app.include_router(agent_router)
app.include_router(profile_router)


@app.get("/api/health")
def health():
    db_url = settings.database_url
    db_type = "sqlite" if "sqlite" in db_url else "mysql" if "mysql" in db_url else "postgresql" if "postgres" in db_url else "unknown"
    return {"status": "ok", "ai_enabled": bool(settings.ANTHROPIC_API_KEY), "db": db_type}


# ── Serve React build (must be last — catches everything not matched above) ────
@app.get("/{full_path:path}", include_in_schema=False)
async def _spa_fallback(full_path: str):
    if not os.path.isdir(FRONTEND_DIST):
        raise HTTPException(status_code=404, detail="Frontend build not found. Run: cd frontend && npm run build")
    # Serve an exact file if it exists (JS, CSS, favicon, robots.txt, etc.)
    candidate = os.path.normpath(os.path.join(FRONTEND_DIST, full_path))
    # Guard against path traversal: candidate must stay inside FRONTEND_DIST.
    if full_path and (candidate == FRONTEND_DIST or candidate.startswith(FRONTEND_DIST + os.sep)) and os.path.isfile(candidate):
        return FileResponse(candidate)
    # Everything else → index.html (React Router handles the URL client-side)
    index = os.path.join(FRONTEND_DIST, "index.html")
    if not os.path.isfile(index):
        raise HTTPException(status_code=404, detail="index.html not found. Run: cd frontend && npm run build")
    return FileResponse(index)