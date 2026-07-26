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
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    AppSetting,
    LlmUsageLog,
    Plan,
    Subscription,
    UsageAccount,
    UsageEvent,
)

logger = logging.getLogger(__name__)

RESOURCE_INTERVIEW = "interview_seconds"
RESOURCE_TOKENS = "llm_tokens"          # LLM token allowance (units = tokens)
RESOURCE_RESUME_UPLOADS = "resume_uploads"  # per-day ledger only (no balance account)

# App-setting keys + their defaults (created on first read / by seed_billing).
SETTING_DEFAULTS = {
    "free_trial_interview_seconds": 600,     # 10 min; set 0 for subscription-only
    "free_trial_tokens": 100_000,            # LLM tokens for non-subscribers / month-less trial
    "usd_to_inr_rate": 84.0,                 # used by the Profit & Loss report
    "interview_hard_cap_seconds": 3600,      # per-session ceiling regardless of balance
    "resume_uploads_per_day": 10,            # resumes a user may create/import per day
}

# Which app-setting supplies the trial allowance for each metered resource.
TRIAL_SETTING_BY_RESOURCE = {
    RESOURCE_INTERVIEW: "free_trial_interview_seconds",
    RESOURCE_TOKENS: "free_trial_tokens",
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

def _trial_amount(db: Session, resource: str) -> int:
    key = TRIAL_SETTING_BY_RESOURCE.get(resource, "free_trial_interview_seconds")
    return int(get_setting(db, key) or 0)


def _find_account(db: Session, user_id: str, resource: str) -> UsageAccount | None:
    return (
        db.query(UsageAccount)
        .filter(UsageAccount.user_id == user_id, UsageAccount.resource_type == resource)
        .first()
    )


def get_or_create_account(db: Session, user_id: str, resource: str = RESOURCE_INTERVIEW) -> UsageAccount:
    account = _find_account(db, user_id, resource)
    if account is None:
        trial = _trial_amount(db, resource)
        account = UsageAccount(
            user_id=user_id, resource_type=resource,
            allowance_seconds=trial, used_seconds=0, refill_seconds=0,
            source="trial", cycle_start=datetime.utcnow(), cycle_end=None,
        )
        db.add(account)
        try:
            db.flush()
            if trial:
                _log(db, account, trial, "trial_grant", None)
            db.commit()
            db.refresh(account)
        except IntegrityError:
            # A concurrent request created this account first (the frontend
            # fires /status, /usage and /nudges in parallel on page load, and
            # React StrictMode doubles each in dev). The unique index on
            # (user_id, resource_type) is doing its job — adopt the row the
            # other request committed instead of 500-ing.
            db.rollback()
            account = _find_account(db, user_id, resource)
            if account is None:
                raise
            _reconcile(db, account)
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
        elif account.allowance_seconds != _plan_allowance(db, sub.plan_id, account.resource_type):
            # Plan allowances changed mid-cycle (admin edit / new resource type
            # added to the plan) → sync the allowance without resetting usage.
            account.allowance_seconds = _plan_allowance(db, sub.plan_id, account.resource_type)
            _log(db, account, 0, "allowance_sync", sub.id)
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
            trial = _trial_amount(db, account.resource_type)
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


def percent_used(account: UsageAccount) -> float:
    """Share of the total budget (allowance + refills) already consumed, 0–100."""
    total = (account.allowance_seconds or 0) + (account.refill_seconds or 0)
    used = total - available_seconds(account)
    if total <= 0:
        return 100.0
    return round(min(100.0, max(0.0, used / total * 100)), 1)


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
        "percent_used": percent_used(account),
        "source": account.source,
        "plan_id": account.plan_id,
        "plan_name": plan_name,
        "cycle_end": account.cycle_end.isoformat() if account.cycle_end else None,
    }


def _chat_percent_used(db: Session, account: UsageAccount) -> float:
    """Share of the token budget consumed by the chatbot this cycle, 0–100."""
    total = (account.allowance_seconds or 0) + (account.refill_seconds or 0)
    if total <= 0:
        return 0.0
    q = db.query(func.coalesce(func.sum(LlmUsageLog.total_tokens), 0)).filter(
        LlmUsageLog.user_id == account.user_id, LlmUsageLog.purpose == "chatbot")
    if account.cycle_start:
        q = q.filter(LlmUsageLog.created_at >= account.cycle_start)
    chat_tokens = int(q.scalar() or 0)
    return round(min(100.0, chat_tokens / total * 100), 1)


