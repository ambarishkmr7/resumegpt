"""Subscription, refills, coupons + Razorpay payments.

Two purchase rails, both server-verified (the client-supplied amount is never
trusted — every price is recomputed from the DB):

- **Monthly plan** — pay via a one-time Razorpay *order* each month (coupon-
  eligible), or via a true recurring Razorpay *subscription* (auto-charge
  mandate) when the plan has a razorpay_plan_id.
- **Refill pack** — one-time Razorpay *order* that tops up interview minutes.

Fulfilment (granting minutes / activating the subscription) happens in
``_fulfil_payment`` and is reused by the verify-payment callback, the demo
checkout, and the Razorpay webhook (app/subscription/webhook.py).
"""
import hashlib
import hmac
import logging
from datetime import datetime, timedelta

import httpx
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.config import get_settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models import Coupon, Payment, Plan, RefillPack, Subscription, User
from app.subscription import coupons as coupon_svc
from app.subscription import usage as usage_svc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/subscription", tags=["subscription"])
settings = get_settings()


def _razorpay_live() -> bool:
    return bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)


# ── Stale-payment expiry ──────────────────────────────────────────────────────
# A Razorpay checkout that was opened but never completed leaves a Payment row
# stuck in "created". Three layers guarantee it gets marked "failed" after
# 30 minutes even if nobody ever opens a payments page:
#
#   1. A precise APScheduler one-shot job per payment, scheduled at order
#      creation for exactly +30 min (schedule_payment_expiry below).
#   2. A periodic APScheduler sweep every 5 min (registered in app/main.py) —
#      catches one-shot jobs lost to a server restart, since one-shot jobs
#      live in memory only.
#   3. A lazy sweep on the user/admin payment-history endpoints — covers
#      serverless deploys where no long-lived scheduler process exists.
#
# All are safe against races: if Razorpay later confirms the charge (webhook
# retry / verify callback), those paths overwrite the status to "paid"
# regardless of the intermediate "failed".

PAYMENT_EXPIRY_MINUTES = 30


def expire_stale_payments(db: Session | None = None) -> int:
    """Mark every 'created' payment older than the expiry window as failed.
    Callable with an existing session (endpoints) or without one (scheduler)."""
    from app.database import SessionLocal
    own_session = db is None
    if own_session:
        db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(minutes=PAYMENT_EXPIRY_MINUTES)
        rows = (
            db.query(Payment)
            .filter(Payment.status == "created", Payment.created_at < cutoff)
            .all()
        )
        for p in rows:
            p.status = "failed"
            p.error_message = f"Checkout not completed within {PAYMENT_EXPIRY_MINUTES} minutes"
            p.updated_at = datetime.utcnow()
        if rows:
            db.commit()
            logger.info("Expired %d stale 'created' payment(s)", len(rows))
        return len(rows)
    finally:
        if own_session:
            db.close()


def mark_payment_failed_if_pending(payment_id: str) -> None:
    """APScheduler one-shot target: fail this payment iff it's still 'created'.
    Runs in the scheduler's worker thread with its own DB session."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        payment = db.query(Payment).filter(Payment.id == payment_id).first()
        if payment and payment.status == "created":
            payment.status = "failed"
            payment.error_message = f"Checkout not completed within {PAYMENT_EXPIRY_MINUTES} minutes"
            payment.updated_at = datetime.utcnow()
            db.commit()
            logger.info("Scheduled expiry: payment %s marked failed", payment_id)
    except Exception:
        logger.exception("Scheduled payment expiry failed for %s", payment_id)
        db.rollback()
    finally:
        db.close()


def schedule_payment_expiry(payment_id: str) -> None:
    """Queue the precise +30 min expiry check for a freshly created payment.
    Best-effort — the periodic sweep is the safety net if this can't run."""
    try:
        from app.core.scheduler import scheduler
        scheduler.add_job(
            mark_payment_failed_if_pending,
            "date",
            run_date=datetime.utcnow() + timedelta(minutes=PAYMENT_EXPIRY_MINUTES),
            args=[payment_id],
            id=f"expire_payment_{payment_id}",
            replace_existing=True,
            misfire_grace_time=3600,  # still run if the loop was busy/asleep
        )
    except Exception:
        logger.warning("Could not schedule payment expiry for %s (sweep will catch it)", payment_id)


