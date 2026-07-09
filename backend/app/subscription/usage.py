"""Metered-usage service — the single source of truth for interview minutes.

Balance model, per (user, resource_type):

    available = allowance_seconds (current cycle) + refill_seconds − used_seconds

- A subscription grants ``allowance_seconds`` each monthly cycle (reset on
  rollover — done lazily here on access, and eagerly by the Razorpay
  ``subscription.charged`` webhook).
- Refill packs add to ``refill_seconds`` and never auto-reset (they carry over).
- Non-subscribers get a trial allowance from the ``free_trial_interview_seconds``
  admin setting (0 ⇒ interview is subscription-only).

Everything is generic over ``resource_type`` so more resources than
``interview_seconds`` can be metered later without a schema change.
"""
from __future__ import annotations

import logging
from datetime import datetime

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models import (
    AppSetting,
    Plan,
    Subscription,
    UsageAccount,
    UsageEvent,
)

logger = logging.getLogger(__name__)

RESOURCE_INTERVIEW = "interview_seconds"

# App-setting keys + their defaults (created on first read / by seed_billing).
SETTING_DEFAULTS = {
    "free_trial_interview_seconds": 600,     # 10 min; set 0 for subscription-only
    "usd_to_inr_rate": 84.0,                 # used by the Profit & Loss report
    "interview_hard_cap_seconds": 3600,      # per-session ceiling regardless of balance
}


# ── App settings ──────────────────────────────────────────────────────────────

def get_setting(db: Session, key: str, default=None):
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is not None and row.value is not None:
        # values are stored under {"v": ...} so numbers/bools round-trip cleanly
        return row.value.get("v") if isinstance(row.value, dict) and "v" in row.value else row.value
    return default if default is not None else SETTING_DEFAULTS.get(key)


def set_setting(db: Session, key: str, value) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = {"v": value}
        row.updated_at = datetime.utcnow()
    else:
        db.add(AppSetting(key=key, value={"v": value}))
    db.commit()


def get_all_settings(db: Session) -> dict:
    out = dict(SETTING_DEFAULTS)
    for row in db.query(AppSetting).all():
        out[row.key] = row.value.get("v") if isinstance(row.value, dict) and "v" in row.value else row.value
    return out


# ── Helpers ───────────────────────────────────────────────────────────────────

def _active_subscription(db: Session, user_id: str):
    """The user's currently-active subscription, if any (period not expired)."""
    sub = (
        db.query(Subscription)
        .filter(Subscription.user_id == user_id, Subscription.status == "active")
        .first()
    )
    if not sub:
        return None
    if sub.current_period_end and sub.current_period_end < datetime.utcnow():
        return None
    return sub


def _plan_allowance(db: Session, plan_id: str | None, resource: str) -> int:
    if not plan_id:
        return 0
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan or not plan.allowances:
        return 0
    return int(plan.allowances.get(resource, 0) or 0)


def _log(db: Session, account: UsageAccount, delta: int, reason: str, ref_id: str | None):
    db.add(UsageEvent(
        user_id=account.user_id,
        resource_type=account.resource_type,
        delta_seconds=delta,
        reason=reason,
        ref_id=ref_id,
        balance_after=available_seconds(account),
    ))


# ── Account lifecycle ─────────────────────────────────────────────────────────

def get_or_create_account(db: Session, user_id: str, resource: str = RESOURCE_INTERVIEW) -> UsageAccount:
    account = (
        db.query(UsageAccount)
        .filter(UsageAccount.user_id == user_id, UsageAccount.resource_type == resource)
        .first()
    )
    if account is None:
        trial = int(get_setting(db, "free_trial_interview_seconds") or 0)
        account = UsageAccount(
            user_id=user_id, resource_type=resource,
            allowance_seconds=trial, used_seconds=0, refill_seconds=0,
            source="trial", cycle_start=datetime.utcnow(), cycle_end=None,
        )
        db.add(account)
        db.flush()
        if trial:
            _log(db, account, trial, "trial_grant", None)
        db.commit()
        db.refresh(account)
    else:
        _reconcile(db, account)
    return account


def _reconcile(db: Session, account: UsageAccount) -> None:
    """Sync an account with the user's subscription state and roll monthly cycles.

    Runs lazily on every access so no cron job is required.
    """
    now = datetime.utcnow()
    sub = _active_subscription(db, account.user_id)
    changed = False

    if sub:
        # Fresh/changed subscription → grant a new cycle from the plan.
        if account.source != "subscription" or account.plan_id != sub.plan_id:
            _apply_subscription_cycle(db, account, sub, reset_used=True)
            changed = True
        elif account.cycle_end and now >= account.cycle_end:
            # Monthly rollover.
            start = account.cycle_end
            end = sub.current_period_end if (sub.current_period_end and sub.current_period_end > now) else start + relativedelta(months=1)
            account.cycle_start = start
            account.cycle_end = end
            account.allowance_seconds = _plan_allowance(db, sub.plan_id, account.resource_type)
            account.used_seconds = 0
            _log(db, account, account.allowance_seconds, "cycle_reset", sub.id)
            changed = True
    else:
        # No active subscription → fall back to trial allowance.
        if account.source == "subscription":
            trial = int(get_setting(db, "free_trial_interview_seconds") or 0)
            account.source = "trial"
            account.plan_id = None
            account.allowance_seconds = trial
            account.used_seconds = 0
            account.cycle_end = None
            _log(db, account, trial, "trial_grant", None)
            changed = True

    if changed:
        account.updated_at = now
        db.commit()
        db.refresh(account)


