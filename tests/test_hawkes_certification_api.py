from __future__ import annotations

import json

import pytest
from fastapi import HTTPException

from backend.main import app
from backend.routes import dynamics
from src.dynamics.hawkes_certification import (
    DEFAULT_D04_ARTIFACT,
    HawkesCertificationError,
    load_frozen_hawkes_certification,
)


def test_http_surface_exposes_read_only_d04_artifact() -> None:
    assert "/dynamics/certification/hawkes-event-process" in app.openapi()["paths"]


def test_route_returns_frozen_synthetic_evidence() -> None:
    payload = dynamics.hawkes_event_process_artifact()

    assert payload["schema_version"] == "dynamics-hawkes-certification/0.4"
    assert payload["program_result"]["status"] == "PARTIALLY_CHARACTERIZED"
    assert payload["execution"]["worlds_executed"] == 12
    assert payload["execution"]["arbitrary_bar_discretization"] is False
    assert payload["causal_claim_eligible"] is False
    assert payload["market_claim_eligible"] is False
    assert len(payload["file_sha256"]) == 64


def test_loader_and_route_fail_closed(tmp_path, monkeypatch) -> None:
    corrupt = tmp_path / "hawkes_certification.json"
    corrupt.write_text(json.dumps({"artifact_hash": "corrupt"}), encoding="utf-8")
    with pytest.raises(HawkesCertificationError):
        load_frozen_hawkes_certification(corrupt)

    def fail_closed() -> dict:
        raise HawkesCertificationError("corrupted D0.4 artifact")

    monkeypatch.setattr(dynamics, "load_frozen_hawkes_certification", fail_closed)
    with pytest.raises(HTTPException) as captured:
        dynamics.hawkes_event_process_artifact()
    assert captured.value.status_code == 409


def test_frozen_api_source_is_the_verified_artifact() -> None:
    payload = load_frozen_hawkes_certification()
    frozen = json.loads(DEFAULT_D04_ARTIFACT.read_text(encoding="utf-8"))
    assert payload["artifact_hash"] == frozen["artifact_hash"]
    assert payload["worlds"] == frozen["worlds"]
