"""AI client with provider fallback chain:
  1. Anthropic Claude  (ANTHROPIC_API_KEY)
  2. Google Gemini     (GEMINI_API_KEY  — free tier: 15 RPM, 1M tokens/day)
  3. xAI Grok          (GROK_API_KEY    — OpenAI-compatible API)

`complete()` tries each provider in order and raises only if ALL fail.
On quota/rate-limit errors (HTTP 429/529) the next provider is tried automatically.
Swap or extend providers without touching any other module.
"""
import json
import logging

import httpx

from app.ai import usage_tracker
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
GEMINI_URL    = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent"
GROK_URL      = "https://api.x.ai/v1/chat/completions"

# HTTP status codes that mean "quota exhausted / overloaded — try next provider"
_QUOTA_CODES = {429, 529, 503}


def available() -> bool:
    return bool(
        settings.ANTHROPIC_API_KEY
        or settings.GEMINI_API_KEY
        or settings.GROK_API_KEY
    )


# ── Anthropic Claude ─────────────────────────────────────────────────────────

def _anthropic(prompt: str, system: str, max_tokens: int) -> tuple[str, dict]:
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    model = settings.AI_MODEL if (settings.AI_MODEL or "").startswith("claude") else "claude-sonnet-4-20250514"
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        body["system"] = system
    with httpx.Client(timeout=60) as c:
        resp = c.post(ANTHROPIC_URL, headers=headers, json=body)
        resp.raise_for_status()
    data = resp.json()
    text = "".join(b.get("text", "") for b in data.get("content", []))
    # https://docs.claude.com/en/api/messages — usage.input_tokens / output_tokens
    usage = data.get("usage") or {}
    return text, {
        "provider": "anthropic",
        "model": model,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "cached_tokens": usage.get("cache_read_input_tokens", 0),
    }


# ── Google Gemini ────────────────────────────────────────────────────────────

def _gemini(prompt: str, system: str, max_tokens: int) -> tuple[str, dict]:
    model = "gemini-3.1-flash-lite"
    url = f"{GEMINI_URL}?key={settings.GEMINI_API_KEY}"
    contents = []
    if system:
        contents.append({"role": "user",  "parts": [{"text": f"[System]: {system}"}]})
        contents.append({"role": "model", "parts": [{"text": "Understood."}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})
    body = {
        "contents": contents,
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.7},
    }
    with httpx.Client(timeout=60) as c:
        resp = c.post(url, json=body)
        resp.raise_for_status()
    data = resp.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        text = ""
    # https://ai.google.dev/gemini-api/docs/tokens — usageMetadata on the response
    usage = data.get("usageMetadata") or {}
    return text, {
        "provider": "gemini",
        "model": model,
        "input_tokens": usage.get("promptTokenCount", 0),
        "output_tokens": usage.get("candidatesTokenCount", 0),
        "cached_tokens": usage.get("cachedContentTokenCount", 0),
        "thoughts_tokens": usage.get("thoughtsTokenCount", 0),
    }


# ── xAI Grok ─────────────────────────────────────────────────────────────────

def _grok(prompt: str, system: str, max_tokens: int) -> tuple[str, dict]:
    """Grok uses the OpenAI-compatible chat completions format."""
    headers = {
        "Authorization": f"Bearer {settings.GROK_API_KEY}",
        "Content-Type": "application/json",
    }
    model = settings.GROK_MODEL or "grok-3-mini"
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    body = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }
    with httpx.Client(timeout=60) as c:
        resp = c.post(GROK_URL, headers=headers, json=body)
        resp.raise_for_status()
    data = resp.json()
    text = data["choices"][0]["message"]["content"]
    # OpenAI-compatible: usage.prompt_tokens / completion_tokens
    usage = data.get("usage") or {}
    return text, {
        "provider": "grok",
        "model": model,
        "input_tokens": usage.get("prompt_tokens", 0),
        "output_tokens": usage.get("completion_tokens", 0),
    }


