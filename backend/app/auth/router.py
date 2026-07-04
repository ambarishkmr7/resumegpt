import logging
import secrets
import uuid as _uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.schemas import (
    ChangePassword,
    ForgotPassword,
    ResetPassword,
    Token,
    UserCreate,
    UserLogin,
    UserOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=Token, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        logger.warning("Registration failed — email already registered: %s", payload.email)
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id))
    logger.info("New user registered: %s (id=%s)", user.email, user.id)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # OAuth2PasswordRequestForm uses 'username' field; we treat it as email.
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        logger.warning("Failed login attempt for email: %s", form.username)
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token(user.id)
    logger.info("User logged in: %s", user.email)
    return Token(access_token=token, user=UserOut.model_validate(user))


class AdminRegister(UserCreate):
    signup_code: str | None = None


@router.post("/admin-register", response_model=Token, status_code=201)
@limiter.limit("5/minute")
def admin_register(request: Request, payload: AdminRegister, db: Session = Depends(get_db)):
    """Create an admin user (used by the /sys-admin page, role=admin).

    Guarded: if ADMIN_SIGNUP_CODE is set, it must match. If it's not set,
    registration is allowed only while no admin exists yet (first-admin bootstrap)
    to avoid leaving an open door to admin access.
    """
    admins_exist = db.query(User).filter(User.is_admin == True).first() is not None  # noqa: E712
    if settings.ADMIN_SIGNUP_CODE:
        if (payload.signup_code or "") != settings.ADMIN_SIGNUP_CODE:
            raise HTTPException(status_code=403, detail="Invalid admin signup code")
    elif admins_exist:
        raise HTTPException(
            status_code=403,
            detail="Admin registration is closed. Set ADMIN_SIGNUP_CODE to allow new admins.",
        )
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    logger.info("New admin registered: %s (id=%s)", user.email, user.id)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login-json", response_model=Token)
@limiter.limit("10/minute")
def login_json(request: Request, payload: UserLogin, db: Session = Depends(get_db)):
    """Alternative JSON-based login (same as /login but accepts JSON body)."""
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        logger.warning("Failed JSON login attempt for email: %s", payload.email)
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token(user.id)
    logger.info("User logged in (JSON): %s", user.email)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/logout")
def logout(user: User = Depends(get_current_user)):
    # JWTs are stateless: the client discards the token. For server-side
    # revocation you would maintain a token blacklist / use short-lived tokens
    # plus refresh tokens. Endpoint exists so the frontend has a clean hook.
    logger.info("User logged out: %s", user.email)
    return {"detail": "Logged out"}


@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, payload: ForgotPassword, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    # Always return the same response to avoid leaking which emails are registered.
    generic = {"detail": "If the email exists, a reset link was sent"}
    if not user:
        logger.info("Password reset requested for unknown email: %s", payload.email)
        return generic

    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires = datetime.utcnow() + timedelta(
        minutes=settings.RESET_TOKEN_EXPIRE_MINUTES
    )
    db.commit()
    logger.info("Password reset requested for: %s", user.email)

    reset_link = f"{settings.FRONTEND_ORIGIN}/reset-password?token={token}"

    # Deliver the link by email. The raw link/token is NEVER returned in the
    # API response in production — doing so would let anyone reset any account
    # just by reading the response (account takeover).
    emailed = False
    try:
        from app.email_service import send_reset_email
        send_reset_email(user.email, reset_link, settings)
        emailed = True
    except Exception as e:
        # Don't reveal email-existence via error; just log it.
        logger.error("Failed to send reset email to %s: %s", user.email, e)

    if not settings.is_production:
        # Dev convenience only: surface the link so you can test without SMTP.
        return {**generic, "emailed": emailed, "dev_reset_link": reset_link}
    return generic


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, payload: ResetPassword, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == payload.token).first()
    if (
        not user
        or not user.reset_token_expires
        or user.reset_token_expires < datetime.utcnow()
    ):
        logger.warning("Invalid or expired reset token used")
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()
    return {"detail": "Password updated successfully"}


