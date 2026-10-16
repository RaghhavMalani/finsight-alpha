"""SYNTHETIC_TEST_ONLY account-switch race checks; no storage or providers."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request
from backend.routes import paper

@pytest.mark.parametrize("method", ["GET", "PUT"])
def test_stale_owner_after_cookie_switch_fails_before_storage(monkeypatch, method):
    monkeypatch.setattr(paper, "verify_session", lambda cookie: 2 if cookie == "new-account" else None)
    def storage_must_not_open():
        raise AssertionError("Stale request reached storage")
    monkeypatch.setattr(paper, "_require_durable_storage", storage_must_not_open)
    app = FastAPI()
    app.include_router(paper.router)
    client = TestClient(app)
    response = client.request(method, "/paper/positions",
        headers={"Cookie": "fs_session=new-account", "X-FinSight-Paper-Owner": "1"},
        **({"json": {"positions": []}} if method == "PUT" else {}))
    assert response.status_code == 401
    assert "account changed" in response.json()["detail"]

@pytest.mark.parametrize("asserted", [None, "2"])
def test_matching_or_legacy_owner_uses_authenticated_cookie(monkeypatch, asserted):
    monkeypatch.setattr(paper, "verify_session", lambda cookie: 2)
    headers = [(b"cookie", b"fs_session=authenticated")]
    if asserted is not None:
        headers.append((b"x-finsight-paper-owner", asserted.encode()))
    request = Request({"type": "http", "headers": headers})
    assert paper._user_id(request) == 2
