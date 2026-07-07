"""Lightweight request-scoped context for LLM usage tracing.

Rather than threading `user_id` / `purpose` through every function signature
in app/ai/services.py (~20+ call sites, many nested), we stash them in
contextvars:

  - `current_user_id` is set once, in `get_current_user` (app/core/deps.py),
    which is already a dependency on almost every authenticated route. That
    single change point means every AI call made while handling a request
    is automatically attributed to the right user.
  - `current_purpose` is set immediately before each LLM call site with the
    `set_purpose("...")` context manager, giving each call a human-readable
    tag (e.g. "resume_parsing", "cover_letter", "mock_interview") without
    changing what the calling function returns.

Both are read by app/ai/client.py, app/ai/gemini.py, and app/resumes/llm_parser.py
right before writing a usage row via app/ai/usage_tracker.py.
"""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Optional

current_user_id: ContextVar[Optional[str]] = ContextVar("current_user_id", default=None)
current_purpose: ContextVar[str] = ContextVar("current_purpose", default="general")


def set_user_id(user_id: Optional[str]) -> None:
    current_user_id.set(user_id)


def get_user_id() -> Optional[str]:
    return current_user_id.get()


def get_purpose() -> str:
    return current_purpose.get()


@contextmanager
def set_purpose(purpose: str):
    """Tag every LLM call made inside this `with` block with `purpose`.

    Usage::

        with set_purpose("cover_letter"):
            return client.complete(prompt, system=system)
    """
    token = current_purpose.set(purpose)
    try:
        yield
    finally:
        current_purpose.reset(token)


@contextmanager
def set_user(user_id: Optional[str]):
    """Explicitly tag the current context with a user id.

    Needed for the handful of call paths that don't go through
    `get_current_user` (e.g. the WebSocket live-interview route, which
    decodes the JWT manually).
    """
    token = current_user_id.set(user_id)
    try:
        yield
    finally:
        current_user_id.reset(token)