@router.post("/guest", response_model=Token, status_code=201)
@limiter.limit("10/minute")
def guest_register(request: Request, db: Session = Depends(get_db)):
    """Create a temporary guest account for anonymous resume building.
    The guest can later claim the account by registering with a real email."""
    guest_uid = _uuid.uuid4().hex[:16]
    email = f"guest_{guest_uid}@guest.resumesgpt.in"
    user = User(
        email=email,
        full_name="Guest",
        hashed_password=hash_password(_uuid.uuid4().hex),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id))
    logger.info("Guest user created: %s", email)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/claim-guest", response_model=Token)
def claim_guest(
    payload: UserCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upgrade a guest account to a real account. Preserves all resumes."""
    if not user.email.endswith("@guest.resumesgpt.in"):
        raise HTTPException(status_code=400, detail="Account is not a guest account")
    if db.query(User).filter(User.email == payload.email, User.id != user.id).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user.email = payload.email
    user.full_name = payload.full_name or user.full_name
    user.hashed_password = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id))
    logger.info("Guest account claimed: %s -> %s", f"guest_*@guest.resumesgpt.in", payload.email)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/change-password")
def change_password(
    payload: ChangePassword,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    logger.info("Password changed for user: %s", user.email)
    return {"detail": "Password changed successfully"}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/google", response_model=Token)
@limiter.limit("10/minute")
def google_login(request: Request, payload: dict, db: Session = Depends(get_db)):
    """Login/register with Google. Frontend sends the Google ID token."""
    token = payload.get("credential") or payload.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="Missing Google credential token")

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        client_id = settings.GOOGLE_CLIENT_ID
        if not client_id:
            raise HTTPException(status_code=503, detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID in .env")

        # Verify the Google ID token
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)

        email = idinfo.get("email")
        name = idinfo.get("name", "")
        if not email:
            raise HTTPException(status_code=400, detail="Could not get email from Google account")

        # Find or create user
        user = db.query(User).filter(User.email == email).first()
        if not user:
            # Auto-register: generate a random password (user logs in via Google)
            import secrets
            user = User(
                email=email,
                full_name=name,
                hashed_password=hash_password(secrets.token_urlsafe(32)),
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info("New user auto-registered via Google: %s", email)
        logger.info("Google login: %s", email)

        access_token = create_access_token(user.id)
        return Token(access_token=access_token, user=UserOut.model_validate(user))

    except ValueError as e:
        logger.warning("Invalid Google token: %s", e)
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")
    except ImportError:
        logger.error("Google auth library not installed")
        raise HTTPException(status_code=503, detail="Google auth library not installed")


@router.post("/facebook", response_model=Token)
@limiter.limit("10/minute")
def facebook_login(request: Request, payload: dict, db: Session = Depends(get_db)):
    """Login/register with Facebook. Frontend sends the FB access token."""
    access_token = payload.get("accessToken") or payload.get("token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Missing Facebook access token")

    if not settings.FACEBOOK_APP_ID:
        raise HTTPException(status_code=503, detail="Facebook OAuth not configured. Set FACEBOOK_APP_ID in .env")

    try:
        import httpx

        # Verify token and get user info from Facebook Graph API
        resp = httpx.get(
            "https://graph.facebook.com/me",
            params={"fields": "id,name,email", "access_token": access_token},
        )
        if resp.status_code != 200:
            logger.warning("Invalid Facebook token received")
            raise HTTPException(status_code=401, detail="Invalid Facebook token")

        fb_data = resp.json()
        email = fb_data.get("email")
        name = fb_data.get("name", "")

        if not email:
            raise HTTPException(
                status_code=400,
                detail="Could not get email from Facebook. Make sure email permission is granted."
            )

        # Find or create user
        user = db.query(User).filter(User.email == email).first()
        if not user:
            import secrets
            user = User(
                email=email,
                full_name=name,
                hashed_password=hash_password(secrets.token_urlsafe(32)),
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info("New user auto-registered via Facebook: %s", email)

        logger.info("Facebook login: %s", email)
        token = create_access_token(user.id)
        return Token(access_token=token, user=UserOut.model_validate(user))

    except httpx.HTTPError as e:
        logger.error("Facebook API error: %s", e)
        raise HTTPException(status_code=502, detail=f"Facebook API error: {str(e)}")
