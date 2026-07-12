"""Admin panel API — dashboard stats and CMS page management."""
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User, Resume, Subscription, CmsPage, VisitorLog, Payment, LlmUsageLog

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
    ("about-us", "🏢 About Us", "**resumes-gpt — AI-Powered Career Builder**\n\nresumes-gpt is India's most intelligent resume building platform, combining cutting-edge AI technology with professional career tools to help you land your dream job.\n\n**Our Mission**\nWe believe everyone deserves a professionally crafted resume that showcases their true potential. Our AI-powered platform makes this accessible to every professional — from fresh graduates to senior executives.\n\n**What Makes Us Different**\n• 30 professionally designed templates with real-time preview\n• AI-powered ATS optimization that scores and improves your resume\n• Career roadmap with certification paths, YouTube channels, and course links\n• Mock interview practice with AI scoring and gap analysis\n• Job search agent that finds matching roles across LinkedIn, Naukri, Indeed & more\n• One-time payment, lifetime access — no sneaky subscriptions\n\n**Our Technology**\nBuilt by experienced engineers using FastAPI, React, and Claude AI. We use advanced NLP to parse, analyze, and enhance your resume while keeping your data secure and private.\n\n**Contact Us**\nEmail: support@resumes-gpt.com\nBased in India 🇮🇳 · Serving professionals worldwide 🌍", "🏢"),
    ("disclaimer", "⚠️ Disclaimer", "**Disclaimer — resumes-gpt**\n\n**General Information**\nThe information, tools, and services provided by resumes-gpt (\"the Platform\") are for general informational and career development purposes only. While we strive to keep all information accurate and up to date, we make no representations or warranties of any kind, express or implied, about the completeness, accuracy, reliability, or suitability of the information.\n\n**AI-Generated Content**\nresumes-gpt uses artificial intelligence to generate resume suggestions, career analysis, interview questions, and other content. AI-generated content should be reviewed and verified by the user before use. We are not responsible for any inaccuracies in AI-generated content.\n\n**Career Advice**\nCareer roadmaps, job suggestions, salary guidance, and interview coaching provided by the Platform are advisory in nature. We do not guarantee employment outcomes, salary levels, or interview success. Individual results may vary based on market conditions, qualifications, and other factors.\n\n**Third-Party Links**\nThe Platform contains links to third-party websites (LinkedIn, Naukri, Indeed, Udemy, Coursera, etc.). We are not responsible for the content, privacy policies, or practices of these external sites.\n\n**Payment & Subscriptions**\nAll payments are processed securely through Razorpay. Subscription terms, including refund policies, are detailed on our Refund Policy page.\n\n**Limitation of Liability**\nIn no event shall resumes-gpt, its creators, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform.\n\n**Changes**\nWe reserve the right to modify this disclaimer at any time. Continued use of the Platform constitutes acceptance of any changes.\n\nLast updated: May 2026", "⚠️"),
    ("contact-us", "📬 Contact Us", "Have questions or feedback? Reach out to us:\n\nEmail: support@resumes-gpt.com\nPhone: +91 98765 43210\n\nOffice Hours: Monday - Friday, 9:00 AM - 6:00 PM IST\n\nWe typically respond within 24 hours.", "📬"),
    ("faq", "❓ FAQ", "**Q: How does the ATS scoring work?**\nA: Our ATS scorer uses a 100-point weighted rubric analyzing contact completeness, summary quality, experience bullet points, skills coverage, and keyword matching against job descriptions.\n\n**Q: Do I need to pay to edit my resume?**\nA: No! Resume editing, AI analysis, career roadmaps, and all tools are free. Payment (₹1,999 Elite plan) is only required to download as PDF/DOCX.\n\n**Q: What's included in the Elite plan?**\nA: Everything in Pro plus upcoming features: AI Career Counseling Bot, Mock Interviews, Interview Gap Analysis, and AI Agent Job Application.\n\n**Q: Is my data secure?**\nA: Yes. Your resume data is stored securely and never shared with third parties.\n\n**Q: Can I cancel my subscription?**\nA: The Elite plan is a one-time payment with lifetime access — no recurring charges to cancel.", "❓"),
    ("feedback", "💬 Feedback", "We\'d love to hear from you! Your feedback helps us improve resumes-gpt.\n\nPlease share your experience, suggestions, or report any issues using the form below.\n\nWe read every submission and use your feedback to improve the platform.", "💬"),
    ("blog", "📝 Blog", "Career Advice, Resume Tips & Job Search Guides for India 2026\n\nExpert-written guides to help you write a winning resume, ace interviews, and land your dream job.", "📝"),
    ("subscription", "👑 Subscription", "**Monthly Plans — from ₹500/month**\n\nPick a plan that matches how much you interview. Every plan includes a pool of AI mock-interview minutes that refreshes each month. Run out mid-month? Top up instantly with a refill pack.\n\n**Starter — ₹500/mo**\n• 60 mock-interview minutes / month\n• AI scoring & gap analysis\n• All 30 templates & PDF/DOCX downloads\n• Career roadmap & job search agent\n\n**Pro — ₹999/mo** (Popular)\n• 150 mock-interview minutes / month\n• Everything in Starter\n• Priority AI responses\n• Interview learning materials\n\n**Elite — ₹1,999/mo** (Best value)\n• 400 mock-interview minutes / month\n• Everything in Pro\n• Highest-priority support\n• Early access to new features\n\n**Refill packs** — one-time top-ups when you need more: +30 min ₹99 · +60 min ₹179 · +120 min ₹299.\n\nCancel anytime. Secure payments via Razorpay.", "👑"),
    ("whats-new", "🚀 What's New", "**Coming Soon in resumes-gpt Elite:**\n\n🤖 **Career Counseling by AI Bot**\nGet personalized career advice through an interactive AI counselor that understands your background, skills, and goals.\n\n🎤 **Mock Interview Practice**\nPractice interviews with our AI interviewer tailored to your target role. Get real-time feedback on your answers.\n\n📊 **Interview Rating & Gap Analysis**\nAfter each mock interview, receive detailed scoring, gap analysis, and suggested correct answers with references to help you improve.\n\n🚀 **AI Agent Job Application**\nOur AI agent will search for relevant jobs on your behalf, craft professional cover letters, and apply with tailored responses to recruiter questions — all automatically.\n\nSubscribe to the Elite plan (₹1,999 one-time) to get access as soon as these features launch!", "🚀"),
    ("privacy-policy", "🔒 Privacy Policy", "**Privacy Policy — resumes-gpt**\n\nWe respect your privacy. This policy explains how we collect, use, and protect your information.\n\n**Data We Collect:** Name, email, resume content, and usage analytics.\n\n**How We Use It:** To provide resume building services, improve our platform, and communicate important updates.\n\n**Data Sharing:** We never sell or share your personal data with third parties for marketing purposes.\n\n**Data Security:** All data is encrypted in transit and at rest. We follow industry-standard security practices.\n\n**Your Rights:** You can request deletion of your account and all associated data at any time by contacting support@resumes-gpt.com.\n\n**Cookies:** We use minimal cookies for authentication and analytics.\n\nLast updated: May 2026", "🔒"),
    ("terms-of-service", "📄 Terms of Service", "**Terms of Service — resumes-gpt**\n\nBy using resumes-gpt, you agree to the following terms:\n\n1. **Account:** You are responsible for maintaining the security of your account credentials.\n\n2. **Content:** You retain ownership of all resume content you create. We do not claim any rights to your data.\n\n3. **Subscriptions:** Elite (₹1,999) are one-time lifetime payments. No recurring charges.\n\n4. **Acceptable Use:** Do not use the platform for illegal purposes, spam, or to create fraudulent documents.\n\n5. **AI-Generated Content:** AI suggestions are provided as guidance. You are responsible for reviewing and verifying all content before use.\n\n6. **Limitation of Liability:** resumes-gpt is provided \"as is\" without warranties. We are not liable for employment outcomes.\n\n7. **Changes:** We may update these terms with notice. Continued use constitutes acceptance.\n\nLast updated: May 2026", "📄"),
    ("refund-policy", "💳 Refund Policy", "**Refund Policy — resumes-gpt**\n\nWe want you to be satisfied with your purchase.\n\n**Elite Plan (₹1,999):**\n• Full refund within 14 days of purchase.\n• Partial refund (50%) within 30 days if upcoming features have not launched.\n\n**How to Request a Refund:**\nEmail support@resumes-gpt.com with your registered email and payment ID.\nRefunds are processed within 5-7 business days.\n\n**Non-Refundable:**\n• Purchases older than the refund period.\n• Accounts suspended for policy violations.", "💳"),
]


