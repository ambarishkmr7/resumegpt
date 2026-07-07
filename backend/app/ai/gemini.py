"""Google Gemini API client — FREE tier.

Get your key (free, no credit card): https://aistudio.google.com/app/apikey
Free limits: 15 requests/min, 1M tokens/day with Gemini 1.5 Flash.
"""
import json
import logging
import re
import httpx
from app.ai import usage_tracker
from app.config import get_settings

logger = logging.getLogger(__name__)
_MODEL = "gemini-1.5-flash"


def available() -> bool:
    return bool(get_settings().GEMINI_API_KEY)


def _log_usage(data: dict, purpose: str, modality: str) -> None:
    usage = data.get("usageMetadata") or {}
    try:
        usage_tracker.record_usage(
            provider="gemini",
            model=_MODEL,
            modality=modality,
            input_tokens=usage.get("promptTokenCount", 0),
            output_tokens=usage.get("candidatesTokenCount", 0),
            cached_tokens=usage.get("cachedContentTokenCount", 0),
            thoughts_tokens=usage.get("thoughtsTokenCount", 0),
            purpose=purpose,
        )
    except Exception:
        logger.exception("Usage logging failed for Gemini call")


def complete(prompt: str, system: str = "", max_tokens: int = 1000, purpose: str = None, modality: str = "text") -> str:
    """Send a prompt to Gemini and return the text response.

    `purpose`/`modality` tag the call for the admin usage dashboard — see
    app/ai/usage_tracker.py and app/core/llm_context.py.
    """
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"

    body = {
        "contents": [{"parts": [{"text": f"{system}\n\n{prompt}" if system else prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.8},
    }

    resp = httpx.post(url, json=body, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    _log_usage(data, purpose, modality)

    # Extract text from Gemini response
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Unexpected Gemini response: {json.dumps(data)[:200]}")


def complete_json(prompt: str, system: str = "", max_tokens: int = 1000, purpose: str = None, modality: str = "text") -> dict:
    """Send a prompt to Gemini and parse JSON from the response."""
    text = complete(prompt, system, max_tokens, purpose=purpose, modality=modality)
    # Strip markdown code fences
    text = re.sub(r"```(?:json)?\s*", "", text).strip()
    text = text.rstrip("`").strip()
    return json.loads(text)


def chat(messages: list, system: str = "", max_tokens: int = 1000, purpose: str = None, modality: str = "text") -> str:
    """Multi-turn conversation with Gemini."""
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"

    # Convert messages to Gemini format
    contents = []
    if system:
        contents.append({"role": "user", "parts": [{"text": f"System instructions: {system}"}]})
        contents.append({"role": "model", "parts": [{"text": "Understood. I'll follow these instructions."}]})

    for msg in messages:
        role = "user" if msg.get("role") == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    body = {
        "contents": contents,
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.8},
    }

    resp = httpx.post(url, json=body, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    _log_usage(data, purpose, modality)

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Unexpected Gemini response: {json.dumps(data)[:200]}")