def cancel_payment_expiry(payment_id: str) -> None:
    """Drop the pending expiry job once a payment is confirmed (best-effort —
    the job itself re-checks status, so a missed cancel is harmless)."""
    try:
        from app.core.scheduler import scheduler
        scheduler.remove_job(f"expire_payment_{payment_id}")
    except Exception:
        pass


# ── Serialization ─────────────────────────────────────────────────────────────

def _plan_public(p: Plan) -> dict:
    return {
        "id": p.id, "slug": p.slug, "name": p.name, "description": p.description,
        "price_inr": p.price_inr, "billing_interval": p.billing_interval,
        "interview_minutes": p.interview_minutes,
        "monthly_tokens": int((p.allowances or {}).get("llm_tokens", 0) or 0),
        "features": p.features or [],
        "badge": p.badge, "is_default": p.is_default,
        "recurring": bool(p.razorpay_plan_id),
    }


def _refill_public(r: RefillPack) -> dict:
    total_min = (r.amount_seconds + r.bonus_seconds) // 60
    return {
        "id": r.id, "slug": r.slug, "name": r.name, "description": r.description,
        "price_inr": r.price_inr, "minutes": r.amount_seconds // 60,
        "bonus_minutes": r.bonus_seconds // 60, "total_minutes": total_min,
    }


# ── Public catalogue ──────────────────────────────────────────────────────────

@router.get("/plans")
def list_plans(db: Session = Depends(get_db)):
    plans = db.query(Plan).filter(Plan.is_active == True).order_by(  # noqa: E712
        Plan.display_order.asc(), Plan.price_inr.asc()).all()
    return {"plans": [_plan_public(p) for p in plans],
            "razorpay_key_id": settings.RAZORPAY_KEY_ID}


@router.get("/refill-packs")
def list_refill_packs(db: Session = Depends(get_db)):
    packs = db.query(RefillPack).filter(RefillPack.is_active == True).order_by(  # noqa: E712
        RefillPack.display_order.asc(), RefillPack.price_inr.asc()).all()
    return {"refill_packs": [_refill_public(r) for r in packs],
            "razorpay_key_id": settings.RAZORPAY_KEY_ID}


# ── Status + usage ────────────────────────────────────────────────────────────

class SubscriptionStatus(BaseModel):
    is_subscribed: bool = False
    plan: Optional[str] = None
    plan_name: Optional[str] = None
    amount: int = 0
    status: Optional[str] = None
    current_period_end: Optional[str] = None
    payment_id: Optional[str] = None
    created_at: Optional[str] = None
    razorpay_key_id: str = ""
    usage: Optional[dict] = None
    used_freepass: bool = False


def _used_freepass(db: Session, user_id: str) -> bool:
    """True if the user ever redeemed a 100%-off coupon (comped access) —
    such users shouldn't be shown purchase/upsell prompts."""
    from app.models import CouponRedemption
    return db.query(CouponRedemption.id).join(
        Coupon, Coupon.id == CouponRedemption.coupon_id
    ).filter(
        CouponRedemption.user_id == user_id,
        Coupon.discount_type == "percent",
        Coupon.discount_value >= 100,
    ).first() is not None


def _status_payload(db: Session, user: User) -> SubscriptionStatus:
    usage = usage_svc.full_usage_summary(db, user.id)
    freepass = _used_freepass(db, user.id)
    sub = db.query(Subscription).filter(
        Subscription.user_id == user.id, Subscription.status == "active",
    ).first()
    if sub and (not sub.current_period_end or sub.current_period_end >= datetime.utcnow()):
        plan = db.query(Plan).filter(Plan.id == sub.plan_id).first() if sub.plan_id else None
        return SubscriptionStatus(
            is_subscribed=True, plan=sub.plan, plan_name=plan.name if plan else sub.plan,
            amount=sub.amount, status=sub.status, payment_id=sub.payment_id,
            current_period_end=sub.current_period_end.isoformat() if sub.current_period_end else None,
            created_at=sub.created_at.isoformat() if sub.created_at else None,
            razorpay_key_id=settings.RAZORPAY_KEY_ID, usage=usage, used_freepass=freepass,
        )
    return SubscriptionStatus(is_subscribed=False, razorpay_key_id=settings.RAZORPAY_KEY_ID,
                              usage=usage, used_freepass=freepass)


