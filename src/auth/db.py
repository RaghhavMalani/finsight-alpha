"""Database engine + user-store helpers for authentication.

Uses ``DATABASE_URL`` when set (Azure Postgres in production) and otherwise
falls back to a local SQLite file, so the app — including login — runs locally
with zero database setup. Postgres URLs in the ``postgres://`` form (as some
providers emit) are normalised to the SQLAlchemy ``postgresql://`` form.
"""

from __future__ import annotations

import os
from typing import Optional

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from src import config
from src.auth.models import Base, User
from src.auth.security import hash_password, verify_password


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        # Local/dev fallback. On serverless platforms config.DATA_DIR resolves
        # to /tmp, since the deployed source tree is read-only.
        data_dir = config.DATA_DIR
        data_dir.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{(data_dir / 'finsight_users.db').as_posix()}"
    # Normalise common variants to a psycopg2-compatible URL.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


_URL = _database_url()
_connect_args = {"check_same_thread": False} if _URL.startswith("sqlite") else {}
engine = create_engine(_URL, pool_pre_ping=True, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True
)


def init_db() -> None:
    """Create tables if they don't exist. Safe to call on every startup."""
    Base.metadata.create_all(bind=engine)


def get_session() -> Session:
    return SessionLocal()


# ---------------------------------------------------------------------------
# User-store operations
# ---------------------------------------------------------------------------
class AuthError(Exception):
    """Raised for expected auth failures (duplicate email, bad credentials)."""


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def create_user(email: str, password: str) -> User:
    email = _normalize_email(email)
    if not email or "@" not in email:
        raise AuthError("Enter a valid email address.")
    if not password or len(password) < 8:
        raise AuthError("Password must be at least 8 characters.")
    with get_session() as s:
        existing = s.scalar(select(User).where(User.email == email))
        if existing is not None:
            raise AuthError("An account with that email already exists.")
        user = User(email=email, password_hash=hash_password(password))
        s.add(user)
        s.commit()
        s.refresh(user)
        return user


def authenticate(email: str, password: str) -> User:
    email = _normalize_email(email)
    with get_session() as s:
        user = s.scalar(select(User).where(User.email == email))
        if user is None or not verify_password(password, user.password_hash):
            raise AuthError("Incorrect email or password.")
        return user


def get_user(user_id: int) -> Optional[User]:
    with get_session() as s:
        return s.get(User, user_id)
