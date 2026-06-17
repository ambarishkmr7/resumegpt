import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.schemas import (
    ForgotPassword,
    ResetPassword,
    Token,
    UserCreate,
    UserLogin,
    UserOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=Token, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # OAuth2PasswordRequestForm uses 'username' field; we treat it as email.
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token(user.id)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login-json", response_model=Token)
@limiter.limit("10/minute")
def login_json(request: Request, payload: UserLogin, db: Session = Depends(get_db)):
    """Alternative JSON-based login (same as /login but accepts JSON body)."""
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token(user.id)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/logout")
def logout(_: User = Depends(get_current_user)):
    # JWTs are stateless: the client discards the token. For server-side
    # revocation you would maintain a token blacklist / use short-lived tokens
    # plus refresh tokens. Endpoint exists so the frontend has a clean hook.
    return {"detail": "Logged out"}


@router.post("/forgot-password")
def forgot_password(payload: ForgotPassword, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    # Always return 200 to avoid leaking which emails are registered.
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires = datetime.utcnow() + timedelta(
            minutes=settings.RESET_TOKEN_EXPIRE_MINUTES
        )
        db.commit()
        # TODO: send `token` via email (SendGrid/SES). For dev we return it.
        reset_link = f"{settings.FRONTEND_ORIGIN}/reset-password?token={token}"
        return {"detail": "If the email exists, a reset link was sent", "dev_reset_link": reset_link}
    return {"detail": "If the email exists, a reset link was sent"}


@router.post("/reset-password")
def reset_password(payload: ResetPassword, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == payload.token).first()
    if (
        not user
        or not user.reset_token_expires
        or user.reset_token_expires < datetime.utcnow()
    ):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()
    return {"detail": "Password updated successfully"}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/google", response_model=Token)
def google_login(payload: dict, db: Session = Depends(get_db)):
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

        access_token = create_access_token(user.id)
        return Token(access_token=access_token, user=UserOut.model_validate(user))

    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")
    except ImportError:
        raise HTTPException(status_code=503, detail="Google auth library not installed")


@router.post("/facebook", response_model=Token)
def facebook_login(payload: dict, db: Session = Depends(get_db)):
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

        token = create_access_token(user.id)
        return Token(access_token=token, user=UserOut.model_validate(user))

    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Facebook API error: {str(e)}")
