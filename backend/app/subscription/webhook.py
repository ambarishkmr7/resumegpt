"""Razorpay webhook receiver — the reconciliation layer.

Best practices applied (per Razorpay docs):
- Verify ``X-Razorpay-Signature`` = HMAC-SHA256 of the **raw** request body with
  the webhook secret, compared in constant time.
- Idempotent: every event is de-duplicated on the ``x-razorpay-event-id`` header
  (Razorpay uses at-least-once delivery and may resend).
- Respond 2xx quickly once stored/processed so Razorpay doesn't retry.

Handles: payment.captured / order.paid (one-time orders → fulfil), subscription
.activated / subscription.charged (grant a monthly cycle), subscription.cancelled
/ halted (mark status), refund.processed (record the refund).
"""
import hashlib
import hmac
import logging

from fastapi import APIRouter, Request, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import Payment, Subscription, WebhookEvent
from app.subscription import usage as usage_svc
from app.subscription.router import _fulfil_payment

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/subscription", tags=["subscription-webhook"])
settings = get_settings()


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    raw = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    event_id = request.headers.get("x-razorpay-event-id", "")

    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret:
        logger.warning("Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set — ignoring")
        return Response(status_code=200)

    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        logger.warning("Razorpay webhook signature mismatch (event=%s)", event_id)
        return Response(status_code=400)

    try:
        payload = await request.json()
    except Exception:
        return Response(status_code=400)

    event_type = payload.get("event", "")
    # Fallback id if the header is missing (shouldn't happen, but be safe).
    dedupe_id = event_id or f"{event_type}:{payload.get('created_at','')}"

    db: Session = SessionLocal()
    try:
        if db.query(WebhookEvent).filter(WebhookEvent.id == dedupe_id).first():
            logger.info("Duplicate webhook %s (%s) — skipping", dedupe_id, event_type)
            return Response(status_code=200)
        db.add(WebhookEvent(id=dedupe_id, event_type=event_type, payload=payload, processed=False))
        db.commit()

        _handle_event(db, event_type, payload)

        evt = db.query(WebhookEvent).filter(WebhookEvent.id == dedupe_id).first()
        if evt:
            evt.processed = True
            db.commit()
    except Exception:
        logger.exception("Error handling webhook %s (%s)", dedupe_id, event_type)
        db.rollback()
        # Return 500 so Razorpay retries (transient failure).
        return Response(status_code=500)
    finally:
        db.close()

    return Response(status_code=200)


def _handle_event(db: Session, event_type: str, payload: dict) -> None:
    entity = payload.get("payload", {})

    if event_type in ("payment.captured", "order.paid"):
        pay = entity.get("payment", {}).get("entity", {})
        order_id = pay.get("order_id")
        payment_id = pay.get("id")
        if not order_id:
            return
        payment = db.query(Payment).filter(Payment.razorpay_order_id == order_id).first()
        if payment and payment.status != "paid":
            payment.razorpay_payment_id = payment_id
            payment.status = "paid"
            _fulfil_payment(db, payment)
            db.commit()
            logger.info("Webhook fulfilled order %s (payment=%s)", order_id, payment_id)

    elif event_type in ("subscription.activated", "subscription.charged"):
        sub_entity = entity.get("subscription", {}).get("entity", {})
        rzp_sub_id = sub_entity.get("id")
        if not rzp_sub_id:
            return
        # The Payment row created at create-subscription carries the mapping.
        payment = db.query(Payment).filter(Payment.razorpay_subscription_id == rzp_sub_id).first()
        sub = db.query(Subscription).filter(Subscription.razorpay_subscription_id == rzp_sub_id).first()
        if payment and not sub:
            # First activation → fulfil (activates Subscription + grants cycle).
            if payment.status != "paid":
                payment.status = "paid"
            _fulfil_payment(db, payment)
            db.commit()
            logger.info("Webhook activated subscription %s (user=%s)", rzp_sub_id, payment.user_id)
        elif sub:
            # Renewal charge → grant a fresh monthly cycle.
            sub.status = "active"
            db.flush()
            usage_svc.grant_subscription_cycle(db, sub.user_id)
            db.commit()
            logger.info("Webhook renewed subscription %s (user=%s)", rzp_sub_id, sub.user_id)

    elif event_type in ("subscription.cancelled", "subscription.halted", "subscription.completed"):
        sub_entity = entity.get("subscription", {}).get("entity", {})
        rzp_sub_id = sub_entity.get("id")
        sub = db.query(Subscription).filter(Subscription.razorpay_subscription_id == rzp_sub_id).first()
        if sub:
            sub.status = "cancelled" if "cancel" in event_type else "halted"
            db.commit()
            logger.info("Webhook marked subscription %s as %s", rzp_sub_id, sub.status)

    elif event_type in ("refund.processed", "refund.created"):
        refund = entity.get("refund", {}).get("entity", {})
        payment_id = refund.get("payment_id")
        payment = db.query(Payment).filter(Payment.razorpay_payment_id == payment_id).first()
        if payment:
            payment.refund_id = refund.get("id")
            payment.refund_amount = int((refund.get("amount") or 0) / 100)  # paise → rupees
            payment.status = "refunded"
            db.commit()
            logger.info("Webhook recorded refund for payment %s (₹%s)", payment_id, payment.refund_amount)
