"""Subscription + Razorpay payment gateway — Elite plan only (₹1,999)."""
import hashlib
import hmac
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.config import get_settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models import Subscription, Payment, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/subscription", tags=["subscription"])
settings = get_settings()

PLAN = {"amount": 199900, "display": 1999, "name": "Elite"}


class SubscriptionStatus(BaseModel):
    is_subscribed: bool = False
    plan: Optional[str] = None
    plan_name: Optional[str] = None
    amount: int = 1999
    payment_id: Optional[str] = None
    created_at: Optional[str] = None
    razorpay_key_id: str = ""


class CreateOrderRequest(BaseModel):
    plan: str = "elite"


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str = "INR"
    razorpay_key_id: str
    plan: str = "elite"


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan: str = "elite"


class CheckoutRequest(BaseModel):
    payment_id: str
    plan: str = "elite"


@router.get("/status", response_model=SubscriptionStatus)
def get_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sub = db.query(Subscription).filter(
        Subscription.user_id == user.id, Subscription.status == "active"
    ).first()
    if sub:
        return SubscriptionStatus(
            is_subscribed=True, plan="elite", plan_name=PLAN["name"],
            amount=PLAN["display"], payment_id=sub.payment_id,
            created_at=sub.created_at.isoformat() if sub.created_at else None,
            razorpay_key_id=settings.RAZORPAY_KEY_ID,
        )
    return SubscriptionStatus(is_subscribed=False, razorpay_key_id=settings.RAZORPAY_KEY_ID)


@router.post("/create-order", response_model=CreateOrderResponse)
def create_order(payload: CreateOrderRequest,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        mock_order_id = f"order_demo_{user.id[:8]}_elite"
        payment = Payment(user_id=user.id, razorpay_order_id=mock_order_id,
                          plan="elite", amount=PLAN["display"], status="created")
        db.add(payment); db.commit()
        return CreateOrderResponse(order_id=mock_order_id, amount=PLAN["amount"],
                                   razorpay_key_id="demo_mode")

    import httpx
    try:
        resp = httpx.post("https://api.razorpay.com/v1/orders",
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
            json={"amount": PLAN["amount"], "currency": "INR",
                  "receipt": f"rcpt_{user.id[:8]}_elite",
                  "notes": {"user_id": user.id, "plan": "elite", "email": user.email}})
        resp.raise_for_status()
        order = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {str(e)}")

    payment = Payment(user_id=user.id, razorpay_order_id=order["id"],
                      plan="elite", amount=PLAN["display"], status="created")
    db.add(payment); db.commit()
    logger.info("Razorpay order created: %s (user=%s, amount=%s)", order["id"], user.id, PLAN["display"])
    return CreateOrderResponse(order_id=order["id"], amount=PLAN["amount"],
                               razorpay_key_id=settings.RAZORPAY_KEY_ID)


@router.post("/verify-payment", response_model=SubscriptionStatus)
def verify_payment(payload: VerifyPaymentRequest,
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payment = db.query(Payment).filter(
        Payment.razorpay_order_id == payload.razorpay_order_id,
        Payment.user_id == user.id,
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")

    if settings.RAZORPAY_KEY_SECRET and not payload.razorpay_order_id.startswith("order_demo"):
        expected = hmac.new(settings.RAZORPAY_KEY_SECRET.encode(),
            f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode(),
            hashlib.sha256).hexdigest()
        if expected != payload.razorpay_signature:
            payment.status = "failed"
            payment.error_message = "Signature verification failed"
            db.commit()
            logger.warning("Payment signature verification failed for order %s (user=%s)",
                           payload.razorpay_order_id, user.id)
            raise HTTPException(status_code=400, detail="Payment verification failed")

    payment.razorpay_payment_id = payload.razorpay_payment_id
    payment.razorpay_signature = payload.razorpay_signature
    payment.status = "paid"
    payment.updated_at = datetime.utcnow()

    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if sub:
        sub.plan = "elite"; sub.amount = PLAN["display"]
        sub.payment_id = payload.razorpay_payment_id
        sub.order_id = payload.razorpay_order_id; sub.status = "active"
    else:
        sub = Subscription(user_id=user.id, plan="elite", status="active",
            amount=PLAN["display"], payment_id=payload.razorpay_payment_id,
            order_id=payload.razorpay_order_id)
        db.add(sub)
    db.commit(); db.refresh(sub)
    logger.info("Payment verified — user %s subscribed to %s plan (payment=%s)",
                user.id, sub.plan, payload.razorpay_payment_id)
    return SubscriptionStatus(is_subscribed=True, plan="elite", plan_name=PLAN["name"],
        amount=PLAN["display"], payment_id=sub.payment_id,
        created_at=sub.created_at.isoformat() if sub.created_at else None,
        razorpay_key_id=settings.RAZORPAY_KEY_ID)


@router.post("/checkout", response_model=SubscriptionStatus)
def checkout(payload: CheckoutRequest,
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payment = Payment(user_id=user.id, razorpay_payment_id=payload.payment_id,
                      plan="elite", amount=PLAN["display"], status="paid")
    db.add(payment)
    existing = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if existing:
        existing.plan = "elite"; existing.amount = PLAN["display"]
        existing.payment_id = payload.payment_id; existing.status = "active"
    else:
        db.add(Subscription(user_id=user.id, plan="elite", status="active",
            amount=PLAN["display"], payment_id=payload.payment_id))
    db.commit()
    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    return SubscriptionStatus(is_subscribed=True, plan="elite", plan_name=PLAN["name"],
        amount=PLAN["display"], payment_id=sub.payment_id,
        created_at=sub.created_at.isoformat() if sub.created_at else None,
        razorpay_key_id=settings.RAZORPAY_KEY_ID)


@router.get("/payments")
def payment_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payments = db.query(Payment).filter(Payment.user_id == user.id).order_by(Payment.created_at.desc()).all()
    return [{"id": p.id, "order_id": p.razorpay_order_id, "payment_id": p.razorpay_payment_id,
             "plan": p.plan, "amount": p.amount, "status": p.status,
             "created_at": p.created_at.isoformat() if p.created_at else None} for p in payments]