import re as _re

# Homepage subscription panel content. Sourced from cms_pages by record id
# 'cms_sub' (slug also 'cms_sub') so it can be edited in the DB/admin without a
# code change. Keep the "**Heading — ₹PRICE**" + "• feature" shape: the homepage
# parses the price and bullet features from it.
CMS_SUB_ID = "cms_sub"
CMS_SUB_CONTENT = (
    "**Starter Plan — ₹500 / month**\n"
    "• 60 AI mock-interview minutes every month\n"
    "• Everything in Free\n"
    "• AI scoring & gap analysis\n"
    "• All 30 templates + PDF/DOCX downloads\n"
    "• Job search & posting agent (LinkedIn, Naukri, Indeed)\n"
    "• 🤖 AI Career Counseling Bot\n"
    "• 🎤 Live Mock Interview Practice\n"
    "• 📊 Interview Gap Analysis\n"
    "• 🚀 AI Job Application Agent\n"
    "• Pro (₹999) & Elite (₹1,999) add more minutes\n"
    "• Refill packs top up minutes anytime · cancel whenever"
)


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
            # One-time migration: refresh the subscription page off the old
            # "₹1,999 one-time lifetime" copy onto the new monthly-plan copy.
            elif slug == "subscription" and existing.content and (
                "One-time" in existing.content or "one-time" in existing.content
            ):
                existing.content = content
                existing.title = title

    # Homepage subscription record, addressed by id 'cms_sub'.
    sub = db.query(CmsPage).filter(
        or_(CmsPage.id == CMS_SUB_ID, CmsPage.slug == CMS_SUB_ID)
    ).first()
    if not sub:
        db.add(CmsPage(id=CMS_SUB_ID, slug=CMS_SUB_ID, title="👑 Starter Plan",
                       content=CMS_SUB_CONTENT, icon="👑"))
    elif sub.content and (_re.search(r'<[a-zA-Z][^>]*/?>', sub.content)
                          or "One-time" in sub.content or "one-time" in sub.content):
        sub.content = CMS_SUB_CONTENT

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
    # Match by slug or by record id (e.g. 'cms_sub') so callers can address a row
    # by either identifier.
    page = db.query(CmsPage).filter(
        or_(CmsPage.slug == slug, CmsPage.id == slug)
    ).first()
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


