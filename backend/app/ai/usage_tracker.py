"""Token usage + cost logging for every LLM call in the app.

Call `record_usage(...)` right after any provider call returns, passing the
raw token counts from that provider's response. Cost is computed from the
per-provider/per-modality env vars in app/config.py (see there for the full
list) so a pricing change later is a single .env edit — nothing here needs
to change.

Gemini responses expose this via `response.usage_metadata`:
    prompt_token_count       -> input_tokens
    candidates_token_count   -> output_tokens
    cached_content_token_count -> cached_tokens
    thoughts_token_count     -> thoughts_tokens
    total_token_count        -> total_tokens
(https://ai.google.dev/gemini-api/docs/tokens — "Understand and count tokens")

Anthropic/Grok responses expose `usage.input_tokens` / `usage.output_tokens`
(Anthropic) or `usage.prompt_tokens` / `usage.completion_tokens` (Grok, OpenAI-
compatible). The provider-specific extraction lives in app/ai/client.py; this
module only deals with the normalized counts.
"""
from __future__ import annotations

import logging
from typing import Optional

from app.config import get_settings
from app.core.llm_context import get_purpose, get_user_id
from app.database import SessionLocal
from app.models import LlmUsageLog

logger = logging.getLogger(__name__)


# Canonical purpose tags used across the app. Not enforced (purpose is a
# free-form string on the model) but kept here as the source of truth so new
# call sites reuse an existing tag instead of inventing near-duplicates.
class Purpose:
    RESUME_PARSING = "resume_parsing"                 # uploaded resume -> structured JSON
    RESUME_SUGGESTIONS = "resume_suggestions"
    RESUME_REWRITE = "resume_rewrite"
    RESUME_SAMPLE_GENERATION = "resume_sample_generation"
    ATS_SCORING = "ats_scoring"
    COVER_LETTER = "cover_letter"
    LINKEDIN_WRITEUP = "linkedin_writeup"
    CAREER_ANALYSIS = "career_analysis"
    CAREER_ROADMAP = "career_roadmap"
    CAREER_COUNSELING = "career_counseling"
    JOB_SUGGESTIONS = "job_suggestions"
    JOB_LISTINGS = "job_listings"
    JOB_AGENT = "job_agent"
    TRENDING_JOBS = "trending_jobs"
    MOCK_INTERVIEW_QUESTIONS = "mock_interview_questions"
    MOCK_INTERVIEW_ANSWER_RATING = "mock_interview_answer_rating"
    MOCK_INTERVIEW_LIVE_VOICE = "mock_interview_live_voice"
    INTERVIEW_REPORT = "interview_report"
    INTERVIEW_LEARNING_MATERIALS = "interview_learning_materials"
    CHATBOT = "chatbot"                                # LangGraph career-assistant chat (app/agent)
    GENERAL = "general"


def _price_per_1m(settings, provider: str, modality: str, direction: str) -> float:
    """Look up USD-per-1M-tokens for (provider, modality, direction) from env-driven
    settings. Falls back sensibly if a specific modality rate isn't configured for
    that provider (e.g. Anthropic images bill at the text-input rate by default)."""
    provider = (provider or "").lower()
    modality = (modality or "text").lower()
    direction = direction.lower()  # "input" | "output" | "cached" | "thoughts"

    # Cached and thinking-token rates are a single per-provider rate (not
    # split by modality) — e.g. GEMINI_PRICE_CACHED_INPUT_PER_1M,
    # GEMINI_PRICE_THOUGHTS_PER_1M — so look those up directly instead of
    # building a "<PROVIDER>_PRICE_<MODALITY>_CACHED_PER_1M" key that would
    # never exist.
    if direction == "cached":
        key = f"{provider.upper()}_PRICE_CACHED_INPUT_PER_1M"
        if hasattr(settings, key):
            return getattr(settings, key)
    if direction == "thoughts":
        key = f"{provider.upper()}_PRICE_THOUGHTS_PER_1M"
        if hasattr(settings, key):
            return getattr(settings, key)

    key = f"{provider.upper()}_PRICE_{modality.upper()}_{direction.upper()}_PER_1M"
    if hasattr(settings, key):
        return getattr(settings, key)

    # Fallbacks: unknown modality/direction combos bill at that provider's
    # text rate for the same direction rather than silently costing $0.
    fallback_direction = "OUTPUT" if direction in ("output", "thoughts") else "INPUT"
    fallback_key = f"{provider.upper()}_PRICE_TEXT_{fallback_direction}_PER_1M"
    return getattr(settings, fallback_key, 0.0)


def estimate_cost(
    *,
    provider: str,
    modality: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cached_tokens: int = 0,
    thoughts_tokens: int = 0,
) -> float:
    settings = get_settings()
    cost = 0.0
    billable_input = max((input_tokens or 0) - (cached_tokens or 0), 0)
    cost += billable_input / 1_000_000 * _price_per_1m(settings, provider, modality, "input")
    if cached_tokens:
        cost += cached_tokens / 1_000_000 * _price_per_1m(settings, provider, modality, "cached")
    if output_tokens:
        cost += output_tokens / 1_000_000 * _price_per_1m(settings, provider, modality, "output")
    if thoughts_tokens:
        cost += thoughts_tokens / 1_000_000 * _price_per_1m(settings, provider, modality, "thoughts")
    return round(cost, 8)


def record_usage(
    *,
    provider: str,
    modality: str = "text",
    input_tokens: int = 0,
    output_tokens: int = 0,
    cached_tokens: int = 0,
    thoughts_tokens: int = 0,
    purpose: Optional[str] = None,
    user_id: Optional[str] = None,
    model: Optional[str] = None,
    meta: Optional[dict] = None,
) -> None:
    """Write one llm_usage_logs row. Never raises — a logging failure should
    never break the actual AI feature the user is waiting on.

    `purpose` / `user_id` fall back to the current request's contextvars
    (see app/core/llm_context.py) when not passed explicitly.
    """
    settings = get_settings()
    if not settings.LLM_USAGE_TRACKING_ENABLED:
        return

    purpose = purpose or get_purpose()
    user_id = user_id if user_id is not None else get_user_id()
    total_tokens = (input_tokens or 0) + (output_tokens or 0) + (thoughts_tokens or 0)

    cost = estimate_cost(
        provider=provider,
        modality=modality,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_tokens=cached_tokens,
        thoughts_tokens=thoughts_tokens,
    )

    db = SessionLocal()
    try:
        db.add(LlmUsageLog(
            user_id=user_id,
            purpose=purpose or Purpose.GENERAL,
            provider=provider,
            model=model,
            modality=modality,
            input_tokens=int(input_tokens or 0),
            output_tokens=int(output_tokens or 0),
            cached_tokens=int(cached_tokens or 0),
            thoughts_tokens=int(thoughts_tokens or 0),
            total_tokens=int(total_tokens),
            cost_usd=cost,
            currency=settings.LLM_PRICING_CURRENCY,
            request_meta=meta or None,
        ))
        db.commit()
    except Exception:
        logger.exception("Failed to record LLM usage log (provider=%s, purpose=%s)", provider, purpose)
        db.rollback()
    finally:
        db.close()