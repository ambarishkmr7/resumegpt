"""App-wide APScheduler instance (AsyncIOScheduler, UTC).

Started/stopped from app/main.py's lifespan. Two kinds of jobs use it:

1. **Precise one-shot jobs** — e.g. "mark payment X failed at created_at+30min",
   scheduled the moment the checkout order is created (see
   app/subscription/router.py::schedule_payment_expiry).
2. **Periodic sweep jobs** — e.g. expire_stale_payments every 5 minutes.

One-shot jobs live in memory, so they're lost on a server restart. That's why
the periodic sweep exists: it re-scans the DB by ``created_at`` and catches
anything a lost one-shot job would have handled. Neither depends on any HTTP
request arriving.
"""
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started (UTC)")


def shutdown_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
