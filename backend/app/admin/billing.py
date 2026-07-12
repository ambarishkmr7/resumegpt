"""Admin billing management API — subscription plans, refill packs, coupons,
subscriptions, per-user usage, settings, and the Profit & Loss report. All list
endpoints are paginated with a ``{items, total, page, page_size}`` envelope.

Mounted under /api/admin (see app/main.py). Reuses ``require_admin`` from
app/admin/router.py.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.admin.router import require_admin
from app.config import get_settings
from app.database import get_db
from app.models import (
    Coupon,
    CouponRedemption,
    LlmUsageLog,
    Payment,
    Plan,
    RefillPack,
    Subscription,
    UsageAccount,
    User,
)
from app.subscription import usage as usage_svc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin-billing"])
settings = get_settings()


# ── Pagination helper ─────────────────────────────────────────────────────────

def paginate(query, page: int, page_size: int):
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def _page(items, total, page, page_size):
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size)}


# ── Plan serialization + Razorpay plan creation ───────────────────────────────

def _plan_dict(p: Plan) -> dict:
    return {
        "id": p.id, "slug": p.slug, "name": p.name, "description": p.description,
        "price_inr": p.price_inr, "currency": p.currency, "billing_interval": p.billing_interval,
        "interview_minutes": p.interview_minutes,
        "monthly_tokens": int((p.allowances or {}).get("llm_tokens", 0) or 0),
        "allowances": p.allowances or {},
        "features": p.features or [], "badge": p.badge, "is_active": p.is_active,
        "is_default": p.is_default, "display_order": p.display_order,
        "razorpay_plan_id": p.razorpay_plan_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _create_razorpay_plan(plan: Plan) -> Optional[str]:
    """Create a matching recurring plan on Razorpay (for true auto-charge).
    Returns the razorpay plan id, or None in demo mode / on failure."""
    if not (settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET):
        return None
    try:
        resp = httpx.post(
            "https://api.razorpay.com/v1/plans",
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
            json={
                "period": "monthly", "interval": 1,
                "item": {"name": plan.name, "amount": plan.price_inr * 100,
                         "currency": "INR", "description": plan.description or plan.name},
                "notes": {"slug": plan.slug},
            }, timeout=15,
        )
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logger.warning("Razorpay plan creation failed for %s: %s", plan.slug, e)
        return None


# ── Plans CRUD ────────────────────────────────────────────────────────────────

class PlanIn(BaseModel):
    slug: Optional[str] = None
    name: str
    description: Optional[str] = None
    price_inr: int = 500
    interview_minutes: int = 60
    monthly_tokens: int = 1_000_000     # LLM-token allowance per month
    features: List[str] = []
    badge: Optional[str] = None
    is_active: bool = True
    is_default: bool = False
    display_order: int = 100


@router.get("/plans")
def admin_list_plans(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                     _: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(Plan).order_by(Plan.display_order.asc(), Plan.price_inr.asc())
    items, total = paginate(q, page, page_size)
    return _page([_plan_dict(p) for p in items], total, page, page_size)


@router.post("/plans")
def admin_create_plan(body: PlanIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    slug = (body.slug or body.name).strip().lower().replace(" ", "-")
    if db.query(Plan).filter(Plan.slug == slug).first():
        raise HTTPException(status_code=400, detail="A plan with this slug already exists")
    if body.is_default:
        db.query(Plan).filter(Plan.is_default == True).update({Plan.is_default: False})  # noqa: E712
    plan = Plan(
        slug=slug, name=body.name, description=body.description, price_inr=body.price_inr,
        interview_minutes=body.interview_minutes,
        allowances={"interview_seconds": body.interview_minutes * 60,
                    "llm_tokens": body.monthly_tokens},
        features=body.features, badge=body.badge, is_active=body.is_active,
        is_default=body.is_default, display_order=body.display_order,
    )
    plan.razorpay_plan_id = _create_razorpay_plan(plan)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    logger.info("Admin created plan %s (₹%s, %s min)", plan.slug, plan.price_inr, plan.interview_minutes)
    return _plan_dict(plan)


@router.put("/plans/{plan_id}")
def admin_update_plan(plan_id: str, body: PlanIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if body.is_default and not plan.is_default:
        db.query(Plan).filter(Plan.is_default == True).update({Plan.is_default: False})  # noqa: E712
    plan.name = body.name
    plan.description = body.description
    plan.price_inr = body.price_inr
    plan.interview_minutes = body.interview_minutes
    plan.allowances = {"interview_seconds": body.interview_minutes * 60,
                       "llm_tokens": body.monthly_tokens}
    plan.features = body.features
    plan.badge = body.badge
    plan.is_active = body.is_active
    plan.is_default = body.is_default
    plan.display_order = body.display_order
    db.commit()
    db.refresh(plan)
    return _plan_dict(plan)


@router.delete("/plans/{plan_id}")
def admin_delete_plan(plan_id: str, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    # Soft-disable if in use by a subscription; otherwise hard-delete.
    in_use = db.query(Subscription).filter(Subscription.plan_id == plan_id).first()
    if in_use:
        plan.is_active = False
        db.commit()
        return {"status": "deactivated", "reason": "plan is referenced by subscriptions"}
    db.delete(plan)
    db.commit()
    return {"status": "deleted"}


# ── Refill packs CRUD ─────────────────────────────────────────────────────────

def _refill_dict(r: RefillPack) -> dict:
    return {
        "id": r.id, "slug": r.slug, "name": r.name, "description": r.description,
        "price_inr": r.price_inr, "resource_type": r.resource_type,
        "amount_seconds": r.amount_seconds, "bonus_seconds": r.bonus_seconds,
        "amount_minutes": r.amount_seconds // 60, "bonus_minutes": r.bonus_seconds // 60,
        "is_active": r.is_active, "display_order": r.display_order,
    }


class RefillIn(BaseModel):
    slug: Optional[str] = None
    name: str
    description: Optional[str] = None
    price_inr: int = 99
    amount_minutes: int = 30
    bonus_minutes: int = 0
    is_active: bool = True
    display_order: int = 100


@router.get("/refill-packs")
def admin_list_refills(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                       _: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(RefillPack).order_by(RefillPack.display_order.asc(), RefillPack.price_inr.asc())
    items, total = paginate(q, page, page_size)
    return _page([_refill_dict(r) for r in items], total, page, page_size)


@router.post("/refill-packs")
def admin_create_refill(body: RefillIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    slug = (body.slug or body.name).strip().lower().replace(" ", "-")
    if db.query(RefillPack).filter(RefillPack.slug == slug).first():
        raise HTTPException(status_code=400, detail="A refill pack with this slug already exists")
    r = RefillPack(
        slug=slug, name=body.name, description=body.description, price_inr=body.price_inr,
        amount_seconds=body.amount_minutes * 60, bonus_seconds=body.bonus_minutes * 60,
        is_active=body.is_active, display_order=body.display_order,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _refill_dict(r)


@router.put("/refill-packs/{refill_id}")
def admin_update_refill(refill_id: str, body: RefillIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    r = db.query(RefillPack).filter(RefillPack.id == refill_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Refill pack not found")
    r.name = body.name
    r.description = body.description
    r.price_inr = body.price_inr
    r.amount_seconds = body.amount_minutes * 60
    r.bonus_seconds = body.bonus_minutes * 60
    r.is_active = body.is_active
    r.display_order = body.display_order
    db.commit()
    db.refresh(r)
    return _refill_dict(r)


@router.delete("/refill-packs/{refill_id}")
def admin_delete_refill(refill_id: str, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    r = db.query(RefillPack).filter(RefillPack.id == refill_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Refill pack not found")
    db.delete(r)
    db.commit()
    return {"status": "deleted"}


# ── Coupons CRUD ──────────────────────────────────────────────────────────────

def _coupon_dict(c: Coupon) -> dict:
    return {
        "id": c.id, "code": c.code, "description": c.description,
        "discount_type": c.discount_type, "discount_value": c.discount_value,
        "applies_to": c.applies_to, "min_amount_inr": c.min_amount_inr,
        "max_redemptions": c.max_redemptions, "redeemed_count": c.redeemed_count,
        "per_user_limit": c.per_user_limit, "is_active": c.is_active,
        "starts_at": c.starts_at.isoformat() if c.starts_at else None,
        "expires_at": c.expires_at.isoformat() if c.expires_at else None,
    }


class CouponIn(BaseModel):
    code: str
    description: Optional[str] = None
    discount_type: str = "percent"     # percent | flat
    discount_value: int = 10
    applies_to: str = "all"            # all | plan | refill
    min_amount_inr: int = 0
    max_redemptions: Optional[int] = None
    per_user_limit: int = 1
    starts_at: Optional[str] = None
    expires_at: Optional[str] = None
    is_active: bool = True


def _parse_dt(v: Optional[str]):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


@router.get("/coupons")
def admin_list_coupons(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                       _: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(Coupon).order_by(Coupon.created_at.desc())
    items, total = paginate(q, page, page_size)
    return _page([_coupon_dict(c) for c in items], total, page, page_size)


@router.post("/coupons")
def admin_create_coupon(body: CouponIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    code = body.code.strip().upper()
    if db.query(Coupon).filter(Coupon.code == code).first():
        raise HTTPException(status_code=400, detail="A coupon with this code already exists")
    c = Coupon(
        code=code, description=body.description, discount_type=body.discount_type,
        discount_value=body.discount_value, applies_to=body.applies_to,
        min_amount_inr=body.min_amount_inr, max_redemptions=body.max_redemptions,
        per_user_limit=body.per_user_limit, is_active=body.is_active,
        starts_at=_parse_dt(body.starts_at), expires_at=_parse_dt(body.expires_at),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _coupon_dict(c)


@router.put("/coupons/{coupon_id}")
def admin_update_coupon(coupon_id: str, body: CouponIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Coupon not found")
    c.code = body.code.strip().upper()
    c.description = body.description
    c.discount_type = body.discount_type
    c.discount_value = body.discount_value
    c.applies_to = body.applies_to
    c.min_amount_inr = body.min_amount_inr
    c.max_redemptions = body.max_redemptions
    c.per_user_limit = body.per_user_limit
    c.is_active = body.is_active
    c.starts_at = _parse_dt(body.starts_at)
    c.expires_at = _parse_dt(body.expires_at)
    db.commit()
    db.refresh(c)
    return _coupon_dict(c)


@router.delete("/coupons/{coupon_id}")
def admin_delete_coupon(coupon_id: str, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Coupon not found")
    db.delete(c)
    db.commit()
    return {"status": "deleted"}


@router.get("/coupons/{coupon_id}/redemptions")
def admin_coupon_redemptions(coupon_id: str, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                             _: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(CouponRedemption).filter(CouponRedemption.coupon_id == coupon_id).order_by(CouponRedemption.created_at.desc())
    items, total = paginate(q, page, page_size)
    uids = [r.user_id for r in items]
    emails = {u.id: u.email for u in db.query(User.id, User.email).filter(User.id.in_(uids)).all()} if uids else {}
    return _page([{
        "id": r.id, "user_id": r.user_id, "user_email": emails.get(r.user_id, ""),
        "discount_inr": r.discount_inr, "payment_id": r.payment_id,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in items], total, page, page_size)


# ── Subscriptions list ────────────────────────────────────────────────────────

@router.get("/subscriptions")
def admin_list_subscriptions(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                             status: Optional[str] = Query(None),
                             _: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(Subscription).order_by(Subscription.created_at.desc())
    if status:
        q = q.filter(Subscription.status == status)
    items, total = paginate(q, page, page_size)
    uids = [s.user_id for s in items]
    emails = {u.id: u.email for u in db.query(User.id, User.email).filter(User.id.in_(uids)).all()} if uids else {}
    pids = [s.plan_id for s in items if s.plan_id]
    plan_names = {p.id: p.name for p in db.query(Plan.id, Plan.name).filter(Plan.id.in_(pids)).all()} if pids else {}
    return _page([{
        "id": s.id, "user_id": s.user_id, "user_email": emails.get(s.user_id, ""),
        "plan": s.plan, "plan_name": plan_names.get(s.plan_id, s.plan), "status": s.status,
        "amount": s.amount, "interval": s.interval,
        "razorpay_subscription_id": s.razorpay_subscription_id,
        "current_period_end": s.current_period_end.isoformat() if s.current_period_end else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    } for s in items], total, page, page_size)


class GrantSubscriptionIn(BaseModel):
    user_email: str
    plan_id: str


@router.post("/subscriptions/grant")
def admin_grant_subscription(body: GrantSubscriptionIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Give a user a plan for free (₹0) — e.g. comp a teammate onto Pro. Records
    a ₹0 paid Payment and activates the subscription + grants the cycle."""
    from app.subscription.router import _activate_subscription
    target = db.query(User).filter(User.email == body.user_email.strip().lower()).first()
    if not target:
        raise HTTPException(status_code=404, detail="No user with that email")
    plan = db.query(Plan).filter(Plan.id == body.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    payment = Payment(user_id=target.id, type="subscription", plan_id=plan.id, plan=plan.slug,
                      base_amount_inr=plan.price_inr, discount_inr=plan.price_inr, amount=0,
                      coupon_code=f"ADMIN_GRANT:{admin.email}", status="paid",
                      razorpay_payment_id=f"grant_{target.id[:8]}")
    db.add(payment)
    _activate_subscription(db, target.id, plan, payment_id=payment.razorpay_payment_id, razorpay_subscription_id=None)
    db.commit()
    logger.info("Admin %s granted plan %s to %s (free)", admin.email, plan.slug, target.email)
    return {"status": "granted", "user_email": target.email, "plan": plan.name}


# ── Per-user usage ────────────────────────────────────────────────────────────

@router.get("/usage")
def admin_list_usage(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                     q: Optional[str] = Query(None, description="filter by user email"),
                     _: User = Depends(require_admin), db: Session = Depends(get_db)):
    query = db.query(UsageAccount).order_by(UsageAccount.updated_at.desc())
    if q:
        matching = db.query(User.id).filter(User.email.ilike(f"%{q}%")).subquery()
        query = query.filter(UsageAccount.user_id.in_(matching))
    items, total = paginate(query, page, page_size)
    uids = [a.user_id for a in items]
    emails = {u.id: u.email for u in db.query(User.id, User.email).filter(User.id.in_(uids)).all()} if uids else {}
    out = []
    for a in items:
        avail = usage_svc.available_seconds(a)
        out.append({
            "user_id": a.user_id, "user_email": emails.get(a.user_id, ""),
            "resource_type": a.resource_type, "source": a.source,
            "allowance_seconds": a.allowance_seconds, "used_seconds": a.used_seconds,
            "refill_seconds": a.refill_seconds, "available_seconds": avail,
            "available_minutes": avail // 60,
            "percent_used": usage_svc.percent_used(a),
            "cycle_end": a.cycle_end.isoformat() if a.cycle_end else None,
        })
    return _page(out, total, page, page_size)


class UsageAdjustIn(BaseModel):
    minutes: Optional[int] = None   # interview minutes: positive grant, negative deduct
    tokens: Optional[int] = None    # LLM tokens: positive grant, negative deduct


@router.post("/usage/{user_id}/adjust")
def admin_adjust_usage(user_id: str, body: UsageAdjustIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not db.query(User.id).filter(User.id == user_id).first():
        raise HTTPException(status_code=404, detail="User not found")
    if body.minutes is None and body.tokens is None:
        raise HTTPException(status_code=400, detail="Provide minutes or tokens to adjust")
    if body.tokens is not None:
        account = usage_svc.admin_adjust(db, user_id, body.tokens, ref_id=f"admin:{admin.id}",
                                         resource=usage_svc.RESOURCE_TOKENS)
        avail = usage_svc.available_seconds(account)
        logger.info("Admin %s adjusted tokens for %s by %s -> %s", admin.id, user_id, body.tokens, avail)
        return {"user_id": user_id, "resource_type": usage_svc.RESOURCE_TOKENS,
                "available_tokens": avail}
    account = usage_svc.admin_adjust(db, user_id, body.minutes * 60, ref_id=f"admin:{admin.id}")
    avail = usage_svc.available_seconds(account)
    logger.info("Admin %s adjusted usage for %s by %s min -> %ss", admin.id, user_id, body.minutes, avail)
    return {"user_id": user_id, "available_seconds": avail, "available_minutes": avail // 60}


# ── Users list (paginated) ────────────────────────────────────────────────────

@router.get("/users")
def admin_list_users(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                     q: Optional[str] = Query(None),
                     _: User = Depends(require_admin), db: Session = Depends(get_db)):
    query = db.query(User).order_by(User.created_at.desc())
    if q:
        query = query.filter(User.email.ilike(f"%{q}%"))
    items, total = paginate(query, page, page_size)
    # active subscription flags
    uids = [u.id for u in items]
    subbed = {s.user_id for s in db.query(Subscription.user_id).filter(
        Subscription.user_id.in_(uids), Subscription.status == "active").all()} if uids else set()
    return _page([{
        "id": u.id, "email": u.email, "name": u.full_name, "is_admin": u.is_admin,
        "is_subscribed": u.id in subbed,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in items], total, page, page_size)


# ── Settings ──────────────────────────────────────────────────────────────────

class SettingsIn(BaseModel):
    free_trial_interview_seconds: Optional[int] = None
    free_trial_tokens: Optional[int] = None
    usd_to_inr_rate: Optional[float] = None
    interview_hard_cap_seconds: Optional[int] = None
    resume_uploads_per_day: Optional[int] = None


@router.get("/settings")
def admin_get_settings(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return usage_svc.get_all_settings(db)


@router.put("/settings")
def admin_update_settings(body: SettingsIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    for key, val in body.model_dump(exclude_none=True).items():
        usage_svc.set_setting(db, key, val)
    return usage_svc.get_all_settings(db)


# ── Profit & Loss ─────────────────────────────────────────────────────────────

@router.get("/profit-loss")
def admin_profit_loss(days: int = Query(30, ge=1, le=365),
                      _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Revenue (paid payments, INR) minus LLM cost (usd × rate) with per-plan
    margins, top loss-making users, a daily series, and generated suggestions."""
    since = datetime.utcnow() - timedelta(days=days)
    rate = float(usage_svc.get_setting(db, "usd_to_inr_rate") or settings.USD_TO_INR_RATE)

    paid = db.query(Payment).filter(Payment.status == "paid", Payment.created_at >= since)

    revenue_inr = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.status == "paid", Payment.created_at >= since).scalar() or 0
    refunds_inr = db.query(func.coalesce(func.sum(Payment.refund_amount), 0)).filter(
        Payment.status == "refunded", Payment.created_at >= since).scalar() or 0
    net_revenue_inr = revenue_inr - refunds_inr

    # revenue split by type
    by_type = [
        {"type": t or "unknown", "count": c, "revenue_inr": int(r or 0)}
        for t, c, r in paid.with_entities(
            Payment.type, func.count(Payment.id), func.sum(Payment.amount)
        ).group_by(Payment.type).all()
    ]

    # LLM cost (USD) → INR
    cost_usd = db.query(func.coalesce(func.sum(LlmUsageLog.cost_usd), 0.0)).filter(
        LlmUsageLog.created_at >= since).scalar() or 0.0
    cost_inr = round(cost_usd * rate, 2)
    gross_profit_inr = round(net_revenue_inr - cost_inr, 2)
    margin_pct = round((gross_profit_inr / net_revenue_inr * 100), 1) if net_revenue_inr else 0.0

    # Per-plan margin: revenue from subscription payments per plan vs a rough
    # cost share (cost attributed by that plan's users' LLM spend).
    plan_rows = db.query(
        Payment.plan_id, func.count(Payment.id), func.coalesce(func.sum(Payment.amount), 0)
    ).filter(Payment.status == "paid", Payment.type == "subscription",
             Payment.created_at >= since).group_by(Payment.plan_id).all()
    plan_names = {p.id: p.name for p in db.query(Plan.id, Plan.name).all()}
    per_plan = [{
        "plan_id": pid, "plan_name": plan_names.get(pid, pid or "unknown"),
        "count": c, "revenue_inr": int(r or 0),
    } for pid, c, r in plan_rows]

    # Top loss-making users: LLM cost (INR) vs their paid revenue (INR).
    cost_by_user = dict(db.query(
        LlmUsageLog.user_id, func.coalesce(func.sum(LlmUsageLog.cost_usd), 0.0)
    ).filter(LlmUsageLog.created_at >= since).group_by(LlmUsageLog.user_id).all())
    rev_by_user = dict(db.query(
        Payment.user_id, func.coalesce(func.sum(Payment.amount), 0)
    ).filter(Payment.status == "paid", Payment.created_at >= since).group_by(Payment.user_id).all())
    loss_users = []
    for uid, c_usd in cost_by_user.items():
        if not uid:
            continue
        c_inr = round((c_usd or 0) * rate, 2)
        r_inr = int(rev_by_user.get(uid, 0) or 0)
        loss_users.append({"user_id": uid, "cost_inr": c_inr, "revenue_inr": r_inr,
                           "net_inr": round(r_inr - c_inr, 2)})
    loss_users.sort(key=lambda x: x["net_inr"])
    loss_users = loss_users[:10]
    luids = [x["user_id"] for x in loss_users]
    lemails = {u.id: u.email for u in db.query(User.id, User.email).filter(User.id.in_(luids)).all()} if luids else {}
    for x in loss_users:
        x["user_email"] = lemails.get(x["user_id"], "")

    # Daily series
    daily = {}
    for d, r in db.query(func.date(Payment.created_at), func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.status == "paid", Payment.created_at >= since).group_by(func.date(Payment.created_at)).all():
        daily.setdefault(str(d), {"date": str(d), "revenue_inr": 0, "cost_inr": 0.0})["revenue_inr"] = int(r or 0)
    for d, c in db.query(func.date(LlmUsageLog.created_at), func.coalesce(func.sum(LlmUsageLog.cost_usd), 0.0)).filter(
            LlmUsageLog.created_at >= since).group_by(func.date(LlmUsageLog.created_at)).all():
        daily.setdefault(str(d), {"date": str(d), "revenue_inr": 0, "cost_inr": 0.0})["cost_inr"] = round((c or 0) * rate, 2)
    daily_series = sorted(daily.values(), key=lambda x: x["date"])

    # Suggestions
    suggestions = _profit_loss_suggestions(
        db, net_revenue_inr, cost_inr, gross_profit_inr, margin_pct, loss_users, rate, since)

    return {
        "days": days, "usd_to_inr_rate": rate,
        "revenue_inr": int(revenue_inr), "refunds_inr": int(refunds_inr),
        "net_revenue_inr": int(net_revenue_inr),
        "cost_usd": round(cost_usd, 4), "cost_inr": cost_inr,
        "gross_profit_inr": gross_profit_inr, "margin_pct": margin_pct,
        "revenue_by_type": by_type, "per_plan": per_plan,
        "loss_making_users": loss_users, "daily": daily_series,
        "suggestions": suggestions,
    }


def _profit_loss_suggestions(db, net_revenue, cost_inr, gross_profit, margin_pct,
                             loss_users, rate, since) -> List[str]:
    s = []
    if gross_profit < 0:
        s.append(f"⚠️ Operating at a loss of ₹{abs(gross_profit):,.0f} — LLM cost (₹{cost_inr:,.0f}) "
                 f"exceeds net revenue (₹{net_revenue:,.0f}). Raise plan prices or reduce included minutes.")
    elif margin_pct < 40 and net_revenue > 0:
        s.append(f"Margin is {margin_pct}% — thin. Consider trimming trial minutes or increasing refill prices.")
    else:
        s.append(f"Healthy margin at {margin_pct}% (₹{gross_profit:,.0f} profit).")

    # Trial-only users burning cost with no revenue
    trial_cost = 0.0
    from app.models import LlmUsageLog, Payment
    paid_uids = {p.user_id for p in db.query(Payment.user_id).filter(
        Payment.status == "paid", Payment.created_at >= since).all()}
    for uid, c_usd in db.query(LlmUsageLog.user_id, func.coalesce(func.sum(LlmUsageLog.cost_usd), 0.0)).filter(
            LlmUsageLog.created_at >= since).group_by(LlmUsageLog.user_id).all():
        if uid and uid not in paid_uids:
            trial_cost += (c_usd or 0)
    if trial_cost > 0:
        s.append(f"Non-paying users consumed ~₹{trial_cost * rate:,.0f} of LLM cost. "
                 f"Lower the free trial minutes if conversion is weak.")

    if loss_users and loss_users[0]["net_inr"] < 0:
        u = loss_users[0]
        s.append(f"Heaviest loss user ({u.get('user_email') or u['user_id'][:8]}) is ₹{abs(u['net_inr']):,.0f} "
                 f"in the red — check for abuse or a very heavy free-tier user.")

    # Cheapest active plan sanity check vs cost per minute
    cheapest = db.query(Plan).filter(Plan.is_active == True, Plan.price_inr > 0).order_by(  # noqa: E712
        Plan.price_inr.asc()).first()
    if cheapest and cheapest.interview_minutes:
        per_min = cheapest.price_inr / cheapest.interview_minutes
        s.append(f"'{cheapest.name}' bills ₹{per_min:.1f}/min. Ensure that comfortably exceeds your "
                 f"LLM cost per interview minute after the {rate:.0f} USD→INR conversion.")
    return s
