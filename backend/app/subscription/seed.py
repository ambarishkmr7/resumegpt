"""Seed default billing config (plans, refill packs, settings, sample coupon)
and grandfather existing lifetime-Elite subscribers. Idempotent — safe to run
on every startup (called from app/main.py lifespan)."""
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import AppSetting, Coupon, Plan, RefillPack, Subscription
from app.subscription.usage import SETTING_DEFAULTS

logger = logging.getLogger(__name__)

# slug, name, price_inr, minutes, features, badge, default, order
DEFAULT_PLANS = [
    ("starter", "Starter", 500, 60,
     ["60 mock-interview minutes / month", "AI scoring & gap analysis",
      "All resume templates & downloads", "Career roadmap & job agent"],
     None, True, 10),
    ("pro", "Pro", 999, 150,
     ["150 mock-interview minutes / month", "Everything in Starter",
      "Priority AI responses", "Interview learning materials"],
     "Popular", False, 20),
    ("elite", "Elite", 1999, 400,
     ["400 mock-interview minutes / month", "Everything in Pro",
      "Highest priority support", "Early access to new features"],
     "Best value", False, 30),
]

# slug, name, price_inr, minutes, bonus_minutes, order
DEFAULT_REFILLS = [
    ("refill-30", "+30 minutes", 99, 30, 0, 10),
    ("refill-60", "+60 minutes", 179, 60, 5, 20),
    ("refill-120", "+120 minutes", 299, 120, 15, 30),
]


def seed_billing(db: Session) -> None:
    # ── Settings ──
    for key, val in SETTING_DEFAULTS.items():
        if not db.query(AppSetting).filter(AppSetting.key == key).first():
            db.add(AppSetting(key=key, value={"v": val}))

    # ── Plans ──
    for slug, name, price, minutes, features, badge, is_default, order in DEFAULT_PLANS:
        if not db.query(Plan).filter(Plan.slug == slug).first():
            db.add(Plan(
                slug=slug, name=name, price_inr=price, interview_minutes=minutes,
                allowances={"interview_seconds": minutes * 60}, features=features,
                badge=badge, is_active=True, is_default=is_default, display_order=order,
                description=f"{minutes} interview minutes every month.",
            ))

    # ── Grandfather: legacy lifetime-Elite plan (hidden from purchase) ──
    legacy = db.query(Plan).filter(Plan.slug == "legacy-elite").first()
    if not legacy:
        legacy = Plan(
            slug="legacy-elite", name="Elite (Legacy)", price_inr=1999,
            interview_minutes=6000, allowances={"interview_seconds": 6000 * 60},
            features=["Grandfathered lifetime Elite access"], is_active=False,
            is_default=False, display_order=999, description="Legacy lifetime Elite.",
        )
        db.add(legacy)
        db.flush()

    # ── Refill packs ──
    for slug, name, price, minutes, bonus, order in DEFAULT_REFILLS:
        if not db.query(RefillPack).filter(RefillPack.slug == slug).first():
            db.add(RefillPack(
                slug=slug, name=name, price_inr=price,
                amount_seconds=minutes * 60, bonus_seconds=bonus * 60,
                is_active=True, display_order=order,
                description=(f"{minutes} extra interview minutes"
                             + (f" (+{bonus} bonus)" if bonus else "") + "."),
            ))

    # ── Sample coupons ──
    if not db.query(Coupon).filter(Coupon.code == "WELCOME20").first():
        db.add(Coupon(
            code="WELCOME20", description="20% off your first purchase",
            discount_type="percent", discount_value=20, applies_to="all",
            per_user_limit=1, is_active=True,
        ))
    # 100%-off code for internal testing / comping — makes any purchase ₹0 so it
    # activates without the payment gateway. DISABLE in production (admin → Coupons).
    if not db.query(Coupon).filter(Coupon.code == "FREEPASS").first():
        db.add(Coupon(
            code="FREEPASS", description="100% off — internal testing only",
            discount_type="percent", discount_value=100, applies_to="all",
            per_user_limit=1, is_active=True,
        ))

    db.commit()

    # ── Backfill existing lifetime-Elite subscribers onto the legacy plan ──
    legacy = db.query(Plan).filter(Plan.slug == "legacy-elite").first()
    if legacy:
        rows = (
            db.query(Subscription)
            .filter(Subscription.status == "active", Subscription.plan_id.is_(None))
            .all()
        )
        for sub in rows:
            sub.plan_id = legacy.id
            if not sub.current_period_end:
                # Give them a long runway so the migration never cuts them off.
                sub.current_period_start = sub.created_at or datetime.utcnow()
                sub.current_period_end = datetime(2099, 1, 1)
        if rows:
            db.commit()
            logger.info("Grandfathered %d existing subscriber(s) onto legacy-elite", len(rows))
