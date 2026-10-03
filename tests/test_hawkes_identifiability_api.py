from __future__ import annotations

import json

import pytest
from fastapi import HTTPException

from backend.main import app
from backend.routes import dynamics
from src.dynamics.hawkes_identifiability import (
    DEFAULT_D041_ARTIFACT,
    HawkesIdentifiabilityError,
    load_frozen_hawkes_identifiability,
)
from src.dynamics import hawkes_identifiability_projection as projection


def test_read_only_http_surface() -> None:
    schema = app.openapi()["paths"]["/dynamics/certification/hawkes-identifiability"]
    assert set(schema) == {"get"}


def test_projection_exposes_verified_evidence_without_all_event_streams() -> None:
    payload = dynamics.hawkes_identifiability_artifact()
    frozen = json.loads(DEFAULT_D041_ARTIFACT.read_text(encoding="utf-8"))
    assert payload["artifact_hash"] == frozen["artifact_hash"]
    assert payload["observatory"] == frozen["observatory"]
    assert payload["metrics"] == frozen["metrics"]
    assert "worlds" not in payload
    assert len(payload["file_sha256"]) == 64
    assert payload["claim_boundary"]["market_claim_eligible"] is False


def test_loader_and_http_fail_closed(tmp_path, monkeypatch) -> None:
    path = tmp_path / "bad.json"
    path.write_text('{"artifact_hash":"bad"}', encoding="utf-8")
    with pytest.raises(HawkesIdentifiabilityError):
        load_frozen_hawkes_identifiability(path)

    def reject() -> dict:
        raise HawkesIdentifiabilityError("source seal changed")

    monkeypatch.setattr(dynamics, "load_hawkes_identifiability_projection", reject)
    with pytest.raises(HTTPException) as caught:
        dynamics.hawkes_identifiability_artifact()
    assert caught.value.status_code == 409


def test_projection_cache_never_masks_changed_evidence(tmp_path, monkeypatch) -> None:
    # No scientific computation is required here: prove that different byte
    # seals use different cache entries, including after a successful read.
    child, parent = tmp_path / "child.json", tmp_path / "parent.json"
    child.write_text("first", encoding="utf-8")
    parent.write_text("parent", encoding="utf-8")
    monkeypatch.setattr(projection, "DEFAULT_D041_ARTIFACT", child)
    monkeypatch.setattr(projection, "PARENT_ARTIFACT", parent)
    monkeypatch.setattr(projection, "IMPLEMENTATION_SOURCES", ())
    calls = []

    def fake_load() -> dict:
        calls.append(child.read_text(encoding="utf-8"))
        if calls[-1] != "first":
            raise HawkesIdentifiabilityError("changed evidence")
        return {
            key: {}
            for key in (
                "schema_version",
                "milestone",
                "artifact_hash",
                "file_sha256",
                "scientific_question",
                "parent_seal",
                "preregistration",
                "execution",
                "thresholds",
                "metrics",
                "program_result",
                "observatory",
                "claim_boundary",
            )
        }

    monkeypatch.setattr(projection, "load_frozen_hawkes_identifiability", fake_load)
    projection._verified_projection.cache_clear()
    projection.load_hawkes_identifiability_projection()
    projection.load_hawkes_identifiability_projection()
    assert calls == ["first"]
    child.write_text("tampered", encoding="utf-8")
    with pytest.raises(HawkesIdentifiabilityError):
        projection.load_hawkes_identifiability_projection()
    projection._verified_projection.cache_clear()