# ── Public API ───────────────────────────────────────────────────────────────

def _log_usage(usage: dict, purpose: str, modality: str) -> None:
    try:
        usage_tracker.record_usage(
            provider=usage.get("provider", "unknown"),
            model=usage.get("model"),
            modality=modality,
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            cached_tokens=usage.get("cached_tokens", 0),
            thoughts_tokens=usage.get("thoughts_tokens", 0),
            purpose=purpose,
        )
    except Exception:
        logger.exception("Usage logging failed for provider=%s", usage.get("provider"))


def complete(prompt: str, system: str = "", max_tokens: int = 1500, purpose: str = None, modality: str = "text") -> str:
    """Try providers in order: Anthropic → Gemini → Grok.
    Falls through to the next provider on quota/rate-limit errors (429/529/503).
    Raises RuntimeError only if every configured provider fails.

    `purpose` tags this call for the admin usage dashboard (e.g. "cover_letter").
    If omitted, falls back to the current request's contextvar tag (see
    app/core/llm_context.py::set_purpose), or "general". `modality` describes
    what kind of input dominated this prompt (text/image/audio/video/document)
    for cost-per-modality accounting — nearly all calls through this function
    are plain text prompts, so it defaults to "text".
    """
    last_err = None

    # 1. Anthropic Claude
    if settings.ANTHROPIC_API_KEY:
        try:
            logger.debug("Trying Anthropic Claude for AI completion")
            text, usage = _anthropic(prompt, system, max_tokens)
            _log_usage(usage, purpose, modality)
            return text
        except httpx.HTTPStatusError as e:
            if e.response.status_code in _QUOTA_CODES:
                logger.warning("Anthropic quota/rate-limit (HTTP %d) — falling back", e.response.status_code)
                last_err = e
            else:
                logger.error("Anthropic HTTP error (HTTP %d): %s", e.response.status_code, e)
                raise
        except Exception as e:
            logger.warning("Anthropic error: %s — falling back", e)
            last_err = e

    # 2. Google Gemini
    if settings.GEMINI_API_KEY:
        try:
            logger.debug("Trying Google Gemini for AI completion")
            text, usage = _gemini(prompt, system, max_tokens)
            _log_usage(usage, purpose, modality)
            return text
        except httpx.HTTPStatusError as e:
            if e.response.status_code in _QUOTA_CODES:
                logger.warning("Gemini quota/rate-limit (HTTP %d) — falling back", e.response.status_code)
                last_err = e
            else:
                logger.error("Gemini HTTP error (HTTP %d): %s", e.response.status_code, e)
                raise
        except Exception as e:
            logger.warning("Gemini error: %s — falling back", e)
            last_err = e

    # 3. xAI Grok
    if settings.GROK_API_KEY:
        try:
            logger.debug("Trying xAI Grok for AI completion")
            text, usage = _grok(prompt, system, max_tokens)
            _log_usage(usage, purpose, modality)
            return text
        except httpx.HTTPStatusError as e:
            if e.response.status_code in _QUOTA_CODES:
                logger.warning("Grok quota/rate-limit (HTTP %d) — falling back", e.response.status_code)
                last_err = e
            else:
                logger.error("Grok HTTP error (HTTP %d): %s", e.response.status_code, e)
                raise
        except Exception as e:
            logger.warning("Grok error: %s — falling back", e)
            last_err = e

    logger.error("All AI providers exhausted. Last error: %s", last_err)
    raise RuntimeError(
        f"All AI providers exhausted. Last error: {last_err}. "
        "Set at least one of ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROK_API_KEY in backend/.env"
    )


def complete_json(prompt: str, system: str = "", max_tokens: int = 2000, purpose: str = None, modality: str = "text") -> dict:
    """Ask the model for JSON and parse it, tolerating markdown code fences."""
    raw = complete(prompt, system=system, max_tokens=max_tokens, purpose=purpose, modality=modality).strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip().strip("`").strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start:end + 1]
    return json.loads(raw)