@router.get("/status", response_model=SubscriptionStatus)
def get_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _status_payload(db, user)


@router.get("/usage")
def get_usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Balance meters: interview minutes (legacy top-level keys) + token and
    resume-upload usage (percent-based) — powers all user-side usage meters."""
    return usage_svc.full_usage_summary(db, user.id)


# ── Coupon validation ─────────────────────────────────────────────────────────

class CouponValidateRequest(BaseModel):
    code: str
    kind: str            # "plan" | "refill"
    target_id: str       # plan id or refill pack id


@router.post("/coupon/validate")
def validate_coupon(payload: CouponValidateRequest,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    base = _base_price(db, payload.kind, payload.target_id)
    try:
        coupon, discount = coupon_svc.validate_coupon(db, payload.code, user.id, payload.kind, base)
    except coupon_svc.CouponError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"valid": True, "code": coupon.code, "base_inr": base,
            "discount_inr": discount, "final_inr": base - discount,
            "discount_type": coupon.discount_type, "discount_value": coupon.discount_value}


def _base_price(db: Session, kind: str, target_id: str) -> int:
    if kind == "plan":
        obj = db.query(Plan).filter(Plan.id == target_id, Plan.is_active == True).first()  # noqa: E712
    elif kind == "refill":
        obj = db.query(RefillPack).filter(RefillPack.id == target_id, RefillPack.is_active == True).first()  # noqa: E712
    else:
        raise HTTPException(status_code=400, detail="Invalid purchase kind")
    if not obj:
        raise HTTPException(status_code=404, detail=f"{kind.title()} not found or inactive")
    return obj.price_inr


# ── Create order (one-time: refill, or manual monthly plan) ───────────────────

class CreateOrderRequest(BaseModel):
    kind: str = "refill"          # "refill" | "plan"
    target_id: str                # refill pack id or plan id
    coupon_code: Optional[str] = None


class CreateOrderResponse(BaseModel):
    order_id: Optional[str] = None
    amount: int                   # paise
    currency: str = "INR"
    razorpay_key_id: str = ""
    kind: str
    base_inr: int
    discount_inr: int
    final_inr: int
    free: bool = False            # True ⇒ activated immediately (₹0 after coupon)


def _active_sub_or_none(db: Session, user_id: str):
    sub = db.query(Subscription).filter(
        Subscription.user_id == user_id, Subscription.status == "active").first()
    if sub and (not sub.current_period_end or sub.current_period_end >= datetime.utcnow()):
        return sub
    return None


def _reject_duplicate_plan_purchase(db: Session, user_id: str, plan_id: str) -> None:
    """A user who already has this exact plan active shouldn't be able to buy
    it again mid-cycle (this is where piles of duplicate 'created' payments
    came from). Buying a *different* plan (up/downgrade) stays allowed."""
    sub = _active_sub_or_none(db, user_id)
    if sub and sub.plan_id == plan_id:
        until = sub.current_period_end.strftime("%d %b %Y") if sub.current_period_end else "the end of this cycle"
        raise HTTPException(
            status_code=409,
            detail=f"You're already subscribed to this plan (active until {until}). "
                   "You can buy a refill pack or switch to a different plan instead.",
        )


@router.post("/create-order", response_model=CreateOrderResponse)
def create_order(payload: CreateOrderRequest,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.kind == "plan":
        _reject_duplicate_plan_purchase(db, user.id, payload.target_id)
    base = _base_price(db, payload.kind, payload.target_id)
    discount = 0
    coupon = None
    if payload.coupon_code:
        try:
            coupon, discount = coupon_svc.validate_coupon(db, payload.coupon_code, user.id, payload.kind, base)
        except coupon_svc.CouponError as e:
            raise HTTPException(status_code=400, detail=str(e))
    final = max(0, base - discount)

    payment = Payment(
        user_id=user.id, type="subscription" if payload.kind == "plan" else "refill",
        plan_id=payload.target_id if payload.kind == "plan" else None,
        refill_pack_id=payload.target_id if payload.kind == "refill" else None,
        plan=_slug_for(db, payload.kind, payload.target_id),
        base_amount_inr=base, discount_inr=discount, amount=final,
        coupon_code=coupon.code if coupon else None,
    )

    # ── ₹0 after coupon → legitimately free: activate immediately, no gateway.
    if final <= 0:
        payment.status = "paid"
        payment.razorpay_payment_id = f"free_{user.id[:8]}"
        db.add(payment)
        _fulfil_payment(db, payment)
        db.commit()
        logger.info("Free activation (₹0 via coupon) — user=%s kind=%s coupon=%s",
                    user.id, payload.kind, coupon.code if coupon else None)
        return CreateOrderResponse(amount=0, kind=payload.kind, base_inr=base,
                                   discount_inr=discount, final_inr=0, free=True)

    # ── Paid: a real Razorpay gateway is required. No silent bypass.
    if not _razorpay_live():
        raise HTTPException(
            status_code=503,
            detail=("Online payments aren't configured yet. Apply a 100%-off coupon, "
                    "or ask an admin to grant you a plan."),
        )

    try:
        resp = httpx.post(
            "https://api.razorpay.com/v1/orders",
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
            json={"amount": final * 100, "currency": "INR",
                  "receipt": f"rcpt_{user.id[:8]}_{payload.kind}",
                  "notes": {"user_id": user.id, "kind": payload.kind,
                            "target_id": payload.target_id, "email": user.email,
                            "coupon": coupon.code if coupon else ""}},
            timeout=15,
        )
        resp.raise_for_status()
        order = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {str(e)}")

    payment.razorpay_order_id = order["id"]
    payment.status = "created"
    db.add(payment)
    db.commit()
    db.refresh(payment)
    schedule_payment_expiry(payment.id)  # auto-fail in 30 min if checkout is abandoned
    logger.info("Order created: %s (user=%s, kind=%s, ₹%s)", order["id"], user.id, payload.kind, final)
    return CreateOrderResponse(order_id=order["id"], amount=final * 100,
                               razorpay_key_id=settings.RAZORPAY_KEY_ID, kind=payload.kind,
                               base_inr=base, discount_inr=discount, final_inr=final)


def _slug_for(db: Session, kind: str, target_id: str) -> str:
    if kind == "plan":
        p = db.query(Plan).filter(Plan.id == target_id).first()
        return p.slug if p else "plan"
    r = db.query(RefillPack).filter(RefillPack.id == target_id).first()
    return r.slug if r else "refill"


# ── Create recurring subscription (Razorpay Subscriptions API) ────────────────

class CreateSubscriptionRequest(BaseModel):
    plan_id: str


class CreateSubscriptionResponse(BaseModel):
    subscription_id: str
    razorpay_key_id: str
    plan_id: str
    amount: int          # paise (first charge)
    demo: bool = False


@router.post("/create-subscription", response_model=CreateSubscriptionResponse)
def create_subscription(payload: CreateSubscriptionRequest,
                        user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == payload.plan_id, Plan.is_active == True).first()  # noqa: E712
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found or inactive")
    _reject_duplicate_plan_purchase(db, user.id, plan.id)

    # Recurring auto-charge requires live Razorpay keys + a razorpay_plan_id on
    # the plan. No silent bypass — callers should use the one-time order flow
    # (create-order) with a coupon, or ask an admin to grant the plan.
    if not _razorpay_live() or not plan.razorpay_plan_id:
        raise HTTPException(
            status_code=503,
            detail=("Recurring billing isn't configured for this plan. Use the one-time "
                    "checkout (with a coupon if testing), or ask an admin to grant access."),
        )

    try:
        resp = httpx.post(
            "https://api.razorpay.com/v1/subscriptions",
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
            json={"plan_id": plan.razorpay_plan_id, "total_count": 120,
                  "customer_notify": 1,
                  "notes": {"user_id": user.id, "plan_id": plan.id, "email": user.email}},
            timeout=15,
        )
        resp.raise_for_status()
        sub = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Razorpay subscription creation failed: {str(e)}")

    payment = Payment(user_id=user.id, type="subscription", plan_id=plan.id, plan=plan.slug,
                      razorpay_subscription_id=sub["id"], base_amount_inr=plan.price_inr,
                      amount=plan.price_inr, status="created")
    db.add(payment)
    db.commit()
    db.refresh(payment)
    schedule_payment_expiry(payment.id)  # auto-fail in 30 min if checkout is abandoned
    logger.info("Razorpay subscription created: %s (user=%s, plan=%s)", sub["id"], user.id, plan.slug)
    return CreateSubscriptionResponse(subscription_id=sub["id"], razorpay_key_id=settings.RAZORPAY_KEY_ID,
                                      plan_id=plan.id, amount=plan.price_inr * 100)


# ── Verify payment (checkout callback for orders + subscriptions) ─────────────

class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_signature: str
    razorpay_order_id: Optional[str] = None
    razorpay_subscription_id: Optional[str] = None


@router.post("/verify-payment", response_model=SubscriptionStatus)
def verify_payment(payload: VerifyPaymentRequest,
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Locate the pending payment by order or subscription id.
    if payload.razorpay_order_id:
        payment = db.query(Payment).filter(
            Payment.razorpay_order_id == payload.razorpay_order_id, Payment.user_id == user.id).first()
        signed = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}"
        is_demo = payload.razorpay_order_id.startswith("order_demo")
    elif payload.razorpay_subscription_id:
        payment = db.query(Payment).filter(
            Payment.razorpay_subscription_id == payload.razorpay_subscription_id,
            Payment.user_id == user.id).first()
        # Razorpay subscription signature = HMAC(payment_id + '|' + subscription_id)
        signed = f"{payload.razorpay_payment_id}|{payload.razorpay_subscription_id}"
        is_demo = payload.razorpay_subscription_id.startswith("sub_demo")
    else:
        raise HTTPException(status_code=400, detail="Missing order or subscription id")

    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")

    if _razorpay_live() and not is_demo:
        expected = hmac.new(settings.RAZORPAY_KEY_SECRET.encode(), signed.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, payload.razorpay_signature):
            payment.status = "failed"
            payment.error_message = "Signature verification failed"
            db.commit()
            logger.warning("Payment signature verification failed (user=%s)", user.id)
            raise HTTPException(status_code=400, detail="Payment verification failed")

    payment.razorpay_payment_id = payload.razorpay_payment_id
    payment.razorpay_signature = payload.razorpay_signature
    payment.status = "paid"
    payment.updated_at = datetime.utcnow()
    cancel_payment_expiry(payment.id)

    _fulfil_payment(db, payment)
    db.commit()
    logger.info("Payment verified & fulfilled — user=%s type=%s payment=%s",
                user.id, payment.type, payload.razorpay_payment_id)
    return _status_payload(db, user)


# ── Fulfilment (shared by verify-payment, free activation, and the webhook) ───

def _activate_subscription(db: Session, user_id: str, plan: Plan,
                           payment_id: Optional[str], razorpay_subscription_id: Optional[str]) -> Subscription:
    now = datetime.utcnow()
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    if not sub:
        sub = Subscription(user_id=user_id)
        db.add(sub)
    sub.plan = plan.slug
    sub.plan_id = plan.id
    sub.amount = plan.price_inr
    sub.interval = plan.billing_interval or "monthly"
    sub.status = "active"
    sub.payment_id = payment_id
    sub.razorpay_subscription_id = razorpay_subscription_id
    sub.current_period_start = now
    sub.current_period_end = now + relativedelta(months=1)
    db.flush()
    usage_svc.grant_subscription_cycle(db, user_id)
    return sub


def _fulfil_payment(db: Session, payment: Payment) -> None:
    """Grant what the (paid) payment bought. Idempotent-ish: safe to re-run for
    subscriptions; refills are guarded by the caller (webhook dedupe / one call
    per verify)."""
    user_id = payment.user_id
    if payment.type == "refill":
        pack = db.query(RefillPack).filter(RefillPack.id == payment.refill_pack_id).first()
        if pack:
            usage_svc.grant_refill(db, user_id, pack.amount_seconds + pack.bonus_seconds, ref_id=payment.id)
    elif payment.type == "subscription":
        plan = db.query(Plan).filter(Plan.id == payment.plan_id).first()
        if plan:
            _activate_subscription(db, user_id, plan,
                                   payment_id=payment.razorpay_payment_id,
                                   razorpay_subscription_id=payment.razorpay_subscription_id)

    # Record coupon redemption once.
    if payment.coupon_code:
        coupon = db.query(Coupon).filter(Coupon.code == payment.coupon_code).first()
        if coupon:
            coupon_svc.record_redemption(db, coupon, user_id, payment.id, payment.discount_inr or 0)


# ── Dashboard nudges: recharge popup + loyalty win-back coupon ────────────────

def _paid_months(db: Session, user_id: str) -> list:
    """Distinct (year, month) tuples with at least one successful paid payment,
    ascending. ₹0 comped activations don't count as a 'recharge'."""
    rows = db.query(Payment.created_at).filter(
        Payment.user_id == user_id, Payment.status == "paid", Payment.amount > 0,
    ).order_by(Payment.created_at.asc()).all()
    months = []
    for (dt,) in rows:
        if dt:
            ym = (dt.year, dt.month)
            if ym not in months:
                months.append(ym)
    return months


