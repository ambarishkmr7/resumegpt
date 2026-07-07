import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String, Text, JSON, Boolean
from sqlalchemy.orm import relationship

from app.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    reset_token = Column(String, nullable=True, index=True)
    reset_token_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resumes = relationship("Resume", back_populates="owner", cascade="all, delete-orphan")
    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")


class Resume(Base):
    __tablename__ = "resumes"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, default="Untitled Resume")
    template_id = Column(String, default="classic")
    content = Column(JSON, nullable=False, default=dict)
    ats_score = Column(Integer, nullable=True)
    original_filename = Column(String, nullable=True)
    storage_key = Column(String, nullable=True)   # S3 object key or local relative path
    career_analysis = Column(JSON, nullable=True)  # Cached career analysis result
    career_roadmap = Column(JSON, nullable=True)   # Cached career roadmap result
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    owner = relationship("User", back_populates="resumes")


class Subscription(Base):
    __tablename__ = "subscriptions"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    plan = Column(String, default="elite")
    status = Column(String, default="active")
    amount = Column(Integer, default=1999)
    payment_id = Column(String, nullable=True)
    order_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Payment(Base):
    __tablename__ = "payments"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    razorpay_order_id = Column(String, nullable=True, index=True)
    razorpay_payment_id = Column(String, nullable=True, index=True)
    razorpay_signature = Column(String, nullable=True)
    plan = Column(String, default="elite")
    amount = Column(Integer, default=299)
    currency = Column(String, default="INR")
    status = Column(String, default="created")
    error_message = Column(Text, nullable=True)
    refund_id = Column(String, nullable=True)
    refund_amount = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Author(Base):
    """An editorial author who can log in and publish content shown in the
    'Our Authors' (editorial-team) section."""
    __tablename__ = "authors"
    id = Column(String, primary_key=True, default=_uuid)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=True)            # e.g. "Certified Resume Writer (CPRW)"
    bio = Column(Text, nullable=True)
    credentials = Column(String, nullable=True)     # e.g. "CPRW · 8 yrs"
    avatar_url = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)  # login id
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    display_order = Column(Integer, default=100)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    posts = relationship("AuthorPost", back_populates="author", cascade="all, delete-orphan")


class AuthorPost(Base):
    """Content posted by an author, displayed under their card in the editorial-team page."""
    __tablename__ = "author_posts"
    id = Column(String, primary_key=True, default=_uuid)
    author_id = Column(String, ForeignKey("authors.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    slug = Column(String, index=True, nullable=False)
    excerpt = Column(String, nullable=True)
    content = Column(Text, nullable=False, default="")
    status = Column(String, default="published")   # draft | published
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)
    author = relationship("Author", back_populates="posts")


class CmsPage(Base):
    __tablename__ = "cms_pages"
    id = Column(String, primary_key=True, default=_uuid)
    slug = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, default="")
    icon = Column(String, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class VisitorLog(Base):
    __tablename__ = "visitor_logs"
    id = Column(String, primary_key=True, default=_uuid)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class OtpVerification(Base):
    __tablename__ = "otp_verifications"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    mobile = Column(String, nullable=False)
    otp_code = Column(String, nullable=False)
    verified = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)


class UserProfile(Base):
    __tablename__ = "user_profiles"
    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    personal = Column(JSON, nullable=False, default=dict)
    education = Column(JSON, nullable=False, default=list)
    experience = Column(JSON, nullable=False, default=list)
    skills = Column(JSON, nullable=False, default=list)
    preferences = Column(JSON, nullable=False, default=dict)
    profile_photo_key = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", back_populates="profile")
    created_at = Column(DateTime, default=datetime.utcnow)


class InterviewSession(Base):
    """A recorded live audio mock-interview session (Gemini Live).

    Stores the transcript, the AI-generated scored report, session metadata, and
    a reference to the recorded audio (kept in StorageService) so the user can
    re-read and listen back later.
    """
    __tablename__ = "interview_sessions"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    resume_id = Column(String, ForeignKey("resumes.id"), nullable=False, index=True)
    resume_title = Column(String, nullable=True)     # snapshot of the resume title
    model = Column(String, nullable=True)            # e.g. gemini-3.1-flash-live-preview
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    transcript = Column(JSON, nullable=True)         # list of {role, text}
    report = Column(JSON, nullable=True)             # scored feedback report
    audio_key = Column(String, nullable=True)        # StorageService key (filled after upload)
    audio_mime = Column(String, nullable=True)       # e.g. audio/webm
    created_at = Column(DateTime, default=datetime.utcnow)


class LlmUsageLog(Base):
    """One row per LLM API call — full token trace + computed cost.

    Powers the admin "LLM Usage" dashboard: per-user usage/cost, breakdowns
    by purpose (which feature triggered the call) and modality (text/image/
    audio/video/document — since each is billed at a different rate), and
    a raw call log for auditing. See app/ai/usage_tracker.py for how rows
    here are written and priced, and app/config.py for the per-modality
    price-per-1M-tokens environment variables.
    """
    __tablename__ = "llm_usage_logs"
    id = Column(String(64), primary_key=True, default=_uuid)
    user_id = Column(String(64), ForeignKey("users.id"), nullable=True, index=True)

    # What the call was for, e.g. "resume_parsing", "cover_letter",
    # "mock_interview_live". Free-form but drawn from a small fixed set —
    # see app/ai/usage_tracker.py::Purpose for the canonical tags.
    purpose = Column(String(64), nullable=False, index=True, default="general")

    provider = Column(String(32), nullable=False)      # anthropic | gemini | grok
    model = Column(String(128), nullable=True)

    # Modality of the INPUT that drove the token count/rate for this call.
    # text | image | audio | video | document | mixed
    modality = Column(String(16), nullable=False, default="text", index=True)

    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    cached_tokens = Column(Integer, default=0)     # billed at a discounted rate
    thoughts_tokens = Column(Integer, default=0)   # thinking-model reasoning tokens
    total_tokens = Column(Integer, default=0)

    cost_usd = Column(Float, default=0.0)
    currency = Column(String(8), default="USD")

    # Free-form extra context (e.g. resume_id, duration_seconds for audio,
    # whether the cost was measured from usage_metadata or estimated).
    request_meta = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("idx_llm_usage_user_created", "user_id", "created_at"),
        Index("idx_llm_usage_purpose_created", "purpose", "created_at"),
    )


class ContactMessage(Base):
    __tablename__ = "contact_messages"
    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    subject = Column(String, nullable=True)
    message = Column(Text, nullable=False)
    type = Column(String, default="contact")   # "contact" or "feedback"
    rating = Column(Integer, nullable=True)     # 1-5 stars (feedback only)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
