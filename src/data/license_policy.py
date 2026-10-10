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

# Narrow publication registrations for attributed research projections. These are
# not raw-vendor-data licences or tenant display/training grants.
PUBLIC_RESEARCH_SOURCES = {
    "alfred:UNRATE": {
        "attribution": "U.S. Bureau of Labor Statistics, Unemployment Rate (UNRATE), retrieved from ALFRED, Federal Reserve Bank of St. Louis.",
        "source_urls": ["https://alfred.stlouisfed.org/series?seid=UNRATE"],
        "terms_url": "https://alfred.stlouisfed.org/series?seid=UNRATE",
        "basis": "UNRATE-specific Public Domain: Citation Requested designation; aggregated revision/health evidence only. No blanket FRED grant.",
    },
    "bls:LNS14000000": {
        "attribution": "U.S. Bureau of Labor Statistics, seasonally adjusted civilian unemployment rate LNS14000000.",
        "source_urls": ["https://www.bls.gov/developers/", "https://www.bls.gov/opub/copyright-information.htm"],
        "terms_url": "https://www.bls.gov/opub/copyright-information.htm",
        "basis": "BLS public-domain statistical data, excluding protected imagery. Aggregated mirror/health evidence only.",
    },
    "ken-french:daily-factors": {
        "attribution": "Kenneth R. French Data Library; Fama and French research factors and momentum.",
        "source_urls": ["https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html"],
        "terms_url": "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
        "basis": "Public research-return library; attributed derived research publication. No raw CRSP redistribution.",
    },
    "iima:daily-factors": {
        "attribution": "Agarwalla, S. K., Jacob, J. and Varma, J. R. (2013), Four factor model in Indian equities market, W.P. No. 2013-09-05, Indian Institute of Management, Ahmedabad.",
        "source_urls": ["https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/"],
        "terms_url": "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
        "basis": "Public research-factor library with requested citation; attributed derived research publication. No raw Prowess redistribution.",
    },
    "celestrak:gp": {
        "attribution": "CelesTrak; USSPACECOM / 18th Space Defense Squadron; Space-Track.org.",
        "source_urls": ["https://celestrak.org/", "https://www.space-track.org/documentation"],
        "terms_url": "https://celestrak.org/usage-policy.php",
        "basis": "USSPACECOM blanket approval for cited basic SSA redistribution; publish derived orbital snapshots only. Fetch needed groups at most once per two hours; stop on non-200.",
    },
}


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
                session.scalars(
                    select(Dataset.dataset_key).where(Dataset.dataset_key.in_(keys))
                ).all()
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
            comparable_start = (
                starts_at.replace(tzinfo=timezone.utc)
                if starts_at and starts_at.tzinfo is None
                else starts_at
            )
            comparable_end = (
                ends_at.replace(tzinfo=timezone.utc)
                if ends_at and ends_at.tzinfo is None
                else ends_at
            )
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
        logger.exception(
            "License resolution failed for organization %s", organization_id
        )
        return unresolved


def dataset_license_status(organization_id: int, dataset_key: str) -> dict[str, Any]:
    return resolve_dataset_licenses(organization_id, {dataset_key}).get(
        dataset_key,
        {
            "status": UNVERIFIED,
            "permitted_uses": [],
            "starts_at": None,
            "ends_at": None,
        },
    )


