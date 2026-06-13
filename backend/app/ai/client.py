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

def _anthropic(prompt: str, system: str, max_tokens: int) -> str:
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": settings.AI_MODEL or "gemini-flash-lite-latest",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        body["system"] = system
    with httpx.Client(timeout=60) as c:
        resp = c.post(ANTHROPIC_URL, headers=headers, json=body)
        resp.raise_for_status()
    data = resp.json()
    return "".join(b.get("text", "") for b in data.get("content", []))


# ── Google Gemini ────────────────────────────────────────────────────────────

def _gemini(prompt: str, system: str, max_tokens: int) -> str:
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
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        return ""


# ── xAI Grok ─────────────────────────────────────────────────────────────────

def _grok(prompt: str, system: str, max_tokens: int) -> str:
    """Grok uses the OpenAI-compatible chat completions format."""
    headers = {
        "Authorization": f"Bearer {settings.GROK_API_KEY}",
        "Content-Type": "application/json",
    }
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    body = {
        "model": settings.GROK_MODEL or "grok-3-mini",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }
    with httpx.Client(timeout=60) as c:
        resp = c.post(GROK_URL, headers=headers, json=body)
        resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


# ── Public API ───────────────────────────────────────────────────────────────

def complete(prompt: str, system: str = "", max_tokens: int = 1500) -> str:
    """Try providers in order: Anthropic → Gemini → Grok.
    Falls through to the next provider on quota/rate-limit errors (429/529/503).
    Raises RuntimeError only if every configured provider fails.
    """
    last_err = None

    # 1. Anthropic Claude
    if settings.ANTHROPIC_API_KEY:
        try:
            logger.debug("Trying Anthropic Claude for AI completion")
            return _anthropic(prompt, system, max_tokens)
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
            return _gemini(prompt, system, max_tokens)
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
            return _grok(prompt, system, max_tokens)
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


def complete_json(prompt: str, system: str = "", max_tokens: int = 2000) -> dict:
    """Ask the model for JSON and parse it, tolerating markdown code fences."""
    raw = complete(prompt, system=system, max_tokens=max_tokens).strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip().strip("`").strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start:end + 1]
    return json.loads(raw)
