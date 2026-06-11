import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, JSON, Boolean
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
    amount = Column(Integer, default=299)
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
    created_at = Column(DateTime, default=datetime.utcnow)


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
