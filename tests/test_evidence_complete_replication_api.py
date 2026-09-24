from __future__ import annotations

import json

import pytest
from fastapi import HTTPException

from backend.main import app
from backend.routes import dynamics
from src.dynamics.replication_projection import (
    ReplicationProjectionError,
    load_evidence_complete_replication_projection,
)


def test_http_surface_exposes_read_only_replication_projection() -> None:
    assert (
        "/dynamics/certification/evidence-complete-replication"
        in app.openapi()["paths"]
    )


def test_route_returns_summary_without_raw_world_evidence() -> None:
    payload = dynamics.evidence_complete_replication_artifact()

    assert payload["schema_version"] == (
        "dynamics-evidence-complete-replication-projection/0.3.4"
    )
    assert payload["read_only"] is True
    assert payload["program_result"]["status"] == "PARTIALLY_CHARACTERIZED"
    assert payload["execution"]["executed_worlds"] == 400
    assert payload["execution"]["admitted_worlds"] == 400
    assert len(payload["metrics"]) == 9
    assert payload["market_claim_eligible"] is False
    assert payload["raw_world_evidence_exposed"] is False
    assert "world_evidence" not in payload


def test_projection_loader_and_route_fail_closed(tmp_path, monkeypatch) -> None:
    corrupt = tmp_path / "evidence_complete_replication.json"
    corrupt.write_text(json.dumps({"artifact_hash": "corrupt"}), encoding="utf-8")
    with pytest.raises(ReplicationProjectionError):
        load_evidence_complete_replication_projection(corrupt)

    def fail_closed() -> dict:
        raise ReplicationProjectionError("corrupted replication artifact")

    monkeypatch.setattr(
        dynamics, "load_evidence_complete_replication_projection", fail_closed
    )
    with pytest.raises(HTTPException) as captured:
        dynamics.evidence_complete_replication_artifact()
    assert captured.value.status_code == 409
