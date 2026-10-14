from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.routes import risk_manager as route
from src.risk_manager.contracts import decode

ROOT = Path(__file__).resolve().parents[2]


def client(auth=False, org=1):
    app = FastAPI()
    @app.middleware("http")
    async def identity(request, call_next):
        if auth:
            request.state.organization_id = org
            request.state.user_id = 1
        return await call_next(request)
    app.include_router(route.router)
    return TestClient(app)


def test_auth_read_only_and_no_arbitrary_selectors(monkeypatch):
    monkeypatch.setattr(route.config, "APP_ENV", "test")
    assert client().get("/risk-manager/state").status_code == 401
    assert client(True, org=True).get("/risk-manager/state").status_code == 401
    assert client(True).post("/risk-manager/state").status_code == 405
    assert client(True).get("/risk-manager/state?path=private").status_code == 422
    assert client(True).get("/risk-manager/state?sweep_id=bad").status_code == 404
    assert client(True).get("/risk-manager/state?sweep_id=").status_code == 404
    assert client(True).get("/risk-manager/state?sweep_id=" + "a" * 64).status_code == 404
    assert client(True).get("/risk-manager/state?sweep_id=bad&sweep_id=bad").status_code == 422
    before = (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes()
    response = client(True).get("/risk-manager/state")
    assert response.status_code == 200 and response.json()["kind"] == "risk-state"
    assert (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes() == before
    monkeypatch.setattr(route.config, "APP_ENV", "production")
    assert client(True).get("/risk-manager/state").status_code == 503


def test_get_cannot_execute_sweep(monkeypatch):
    import src.risk_manager.sweep as sweep
    def forbidden(*args, **kwargs):
        raise AssertionError("GET executed a sweep")
    monkeypatch.setattr(sweep, "run", forbidden)
    monkeypatch.setattr(route.config, "APP_ENV", "test")
    assert client(True).get("/risk-manager/sweep").status_code == 200


def test_pinned_selection_and_verification_failure(monkeypatch):
    monkeypatch.setattr(route.config, "APP_ENV", "test")
    response = client(True).get("/risk-manager/sweep")
    sweep_id = response.json()["payload"]["sweep_id"]
    state = client(True).get("/risk-manager/state?sweep_id=" + sweep_id)
    assert state.status_code == 200
    assert state.json()["payload"]["sweep_fingerprint"] == response.json()["payload"]["fingerprint"]
    def broken(*args, **kwargs):
        raise ValueError("SYNTHETIC_TEST_ONLY raw private fault")
    monkeypatch.setattr(route, "read", broken)
    failed = client(True).get("/risk-manager/state")
    assert failed.status_code == 409
    assert "private fault" not in failed.text
    assert "no empty success" in failed.text
