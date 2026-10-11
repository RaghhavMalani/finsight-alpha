"""Family J (API): authenticated, local, read-only; GETs never fetch or compute."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes import regimes as route
from scripts import collect_regime_inputs as collector
from src.regimes.service import Pipeline
from tests.regimes.fixtures import write_factor_captures

CUTOFF = "2026-10-11T00:00:00Z"


@pytest.fixture(scope="module")
def exports(tmp_path_factory):
    root = tmp_path_factory.mktemp("regime-api")
    runtime = root / "replay-source/regimes-runtime"
    write_factor_captures(root / "captures")
    collector.collect(runtime, directory=root / "captures")
    pipe = Pipeline(runtime)
    for asset in ("US-MKT", "IN-MKT"):
        pipe.run_market(asset, CUTOFF)
    return root, pipe


def client(monkeypatch, exports_dir, org=None, production=False):
    monkeypatch.setattr(route.config, "APP_ENV", "production" if production else "test")
    monkeypatch.setattr(route.config, "EXPORTS_DIR", exports_dir)
    app = FastAPI()

    @app.middleware("http")
    async def identity(request, call_next):
        if org is not None:
            request.state.organization_id = org
            request.state.user_id = 1
        return await call_next(request)

    app.include_router(route.router)
    return TestClient(app)


def test_requires_authentication_and_local_runtime(monkeypatch, exports, tmp_path):
    root, _ = exports
    assert client(monkeypatch, root).get("/regimes/assets").status_code == 401
    assert client(monkeypatch, root, org=1, production=True).get("/regimes/assets").status_code == 503
    assert client(monkeypatch, tmp_path, org=1).get("/regimes/snapshot?asset=US-MKT").status_code == 404
    assert not (tmp_path / "replay-source").exists(), "GET must not create a runtime"


def test_gets_never_fetch_compute_or_write(monkeypatch, exports):
    import requests

    from finsight.plugins import SeriesRunner

    root, pipe = exports
    before = len(pipe.registry.events(pipe.tenant_id))
    monkeypatch.setattr(requests, "get", lambda *a, **k: (_ for _ in ()).throw(AssertionError("fetch on GET")))
    monkeypatch.setattr(SeriesRunner, "compute", lambda *a, **k: (_ for _ in ()).throw(AssertionError("compute on GET")))
    c = client(monkeypatch, root, org=3)
    for path in (
        "/regimes/snapshot?asset=US-MKT",
        "/regimes/timeline?asset=IN-MKT",
        "/regimes/factors?asset=US-MKT",
        "/regimes/lineage?asset=US-MKT",
        "/regimes/seasonality?asset=US-MKT",
        "/regimes/events?asset=IN-MKT",
        "/regimes/compare?assets=US-MKT,IN-MKT",
        "/regimes/matrix",
    ):
        response = c.get(path)
        assert response.status_code == 200, path
        body = response.json()
        assert all(v is False for v in body["claims"].values())
    assert len(pipe.registry.events(pipe.tenant_id)) == before
    assert c.post("/regimes/snapshot?asset=US-MKT").status_code == 405


def test_envelope_fields_and_unavailable_modules(monkeypatch, exports):
    root, _ = exports
    c = client(monkeypatch, root, org=3)
    body = c.get("/regimes/snapshot?asset=IN-MKT").json()
    for key in ("schema_version", "asset", "market", "requested_as_of", "state_at", "input_hash", "run_ids", "evidence_scope", "evidence_quality", "calendar", "module_statuses", "claims"):
        assert key in body
    assert body["badge"] == "LOCAL MODEL RUN" and "LIVE" not in body["badge"]
    assert body["payload"]["market"] == "INDIA MARKET-FACTOR REGIME"
    assert c.get("/regimes/events?asset=US-MKT").json()["payload"]["status"] == "UNAVAILABLE"
    assert c.get("/regimes/seasonality?asset=US-MKT").json()["payload"]["status"] == "UNAVAILABLE"
    assert c.get("/regimes/snapshot?asset=NIFTY50").status_code == 422
    assert c.get("/regimes/snapshot?asset=SPY").status_code == 404
