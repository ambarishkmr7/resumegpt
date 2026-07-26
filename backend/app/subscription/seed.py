"""Seed default billing config (plans, refill packs, settings, sample coupon)
and grandfather existing lifetime-Elite subscribers. Idempotent — safe to run
on every startup (called from app/main.py lifespan)."""
import logging

from sqlalchemy.orm import Session

from app.models import AppSetting, Coupon, Plan, RefillPack, Subscription
from app.subscription.usage import SETTING_DEFAULTS

logger = logging.getLogger(__name__)

# Rupee → token conversion used when a plan has no explicit token allowance
# (₹500 plan ⇒ 1M tokens / month).
TOKENS_PER_RUPEE = 2000

# slug, name, price_inr, minutes, monthly_tokens, features, badge, default, order
DEFAULT_PLANS = [
    # The free tier is a real Plan row (price 0) so admins edit its name, blurb
    # and feature list like any other — nothing about it is hardcoded in the UI.
    # Its allowances stay 0: free usage comes from the trial settings
    # (free_trial_interview_seconds / free_trial_tokens), not from a cycle grant.
    ("free", "Free", 0, 0, 0,
     ["Create & edit unlimited resumes", "30 professional templates",
      "ATS scoring & suggestions", "AI career analysis & roadmap",
      "AI resume rewriting & cover letters", "Free trial interview minutes"],
     None, False, 0),
    ("starter", "Starter", 500, 60, 1_000_000,
     ["60 mock-interview minutes / month", "1M AI tokens / month",
      "AI scoring & gap analysis",
      "All resume templates & downloads", "Career roadmap & job agent"],
     None, True, 10),
    ("pro", "Pro", 999, 150, 2_000_000,
     ["150 mock-interview minutes / month", "2M AI tokens / month",
      "Everything in Starter",
      "Priority AI responses", "Interview learning materials"],
     "Popular", False, 20),
    ("elite", "Elite", 1999, 400, 4_000_000,
     ["400 mock-interview minutes / month", "4M AI tokens / month",
      "Everything in Pro",
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
    for slug, name, price, minutes, tokens, features, badge, is_default, order in DEFAULT_PLANS:
        if not db.query(Plan).filter(Plan.slug == slug).first():
            db.add(Plan(
                slug=slug, name=name, price_inr=price, interview_minutes=minutes,
                allowances={"interview_seconds": minutes * 60, "llm_tokens": tokens},
                features=features,
                badge=badge, is_active=True, is_default=is_default, display_order=order,
                description=(f"{minutes} interview minutes every month." if price > 0
                             else "Everything you need to build a resume, free forever."),
            ))

    # ── Backfill: existing plans created before token metering get an allowance ──
    for plan in db.query(Plan).all():
        allowances = dict(plan.allowances or {})
        if "llm_tokens" not in allowances:
            allowances["llm_tokens"] = int((plan.price_inr or 0) * TOKENS_PER_RUPEE)
            plan.allowances = allowances

    # ── Retire the legacy lifetime-Elite plan (no longer offered) ──
    legacy = db.query(Plan).filter(Plan.slug == "legacy-elite").first()
    if legacy:
        in_use = db.query(Subscription).filter(Subscription.plan_id == legacy.id).first()
        if in_use:
            # Referenced by old subscriptions → keep the row but hidden/inactive.
            legacy.is_active = False
        else:
            db.delete(legacy)
        logger.info("Legacy Elite plan retired (%s)", "deactivated" if in_use else "deleted")

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
