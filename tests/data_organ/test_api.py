from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes import data_organ as route


def client(monkeypatch, tmp_path, org=None, production=False):
    monkeypatch.setattr(route.config, "APP_ENV", "production" if production else "test")
    monkeypatch.setattr(route.config, "EXPORTS_DIR", tmp_path)
    app = FastAPI()

    @app.middleware("http")
    async def identity(request, call_next):
        if org is not None:
            request.state.organization_id = org
            request.state.user_id = 1
        return await call_next(request)

    app.include_router(route.router)
    return TestClient(app)


def test_api_requires_authentication_and_local_runtime(monkeypatch, tmp_path):
    assert client(monkeypatch, tmp_path).get("/data/health").status_code == 401
    assert (
        client(monkeypatch, tmp_path, org=1, production=True)
        .get("/data/health")
        .status_code
        == 503
    )


def test_tenant_gets_do_not_fetch_upstream_or_expose_raw(monkeypatch, tmp_path):
    from src.data_organ import adapters

    monkeypatch.setattr(
        adapters,
        "fetch",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("fetch on GET")),
    )
    c = client(monkeypatch, tmp_path, org=2)
    result = c.get("/data/health")
    assert result.status_code == 200
    assert result.json()["payload"]["items"] == []
    assert result.json()["scope"] == "LOCAL_ONLY"
    assert c.get("/data/raw").status_code == 404
    assert c.post("/data/health").status_code == 405
    assert c.get("/data/lineage/" + "a" * 64).json()["status"] == "UNAVAILABLE"
