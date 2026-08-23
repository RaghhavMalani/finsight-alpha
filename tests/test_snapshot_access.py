from __future__ import annotations

import pytest

from src.data import license_policy
from src.intelligence.snapshots import SnapshotAccessDenied, SnapshotStore


def test_snapshot_repository_enforces_tenant_license(monkeypatch, tmp_path) -> None:
    store = SnapshotStore(tmp_path, register_metadata=False)
    snapshot = store.record(
        "Provider",
        "https://example.test/source",
        {},
        {"value": 1},
        dataset_key="provider:licensed-source",
    )
    monkeypatch.setattr(
        license_policy,
        "dataset_license_status",
        lambda organization_id, dataset_key: {
            "status": "NOT_GRANTED",
            "permitted_uses": [],
        },
    )

    with pytest.raises(SnapshotAccessDenied, match="NOT_GRANTED"):
        store.get(
            "Provider",
            snapshot.lineage.snapshot_id,
            organization_id=42,
        )


def test_snapshot_repository_returns_authorized_snapshot(monkeypatch, tmp_path) -> None:
    store = SnapshotStore(tmp_path, register_metadata=False)
    snapshot = store.record(
        "Provider",
        "https://example.test/source",
        {},
        {"value": 1},
        dataset_key="provider:licensed-source",
    )
    monkeypatch.setattr(
        license_policy,
        "dataset_license_status",
        lambda organization_id, dataset_key: {
            "status": "ACTIVE",
            "permitted_uses": ["display"],
        },
    )

    restored = store.get(
        "Provider",
        snapshot.lineage.snapshot_id,
        organization_id=42,
    )
    assert restored is not None
    assert restored.payload == {"value": 1}


def test_active_snapshot_grant_without_display_use_is_denied(
    monkeypatch, tmp_path
) -> None:
    store = SnapshotStore(tmp_path, register_metadata=False)
    snapshot = store.record(
        "Provider",
        "https://example.test/source",
        {},
        {"value": 1},
        dataset_key="provider:restricted-source",
    )
    monkeypatch.setattr(
        license_policy,
        "dataset_license_status",
        lambda organization_id, dataset_key: {
            "status": "ACTIVE",
            "permitted_uses": ["model-training"],
        },
    )

    with pytest.raises(SnapshotAccessDenied, match="ACTIVE"):
        store.get(
            "Provider",
            snapshot.lineage.snapshot_id,
            organization_id=42,
        )