def _apply_subscription_cycle(db: Session, account: UsageAccount, sub: Subscription, reset_used: bool) -> None:
    now = datetime.utcnow()
    account.source = "subscription"
    account.plan_id = sub.plan_id
    account.allowance_seconds = _plan_allowance(db, sub.plan_id, account.resource_type)
    if reset_used:
        account.used_seconds = 0
    account.cycle_start = sub.current_period_start or now
    account.cycle_end = sub.current_period_end or (now + relativedelta(months=1))
    _log(db, account, account.allowance_seconds, "subscription_grant", sub.id)


# ── Reads ─────────────────────────────────────────────────────────────────────

def available_seconds(account: UsageAccount) -> int:
    avail = (account.allowance_seconds or 0) + (account.refill_seconds or 0) - (account.used_seconds or 0)
    return max(0, avail)


def usage_summary(db: Session, user_id: str, resource: str = RESOURCE_INTERVIEW) -> dict:
    account = get_or_create_account(db, user_id, resource)
    avail = available_seconds(account)
    plan_name = None
    if account.plan_id:
        plan = db.query(Plan).filter(Plan.id == account.plan_id).first()
        plan_name = plan.name if plan else None
    return {
        "resource_type": resource,
        "allowance_seconds": account.allowance_seconds or 0,
        "used_seconds": account.used_seconds or 0,
        "refill_seconds": account.refill_seconds or 0,
        "available_seconds": avail,
        "available_minutes": avail // 60,
        "source": account.source,
        "plan_id": account.plan_id,
        "plan_name": plan_name,
        "cycle_end": account.cycle_end.isoformat() if account.cycle_end else None,
    }


# ── Writes ────────────────────────────────────────────────────────────────────

def consume(db: Session, user_id: str, seconds: int, ref_id: str | None = None,
            resource: str = RESOURCE_INTERVIEW) -> UsageAccount:
    """Record consumed usage (used against allowance first, then refills)."""
    account = get_or_create_account(db, user_id, resource)
    if seconds <= 0:
        return account
    account.used_seconds = (account.used_seconds or 0) + seconds
    # If used exceeds the cycle allowance, spill the overflow into refills so the
    # refill bucket depletes correctly.
    allowance = account.allowance_seconds or 0
    if account.used_seconds > allowance:
        overflow = account.used_seconds - allowance
        account.used_seconds = allowance
        account.refill_seconds = max(0, (account.refill_seconds or 0) - overflow)
    account.updated_at = datetime.utcnow()
    _log(db, account, -seconds, "interview_consume", ref_id)
    db.commit()
    db.refresh(account)
    logger.info("Usage consume: user=%s %ss (%s) available=%ss",
                user_id, seconds, resource, available_seconds(account))
    return account


def grant_refill(db: Session, user_id: str, seconds: int, ref_id: str | None = None,
                 resource: str = RESOURCE_INTERVIEW) -> UsageAccount:
    account = get_or_create_account(db, user_id, resource)
    account.refill_seconds = (account.refill_seconds or 0) + seconds
    account.updated_at = datetime.utcnow()
    _log(db, account, seconds, "refill", ref_id)
    db.commit()
    db.refresh(account)
    return account


def grant_subscription_cycle(db: Session, user_id: str, ref_id: str | None = None,
                             resource: str = RESOURCE_INTERVIEW) -> UsageAccount:
    """Called on subscription activation / renewal — grant a fresh cycle."""
    account = get_or_create_account(db, user_id, resource)
    sub = _active_subscription(db, user_id)
    if sub:
        _apply_subscription_cycle(db, account, sub, reset_used=True)
        account.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(account)
    return account


def admin_adjust(db: Session, user_id: str, delta_seconds: int, ref_id: str | None = None,
                 resource: str = RESOURCE_INTERVIEW) -> UsageAccount:
    """Admin grant (+) or deduction (−) — applied to the carry-over refill bucket."""
    account = get_or_create_account(db, user_id, resource)
    account.refill_seconds = (account.refill_seconds or 0) + delta_seconds
    # Guard against a deduction pushing total available below zero.
    if available_seconds(account) < 0:
        account.refill_seconds -= available_seconds(account)  # (adds back the deficit)
    account.updated_at = datetime.utcnow()
    _log(db, account, delta_seconds, "admin_adjust", ref_id)
    db.commit()
    db.refresh(account)
    return account
