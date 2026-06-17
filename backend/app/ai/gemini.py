"""Google Gemini API client — FREE tier.

Get your key (free, no credit card): https://aistudio.google.com/app/apikey
Free limits: 15 requests/min, 1M tokens/day with Gemini 1.5 Flash.
"""
import json
import re
import httpx
from app.config import get_settings


def available() -> bool:
    return bool(get_settings().GEMINI_API_KEY)


def complete(prompt: str, system: str = "", max_tokens: int = 1000) -> str:
    """Send a prompt to Gemini and return the text response."""
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"

    body = {
        "contents": [{"parts": [{"text": f"{system}\n\n{prompt}" if system else prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.8},
    }

    resp = httpx.post(url, json=body, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    # Extract text from Gemini response
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Unexpected Gemini response: {json.dumps(data)[:200]}")


def complete_json(prompt: str, system: str = "", max_tokens: int = 1000) -> dict:
    """Send a prompt to Gemini and parse JSON from the response."""
    text = complete(prompt, system, max_tokens)
    # Strip markdown code fences
    text = re.sub(r"```(?:json)?\s*", "", text).strip()
    text = text.rstrip("`").strip()
    return json.loads(text)


def chat(messages: list, system: str = "", max_tokens: int = 1000) -> str:
    """Multi-turn conversation with Gemini."""
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"

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

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Unexpected Gemini response: {json.dumps(data)[:200]}")
