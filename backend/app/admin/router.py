"""Admin panel API — dashboard stats and CMS page management."""
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User, Resume, Subscription, CmsPage, VisitorLog, Payment

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------- Auth ----------

def require_admin(user: User = Depends(get_current_user)):
    if not user.is_admin:
        logger.warning("Non-admin user %s attempted admin access", user.id)
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------- Schemas ----------

class DashboardStats(BaseModel):
    total_users: int = 0
    total_subscribers: int = 0
    elite_subscribers: int = 0
    total_resumes: int = 0
    total_visitors: int = 0
    users_not_subscribed: int = 0
    total_revenue: int = 0
    recent_users: List[dict] = []
    recent_subscribers: List[dict] = []


class CmsPageOut(BaseModel):
    id: str
    slug: str
    title: str
    content: str
    icon: str
    updated_at: Optional[str] = None


class CmsPageUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    icon: Optional[str] = None


# ---------- Dashboard ----------

@router.get("/dashboard", response_model=DashboardStats)
def dashboard(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    total_users = db.query(func.count(User.id)).scalar()
    total_subs = db.query(func.count(Subscription.id)).filter(Subscription.status == "active").scalar()
    
    elite_subs = db.query(func.count(Subscription.id)).filter(Subscription.status == "active", Subscription.plan == "elite").scalar()
    total_resumes = db.query(func.count(Resume.id)).scalar()
    total_visitors = db.query(func.count(VisitorLog.id)).scalar()

    # Users who registered but didn't subscribe
    sub_user_ids = db.query(Subscription.user_id).filter(Subscription.status == "active").scalar_subquery()
    users_not_subbed = db.query(func.count(User.id)).filter(~User.id.in_(sub_user_ids)).scalar()

    # Recent users
    recent_users = db.query(User).order_by(User.created_at.desc()).limit(10).all()
    recent_subs = db.query(Subscription).filter(Subscription.status == "active").order_by(Subscription.created_at.desc()).limit(10).all()

    # Calculate total revenue from actual subscription amounts
    total_revenue = db.query(func.coalesce(func.sum(Subscription.amount), 0)).filter(Subscription.status == "active").scalar()

    return DashboardStats(
        total_users=total_users,
        total_subscribers=total_subs,
        elite_subscribers=elite_subs,
        total_resumes=total_resumes,
        total_visitors=total_visitors,
        users_not_subscribed=users_not_subbed,
        total_revenue=total_revenue,
        recent_users=[{"id": u.id, "email": u.email, "name": u.full_name, "date": u.created_at.isoformat()} for u in recent_users],
        recent_subscribers=[{"id": s.id, "user_id": s.user_id, "plan": s.plan, "amount": s.amount, "date": s.created_at.isoformat()} for s in recent_subs],
    )


# ---------- CMS Pages ----------

CMS_DEFAULTS = [
    ("about-us", "🏢 About Us", "**ResumeGPT — AI-Powered Career Builder**\n\nResumeGPT is India's most intelligent resume building platform, combining cutting-edge AI technology with professional career tools to help you land your dream job.\n\n**Our Mission**\nWe believe everyone deserves a professionally crafted resume that showcases their true potential. Our AI-powered platform makes this accessible to every professional — from fresh graduates to senior executives.\n\n**What Makes Us Different**\n• 30 professionally designed templates with real-time preview\n• AI-powered ATS optimization that scores and improves your resume\n• Career roadmap with certification paths, YouTube channels, and course links\n• Mock interview practice with AI scoring and gap analysis\n• Job search agent that finds matching roles across LinkedIn, Naukri, Indeed & more\n• One-time payment, lifetime access — no sneaky subscriptions\n\n**Our Technology**\nBuilt by experienced engineers using FastAPI, React, and Claude AI. We use advanced NLP to parse, analyze, and enhance your resume while keeping your data secure and private.\n\n**Contact Us**\nEmail: support@resumegpt.in\nBased in India 🇮🇳 · Serving professionals worldwide 🌍", "🏢"),
    ("disclaimer", "⚠️ Disclaimer", "**Disclaimer — ResumeGPT**\n\n**General Information**\nThe information, tools, and services provided by ResumeGPT (\"the Platform\") are for general informational and career development purposes only. While we strive to keep all information accurate and up to date, we make no representations or warranties of any kind, express or implied, about the completeness, accuracy, reliability, or suitability of the information.\n\n**AI-Generated Content**\nResumeGPT uses artificial intelligence to generate resume suggestions, career analysis, interview questions, and other content. AI-generated content should be reviewed and verified by the user before use. We are not responsible for any inaccuracies in AI-generated content.\n\n**Career Advice**\nCareer roadmaps, job suggestions, salary guidance, and interview coaching provided by the Platform are advisory in nature. We do not guarantee employment outcomes, salary levels, or interview success. Individual results may vary based on market conditions, qualifications, and other factors.\n\n**Third-Party Links**\nThe Platform contains links to third-party websites (LinkedIn, Naukri, Indeed, Udemy, Coursera, etc.). We are not responsible for the content, privacy policies, or practices of these external sites.\n\n**Payment & Subscriptions**\nAll payments are processed securely through Razorpay. Subscription terms, including refund policies, are detailed on our Refund Policy page.\n\n**Limitation of Liability**\nIn no event shall ResumeGPT, its creators, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform.\n\n**Changes**\nWe reserve the right to modify this disclaimer at any time. Continued use of the Platform constitutes acceptance of any changes.\n\nLast updated: May 2026", "⚠️"),
    ("contact-us", "📬 Contact Us", "Have questions or feedback? Reach out to us:\n\nEmail: support@resumegpt.in\nPhone: +91 98765 43210\n\nOffice Hours: Monday - Friday, 9:00 AM - 6:00 PM IST\n\nWe typically respond within 24 hours.", "📬"),
    ("faq", "❓ FAQ", "**Q: How does the ATS scoring work?**\nA: Our ATS scorer uses a 100-point weighted rubric analyzing contact completeness, summary quality, experience bullet points, skills coverage, and keyword matching against job descriptions.\n\n**Q: Do I need to pay to edit my resume?**\nA: No! Resume editing, AI analysis, career roadmaps, and all tools are free. Payment (₹1,999 Elite plan) is only required to download as PDF/DOCX.\n\n**Q: What's included in the Elite plan?**\nA: Everything in Pro plus upcoming features: AI Career Counseling Bot, Mock Interviews, Interview Gap Analysis, and AI Agent Job Application.\n\n**Q: Is my data secure?**\nA: Yes. Your resume data is stored securely and never shared with third parties.\n\n**Q: Can I cancel my subscription?**\nA: The Elite plan is a one-time payment with lifetime access — no recurring charges to cancel.", "❓"),
    ("feedback", "💬 Feedback", "We\'d love to hear from you! Your feedback helps us improve ResumeGPT.\n\nPlease share your experience, suggestions, or report any issues using the form below.\n\nWe read every submission and use your feedback to improve the platform.", "💬"),
    ("blog", "📝 Blog", "Career Advice, Resume Tips & Job Search Guides for India 2026\n\nExpert-written guides to help you write a winning resume, ace interviews, and land your dream job.", "📝"),
    ("subscription", "👑 Subscription", "**Elite Plan — ₹1,999 (One-time)**\n• Unlimited PDF and DOCX downloads\n• All 30 professional templates\n• AI-powered career analysis & roadmap\n• AI resume rewriting (3 variants)\n• Professional writeup & cover letter generator\n• Job search agent (LinkedIn, Naukri, Indeed)\n• 🤖 AI Career Counseling Bot\n• 🎤 Mock Interview Practice\n• 📊 Interview Gap Analysis\n• 🚀 AI Job Application Agent\n• Priority support\n• Early access to new features\n• Lifetime access — no recurring fees", "👑"),
    ("whats-new", "🚀 What's New", "**Coming Soon in ResumeGPT Elite:**\n\n🤖 **Career Counseling by AI Bot**\nGet personalized career advice through an interactive AI counselor that understands your background, skills, and goals.\n\n🎤 **Mock Interview Practice**\nPractice interviews with our AI interviewer tailored to your target role. Get real-time feedback on your answers.\n\n📊 **Interview Rating & Gap Analysis**\nAfter each mock interview, receive detailed scoring, gap analysis, and suggested correct answers with references to help you improve.\n\n🚀 **AI Agent Job Application**\nOur AI agent will search for relevant jobs on your behalf, craft professional cover letters, and apply with tailored responses to recruiter questions — all automatically.\n\nSubscribe to the Elite plan (₹1,999 one-time) to get access as soon as these features launch!", "🚀"),
    ("privacy-policy", "🔒 Privacy Policy", "**Privacy Policy — ResumeGPT**\n\nWe respect your privacy. This policy explains how we collect, use, and protect your information.\n\n**Data We Collect:** Name, email, resume content, and usage analytics.\n\n**How We Use It:** To provide resume building services, improve our platform, and communicate important updates.\n\n**Data Sharing:** We never sell or share your personal data with third parties for marketing purposes.\n\n**Data Security:** All data is encrypted in transit and at rest. We follow industry-standard security practices.\n\n**Your Rights:** You can request deletion of your account and all associated data at any time by contacting support@resumegpt.in.\n\n**Cookies:** We use minimal cookies for authentication and analytics.\n\nLast updated: May 2026", "🔒"),
    ("terms-of-service", "📄 Terms of Service", "**Terms of Service — ResumeGPT**\n\nBy using ResumeGPT, you agree to the following terms:\n\n1. **Account:** You are responsible for maintaining the security of your account credentials.\n\n2. **Content:** You retain ownership of all resume content you create. We do not claim any rights to your data.\n\n3. **Subscriptions:** Elite (₹1,999) are one-time lifetime payments. No recurring charges.\n\n4. **Acceptable Use:** Do not use the platform for illegal purposes, spam, or to create fraudulent documents.\n\n5. **AI-Generated Content:** AI suggestions are provided as guidance. You are responsible for reviewing and verifying all content before use.\n\n6. **Limitation of Liability:** ResumeGPT is provided \"as is\" without warranties. We are not liable for employment outcomes.\n\n7. **Changes:** We may update these terms with notice. Continued use constitutes acceptance.\n\nLast updated: May 2026", "📄"),
    ("refund-policy", "💳 Refund Policy", "**Refund Policy — ResumeGPT**\n\nWe want you to be satisfied with your purchase.\n\n**Elite Plan (₹1,999):**\n• Full refund within 14 days of purchase.\n• Partial refund (50%) within 30 days if upcoming features have not launched.\n\n**How to Request a Refund:**\nEmail support@resumegpt.in with your registered email and payment ID.\nRefunds are processed within 5-7 business days.\n\n**Non-Refundable:**\n• Purchases older than the refund period.\n• Accounts suspended for policy violations.", "💳"),
]


import re as _re

def _seed_cms(db: Session):
    """Seed default CMS pages if they don't exist. Also reset any rows whose content contains raw HTML/JSX tags."""
    for slug, title, content, icon in CMS_DEFAULTS:
        existing = db.query(CmsPage).filter(CmsPage.slug == slug).first()
        if not existing:
            db.add(CmsPage(slug=slug, title=title, content=content, icon=icon))
        else:
            # Reset content if it was corrupted with HTML/JSX tags by the admin editor
            if existing.content and _re.search(r'<[a-zA-Z][^>]*/?>', existing.content):
                existing.content = content
                existing.title = title
    db.commit()


@router.get("/cms", response_model=List[CmsPageOut])
def list_cms_pages(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    _seed_cms(db)
    pages = db.query(CmsPage).order_by(CmsPage.slug).all()
    return [CmsPageOut(id=p.id, slug=p.slug, title=p.title, content=p.content, icon=p.icon,
                       updated_at=p.updated_at.isoformat() if p.updated_at else None) for p in pages]


@router.put("/cms/{slug}", response_model=CmsPageOut)
def update_cms_page(slug: str, payload: CmsPageUpdate,
                    user: User = Depends(require_admin), db: Session = Depends(get_db)):
    page = db.query(CmsPage).filter(CmsPage.slug == slug).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if payload.title is not None:
        page.title = payload.title
    if payload.content is not None:
        page.content = payload.content
    if payload.icon is not None:
        page.icon = payload.icon
    db.commit()
    db.refresh(page)
    logger.info("CMS page updated: %s (admin=%s)", slug, user.id)
    return CmsPageOut(id=page.id, slug=page.slug, title=page.title, content=page.content, icon=page.icon,
                      updated_at=page.updated_at.isoformat() if page.updated_at else None)


# ---------- Public CMS API ----------

@router.get("/public/stats")
def get_public_stats(db: Session = Depends(get_db)):
    """Public endpoint — returns platform stats for homepage display."""
    from app.models import Resume
    from sqlalchemy import func

    total_resumes = db.query(func.count(Resume.id)).scalar() or 0

    # ATS pass rate = % of resumes with ats_score >= 75
    total_scored = db.query(func.count(Resume.id)).filter(Resume.ats_score.isnot(None)).scalar() or 0
    passing = db.query(func.count(Resume.id)).filter(Resume.ats_score >= 75).scalar() or 0
    ats_pass_rate = round((passing / total_scored * 100) if total_scored > 0 else 0)

    return {
        "total_resumes": total_resumes,
        "ats_pass_rate": ats_pass_rate,
        "total_scored": total_scored,
    }


@router.get("/public/cms/{slug}", response_model=CmsPageOut)
def get_public_cms_page(slug: str, db: Session = Depends(get_db)):
    _seed_cms(db)
    page = db.query(CmsPage).filter(CmsPage.slug == slug).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return CmsPageOut(id=page.id, slug=page.slug, title=page.title, content=page.content, icon=page.icon,
                      updated_at=page.updated_at.isoformat() if page.updated_at else None)


@router.get("/public/cms", response_model=List[CmsPageOut])
def list_public_cms_pages(db: Session = Depends(get_db)):
    _seed_cms(db)
    pages = db.query(CmsPage).order_by(CmsPage.slug).all()
    return [CmsPageOut(id=p.id, slug=p.slug, title=p.title, content=p.content, icon=p.icon,
                       updated_at=p.updated_at.isoformat() if p.updated_at else None) for p in pages]


# ---------- Payments ----------

class PaymentOut(BaseModel):
    id: str
    user_id: str
    user_email: str = ""
    plan: str
    amount: int
    currency: str
    status: str
    created_at: Optional[str] = None


@router.get("/payments", response_model=List[PaymentOut])
def list_payments(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Return payment history with user email."""
    payments = db.query(Payment).order_by(Payment.created_at.desc()).limit(50).all()
    # Batch-fetch user emails
    user_ids = [p.user_id for p in payments]
    users = {u.id: u.email for u in db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    return [PaymentOut(
        id=p.id, user_id=p.user_id, user_email=users.get(p.user_id, ""),
        plan=p.plan, amount=p.amount, currency=p.currency,
        status=p.status, created_at=p.created_at.isoformat() if p.created_at else None,
    ) for p in payments]


# ---------- Make first user admin (admin-only) ----------

@router.post("/make-admin")
def make_first_admin(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """One-time setup: makes the first registered user an admin. Requires existing admin auth."""
    first_user = db.query(User).order_by(User.created_at.asc()).first()
    if not first_user:
        raise HTTPException(status_code=404, detail="No users found")
    first_user.is_admin = True
    db.commit()
    logger.info("User promoted to admin via make-admin: %s (by admin=%s)", first_user.email, user.id)
    return {"message": f"User {first_user.email} is now admin"}
