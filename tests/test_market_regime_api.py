import copy
import json

from fastapi import HTTPException
import pytest

from backend.main import app
from backend.routes import market_regime as routes
from src.dynamics import market_regime_projection as projection
from src.dynamics.market_regime_inputs import digest


def test_integrated_api_is_read_only():
    paths = app.openapi()["paths"]
    assert set(paths["/dynamics/regime-intelligence"]) == {"get"}
    assert set(paths["/dynamics/regime-intelligence/worlds"]) == {"get"}


def test_catalog_explicitly_marks_missing_local_input(tmp_path, monkeypatch):
    monkeypatch.setattr(projection, "local_path", lambda: tmp_path / "world.json")
    catalog = routes.regime_worlds()
    assert catalog["read_only"] and not catalog["network_downloads"]
    assert catalog["worlds"][-1]["available"] is False


def test_frozen_projection_and_cache_copy():
    value = projection.load_lab()
    frozen = json.loads(projection.ARTIFACT.read_bytes())
    assert value == frozen["worlds"]["demo-full"]["projection"]
    value["current"]["vector"]["V"] = 999
    assert projection.load_lab()["current"]["vector"]["V"] != 999
    sparse = projection.load_lab("demo-sparse")
    assert sparse["landscape"]["status"] == "UNAVAILABLE"


def test_resealed_false_projection_is_rejected():
    bundle = json.loads(projection.ARTIFACT.read_bytes())
    bundle["worlds"]["demo-full"]["projection"]["current"]["vector"]["V"] = 0.99
    payload = bundle["worlds"]["demo-full"]["projection"]
    payload["artifact_hash"] = digest(
        {k: v for k, v in payload.items() if k != "artifact_hash"}
    )
    bundle["artifact_hash"] = digest(
        {k: v for k, v in bundle.items() if k != "artifact_hash"}
    )
    with pytest.raises(projection.RegimeEvidenceError, match="release identity"):
        projection.verify_bundle(bundle)


def test_malformed_bundle_fails_closed():
    with pytest.raises(projection.RegimeEvidenceError):
        projection.verify_bundle({})


def test_changed_parent_bytes_fail_closed(monkeypatch):
    bundle = json.loads(projection.ARTIFACT.read_bytes())
    first = next(iter(bundle["frozen_parent_bytes"]))
    bundle["frozen_parent_bytes"][first] = "0" * 64
    bundle["artifact_hash"] = digest(
        {k: v for k, v in bundle.items() if k != "artifact_hash"}
    )
    with pytest.raises(projection.RegimeEvidenceError, match="Historical"):
        projection.verify_bundle(bundle)


@pytest.mark.parametrize(
    "kind,status", [("missing", 404), ("seal", 409), ("input", 422)]
)
def test_route_error_states(monkeypatch, kind, status):
    def reject(*args):
        if kind == "missing":
            raise FileNotFoundError("No PIT dataset")
        if kind == "seal":
            raise projection.RegimeEvidenceError("Changed source")
        raise ValueError("Invalid as_of")

    monkeypatch.setattr(routes, "load_lab", reject)
    with pytest.raises(HTTPException) as error:
        routes.market_regime_intelligence(world="demo-full", as_of=None)
    assert error.value.status_code == status


def test_local_mode_uses_only_explicit_timestamped_input(tmp_path, monkeypatch):
    path = tmp_path / "world.json"
    monkeypatch.setattr(projection, "local_path", lambda: path)
    data = copy.deepcopy(
        json.loads(projection.ARTIFACT.read_bytes())["worlds"]["demo-sparse"]["input"]
    )
    data["evidence_scope"] = "PIT_LOCAL"
    data["price_basis"] = "TOTAL_RETURN"
    data["source"] = "Explicit test dataset; not provider download"
    path.write_text(json.dumps(data), encoding="utf-8")
    result = projection.load_lab("pit-local", data["daily"][65]["available_at"])
    assert (
        result["world"]["scope"] == "PIT_LOCAL"
        and result["world"]["observations"] == 66
    )
    assert result["landscape"]["cells"] == []
