"""Database engine, durable users, and tenant membership helpers."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from src import config
from src.auth.models import Base, User
from src.auth.security import hash_password, verify_password
from src.auth.tenant_models import Organization, OrganizationMembership  # registers all tenant tables


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        if config.APP_ENV == "production":
            raise RuntimeError("DATABASE_URL is required in production; ephemeral SQLite fallback is disabled.")
        data_dir = config.DATA_DIR
        data_dir.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{(data_dir / 'finsight_users.db').as_posix()}"
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if config.APP_ENV == "production" and not url.startswith(("postgresql://", "postgresql+")):
        raise RuntimeError("Production DATABASE_URL must point to PostgreSQL.")
    return url


_URL = _database_url()
_connect_args = {"check_same_thread": False} if _URL.startswith("sqlite") else {}
engine = create_engine(
    _URL,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args=_connect_args,
    future=True,
)
SessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True
)


def init_db() -> None:
    """Create missing tables for development and fresh deployments.

    Existing production databases must apply the checked-in SQL migrations;
    ``create_all`` intentionally does not pretend to be a migration runner.
    """
    Base.metadata.create_all(bind=engine)


def get_session() -> Session:
    return SessionLocal()


class AuthError(Exception):
    """Raised for expected authentication failures."""


@dataclass(frozen=True)
class Principal:
    user_id: int
    organization_id: int
    role: str


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _organization_name(email: str) -> str:
    local = email.split("@", 1)[0].replace(".", " ").replace("_", " ").strip()
    return f"{local.title() or 'Personal'} Workspace"


def _organization_slug(email: str, user_id: int) -> str:
    local = re.sub(r"[^a-z0-9]+", "-", email.split("@", 1)[0].lower()).strip("-") or "personal"
    return f"{local}-{user_id}"


def _ensure_default_membership(session: Session, user: User) -> OrganizationMembership:
    membership = session.scalar(
        select(OrganizationMembership)
        .where(OrganizationMembership.user_id == user.id)
        .order_by(OrganizationMembership.id)
    )
    if membership is not None:
        return membership
    organization = Organization(slug=_organization_slug(user.email, user.id), name=_organization_name(user.email))
    session.add(organization)
    session.flush()
    membership = OrganizationMembership(
        organization_id=organization.id,
        user_id=user.id,
        role="owner",
    )
    session.add(membership)
    session.flush()
    return membership


def create_user(email: str, password: str) -> User:
    email = _normalize_email(email)
    if not email or "@" not in email:
        raise AuthError("Enter a valid email address.")
    if not password or len(password) < 12:
        raise AuthError("Password must be at least 12 characters.")
    with get_session() as session:
        existing = session.scalar(select(User).where(User.email == email))
        if existing is not None:
            raise AuthError("An account with that email already exists.")
        user = User(email=email, password_hash=hash_password(password))
        session.add(user)
        session.flush()
        _ensure_default_membership(session, user)
        session.commit()
        session.refresh(user)
        return user


def authenticate(email: str, password: str) -> User:
    email = _normalize_email(email)
    with get_session() as session:
        user = session.scalar(select(User).where(User.email == email))
        if user is None or not verify_password(password, user.password_hash):
            raise AuthError("Incorrect email or password.")
        _ensure_default_membership(session, user)
        session.commit()
        return user


def get_user(user_id: int) -> Optional[User]:
    with get_session() as session:
        return session.get(User, user_id)


def resolve_principal(user_id: int, requested_organization: str | None = None) -> Principal | None:
    """Resolve and authorize the selected organization for a signed-in user."""
    with get_session() as session:
        user = session.get(User, user_id)
        if user is None:
            return None
        default = _ensure_default_membership(session, user)
        membership = default
        if requested_organization:
            try:
                organization_id = int(requested_organization)
            except ValueError:
                return None
            selected = session.scalar(
                select(OrganizationMembership).where(
                    OrganizationMembership.user_id == user_id,
                    OrganizationMembership.organization_id == organization_id,
                )
            )
            if selected is None:
                return None
            membership = selected
        session.commit()
        return Principal(
            user_id=user_id,
            organization_id=membership.organization_id,
            role=membership.role,
        )


def user_public(user: User) -> dict:
    principal = resolve_principal(user.id)
    payload = user.public()
    if principal:
        payload["active_organization_id"] = principal.organization_id
        payload["role"] = principal.role
    payload["organizations"] = memberships_for_user(user.id)
    return payload


def memberships_for_user(user_id: int) -> list[dict]:
    with get_session() as session:
        rows = session.execute(
            select(OrganizationMembership, Organization)
            .join(Organization, Organization.id == OrganizationMembership.organization_id)
            .where(OrganizationMembership.user_id == user_id)
            .order_by(OrganizationMembership.id)
        ).all()
        return [
            {"id": organization.id, "slug": organization.slug, "name": organization.name, "role": membership.role}
            for membership, organization in rows
        ]
