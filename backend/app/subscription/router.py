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
from datetime import datetime, timedelta, timezone

import httpx
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import Optional

from app.config import get_settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models import Coupon, Payment, Plan, RefillPack, Subscription, User
from app.subscription import coupons as coupon_svc
from app.subscription import invoice as invoice_svc
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
        # A ₹0 tier is the free plan: shown in the pricing grid, never purchasable.
        "is_free": (p.price_inr or 0) <= 0,
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
    # ── Auto-payment (recurring mandate) ──
    auto_pay: bool = False            # a live mandate will charge the next cycle
    auto_pay_available: bool = False  # this plan *can* run on auto-pay
    cancel_at_period_end: bool = False


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


def _auto_pay_on(sub: Subscription) -> bool:
    """Auto-pay is on only when a Razorpay mandate exists *and* it hasn't been
    told to stop at the end of this cycle. A plan bought as a one-time order has
    no mandate, so it is always off."""
    return bool(sub.razorpay_subscription_id) and not sub.cancel_at_period_end


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
            auto_pay=_auto_pay_on(sub),
            auto_pay_available=bool(plan and plan.razorpay_plan_id and _razorpay_live()),
            cancel_at_period_end=bool(sub.cancel_at_period_end),
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
    if (obj.price_inr or 0) <= 0:
        # The ₹0 tier is the free plan. Without this it would fall through the
        # "free after coupon" branch below and hand out a real *subscription*
        # record — making a free user read as subscribed everywhere.
        raise HTTPException(
            status_code=400,
            detail="This is the free plan — there's nothing to pay for. It's already available to you.",
        )
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
    payment_ref: Optional[str] = None  # our Payment.id — key for the success page/invoice


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
        db.refresh(payment)
        logger.info("Free activation (₹0 via coupon) — user=%s kind=%s coupon=%s",
                    user.id, payload.kind, coupon.code if coupon else None)
        return CreateOrderResponse(amount=0, kind=payload.kind, base_inr=base,
                                   discount_inr=discount, final_inr=0, free=True,
                                   payment_ref=payment.id)

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
                               base_inr=base, discount_inr=discount, final_inr=final,
                               payment_ref=payment.id)


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
    payment_ref: Optional[str] = None  # our Payment.id — key for the success page/invoice


def _require_recurring_plan(plan: Plan) -> None:
    """Recurring auto-charge requires live Razorpay keys + a razorpay_plan_id on
    the plan. No silent bypass — callers should use the one-time order flow
    (create-order) with a coupon, or ask an admin to grant the plan."""
    if not _razorpay_live() or not plan.razorpay_plan_id:
        raise HTTPException(
            status_code=503,
            detail=("Auto-payment isn't configured for this plan. Pay once now, or ask an "
                    "admin to link a Razorpay plan id so recurring billing can be enabled."),
        )


def _open_mandate(db: Session, user: User, plan: Plan, start_at: datetime | None,
                  payment_type: str) -> tuple[dict, Payment]:
    """Create a Razorpay subscription (auto-debit mandate) + the local Payment row.

    ``start_at`` in the future defers the first charge to that moment — used when
    a user turns auto-pay on mid-cycle, so the period they already paid for isn't
    billed twice. Checkout still collects a mandate authorisation.
    """
    _require_recurring_plan(plan)
    body = {
        "plan_id": plan.razorpay_plan_id,
        "total_count": 120,
        "customer_notify": 1,
        "notes": {"user_id": user.id, "plan_id": plan.id, "email": user.email,
                  "purpose": payment_type},
    }
    if start_at and start_at > datetime.utcnow():
        # Period ends are stored as naive UTC. datetime.timestamp() would read a
        # naive value as *local* time, which on an IST server starts the mandate
        # 5.5 hours early — i.e. charges inside the period already paid for.
        body["start_at"] = int(start_at.replace(tzinfo=timezone.utc).timestamp())

    try:
        resp = httpx.post(
            "https://api.razorpay.com/v1/subscriptions",
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
            json=body, timeout=15,
        )
        resp.raise_for_status()
        sub = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Razorpay subscription creation failed: {str(e)}")

    # A deferred mandate charges nothing today, so the Payment row records ₹0 —
    # the real charge arrives later as a subscription.charged webhook.
    charged_now = 0 if body.get("start_at") else plan.price_inr
    payment = Payment(user_id=user.id, type=payment_type, plan_id=plan.id, plan=plan.slug,
                      razorpay_subscription_id=sub["id"], base_amount_inr=charged_now,
                      amount=charged_now, status="created")
    db.add(payment)
    db.commit()
    db.refresh(payment)
    schedule_payment_expiry(payment.id)  # auto-fail in 30 min if checkout is abandoned
    logger.info("Razorpay mandate created: %s (user=%s, plan=%s, purpose=%s, start_at=%s)",
                sub["id"], user.id, plan.slug, payment_type, body.get("start_at"))
    return sub, payment


