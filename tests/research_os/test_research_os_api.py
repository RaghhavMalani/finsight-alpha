"""Local authoring uses the existing principal boundary and organization storage."""
import base64
from fastapi import FastAPI,Request
from fastapi.testclient import TestClient
import pytest
from backend.routes import research_os


@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setattr(research_os,"EXPORTS_DIR",tmp_path)
    monkeypatch.setattr(research_os,"APP_ENV","test")
    monkeypatch.setattr("src.research_os.service.code_identity",lambda root:("a"*40,"b"*64))
    app=FastAPI();app.include_router(research_os.router)
    @app.middleware("http")
    async def fixture_principal(request:Request,call_next):
        principal=request.headers.get("x-test-principal")
        if principal:
            request.state.organization_id=int(principal);request.state.user_id=1
        return await call_next(request)
    return TestClient(app)


def test_signed_out_and_tenant_substitution(client,spec):
    assert client.get("/research-os/attempts").status_code==401
    response=client.post("/research-os/objects",json={"kind":"Preregistration","payload":spec.model_dump(mode="json")},headers={"x-test-principal":"1"})
    assert response.status_code==200
    identity=response.json()["identity"]
    assert client.get("/research-os/objects/"+identity,headers={"x-test-principal":"2"}).status_code==422
    receipt=client.post("/research-os/freeze/"+identity,headers={"x-test-principal":"1"})
    assert receipt.status_code==200 and receipt.json()["preregistration_hash"]==identity
    events=client.get("/research-os/attempts",headers={"x-test-principal":"1"}).json()
    assert events[0]["kind"]=="FREEZE"


def test_paper_upload_and_claim_evidence_roundtrip(client):
    raw=b"No original seed was reported."
    response=client.post("/research-os/papers",json={"filename":"../../../unsafe.txt",
        "data_base64":base64.b64encode(raw).decode(),"title":"Test paper","authors":["Author"],"source_url":"fixture://paper"},headers={"x-test-principal":"1"})
    assert response.status_code==200 and response.json()["extraction_status"]=="EXTRACTED"
    paper=client.get("/research-os/objects/"+response.json()["identity"],headers={"x-test-principal":"1"}).json()
    assert paper["pages"]==[raw.decode()] and paper["original_seed"] is None
    paper["claims"]=[{"kind":"LIMITATION","statement":"Original seed absent","anchor":{
        "page":1,"start":0,"end":len(raw),"excerpt":raw.decode()}}]
    paper["parent"]=response.json()["identity"]
    updated=client.post("/research-os/objects",json={"kind":"Paper","payload":paper},headers={"x-test-principal":"1"})
    assert updated.status_code==200 and updated.json()["identity"]!=response.json()["identity"]
    paper["claims"][0]["reported_value"]=42
    assert client.post("/research-os/objects",json={"kind":"Paper","payload":paper},headers={"x-test-principal":"1"}).status_code==422


def test_production_cannot_start_heavy_research(client,monkeypatch):
    monkeypatch.setattr(research_os,"APP_ENV","production")
    assert client.get("/research-os/attempts",headers={"x-test-principal":"1"}).status_code==503


def test_result_and_receipt_cannot_be_authored(client):
    assert client.post("/research-os/objects",json={"kind":"FreezeReceipt","payload":{}},headers={"x-test-principal":"1"}).status_code==422
    assert client.post("/research-os/run",json={"receipt_hash":"f"*64,"trial_id":"primary","seed":1},headers={"x-test-principal":"1"}).status_code==422