def enforce_evidence_licenses(
    payload: dict[str, Any], organization_id: int
) -> dict[str, Any]:
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
            {
                "status": UNVERIFIED,
                "permitted_uses": [],
                "starts_at": None,
                "ends_at": None,
            },
        )
        metadata["customer_license_status"] = grant["status"]
        metadata["customer_license_permitted_uses"] = grant["permitted_uses"]
        metadata["customer_license_valid_from"] = grant["starts_at"]
        metadata["customer_license_valid_through"] = grant["ends_at"]
        if grant["status"] != ACTIVE or "display" not in grant["permitted_uses"]:
            original_status = item.get("status", "UNAVAILABLE")
            item["status"] = "UNAVAILABLE"
            item["reason"] = (
                f"Evidence redacted: organization {organization_id} license status for "
                f"{dataset_key} is {grant['status']}; required permitted use is display."
            )
            item["source_status"] = original_status
            if "points" in item:
                item["points"] = []
            item.pop("image_path", None)

    available = sum(item.get("status") == "AVAILABLE" for item in evidence)
    if evidence:
        payload["status"] = (
            "AVAILABLE"
            if available == len(evidence)
            else "PARTIAL" if available else "UNAVAILABLE"
        )
    payload["license_enforcement"] = {
        "organization_id": organization_id,
        "status": "ACTIVE" if evidence and available == len(evidence) else "RESTRICTED",
        "datasets_evaluated": len(dataset_keys),
    }
    return payload


class LicenseAccessDenied(PermissionError):
    """Raised when a response would expose evidence outside a tenant grant."""


def derived_publication_license(
    dataset_key: str, organization_id: int | None, *, at: datetime | None = None
) -> dict[str, Any]:
    """Display/training grants never imply permission for anonymous publication."""
    if dataset_key in PUBLIC_RESEARCH_SOURCES:
        return {"status": ACTIVE, "permitted_uses": ["publish_derived"],
                "dataset_key": dataset_key, "valid_through": None,
                **PUBLIC_RESEARCH_SOURCES[dataset_key]}
    if dataset_key == "usgs:comcat":
        return {"status": "PUBLIC_DOMAIN", "permitted_uses": ["publish_derived"],
                "dataset_key": dataset_key, "valid_through": None,
                "terms_url": "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits"}
    if not dataset_key or organization_id is None:
        return {"status": UNVERIFIED, "permitted_uses": [], "dataset_key": dataset_key,
                "valid_through": None}
    grant = resolve_dataset_licenses(organization_id, {dataset_key}, at=at).get(
        dataset_key, {"status": UNVERIFIED, "permitted_uses": []}
    )
    allowed = grant.get("status") == ACTIVE and "publish_derived" in grant.get("permitted_uses", [])
    return {"status": ACTIVE if allowed else (
                "NOT_GRANTED" if grant.get("status") == ACTIVE else grant.get("status", UNVERIFIED)),
            "permitted_uses": ["publish_derived"] if allowed else [],
            "dataset_key": dataset_key, "valid_through": grant.get("ends_at")}


def require_lineage_licenses(
    payload: dict[str, Any], organization_id: int, *, permitted_use: str = "display"
) -> dict[str, Any]:
    """Authorize every raw lineage item before a route returns its payload."""

    lineage = payload.get("lineage") or []
    if not isinstance(lineage, list):
        raise LicenseAccessDenied("Evidence lineage is malformed.")
    legacy = [
        item
        for item in lineage
        if not isinstance(item, dict) or not item.get("dataset_key")
    ]
    if legacy:
        raise LicenseAccessDenied(
            "Evidence contains a legacy snapshot without a dataset identity."
        )
    keys = {str(item["dataset_key"]) for item in lineage}
    grants = resolve_dataset_licenses(organization_id, keys)
    denied = []
    for key in sorted(keys):
        grant = grants.get(key, {"status": UNVERIFIED, "permitted_uses": []})
        uses = grant.get("permitted_uses") or []
        if grant.get("status") != ACTIVE or permitted_use not in uses:
            denied.append(
                {"dataset_key": key, "status": grant.get("status", UNVERIFIED)}
            )
    if denied:
        details = ", ".join(
            f"{item['dataset_key']}={item['status']}" for item in denied
        )
        raise LicenseAccessDenied(
            f"Organization {organization_id} lacks authorized evidence access: {details}."
        )
    payload["license_enforcement"] = {
        "organization_id": organization_id,
        "status": "ACTIVE" if keys else "NO_EVIDENCE",
        "datasets_evaluated": len(keys),
        "permitted_use": permitted_use,
    }
    return payload
