from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from app.auth.router import router as auth_router
from app.config import get_settings
from app.database import Base, engine, SessionLocal
from app.resumes.router import router as resumes_router
from app.templates.router import router as templates_router
from app.subscription.router import router as sub_router
from app.admin.router import router as admin_router
from app.public.router import router as public_router

settings = get_settings()


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
            print(f"[SEED] Admin user created: {settings.ADMIN_EMAIL}")
        elif not existing.is_admin:
            existing.is_admin = True
            db.commit()
            print(f"[SEED] User {settings.ADMIN_EMAIL} promoted to admin")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables + seed admin
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        err = str(e)
        if "DatatypeMismatch" in err or "incompatible types" in err:
            print("\n" + "=" * 70)
            print("ERROR: Database tables exist with incompatible column types.")
            print("This happens when another app created tables with INTEGER ids")
            print("but ResumeGPT uses VARCHAR ids.")
            print("")
            print("FIX: Run the schema.sql script to recreate tables correctly:")
            print("  psql -h localhost -p 5432 -U admin -d stocklens_db -f schema.sql")
            print("=" * 70 + "\n")
        else:
            print(f"\n[STARTUP] Table creation failed: {err}")
            print("If using PostgreSQL, run: psql ... -f schema.sql\n")
        # Don't crash — let the app start so the health endpoint works
    try:
        _seed_admin()
    except Exception as e:
        print(f"[STARTUP] Admin seed skipped: {e}")
    yield
    # Shutdown: nothing needed


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