@router.post("/create-subscription", response_model=CreateSubscriptionResponse)
def create_subscription(payload: CreateSubscriptionRequest,
                        user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Buy a plan *with* auto-payment — charges the first cycle now and leaves a
    mandate in place for subsequent months."""
    plan = db.query(Plan).filter(Plan.id == payload.plan_id, Plan.is_active == True).first()  # noqa: E712
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found or inactive")
    if (plan.price_inr or 0) <= 0:
        raise HTTPException(status_code=400, detail="The free plan can't be put on auto-payment.")
    _reject_duplicate_plan_purchase(db, user.id, plan.id)

    sub, payment = _open_mandate(db, user, plan, start_at=None, payment_type="subscription")
    return CreateSubscriptionResponse(subscription_id=sub["id"], razorpay_key_id=settings.RAZORPAY_KEY_ID,
                                      plan_id=plan.id, amount=plan.price_inr * 100,
                                      payment_ref=payment.id)


# ── Auto-payment toggle ───────────────────────────────────────────────────────

class AutoPayRequest(BaseModel):
    enabled: bool


class AutoPayResponse(BaseModel):
    auto_pay: bool
    message: str
    # Set when switching auto-pay ON needs a fresh mandate authorisation: the
    # client must run Razorpay Checkout with these and then call verify-payment.
    requires_checkout: bool = False
    subscription_id: Optional[str] = None
    razorpay_key_id: str = ""
    payment_ref: Optional[str] = None
    charges_now: int = 0        # rupees taken at checkout (0 for a deferred mandate)


def _cancel_mandate_at_cycle_end(sub: Subscription) -> None:
    """Tell Razorpay to stop after the cycle the user already paid for."""
    if not (sub.razorpay_subscription_id and _razorpay_live()):
        return
    try:
        resp = httpx.post(
            f"https://api.razorpay.com/v1/subscriptions/{sub.razorpay_subscription_id}/cancel",
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
            json={"cancel_at_cycle_end": 1}, timeout=15,
        )
        resp.raise_for_status()
    except Exception as e:
        # Never report auto-pay as off while Razorpay still holds a live mandate —
        # that would silently charge the user next month.
        raise HTTPException(
            status_code=502,
            detail=f"Could not turn auto-payment off at the payment gateway: {e}. "
                   "Nothing was changed — please try again.",
        )


@router.post("/auto-pay", response_model=AutoPayResponse)
def set_auto_pay(payload: AutoPayRequest,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Turn the recurring mandate on or off for the active plan.

    Off is immediate and safe: the mandate is cancelled at cycle end, so access
    the user already paid for is untouched. On needs a new authorisation —
    Razorpay has no 'resume', a cancelled mandate can only be replaced.
    """
    sub = _active_sub_or_none(db, user.id)
    if not sub:
        raise HTTPException(status_code=409, detail="You don't have an active plan to put on auto-payment.")

    if not payload.enabled:
        if not _auto_pay_on(sub):
            return AutoPayResponse(auto_pay=False, message="Auto-payment is already off.")
        _cancel_mandate_at_cycle_end(sub)
        sub.cancel_at_period_end = True
        db.commit()
        until = sub.current_period_end.strftime("%d %b %Y") if sub.current_period_end else "the end of this cycle"
        logger.info("Auto-pay disabled (user=%s, sub=%s)", user.id, sub.razorpay_subscription_id)
        return AutoPayResponse(
            auto_pay=False,
            message=f"Auto-payment is off. Your plan stays active until {until}, "
                    "and you won't be charged again.",
        )

    if _auto_pay_on(sub):
        return AutoPayResponse(auto_pay=True, message="Auto-payment is already on.")

    plan = db.query(Plan).filter(Plan.id == sub.plan_id).first() if sub.plan_id else None
    if not plan:
        raise HTTPException(status_code=409, detail="Your current plan is no longer available for auto-payment.")
    _require_recurring_plan(plan)

    # Defer the first auto-charge to the end of the period already paid for.
    rzp_sub, payment = _open_mandate(db, user, plan, start_at=sub.current_period_end,
                                     payment_type="mandate")
    return AutoPayResponse(
        auto_pay=False,  # not on until the mandate is authorised at checkout
        message="Approve the auto-payment mandate to finish turning it on.",
        requires_checkout=True,
        subscription_id=rzp_sub["id"],
        razorpay_key_id=settings.RAZORPAY_KEY_ID,
        payment_ref=payment.id,
        charges_now=payment.amount or 0,
    )


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

def _cancel_mandate_best_effort(razorpay_subscription_id: str, user_id: str) -> None:
    """Cancel a mandate we're about to stop tracking. Best-effort on purpose:
    this runs inside fulfilment of a payment the customer already made, so a
    gateway hiccup must not block their new plan from activating. Failures are
    logged loudly because they mean a live mandate is still out there."""
    if not _razorpay_live():
        return
    try:
        resp = httpx.post(
            f"https://api.razorpay.com/v1/subscriptions/{razorpay_subscription_id}/cancel",
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
            json={"cancel_at_cycle_end": 0}, timeout=15,
        )
        resp.raise_for_status()
        logger.info("Cancelled superseded mandate %s (user=%s)", razorpay_subscription_id, user_id)
    except Exception:
        logger.exception(
            "ORPHANED MANDATE: could not cancel %s for user %s while switching plans — "
            "this mandate may keep charging the customer; cancel it in the Razorpay dashboard",
            razorpay_subscription_id, user_id,
        )


def _activate_subscription(db: Session, user_id: str, plan: Plan,
                           payment_id: Optional[str], razorpay_subscription_id: Optional[str]) -> Subscription:
    now = datetime.utcnow()
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    if not sub:
        sub = Subscription(user_id=user_id)
        db.add(sub)
    # Switching plans replaces the row, so any mandate the old plan was running
    # would be orphaned: still live at Razorpay, still charging monthly, but no
    # longer recorded anywhere we could cancel it from. Stop it first.
    old_mandate = sub.razorpay_subscription_id
    if old_mandate and old_mandate != razorpay_subscription_id:
        _cancel_mandate_best_effort(old_mandate, user_id)

    sub.plan = plan.slug
    sub.plan_id = plan.id
    sub.amount = plan.price_inr
    sub.interval = plan.billing_interval or "monthly"
    sub.status = "active"
    sub.payment_id = payment_id
    sub.razorpay_subscription_id = razorpay_subscription_id
    # A fresh purchase always re-arms billing: bought with auto-pay ⇒ the mandate
    # runs; bought as a one-time order ⇒ there's no mandate to stop.
    sub.cancel_at_period_end = False
    sub.current_period_start = now
    sub.current_period_end = now + relativedelta(months=1)
    db.flush()
    usage_svc.grant_subscription_cycle(db, user_id)
    return sub


def _attach_mandate(db: Session, payment: Payment) -> None:
    """Auto-pay was switched on mid-cycle: bind the freshly authorised mandate to
    the existing subscription. Deliberately does *not* touch the billing period
    or grant a cycle — the user already paid for the period they're in, and the
    first auto-charge lands at renewal via the subscription.charged webhook."""
    sub = db.query(Subscription).filter(Subscription.user_id == payment.user_id).first()
    if not sub:
        logger.warning("Mandate %s authorised with no subscription to attach (user=%s)",
                       payment.razorpay_subscription_id, payment.user_id)
        return
    sub.razorpay_subscription_id = payment.razorpay_subscription_id
    sub.cancel_at_period_end = False
    db.flush()
    logger.info("Auto-pay enabled via mandate %s (user=%s)",
                payment.razorpay_subscription_id, payment.user_id)


def _fulfil_payment(db: Session, payment: Payment) -> None:
    """Grant what the (paid) payment bought. Idempotent-ish: safe to re-run for
    subscriptions; refills are guarded by the caller (webhook dedupe / one call
    per verify)."""
    user_id = payment.user_id
    if payment.type == "mandate":
        _attach_mandate(db, payment)
        return
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


def _find_user_payment(db: Session, user_id: str, ref: str) -> Payment:
    """Look a payment up by our own id, the Razorpay order id, or the Razorpay
    payment id — the success page only has whatever Checkout handed back."""
    payment = db.query(Payment).filter(
        Payment.user_id == user_id,
        or_(Payment.id == ref,
            Payment.razorpay_order_id == ref,
            Payment.razorpay_payment_id == ref),
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment


def _receipt_payload(db: Session, payment: Payment) -> dict:
    plan_name = None
    if payment.plan_id:
        plan = db.query(Plan).filter(Plan.id == payment.plan_id).first()
        plan_name = plan.name if plan else None
    elif payment.refill_pack_id:
        pack = db.query(RefillPack).filter(RefillPack.id == payment.refill_pack_id).first()
        plan_name = pack.name if pack else None
    return {
        "id": payment.id,
        "invoice_no": invoice_svc.invoice_number(payment),
        "type": payment.type,
        "plan": payment.plan,
        "plan_name": plan_name or payment.plan,
        "amount": payment.amount,
        "base_amount_inr": payment.base_amount_inr or payment.amount,
        "discount_inr": payment.discount_inr or 0,
        "coupon_code": payment.coupon_code,
        "currency": payment.currency or "INR",
        "status": payment.status,
        "order_id": payment.razorpay_order_id,
        "payment_id": payment.razorpay_payment_id,
        "subscription_id": payment.razorpay_subscription_id,
        "created_at": payment.created_at.isoformat() if payment.created_at else None,
    }


@router.get("/payments/{ref}/receipt")
def payment_receipt(ref: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Details for the in-app payment-success page."""
    return _receipt_payload(db, _find_user_payment(db, user.id, ref))


@router.get("/payments/{ref}/invoice")
def payment_invoice(ref: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Downloadable PDF invoice. Only issued once the payment actually cleared."""
    payment = _find_user_payment(db, user.id, ref)
    if payment.status != "paid":
        raise HTTPException(status_code=409, detail="Invoice is available only for completed payments")
    pdf = invoice_svc.build_invoice_pdf(db, payment, user)
    filename = f"invoice-{invoice_svc.invoice_number(payment)}.pdf"
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/payments")
def payment_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    expire_stale_payments(db)
    payments = db.query(Payment).filter(Payment.user_id == user.id).order_by(Payment.created_at.desc()).all()
    return [{"id": p.id, "order_id": p.razorpay_order_id, "payment_id": p.razorpay_payment_id,
             "type": p.type, "plan": p.plan, "amount": p.amount, "discount_inr": p.discount_inr,
             "coupon_code": p.coupon_code, "status": p.status,
             "created_at": p.created_at.isoformat() if p.created_at else None} for p in payments]
