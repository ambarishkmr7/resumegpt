"""Postgres-backed memory for the LangGraph agent.

Short-term: conversation checkpoints (per thread_id)
Long-term:  user memory store (per user_id, with semantic search)

Uses the same DATABASE_URL as the main application database.
"""

from __future__ import annotations

import logging
import os

from app.config import get_settings

logger = logging.getLogger(__name__)


def _get_memory_url() -> str:
    """Return the database URL for agent memory (same as main DATABASE_URL)."""
    settings = get_settings()
    url = settings.database_url
    if url.startswith("sqlite"):
        raise RuntimeError(
            "Agent memory requires Postgres. Set DATABASE_URL to a Postgres "
            "connection string (e.g. postgresql://user:pass@host:5432/dbname)."
        )
    return url


_pool = None
_checkpointer = None
_store = None


async def _get_pool():
    global _pool
    if _pool is None:
        from psycopg_pool import AsyncConnectionPool
        from psycopg.conninfo import conninfo_to_dict
        url = _get_memory_url()
        # Parse connection info so we can inject SSL and keep-alive settings
        # that Neon (serverless Postgres) requires to avoid dropped connections.
        conn_kwargs = conninfo_to_dict(url)
        conn_kwargs.update({
            "autocommit": True,
            "prepare_threshold": 0,
            "sslmode": conn_kwargs.get("sslmode", "require"),
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
        })
        _pool = AsyncConnectionPool(
            kwargs=conn_kwargs,
            max_size=10,
            open=False,
        )
        await _pool.open()
    return _pool


async def get_checkpointer():
    """Return a singleton AsyncPostgresSaver using a shared connection pool."""
    global _checkpointer
    if _checkpointer is not None:
        return _checkpointer

    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    pool = await _get_pool()
    _checkpointer = AsyncPostgresSaver(pool)
    await _checkpointer.setup()
    return _checkpointer


async def get_store():
    """Return a singleton AsyncPostgresStore using a shared connection pool."""
    global _store
    if _store is not None:
        return _store

    from langgraph.store.postgres.aio import AsyncPostgresStore

    pool = await _get_pool()

    # Set up semantic search embeddings using Gemini
    index_config = None
    try:
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        gemini_key = get_settings().GEMINI_API_KEY
        if gemini_key:
            os.environ.setdefault("GEMINI_API_KEY", gemini_key)
            os.environ.setdefault("GOOGLE_API_KEY", gemini_key)
            
        embeddings = GoogleGenerativeAIEmbeddings(
            model="gemini-embedding-001",
            output_dimensionality=768,
        )
        index_config = {"embed": embeddings, "dims": 768}
        logger.info("Gemini embedding store initialized (gemini-embedding-001, dims=768)")
    except Exception as exc:
        logger.warning("Gemini embeddings not available for store: %s", exc)

    store_kwargs: dict = {}
    if index_config:
        store_kwargs["index"] = index_config

    _store = AsyncPostgresStore(pool, **store_kwargs)
    await _store.setup()
    return _store