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
from app.authors.router import router as authors_router

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


def _seed_authors():
    """Seed sample editorial authors with logins if the table is empty.

    Mirrors authors_schema.sql so the 'Our Authors' section and author login work
    out of the box. Default password for all seeded authors: 'Author@123'
    (change it after first login). Override the default via AUTHOR_SEED_PASSWORD.
    """
    from app.models import Author
    from app.core.security import hash_password
    import os
    db = SessionLocal()
    try:
        if db.query(Author).first():
            return
        pw = os.getenv("AUTHOR_SEED_PASSWORD", "Author@123")
        h = hash_password(pw)
        seed = [
            ("ananya-iyer", "Ananya Iyer", "Lead Career Editor · CPRW",
             "Ananya has reviewed over 8,000 resumes and coached job seekers from freshers to "
             "senior leaders. She specialises in ATS optimisation and turning achievements into "
             "measurable, recruiter-friendly impact.", "CPRW · 9 yrs", "ananya@resumes-gpt.com", 10),
            ("rohan-mehta", "Rohan Mehta", "Technical Hiring Advisor · ex-Engineering Manager",
             "Rohan spent 12 years building and hiring engineering teams. He advises on technical "
             "resumes, system-design interviews, and what hiring managers look for beyond keywords.",
             "ex-EM · 12 yrs", "rohan@resumes-gpt.com", 20),
            ("priya-nair", "Priya Nair", "HR & Talent Acquisition Specialist",
             "Priya has led talent acquisition for high-growth startups and enterprises. She writes "
             "on interview preparation, salary negotiation, and modern AI-assisted hiring.",
             "TA Lead · 10 yrs", "priya@resumes-gpt.com", 30),
        ]
        for slug, name, role, bio, creds, email, order in seed:
            db.add(Author(slug=slug, name=name, role=role, bio=bio, credentials=creds,
                          email=email, hashed_password=h, is_active=True, display_order=order))
        db.commit()
        logger.info("Seeded %d editorial authors (default password: Author@123)", len(seed))
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

    try:
        _seed_authors()
    except Exception as e:
        logger.warning("Author seed skipped: %s", e)

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


# ── LLM usage attribution middleware ────────────────────────────────────────────
# Tags every request with the caller's user id (from the JWT) for LLM usage
# logging (see app/core/llm_context.py, app/ai/usage_tracker.py).
#
# This has to happen in real ASGI middleware — NOT in the get_current_user
# dependency — because FastAPI resolves each sync dependency and each sync
# endpoint via a *separate* run_in_threadpool() call, each of which takes its
# own contextvars.copy_context() snapshot of the request's context at the
# moment it's dispatched. A contextvar set *inside* one of those threadpool
# calls never propagates back out to the caller, so a set_user_id() call
# inside get_current_user was silently discarded — hence usage rows showing
# up as "(unattributed)". Setting it here, before call_next() forks off to
# routing/dependencies/the endpoint, means every later copy_context() picks
# up the value.
class LlmUsageContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        from app.core.llm_context import set_user_id
        from app.core.security import decode_token

        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            try:
                user_id = decode_token(auth[7:].strip())
                if user_id:
                    set_user_id(user_id)
            except Exception:
                pass
        return await call_next(request)


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
app.add_middleware(LlmUsageContextMiddleware)
app.include_router(auth_router)
app.include_router(resumes_router)
app.include_router(templates_router)
app.include_router(sub_router)
app.include_router(admin_router)
app.include_router(public_router)
app.include_router(agent_router)
app.include_router(profile_router)
app.include_router(authors_router)


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
    inside = candidate == FRONTEND_DIST or candidate.startswith(FRONTEND_DIST + os.sep)
    if full_path and inside:
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        # Prerendered routes are written as <route>/index.html — serve those so
        # crawlers and URL classifiers get static HTML with real meta + JSON-LD.
        route_index = os.path.join(candidate, "index.html")
        if os.path.isfile(route_index):
            return FileResponse(route_index)
    # Everything else → index.html (React Router handles the URL client-side)
    index = os.path.join(FRONTEND_DIST, "index.html")
    if not os.path.isfile(index):
        raise HTTPException(status_code=404, detail="index.html not found. Run: cd frontend && npm run build")
    return FileResponse(index)