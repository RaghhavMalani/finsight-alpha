"""Lightweight on-disk cache (SQLite, zero-config).

A single key/value table with timestamps powers TTL caching for slow/expensive
fetches (SEC company-facts, price history). SQLite needs no setup and works
everywhere; to scale later, swap the connection for PostgreSQL by honoring a
``DATABASE_URL`` env var (the call sites don't change).

All functions are best-effort: any failure returns ``None`` / no-ops rather than
raising, so a cache problem can never break a request.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Optional

from src import config

_DB_PATH = Path(os.getenv("FINSIGHT_CACHE_DB", str(config.DATA_DIR / "cache.db")))
_LOCK = threading.Lock()


def _conn() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(_DB_PATH), timeout=10)
    c.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, val TEXT, ts REAL)")
    return c


def get_json(key: str, ttl: Optional[float] = None) -> Optional[Any]:
    """Return the cached object for ``key`` if present and (optionally) fresh."""
    try:
        with _LOCK, _conn() as c:
            row = c.execute("SELECT val, ts FROM kv WHERE key = ?", (key,)).fetchone()
        if not row:
            return None
        val, ts = row
        if ttl is not None and (time.time() - ts) > ttl:
            return None
        return json.loads(val)
    except Exception:
        return None


def put_json(key: str, obj: Any) -> None:
    """Store ``obj`` under ``key`` with the current timestamp (best-effort)."""
    try:
        with _LOCK, _conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO kv (key, val, ts) VALUES (?, ?, ?)",
                (key, json.dumps(obj), time.time()),
            )
    except Exception:
        pass


def cached(key: str, ttl: float, producer):
    """Return cached value for ``key`` or compute via ``producer()``, cache, return.

    ``producer`` is only called on a miss/stale entry. Exceptions from the
    producer propagate (so the caller can decide), but cache I/O never raises.
    """
    hit = get_json(key, ttl=ttl)
    if hit is not None:
        return hit
    value = producer()
    if value is not None:
        put_json(key, value)
    return value


def clear() -> None:
    try:
        with _LOCK, _conn() as c:
            c.execute("DELETE FROM kv")
    except Exception:
        pass