def _has_three_consecutive(months: list) -> bool:
    def idx(ym):  # months since year 0
        return ym[0] * 12 + (ym[1] - 1)
    run = 1
    for a, b in zip(months, months[1:]):
        run = run + 1 if idx(b) - idx(a) == 1 else 1
        if run >= 3:
            return True
    return False


def _loyalty_coupon(db: Session, user: User) -> Optional[dict]:
    """10% win-back coupon for users who paid 3 consecutive months and then
    lapsed for 3+ months. Issued once per user as a personal coupon code."""
    months = _paid_months(db, user.id)
    if not _has_three_consecutive(months):
        return None
    last = db.query(Payment.created_at).filter(
        Payment.user_id == user.id, Payment.status == "paid", Payment.amount > 0,
    ).order_by(Payment.created_at.desc()).first()
    if not last or last[0] > datetime.utcnow() - relativedelta(months=3):
        return None  # still active/recent — no win-back needed

    code = f"LOYAL10-{user.id[:6].upper()}"
    coupon = db.query(Coupon).filter(Coupon.code == code).first()
    if not coupon:
        coupon = Coupon(
            code=code, description="10% welcome-back discount — thanks for being a loyal member!",
            discount_type="percent", discount_value=10, applies_to="all",
            per_user_limit=1, max_redemptions=1, is_active=True,
            expires_at=datetime.utcnow() + relativedelta(months=2),
        )
        db.add(coupon)
        db.commit()
        db.refresh(coupon)
        logger.info("Issued loyalty coupon %s to user %s", code, user.id)
    if not coupon.is_active or (coupon.redeemed_count or 0) >= 1:
        return None
    if coupon.expires_at and coupon.expires_at < datetime.utcnow():
        return None
    return {
        "code": coupon.code, "description": coupon.description,
        "discount_value": coupon.discount_value,
        "expires_at": coupon.expires_at.isoformat() if coupon.expires_at else None,
    }


