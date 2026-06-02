"""Database access (Cloud SQL / PostgreSQL).

A thin wrapper around SQLAlchemy that creates an engine from ``DATABASE_URL``.
Everything here degrades gracefully: if no database is configured (the common
case in local development), :func:`get_engine` returns ``None`` and the rest of
the app keeps working. The database stores *application metadata* (assets,
ingestion jobs, watchlists) - not the bulk time-series, which lives in
BigQuery / local files.
"""

from __future__ import annotations

from src import config
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

# Cache the engine so we build it at most once per process.
_ENGINE = None
_ENGINE_INITIALISED = False


def get_engine():
    """Return a cached SQLAlchemy engine, or ``None`` if not configured.

    Reads ``DATABASE_URL`` from the environment (via :mod:`src.config`). If it is
    missing, or SQLAlchemy is not installed, we log a clear message and return
    ``None`` instead of raising - the app must run without a database locally.

    Returns
    -------
    sqlalchemy.engine.Engine | None
    """
    global _ENGINE, _ENGINE_INITIALISED

    if _ENGINE_INITIALISED:
        return _ENGINE

    _ENGINE_INITIALISED = True  # mark attempted even if it fails

    if not config.DATABASE_URL:
        logger.info(
            "DATABASE_URL not set; running without a database. "
            "Set it in .env to enable Cloud SQL / PostgreSQL metadata."
        )
        _ENGINE = None
        return None

    try:
        from sqlalchemy import create_engine

        # pool_pre_ping avoids stale-connection errors on managed databases.
        _ENGINE = create_engine(config.DATABASE_URL, pool_pre_ping=True, future=True)
        logger.info("SQLAlchemy engine created.")
    except Exception as exc:  # missing driver, bad URL, etc.
        logger.warning("Could not create database engine: %s", exc)
        _ENGINE = None

    return _ENGINE


def test_connection() -> bool:
    """Attempt a trivial ``SELECT 1`` to verify connectivity.

    Returns
    -------
    bool
        ``True`` if a connection succeeded, ``False`` otherwise (including when
        no database is configured). Never raises.
    """
    engine = get_engine()
    if engine is None:
        return False

    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection OK.")
        return True
    except Exception as exc:
        logger.warning("Database connection failed: %s", exc)
        return False


def is_configured() -> bool:
    """Whether a ``DATABASE_URL`` is present (does not test connectivity)."""
    return bool(config.DATABASE_URL)
