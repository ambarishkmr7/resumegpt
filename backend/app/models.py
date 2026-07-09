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
    plan = Column(String, default="elite")           # plan slug (back-compat)
    plan_id = Column(String, ForeignKey("plans.id"), nullable=True, index=True)
    status = Column(String, default="active")         # active | halted | cancelled | created
    amount = Column(Integer, default=1999)            # INR rupees charged for the current plan
    interval = Column(String, default="monthly")      # monthly (recurring)
    payment_id = Column(String, nullable=True)
    order_id = Column(String, nullable=True)
    razorpay_subscription_id = Column(String, nullable=True, index=True)
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    cancel_at_period_end = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Payment(Base):
    __tablename__ = "payments"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    razorpay_order_id = Column(String, nullable=True, index=True)
    razorpay_payment_id = Column(String, nullable=True, index=True)
    razorpay_signature = Column(String, nullable=True)
    razorpay_subscription_id = Column(String, nullable=True, index=True)
    plan = Column(String, default="elite")            # plan/refill slug
    type = Column(String, default="subscription")     # subscription | refill
    plan_id = Column(String, nullable=True, index=True)
    refill_pack_id = Column(String, nullable=True, index=True)
    amount = Column(Integer, default=299)             # INR rupees actually charged (after discount)
    base_amount_inr = Column(Integer, nullable=True)  # INR before coupon discount
    discount_inr = Column(Integer, default=0)         # INR discounted via coupon
    coupon_code = Column(String, nullable=True)
    currency = Column(String, default="INR")
    status = Column(String, default="created")        # created | paid | failed | refunded
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


# ── Billing / metered usage ───────────────────────────────────────────────────
# All money is stored as INR **rupees** (int) for admin readability; multiply by
# 100 to get paise only when calling Razorpay. Interview usage is metered in
# seconds. The usage tables are generic (keyed by resource_type) so more
# resources than "interview_seconds" can be metered later without a schema
# change. See app/subscription/usage.py for the metering logic.

class Plan(Base):
    """An admin-managed monthly subscription tier (e.g. Starter ₹500 → 60 min)."""
    __tablename__ = "plans"
    id = Column(String, primary_key=True, default=_uuid)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    price_inr = Column(Integer, default=500)           # rupees / billing_interval
    currency = Column(String, default="INR")
    billing_interval = Column(String, default="monthly")
    interview_minutes = Column(Integer, default=60)    # convenience mirror of allowances
    allowances = Column(JSON, nullable=False, default=dict)  # {"interview_seconds": 3600}
    features = Column(JSON, nullable=False, default=list)    # ["Feature line", ...]
    badge = Column(String, nullable=True)              # e.g. "Popular"
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)
    display_order = Column(Integer, default=100)
    razorpay_plan_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RefillPack(Base):
    """An admin-managed one-time top-up of extra interview minutes."""
    __tablename__ = "refill_packs"
    id = Column(String, primary_key=True, default=_uuid)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    price_inr = Column(Integer, default=99)
    currency = Column(String, default="INR")
    resource_type = Column(String, default="interview_seconds")
    amount_seconds = Column(Integer, default=1800)     # seconds granted
    bonus_seconds = Column(Integer, default=0)         # promo bonus on top
    is_active = Column(Boolean, default=True)
    display_order = Column(Integer, default=100)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Coupon(Base):
    """An admin-managed discount code applicable to plans and/or refills."""
    __tablename__ = "coupons"
    id = Column(String, primary_key=True, default=_uuid)
    code = Column(String, unique=True, index=True, nullable=False)  # stored uppercase
    description = Column(String, nullable=True)
    discount_type = Column(String, default="percent")  # percent | flat
    discount_value = Column(Integer, default=10)        # percent (0-100) or flat INR
    applies_to = Column(String, default="all")          # all | plan | refill
    min_amount_inr = Column(Integer, default=0)
    max_redemptions = Column(Integer, nullable=True)    # null = unlimited
    redeemed_count = Column(Integer, default=0)
    per_user_limit = Column(Integer, default=1)
    starts_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CouponRedemption(Base):
    """Audit row per coupon use — enforces per-user limits and feeds P&L."""
    __tablename__ = "coupon_redemptions"
    id = Column(String, primary_key=True, default=_uuid)
    coupon_id = Column(String, ForeignKey("coupons.id"), nullable=False, index=True)
    coupon_code = Column(String, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    payment_id = Column(String, ForeignKey("payments.id"), nullable=True, index=True)
    discount_inr = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class UsageAccount(Base):
    """Current metered balance for one (user, resource_type).

    available = allowance_seconds (this cycle) + refill_seconds − used_seconds
    """
    __tablename__ = "usage_accounts"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    resource_type = Column(String, default="interview_seconds", index=True)
    allowance_seconds = Column(Integer, default=0)   # granted for the current cycle
    used_seconds = Column(Integer, default=0)        # consumed this cycle
    refill_seconds = Column(Integer, default=0)      # purchased top-ups (carry over)
    source = Column(String, default="trial")         # subscription | trial | admin
    plan_id = Column(String, nullable=True)
    cycle_start = Column(DateTime, nullable=True)
    cycle_end = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (
        Index("idx_usage_user_resource", "user_id", "resource_type", unique=True),
    )


class UsageEvent(Base):
    """Append-only ledger of every grant/consume — audit + analytics."""
    __tablename__ = "usage_events"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    resource_type = Column(String, default="interview_seconds", index=True)
    delta_seconds = Column(Integer, default=0)       # +grant / −consume
    reason = Column(String, default="interview_consume")
    ref_id = Column(String, nullable=True)           # session/payment id
    balance_after = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class AppSetting(Base):
    """Key/value admin settings (JSON value). See app/subscription/usage.py."""
    __tablename__ = "app_settings"
    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WebhookEvent(Base):
    """Idempotency guard for Razorpay webhooks (keyed by x-razorpay-event-id)."""
    __tablename__ = "webhook_events"
    id = Column(String, primary_key=True)            # razorpay event id
    event_type = Column(String, nullable=True)
    payload = Column(JSON, nullable=True)
    processed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
