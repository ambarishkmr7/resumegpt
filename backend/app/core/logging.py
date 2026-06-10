"""Centralized logging configuration for the ResumeGPT backend.

Call ``setup_logging()`` once at application startup (from ``main.py``).
Every other module simply does::

    import logging
    logger = logging.getLogger(__name__)

and the centralized configuration handles formatting, level, and noise suppression.
"""
from __future__ import annotations

import logging
import sys


def setup_logging(level: str = "INFO") -> None:
    """Configure root logger and silence noisy third-party loggers.

    Parameters
    ----------
    level: One of DEBUG, INFO, WARNING, ERROR, CRITICAL (case-insensitive).
    """
    numeric = getattr(logging, level.upper(), logging.INFO)

    # ── Root handler ──────────────────────────────────────────────────────
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="[%(asctime)s] %(levelname)-8s %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )

    root = logging.getLogger()
    root.setLevel(numeric)
    # Avoid duplicate handlers on reload (uvicorn --reload)
    if not root.handlers:
        root.addHandler(handler)
    else:
        root.handlers[:] = [handler]

    # ── Quiet noisy libraries ─────────────────────────────────────────────
    for noisy in ("urllib3", "httpx", "httpcore", "boto3", "botocore", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
