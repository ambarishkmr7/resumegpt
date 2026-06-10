import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import ContactMessage

router = APIRouter(prefix="/api/public", tags=["public"])

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


# ── Schemas ───────────────────────────────────────────────────────────────────

class ContactIn(BaseModel):
    name: str
    email: str
    subject: str = ""
    message: str
    # Honeypot field — bots fill this; humans leave it blank
    website: str = ""

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v):
        v = v.strip()
        if not v or len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        if len(v) > 100:
            raise ValueError("Name too long")
        return v

    @field_validator("email")
    @classmethod
    def email_valid(cls, v):
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address")
        return v

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v):
        v = v.strip()
        if not v or len(v) < 10:
            raise ValueError("Message must be at least 10 characters")
        if len(v) > 5000:
            raise ValueError("Message too long (max 5000 chars)")
        return v

    @field_validator("subject")
    @classmethod
    def subject_len(cls, v):
        if len(v) > 200:
            raise ValueError("Subject too long")
        return v.strip()


class FeedbackIn(BaseModel):
    name: str
    email: str
    message: str
    rating: int = 5
    website: str = ""   # honeypot

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v):
        v = v.strip()
        if not v or len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v

    @field_validator("email")
    @classmethod
    def email_valid(cls, v):
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address")
        return v

    @field_validator("rating")
    @classmethod
    def rating_range(cls, v):
        if v not in range(1, 6):
            raise ValueError("Rating must be 1–5")
        return v

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v):
        v = v.strip()
        if not v or len(v) < 5:
            raise ValueError("Feedback must be at least 5 characters")
        if len(v) > 3000:
            raise ValueError("Feedback too long (max 3000 chars)")
        return v


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/contact")
def submit_contact(payload: ContactIn, request: Request, db: Session = Depends(get_db)):
    # Honeypot check — if 'website' field is filled, silently discard
    if payload.website.strip():
        return {"ok": True, "message": "Thank you! We'll be in touch."}

    msg = ContactMessage(
        name=payload.name,
        email=payload.email,
        subject=payload.subject or "Contact Form",
        message=payload.message,
        type="contact",
        ip_address=_get_ip(request),
    )
    db.add(msg)
    db.commit()
    return {"ok": True, "message": "Thank you! We'll get back to you within 24 hours."}


@router.post("/feedback")
def submit_feedback(payload: FeedbackIn, request: Request, db: Session = Depends(get_db)):
    # Honeypot check
    if payload.website.strip():
        return {"ok": True, "message": "Thanks for your feedback!"}

    msg = ContactMessage(
        name=payload.name,
        email=payload.email,
        subject="Feedback",
        message=payload.message,
        type="feedback",
        rating=payload.rating,
        ip_address=_get_ip(request),
    )
    db.add(msg)
    db.commit()
    return {"ok": True, "message": "Thank you for your feedback! It helps us improve."}
