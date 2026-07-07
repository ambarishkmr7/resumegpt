import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database import get_db
from app.models import User

logger = logging.getLogger(__name__)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user_id = decode_token(token)
    if not user_id:
        logger.debug("Token decode failed — invalid or expired token")
        raise credentials_exc
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        logger.warning("Token valid but user not found (user_id=%s)", user_id)
        raise credentials_exc
    # NOTE: LLM-usage attribution (which user triggered a given AI call) is
    # NOT set here — it's set in app.main.LlmUsageContextMiddleware instead.
    # FastAPI resolves sync dependencies (like this one) and sync endpoint
    # functions via separate run_in_threadpool() calls, each taking its own
    # contextvars snapshot, so a contextvar set inside this function would
    # never be visible to the endpoint or to app/ai/services.py. See
    # app/core/llm_context.py for details.
    return user