def full_usage_summary(db: Session, user_id: str) -> dict:
    """User-facing meters: interview minutes + LLM tokens (percent-only on the
    token side — exact counts are intentionally not exposed to users) plus the
    daily resume-upload quota."""
    interview = usage_summary(db, user_id, RESOURCE_INTERVIEW)
    token_account = get_or_create_account(db, user_id, RESOURCE_TOKENS)
    daily_limit = int(get_setting(db, "resume_uploads_per_day") or 0)
    out = dict(interview)  # keep legacy top-level interview keys (MockInterview UI)
    token_budget = (token_account.allowance_seconds or 0) + (token_account.refill_seconds or 0)
    out["tokens"] = {
        "percent_used": percent_used(token_account),
        "percent_remaining": round(100 - percent_used(token_account), 1),
        "chat_percent_used": _chat_percent_used(db, token_account),
        "has_budget": token_budget > 0,
        "source": token_account.source,
        "cycle_end": token_account.cycle_end.isoformat() if token_account.cycle_end else None,
    }
    out["resume_uploads"] = {
        "used_today": count_resume_uploads_today(db, user_id),
        "daily_limit": daily_limit,
    }
    return out


# ── Writes ────────────────────────────────────────────────────────────────────

def consume(db: Session, user_id: str, seconds: int, ref_id: str | None = None,
            resource: str = RESOURCE_INTERVIEW, reason: str | None = None) -> UsageAccount:
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
    _log(db, account, -seconds, reason or "interview_consume", ref_id)
    db.commit()
    db.refresh(account)
    logger.info("Usage consume: user=%s %s units (%s) available=%s",
                user_id, seconds, resource, available_seconds(account))
    return account


def consume_tokens_standalone(user_id: str, tokens: int, ref_id: str | None = None) -> None:
    """Deduct LLM tokens from the user's monthly token budget, using a fresh DB
    session. Called from app/ai/usage_tracker.py right after every LLM call is
    logged — must never raise into the AI feature the user is waiting on."""
    if not user_id or tokens <= 0:
        return
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        consume(db, user_id, int(tokens), ref_id=ref_id,
                resource=RESOURCE_TOKENS, reason="token_consume")
    except Exception:
        logger.exception("Failed to consume %s tokens for user %s", tokens, user_id)
        db.rollback()
    finally:
        db.close()


def tokens_available(db: Session, user_id: str) -> bool:
    """True if the user still has LLM-token budget this cycle."""
    account = get_or_create_account(db, user_id, RESOURCE_TOKENS)
    return available_seconds(account) > 0


# ── Daily resume-upload quota ────────────────────────────────────────────────
# Metered via the append-only UsageEvent ledger (not a balance account) so the
# count survives resume deletions.

def count_resume_uploads_today(db: Session, user_id: str) -> int:
    start_of_day = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(UsageEvent)
        .filter(UsageEvent.user_id == user_id,
                UsageEvent.resource_type == RESOURCE_RESUME_UPLOADS,
                UsageEvent.created_at >= start_of_day)
        .count()
    )


def check_resume_upload_allowed(db: Session, user_id: str) -> None:
    """Raise ValueError with a user-facing message when today's quota is spent."""
    limit = int(get_setting(db, "resume_uploads_per_day") or 0)
    if limit <= 0:
        return  # 0 ⇒ unlimited
    used = count_resume_uploads_today(db, user_id)
    if used >= limit:
        raise ValueError(
            f"Daily limit reached — you can add up to {limit} resumes per day. "
            "Please try again tomorrow.")


def log_resume_upload(db: Session, user_id: str, ref_id: str | None = None) -> None:
    db.add(UsageEvent(
        user_id=user_id, resource_type=RESOURCE_RESUME_UPLOADS,
        delta_seconds=1, reason="resume_upload", ref_id=ref_id, balance_after=None,
    ))
    db.commit()


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
                             resource: str | None = None) -> UsageAccount:
    """Called on subscription activation / renewal — grant a fresh cycle.
    With no explicit resource, grants every metered resource the plan covers
    (interview minutes + LLM tokens)."""
    resources = [resource] if resource else [RESOURCE_INTERVIEW, RESOURCE_TOKENS]
    account = None
    sub = _active_subscription(db, user_id)
    for res in resources:
        # Look the account up *without* reconciling. get_or_create_account()
        # reconciles, and on a brand-new subscription that reconcile applies the
        # very cycle we are about to apply — writing two identical
        # `subscription_grant` rows per resource into the ledger. The balance was
        # right either way (the cycle is assigned, not added), but the audit
        # trail double-counted every activation.
        account = _find_account(db, user_id, res)
        if account is None:
            account = get_or_create_account(db, user_id, res)
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
