"""Thin AI client. Uses Anthropic's Messages API via httpx so there's no hard
SDK dependency. If no API key is configured, `available()` returns False and
callers fall back to deterministic logic.

Swap providers by reimplementing `complete()` — nothing else changes.
"""
import json
from typing import Optional

import httpx

from app.config import get_settings

settings = get_settings()
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


def available() -> bool:
    return bool(settings.ANTHROPIC_API_KEY)


def complete(prompt: str, system: str = "", max_tokens: int = 1500) -> str:
    if not available():
        raise RuntimeError("AI not configured: set ANTHROPIC_API_KEY")
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": settings.AI_MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        body["system"] = system
    with httpx.Client(timeout=60) as client:
        resp = client.post(ANTHROPIC_URL, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()
    return "".join(block.get("text", "") for block in data.get("content", []))


def complete_json(prompt: str, system: str = "", max_tokens: int = 2000) -> dict:
    """Ask the model for JSON and parse it, tolerating code fences."""
    raw = complete(prompt, system=system, max_tokens=max_tokens)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip().strip("`").strip()
    # find first { ... last }
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start:end + 1]
    return json.loads(raw)
