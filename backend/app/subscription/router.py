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
from datetime import datetime

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


# ── Serialization ─────────────────────────────────────────────────────────────

def _plan_public(p: Plan) -> dict:
    return {
        "id": p.id, "slug": p.slug, "name": p.name, "description": p.description,
        "price_inr": p.price_inr, "billing_interval": p.billing_interval,
        "interview_minutes": p.interview_minutes, "features": p.features or [],
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


def _status_payload(db: Session, user: User) -> SubscriptionStatus:
    usage = usage_svc.usage_summary(db, user.id)
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
            razorpay_key_id=settings.RAZORPAY_KEY_ID, usage=usage,
        )
    return SubscriptionStatus(is_subscribed=False, razorpay_key_id=settings.RAZORPAY_KEY_ID, usage=usage)


@router.get("/status", response_model=SubscriptionStatus)
def get_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _status_payload(db, user)


@router.get("/usage")
def get_usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Current interview-minute balance — powers the usage meter."""
    return usage_svc.usage_summary(db, user.id)


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


@router.post("/create-order", response_model=CreateOrderResponse)
def create_order(payload: CreateOrderRequest,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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


@router.get("/payments")
def payment_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payments = db.query(Payment).filter(Payment.user_id == user.id).order_by(Payment.created_at.desc()).all()
    return [{"id": p.id, "order_id": p.razorpay_order_id, "payment_id": p.razorpay_payment_id,
             "type": p.type, "plan": p.plan, "amount": p.amount, "discount_inr": p.discount_inr,
             "coupon_code": p.coupon_code, "status": p.status,
             "created_at": p.created_at.isoformat() if p.created_at else None} for p in payments]
