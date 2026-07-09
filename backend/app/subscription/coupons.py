"""Coupon validation + discount computation. Discounts are ALWAYS recomputed on
the server from the DB — the client-supplied amount is never trusted."""
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Coupon, CouponRedemption


class CouponError(Exception):
    """Raised with a user-facing message when a coupon can't be applied."""


def apply_discount(base_inr: int, coupon: Coupon) -> int:
    """Return the discount amount (INR), clamped to [0, base_inr]."""
    if coupon.discount_type == "percent":
        disc = round(base_inr * coupon.discount_value / 100)
    else:  # flat
        disc = coupon.discount_value
    return max(0, min(disc, base_inr))


def validate_coupon(db: Session, code: str, user_id: str, kind: str, base_inr: int) -> tuple[Coupon, int]:
    """Validate `code` for `user_id` against a `kind` ("plan"|"refill") purchase
    of `base_inr`. Returns (coupon, discount_inr) or raises CouponError.
    """
    if not code:
        raise CouponError("No coupon code provided")
    coupon = db.query(Coupon).filter(Coupon.code == code.strip().upper()).first()
    if not coupon or not coupon.is_active:
        raise CouponError("Invalid coupon code")

    now = datetime.utcnow()
    if coupon.starts_at and now < coupon.starts_at:
        raise CouponError("This coupon is not active yet")
    if coupon.expires_at and now > coupon.expires_at:
        raise CouponError("This coupon has expired")
    if coupon.applies_to not in ("all", kind):
        raise CouponError(f"This coupon isn't valid for {kind} purchases")
    if coupon.min_amount_inr and base_inr < coupon.min_amount_inr:
        raise CouponError(f"Requires a minimum spend of ₹{coupon.min_amount_inr}")
    if coupon.max_redemptions is not None and (coupon.redeemed_count or 0) >= coupon.max_redemptions:
        raise CouponError("This coupon has reached its redemption limit")

    used_by_user = (
        db.query(CouponRedemption)
        .filter(CouponRedemption.coupon_id == coupon.id, CouponRedemption.user_id == user_id)
        .count()
    )
    if coupon.per_user_limit and used_by_user >= coupon.per_user_limit:
        raise CouponError("You have already used this coupon")

    discount = apply_discount(base_inr, coupon)
    if discount <= 0:
        raise CouponError("This coupon gives no discount on this amount")
    return coupon, discount


def record_redemption(db: Session, coupon: Coupon, user_id: str, payment_id: str | None, discount_inr: int) -> None:
    db.add(CouponRedemption(
        coupon_id=coupon.id, coupon_code=coupon.code, user_id=user_id,
        payment_id=payment_id, discount_inr=discount_inr,
    ))
    coupon.redeemed_count = (coupon.redeemed_count or 0) + 1
