"""Agent memory — MySQL-backed checkpointer and store.

Two tables are created automatically in the application's MySQL database:

  agent_checkpoints  — conversation state (LangGraph checkpoints)
  agent_store        — thread metadata (titles, last messages, etc.)

Both classes wrap LangGraph's in-memory implementations and write through to
MySQL so history survives server restarts.
"""

from __future__ import annotations

import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor

from app.config import get_settings

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="agent-db")

_engine = None
_checkpointer = None
_store = None


# ── Database bootstrap ────────────────────────────────────────────────────────

def _get_engine():
    global _engine
    if _engine is not None:
        return _engine
    from sqlalchemy import create_engine
    _engine = create_engine(
        get_settings().database_url,
        pool_pre_ping=True,
        pool_recycle=3600,
    )
    _init_tables(_engine)
    return _engine


def _init_tables(engine) -> None:
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agent_checkpoints (
                thread_id     VARCHAR(255) NOT NULL,
                checkpoint_ns VARCHAR(255) NOT NULL DEFAULT '',
                checkpoint_id VARCHAR(255) NOT NULL,
                parent_id     VARCHAR(255),
                type_col      VARCHAR(64)  NOT NULL,
                data_col      LONGBLOB     NOT NULL,
                PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agent_store (
                prefix_col  VARCHAR(255) NOT NULL,
                key_col     VARCHAR(255) NOT NULL,
                value_col   LONGTEXT     NOT NULL,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (prefix_col, key_col)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """))
    logger.info("Agent memory tables ready (MySQL)")


async def _run(fn, *args):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, fn, *args)


# ── MySQLSaver ────────────────────────────────────────────────────────────────

def _build_saver(engine):
    """Return a MemorySaver that writes checkpoints through to MySQL."""
    from langgraph.checkpoint.memory import MemorySaver
    from sqlalchemy import text

    class MySQLSaver(MemorySaver):
        def __init__(self):
            super().__init__()
            self._db = engine
            self._restore()

        # ── startup restore ──────────────────────────────────────────────────

        def _restore(self):
            try:
                with self._db.connect() as conn:
                    rows = conn.execute(text(
                        "SELECT thread_id, checkpoint_ns, checkpoint_id, parent_id, "
                        "type_col, data_col "
                        "FROM agent_checkpoints ORDER BY checkpoint_id"
                    )).fetchall()

                for tid, ns, cid, pid, ttype, data in rows:
                    try:
                        chk = self.serde.loads_typed((ttype, bytes(data)))
                        # Call MemorySaver.put directly to skip our override
                        # config.checkpoint_id = parent's id (how MemorySaver tracks lineage)
                        MemorySaver.put(
                            self,
                            {"configurable": {
                                "thread_id": tid,
                                "checkpoint_ns": ns,
                                "checkpoint_id": pid or "",
                            }},
                            chk, {}, {},
                        )
                    except Exception as exc:
                        logger.debug("Skip checkpoint %s/%s: %s", tid, cid, exc)

                if rows:
                    logger.info("Restored %d checkpoints from MySQL", len(rows))
            except Exception as exc:
                logger.warning("Checkpoint restore failed: %s", exc)

        # ── write-through put ────────────────────────────────────────────────

        def put(self, config, checkpoint, metadata, new_versions):
            result = MemorySaver.put(self, config, checkpoint, metadata, new_versions)
            try:
                tid   = config["configurable"]["thread_id"]
                ns    = config["configurable"].get("checkpoint_ns", "")
                cid   = checkpoint["id"]
                pid   = config["configurable"].get("checkpoint_id")
                ttype, data = self.serde.dumps_typed(checkpoint)
                with self._db.begin() as conn:
                    conn.execute(text("""
                        INSERT INTO agent_checkpoints
                            (thread_id, checkpoint_ns, checkpoint_id,
                             parent_id, type_col, data_col)
                        VALUES (:tid, :ns, :cid, :pid, :tt, :data)
                        ON DUPLICATE KEY UPDATE
                            type_col = VALUES(type_col),
                            data_col = VALUES(data_col)
                    """), {"tid": tid, "ns": ns, "cid": cid,
                           "pid": pid, "tt": ttype, "data": data})
            except Exception as exc:
                logger.warning("Failed to persist checkpoint: %s", exc)
            return result

        async def aput(self, config, checkpoint, metadata, new_versions):
            return await _run(self.put, config, checkpoint, metadata, new_versions)

        # ── delete ───────────────────────────────────────────────────────────

        async def adelete(self, config):
            tid = config["configurable"]["thread_id"]
            ns  = config["configurable"].get("checkpoint_ns", "")

            def _del():
                with self._db.begin() as conn:
                    conn.execute(text(
                        "DELETE FROM agent_checkpoints "
                        "WHERE thread_id = :tid AND checkpoint_ns = :ns"
                    ), {"tid": tid, "ns": ns})

            await _run(_del)

    return MySQLSaver()


# ── MySQLStore ────────────────────────────────────────────────────────────────

def _build_store(engine):
    """Return an InMemoryStore that writes items through to MySQL."""
    from langgraph.store.memory import InMemoryStore
    from sqlalchemy import text

    class MySQLStore(InMemoryStore):
        def __init__(self):
            super().__init__()
            self._db = engine
            self._restore()

        @staticmethod
        def _prefix(namespace: tuple) -> str:
            return "/".join(str(n) for n in namespace)

        # ── startup restore ──────────────────────────────────────────────────

        def _restore(self):
            try:
                with self._db.connect() as conn:
                    rows = conn.execute(text(
                        "SELECT prefix_col, key_col, value_col FROM agent_store"
                    )).fetchall()

                if not rows:
                    return

                # Populate in-memory store using parent's batch (no write-back)
                # Build PutOp list — try official import first, duck-type fallback
                put_ops = []
                for prefix, key, val_json in rows:
                    ns = tuple(prefix.split("/"))
                    try:
                        value = json.loads(val_json)
                        put_ops.append((ns, key, value))
                    except Exception:
                        pass

                try:
                    from langgraph.store.base import PutOp
                    ops = [PutOp(namespace=ns, key=k, value=v) for ns, k, v in put_ops]
                    InMemoryStore.batch(self, ops)
                except Exception:
                    # Fallback: write to .data dict directly if accessible
                    from datetime import datetime, timezone
                    now = datetime.now(timezone.utc)
                    try:
                        from langgraph.store.base import Item
                        for ns, key, value in put_ops:
                            if hasattr(self, "data"):
                                self.data[ns][key] = Item(
                                    value=value, key=key, namespace=ns,
                                    created_at=now, updated_at=now,
                                )
                    except Exception as exc2:
                        logger.debug("Store preload inner fallback: %s", exc2)

                logger.info("Restored %d store items from MySQL", len(rows))
            except Exception as exc:
                logger.warning("Store restore failed: %s", exc)

        # ── write-through batch ──────────────────────────────────────────────

        def batch(self, ops):
            results = InMemoryStore.batch(self, ops)
            try:
                with self._db.begin() as conn:
                    for op in ops:
                        op_type = type(op).__name__
                        if op_type == "PutOp":
                            conn.execute(text("""
                                INSERT INTO agent_store
                                    (prefix_col, key_col, value_col)
                                VALUES (:p, :k, :v)
                                ON DUPLICATE KEY UPDATE
                                    value_col  = VALUES(value_col),
                                    updated_at = CURRENT_TIMESTAMP
                            """), {
                                "p": self._prefix(op.namespace),
                                "k": op.key,
                                "v": json.dumps(op.value),
                            })
                        elif op_type == "DeleteOp":
                            conn.execute(text(
                                "DELETE FROM agent_store "
                                "WHERE prefix_col = :p AND key_col = :k"
                            ), {
                                "p": self._prefix(op.namespace),
                                "k": op.key,
                            })
            except Exception as exc:
                logger.warning("Failed to persist store op: %s", exc)
            return results

        async def abatch(self, ops):
            return await _run(self.batch, ops)

    return MySQLStore()


# ── Public API ────────────────────────────────────────────────────────────────

async def get_checkpointer():
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = _build_saver(_get_engine())
        logger.info("Agent checkpointer: MySQL-backed")
    return _checkpointer


async def get_store():
    global _store
    if _store is None:
        _store = _build_store(_get_engine())
        logger.info("Agent store: MySQL-backed")
    return _store