@router.get("/payments")
def list_payments(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  status: Optional[str] = Query(None), type: Optional[str] = Query(None),
                  user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Paginated payment history with user email."""
    from app.subscription.router import expire_stale_payments
    expire_stale_payments(db)  # keep abandoned-checkout rows from lingering as "created"
    q = db.query(Payment).order_by(Payment.created_at.desc())
    if status:
        q = q.filter(Payment.status == status)
    if type:
        q = q.filter(Payment.type == type)
    total = q.count()
    payments = q.offset((page - 1) * page_size).limit(page_size).all()
    user_ids = [p.user_id for p in payments]
    users = {u.id: u.email for u in db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    items = [{
        "id": p.id, "user_id": p.user_id, "user_email": users.get(p.user_id, ""),
        "plan": p.plan, "type": p.type, "amount": p.amount,
        "base_amount_inr": p.base_amount_inr, "discount_inr": p.discount_inr,
        "coupon_code": p.coupon_code, "currency": p.currency, "status": p.status,
        "error_message": p.error_message,
        "razorpay_payment_id": p.razorpay_payment_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    } for p in payments]
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size)}


# ---------- LLM Usage & Cost Tracking ----------

class LlmUsageSummary(BaseModel):
    total_calls: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cached_tokens: int = 0
    total_thoughts_tokens: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    currency: str = "USD"
    by_purpose: List[dict] = []
    by_modality: List[dict] = []
    by_provider: List[dict] = []
    daily: List[dict] = []


class LlmUserUsage(BaseModel):
    user_id: Optional[str] = None
    user_email: str = ""
    total_calls: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    last_used_at: Optional[str] = None


class LlmUsageLogOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_email: str = ""
    purpose: str
    provider: str
    model: Optional[str] = None
    modality: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    thoughts_tokens: int
    total_tokens: int
    cost_usd: float
    currency: str
    created_at: Optional[str] = None


def _usage_query(db: Session, days: Optional[int], purpose: Optional[str], provider: Optional[str]):
    q = db.query(LlmUsageLog)
    if days:
        q = q.filter(LlmUsageLog.created_at >= datetime.utcnow() - timedelta(days=days))
    if purpose:
        q = q.filter(LlmUsageLog.purpose == purpose)
    if provider:
        q = q.filter(LlmUsageLog.provider == provider)
    return q


@router.get("/llm-usage/summary", response_model=LlmUsageSummary)
def llm_usage_summary(
    days: int = Query(30, ge=1, le=365, description="Look back this many days (0 = all time)"),
    user: User = Depends(require_admin), db: Session = Depends(get_db),
):
    """Aggregate token usage + cost across all LLM calls — the top-level
    numbers for the admin 'LLM Usage' tab, plus breakdowns by purpose
    (which feature triggered the call), modality (text/image/audio/video/
    document — since each is billed differently), and provider."""
    since = datetime.utcnow() - timedelta(days=days)
    base = db.query(LlmUsageLog).filter(LlmUsageLog.created_at >= since)

    totals = base.with_entities(
        func.count(LlmUsageLog.id),
        func.coalesce(func.sum(LlmUsageLog.input_tokens), 0),
        func.coalesce(func.sum(LlmUsageLog.output_tokens), 0),
        func.coalesce(func.sum(LlmUsageLog.cached_tokens), 0),
        func.coalesce(func.sum(LlmUsageLog.thoughts_tokens), 0),
        func.coalesce(func.sum(LlmUsageLog.total_tokens), 0),
        func.coalesce(func.sum(LlmUsageLog.cost_usd), 0.0),
    ).first()

    by_purpose = [
        {"purpose": p, "calls": c, "tokens": int(t or 0), "cost_usd": round(float(cost or 0), 6)}
        for p, c, t, cost in base.with_entities(
            LlmUsageLog.purpose, func.count(LlmUsageLog.id),
            func.sum(LlmUsageLog.total_tokens), func.sum(LlmUsageLog.cost_usd),
        ).group_by(LlmUsageLog.purpose).order_by(func.sum(LlmUsageLog.cost_usd).desc()).all()
    ]
    by_modality = [
        {"modality": m, "calls": c, "tokens": int(t or 0), "cost_usd": round(float(cost or 0), 6)}
        for m, c, t, cost in base.with_entities(
            LlmUsageLog.modality, func.count(LlmUsageLog.id),
            func.sum(LlmUsageLog.total_tokens), func.sum(LlmUsageLog.cost_usd),
        ).group_by(LlmUsageLog.modality).order_by(func.sum(LlmUsageLog.cost_usd).desc()).all()
    ]
    by_provider = [
        {"provider": pr, "calls": c, "tokens": int(t or 0), "cost_usd": round(float(cost or 0), 6)}
        for pr, c, t, cost in base.with_entities(
            LlmUsageLog.provider, func.count(LlmUsageLog.id),
            func.sum(LlmUsageLog.total_tokens), func.sum(LlmUsageLog.cost_usd),
        ).group_by(LlmUsageLog.provider).order_by(func.sum(LlmUsageLog.cost_usd).desc()).all()
    ]
    daily = [
        {"date": str(d), "calls": c, "cost_usd": round(float(cost or 0), 6)}
        for d, c, cost in base.with_entities(
            func.date(LlmUsageLog.created_at), func.count(LlmUsageLog.id), func.sum(LlmUsageLog.cost_usd),
        ).group_by(func.date(LlmUsageLog.created_at)).order_by(func.date(LlmUsageLog.created_at)).all()
    ]

    return LlmUsageSummary(
        total_calls=totals[0] or 0,
        total_input_tokens=int(totals[1] or 0),
        total_output_tokens=int(totals[2] or 0),
        total_cached_tokens=int(totals[3] or 0),
        total_thoughts_tokens=int(totals[4] or 0),
        total_tokens=int(totals[5] or 0),
        total_cost_usd=round(float(totals[6] or 0), 6),
        by_purpose=by_purpose,
        by_modality=by_modality,
        by_provider=by_provider,
        daily=daily,
    )


@router.get("/llm-usage/by-user")
def llm_usage_by_user(
    days: int = Query(30, ge=1, le=365),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    user: User = Depends(require_admin), db: Session = Depends(get_db),
):
    """Per-user token/cost breakdown — 'which user has how much usage' (paginated)."""
    since = datetime.utcnow() - timedelta(days=days)
    base = (
        db.query(
            LlmUsageLog.user_id,
            func.count(LlmUsageLog.id),
            func.coalesce(func.sum(LlmUsageLog.total_tokens), 0),
            func.coalesce(func.sum(LlmUsageLog.cost_usd), 0.0),
            func.max(LlmUsageLog.created_at),
        )
        .filter(LlmUsageLog.created_at >= since)
        .group_by(LlmUsageLog.user_id)
        .order_by(func.sum(LlmUsageLog.cost_usd).desc())
    )
    total = base.count()
    rows = base.offset((page - 1) * page_size).limit(page_size).all()
    user_ids = [r[0] for r in rows if r[0]]
    emails = {u.id: u.email for u in db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    items = [
        {
            "user_id": uid, "user_email": emails.get(uid, "" if uid else "(unattributed)"),
            "total_calls": calls, "total_tokens": int(tokens or 0),
            "total_cost_usd": round(float(cost or 0), 6),
            "last_used_at": last.isoformat() if last else None,
        }
        for uid, calls, tokens, cost, last in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size)}


@router.get("/llm-usage/logs")
def llm_usage_logs(
    days: int = Query(7, ge=1, le=365),
    purpose: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    user: User = Depends(require_admin), db: Session = Depends(get_db),
):
    """Raw recent call log, filterable + paginated — for auditing individual calls."""
    q = _usage_query(db, days, purpose, provider)
    if user_id:
        q = q.filter(LlmUsageLog.user_id == user_id)
    q = q.order_by(LlmUsageLog.created_at.desc())
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    user_ids = [r.user_id for r in rows if r.user_id]
    emails = {u.id: u.email for u in db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    items = [
        {
            "id": r.id, "user_id": r.user_id, "user_email": emails.get(r.user_id, ""),
            "purpose": r.purpose, "provider": r.provider, "model": r.model, "modality": r.modality,
            "input_tokens": r.input_tokens, "output_tokens": r.output_tokens,
            "cached_tokens": r.cached_tokens, "thoughts_tokens": r.thoughts_tokens,
            "total_tokens": r.total_tokens, "cost_usd": r.cost_usd, "currency": r.currency,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size)}


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