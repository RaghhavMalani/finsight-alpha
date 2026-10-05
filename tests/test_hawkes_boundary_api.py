from __future__ import annotations

import json
import pytest
from fastapi import HTTPException

from backend.main import app
from backend.routes import dynamics
from src.dynamics import hawkes_boundary_projection as projection
from src.dynamics.hawkes_boundary import ARTIFACT, BoundaryEvidenceError


def test_boundary_surface_is_get_only() -> None:
    assert set(
        app.openapi()["paths"]["/dynamics/certification/hawkes-boundary-decomposition"]
    ) == {"get"}


def test_projection_is_frozen_and_omits_event_streams() -> None:
    payload = dynamics.hawkes_boundary_artifact()
    frozen = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    assert payload["artifact_hash"] == frozen["artifact_hash"]
    assert payload["summary"] == frozen["summary"]
    assert len(payload["representatives"]) == 10
    assert "records" not in payload and "observatory" not in payload
    assert "full_events" not in json.dumps(payload)
    assert all(not v for v in payload["claims"].values())
    assert payload["execution"]["protocol_fits"] == 1800
    assert len(payload["file_sha256"]) == 64


def test_boundary_loader_and_http_fail_closed(tmp_path, monkeypatch) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text('{"artifact_hash":"fabricated"}', encoding="utf-8")
    with pytest.raises(BoundaryEvidenceError):
        projection.load_frozen_boundary(bad)

    def reject():
        raise BoundaryEvidenceError("changed source seal")

    monkeypatch.setattr(dynamics, "load_boundary_projection", reject)
    with pytest.raises(HTTPException) as caught:
        dynamics.hawkes_boundary_artifact()
    assert caught.value.status_code == 409


def test_projection_cache_keys_include_parent_sources_and_returns_copies(
    tmp_path, monkeypatch
) -> None:
    child, parent, historical = (
        tmp_path / "child",
        tmp_path / "parent",
        tmp_path / "historical",
    )
    child.write_text("first", encoding="utf-8")
    historical.write_text("source", encoding="utf-8")
    parent.write_text(
        json.dumps({"implementation_sources": {str(historical): "unused"}}),
        encoding="utf-8",
    )
    monkeypatch.setattr(projection, "ARTIFACT", child)
    monkeypatch.setattr(projection, "PARENTS", {"D0.4.1": (str(parent), "", "")})
    monkeypatch.setattr(projection, "SOURCES", ())
    calls = []

    def fake_load():
        calls.append(historical.read_text(encoding="utf-8"))
        if calls[-1] != "source":
            raise BoundaryEvidenceError("historical source changed")
        return {"value": []}

    monkeypatch.setattr(projection, "load_frozen_boundary", fake_load)
    monkeypatch.setattr(projection, "project_boundary", lambda v: v)
    projection._verified_projection.cache_clear()
    projection.load_boundary_projection()["value"].append("mutation")
    assert projection.load_boundary_projection() == {"value": []}
    assert calls == ["source"]
    historical.write_text("changed", encoding="utf-8")
    with pytest.raises(BoundaryEvidenceError):
        projection.load_boundary_projection()
    projection._verified_projection.cache_clear()
