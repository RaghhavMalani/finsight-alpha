"""Tenant-aware license resolution and fail-closed evidence redaction."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, text

from src.auth.db import get_session
from src.auth.tenant_models import Dataset, OrganizationLicenseGrant
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

ACTIVE = "ACTIVE"
NOT_GRANTED = "NOT_GRANTED"
NOT_REGISTERED = "NOT_REGISTERED"
UNVERIFIED = "UNVERIFIED"


def _set_tenant(session: Any, organization_id: int) -> None:
    if session.bind and session.bind.dialect.name == "postgresql":
        session.execute(
            text("SELECT set_config('app.organization_id', :organization_id, true)"),
            {"organization_id": str(organization_id)},
        )


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def resolve_dataset_licenses(
    organization_id: int,
    dataset_keys: set[str],
    *,
    at: datetime | None = None,
) -> dict[str, dict[str, Any]]:
    """Resolve current grants for one tenant without ever assuming permission."""
    keys = {key for key in dataset_keys if key and key != "UNAVAILABLE"}
    if not keys:
        return {}

    now = at or datetime.now(timezone.utc)
    unresolved = {
        key: {
            "status": UNVERIFIED,
            "permitted_uses": [],
            "starts_at": None,
            "ends_at": None,
        }
        for key in keys
    }
    try:
        with get_session() as session:
            _set_tenant(session, organization_id)
            registered = set(
                session.scalars(select(Dataset.dataset_key).where(Dataset.dataset_key.in_(keys))).all()
            )
            rows = session.execute(
                select(Dataset.dataset_key, OrganizationLicenseGrant)
                .join(
                    OrganizationLicenseGrant,
                    OrganizationLicenseGrant.dataset_id == Dataset.id,
                )
                .where(
                    Dataset.dataset_key.in_(keys),
                    OrganizationLicenseGrant.organization_id == organization_id,
                )
            ).all()

        resolved: dict[str, dict[str, Any]] = {}
        grants = {dataset_key: grant for dataset_key, grant in rows}
        for key in keys:
            if key not in registered:
                resolved[key] = {
                    "status": NOT_REGISTERED,
                    "permitted_uses": [],
                    "starts_at": None,
                    "ends_at": None,
                }
                continue
            grant = grants.get(key)
            if grant is None:
                resolved[key] = {
                    "status": NOT_GRANTED,
                    "permitted_uses": [],
                    "starts_at": None,
                    "ends_at": None,
                }
                continue

            starts_at = grant.starts_at
            ends_at = grant.ends_at
            comparable_start = starts_at.replace(tzinfo=timezone.utc) if starts_at and starts_at.tzinfo is None else starts_at
            comparable_end = ends_at.replace(tzinfo=timezone.utc) if ends_at and ends_at.tzinfo is None else ends_at
            status = grant.status.upper()
            if status == ACTIVE and comparable_start and comparable_start > now:
                status = "PENDING"
            elif status == ACTIVE and comparable_end and comparable_end <= now:
                status = "EXPIRED"
            resolved[key] = {
                "status": status,
                "permitted_uses": list(grant.permitted_uses or []),
                "starts_at": _iso(starts_at),
                "ends_at": _iso(ends_at),
            }
        return resolved
    except Exception:
        logger.exception("License resolution failed for organization %s", organization_id)
        return unresolved


def dataset_license_status(organization_id: int, dataset_key: str) -> dict[str, Any]:
    return resolve_dataset_licenses(organization_id, {dataset_key}).get(
        dataset_key,
        {"status": UNVERIFIED, "permitted_uses": [], "starts_at": None, "ends_at": None},
    )


def enforce_evidence_licenses(payload: dict[str, Any], organization_id: int) -> dict[str, Any]:
    """Annotate evidence and redact observations when a tenant lacks a grant."""
    evidence: list[dict[str, Any]] = []

    def collect(value: Any) -> None:
        if isinstance(value, dict):
            metadata = value.get("metadata")
            if isinstance(metadata, dict) and metadata.get("dataset_id"):
                evidence.append(value)
            for child in value.values():
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)

    collect(payload)
    dataset_keys = {
        str(item["metadata"].get("dataset_id"))
        for item in evidence
        if item["metadata"].get("dataset_id") not in (None, "UNAVAILABLE")
    }
    grants = resolve_dataset_licenses(organization_id, dataset_keys)

    for item in evidence:
        metadata = item["metadata"]
        dataset_key = str(metadata.get("dataset_id"))
        if dataset_key == "UNAVAILABLE":
            continue
        grant = grants.get(
            dataset_key,
            {"status": UNVERIFIED, "permitted_uses": [], "starts_at": None, "ends_at": None},
        )
        metadata["customer_license_status"] = grant["status"]
        metadata["customer_license_permitted_uses"] = grant["permitted_uses"]
        metadata["customer_license_valid_from"] = grant["starts_at"]
        metadata["customer_license_valid_through"] = grant["ends_at"]
        if grant["status"] != ACTIVE:
            original_status = item.get("status", "UNAVAILABLE")
            item["status"] = "UNAVAILABLE"
            item["reason"] = (
                f"Evidence redacted: organization {organization_id} license status for "
                f"{dataset_key} is {grant['status']}."
            )
            item["source_status"] = original_status
            if "points" in item:
                item["points"] = []
            item.pop("image_path", None)

    available = sum(item.get("status") == "AVAILABLE" for item in evidence)
    if evidence:
        payload["status"] = (
            "AVAILABLE" if available == len(evidence) else "PARTIAL" if available else "UNAVAILABLE"
        )
    payload["license_enforcement"] = {
        "organization_id": organization_id,
        "status": "ACTIVE" if evidence and available == len(evidence) else "RESTRICTED",
        "datasets_evaluated": len(dataset_keys),
    }
    return payload
