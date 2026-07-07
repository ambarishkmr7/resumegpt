"""Agent memory — official LangGraph persistence.

Uses LangGraph's own production-grade, Postgres-backed implementations
instead of a hand-rolled write-through cache:

  AsyncPostgresSaver  (langgraph.checkpoint.postgres.aio) — conversation
                       state / checkpoints
  AsyncPostgresStore  (langgraph.store.postgres.aio)      — thread metadata
                       (titles, previews, etc.)

Docs: https://docs.langchain.com/oss/python/langgraph/persistence
      https://reference.langchain.com/python/langgraph.checkpoint.postgres
      https://reference.langchain.com/python/langgraph.store.postgres

These manage their own schema (checkpoints/checkpoint_blobs/checkpoint_writes
tables, store/store_migrations tables — created by `.setup()`), handle
CheckpointMetadata correctly, and are what LangGraph itself recommends for
production rather than a custom saver. Both packages are already in
requirements.txt: `langgraph-checkpoint-postgres` and `psycopg[binary,pool]`
(note: psycopg v3, a different driver from the psycopg2 SQLAlchemy uses
elsewhere in this app — that's expected, they're independent).

NOTE ON MIGRATION: this replaces the old custom `agent_checkpoints` /
`agent_store` tables with LangGraph's own tables. Conversation history saved
under the old scheme is not carried over — it's a clean break. The old
tables are unused after this change and can be dropped once you've confirmed
the new one works:
    DROP TABLE IF EXISTS agent_checkpoints;
    DROP TABLE IF EXISTS agent_store;

If DATABASE_URL isn't Postgres, LangGraph has no official MySQL checkpointer,
so we fall back to LangGraph's plain in-memory implementations — usable for
local dev, but conversation history won't survive a server restart.
"""

from __future__ import annotations

import logging
import re

from app.config import get_settings

logger = logging.getLogger(__name__)

_pool = None
_checkpointer = None
_store = None


def _dialect() -> str:
    url = get_settings().database_url
    if url.startswith("postgresql"):
        return "postgresql"
    if url.startswith("mysql"):
        return "mysql"
    return "sqlite"


def _psycopg_dsn(database_url: str) -> str:
    """SQLAlchemy URLs look like 'postgresql+psycopg2://user:pass@host/db'.
    psycopg (v3, used by langgraph-checkpoint-postgres) wants the driver
    suffix stripped: 'postgresql://user:pass@host/db'."""
    return re.sub(r"^postgresql\+\w+://", "postgresql://", database_url)


async def _get_pool():
    """A single shared async connection pool, opened lazily and reused for
    both the checkpointer and the store, kept open for the process's life."""
    global _pool
    if _pool is not None:
        return _pool
    from psycopg_pool import AsyncConnectionPool

    dsn = _psycopg_dsn(get_settings().database_url)
    _pool = AsyncConnectionPool(
        conninfo=dsn,
        max_size=10,
        open=False,
        kwargs={"autocommit": True, "prepare_threshold": 0},
    )
    await _pool.open()
    return _pool


async def get_checkpointer():
    global _checkpointer
    if _checkpointer is not None:
        return _checkpointer

    if _dialect() == "postgresql":
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

        pool = await _get_pool()
        saver = AsyncPostgresSaver(pool)
        await saver.setup()  # creates/migrates checkpoints, checkpoint_blobs, checkpoint_writes — idempotent
        _checkpointer = saver
        logger.info("Agent checkpointer: AsyncPostgresSaver (official, Postgres-backed)")
    else:
        from langgraph.checkpoint.memory import MemorySaver

        logger.warning(
            "Agent checkpointer: in-memory only (DATABASE_URL dialect=%s). "
            "LangGraph has no official MySQL checkpointer, so conversation "
            "history will NOT survive a server restart. Use a Postgres "
            "DATABASE_URL for persistence.",
            _dialect(),
        )
        _checkpointer = MemorySaver()
    return _checkpointer


async def get_store():
    global _store
    if _store is not None:
        return _store

    if _dialect() == "postgresql":
        from langgraph.store.postgres.aio import AsyncPostgresStore

        pool = await _get_pool()
        store = AsyncPostgresStore(pool)
        await store.setup()  # creates/migrates store, store_migrations — idempotent
        _store = store
        logger.info("Agent store: AsyncPostgresStore (official, Postgres-backed)")
    else:
        from langgraph.store.memory import InMemoryStore

        logger.warning(
            "Agent store: in-memory only (DATABASE_URL dialect=%s). Thread "
            "titles/previews will NOT survive a server restart. Use a "
            "Postgres DATABASE_URL for persistence.",
            _dialect(),
        )
        _store = InMemoryStore()
    return _store