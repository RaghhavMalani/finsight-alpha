from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from backend.routes import factor_evidence as route

def client(auth=False):
    app=FastAPI()
    @app.middleware('http')
    async def identity(request,call_next):
        if auth:request.state.organization_id=1;request.state.user_id=1
        return await call_next(request)
    app.include_router(route.router)
    return TestClient(app)

def test_read_only_local_api_does_not_populate_missing_runtime(monkeypatch):
    monkeypatch.setattr(route.config,'APP_ENV','test')
    assert client().get('/factor-evidence/catalog?country=US').status_code==401
    for kind in ['catalog','audit','ledger','lineage']:
        assert client(True).get(f'/factor-evidence/{kind}?country=INDIA').status_code==404
        assert client(True).post(f'/factor-evidence/{kind}?country=US').status_code==405
    assert client(True).get('/factor-evidence/catalog?country=UNKNOWN').status_code==422
    assert client(True).get('/factor-evidence/catalog?country=US&as_of=2000').status_code==404
    monkeypatch.setattr(route.config,'APP_ENV','production')
    assert client(True).get('/factor-evidence/catalog?country=US').status_code==503