@router.get("/nudges")
def dashboard_nudges(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """What the dashboard should surface: a recharge popup (no active plan or
    nearly-exhausted balance) and/or a personal loyalty discount coupon.
    Freepass (100%-off coupon) users are never nudged to purchase."""
    status = _status_payload(db, user)
    if status.used_freepass:
        return {"show_recharge": False, "recharge_reason": None, "loyalty_coupon": None}

    usage = status.usage or {}
    tokens = usage.get("tokens") or {}
    # Only treat a bucket as "low" when the user actually has a budget for it —
    # a plan with no token allowance configured reads as 100% used otherwise.
    audio_budget = (usage.get("allowance_seconds") or 0) + (usage.get("refill_seconds") or 0)
    audio_low = audio_budget > 0 and (usage.get("percent_used") or 0) >= 90
    tokens_low = bool(tokens.get("has_budget")) and (tokens.get("percent_used") or 0) >= 90
    show_recharge, reason = False, None
    if not status.is_subscribed:
        show_recharge, reason = True, "no_active_plan"
    elif audio_low or tokens_low:
        show_recharge, reason = True, "balance_low"

    return {
        "show_recharge": show_recharge,
        "recharge_reason": reason,
        "loyalty_coupon": _loyalty_coupon(db, user),
    }


@router.get("/payments")
def payment_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    expire_stale_payments(db)
    payments = db.query(Payment).filter(Payment.user_id == user.id).order_by(Payment.created_at.desc()).all()
    return [{"id": p.id, "order_id": p.razorpay_order_id, "payment_id": p.razorpay_payment_id,
             "type": p.type, "plan": p.plan, "amount": p.amount, "discount_inr": p.discount_inr,
             "coupon_code": p.coupon_code, "status": p.status,
             "created_at": p.created_at.isoformat() if p.created_at else None} for p in payments]
