from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.auth.models import Base
from src.auth.tenant_models import Dataset, Organization, OrganizationLicenseGrant
from src.data import license_policy


def _session_factory(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'licenses.db'}", future=True)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    now = datetime.now(timezone.utc)
    with factory() as session:
        organization = Organization(slug="licensed-tenant", name="Licensed Tenant")
        active = Dataset(
            dataset_key="source:active",
            name="Active source",
            provider="Provider",
            source_url="https://example.com/active",
        )
        not_granted = Dataset(
            dataset_key="source:not-granted",
            name="Not granted source",
            provider="Provider",
            source_url="https://example.com/not-granted",
        )
        session.add_all([organization, active, not_granted])
        session.flush()
        session.add(
            OrganizationLicenseGrant(
                organization_id=organization.id,
                dataset_id=active.id,
                status="active",
                permitted_uses=["display"],
                starts_at=now - timedelta(days=1),
            )
        )
        session.commit()
        return factory, organization.id


def _evidence(dataset_key: str) -> dict:
    return {
        "status": "AVAILABLE",
        "points": [{"date": "2025-12-31", "value": 1.0}],
        "metadata": {
            "dataset_id": dataset_key,
            "customer_license_status": "UNVERIFIED",
        },
    }


def test_license_resolution_is_tenant_scoped_and_fail_closed(tmp_path, monkeypatch):
    factory, organization_id = _session_factory(tmp_path)
    monkeypatch.setattr(license_policy, "get_session", factory)

    statuses = license_policy.resolve_dataset_licenses(
        organization_id,
        {"source:active", "source:not-granted", "source:missing"},
    )

    assert statuses["source:active"]["status"] == "ACTIVE"
    assert statuses["source:active"]["permitted_uses"] == ["display"]
    assert statuses["source:not-granted"]["status"] == "NOT_GRANTED"
    assert statuses["source:missing"]["status"] == "NOT_REGISTERED"


def test_unlicensed_evidence_is_redacted_not_simulated(tmp_path, monkeypatch):
    factory, organization_id = _session_factory(tmp_path)
    monkeypatch.setattr(license_policy, "get_session", factory)
    payload = {
        "status": "AVAILABLE",
        "first": _evidence("source:active"),
        "second": _evidence("source:not-granted"),
    }

    result = license_policy.enforce_evidence_licenses(payload, organization_id)

    assert result["status"] == "PARTIAL"
    assert result["first"]["points"]
    assert result["first"]["metadata"]["customer_license_status"] == "ACTIVE"
    assert result["second"]["status"] == "UNAVAILABLE"
    assert result["second"]["points"] == []
    assert result["second"]["source_status"] == "AVAILABLE"
    assert result["second"]["metadata"]["customer_license_status"] == "NOT_GRANTED"
