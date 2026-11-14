"""/live routes with FastAPI TestClient: SSE framing, health, polling fallback, gate."""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes import live as route
from src.live import runtime
from src.live.risk_live import LiveRisk
from src.live.runtime import LiveService
from src.live.store import LiveStore
from tests.live.helpers import Clock, fixture_observations


def client(monkeypatch, org=1, production=False):
    monkeypatch.setattr(route.config, "APP_ENV", "production" if production else "test")
    app = FastAPI()

    @app.middleware("http")
    async def identity(request, call_next):
        if org is not None:
            request.state.organization_id = org
            request.state.user_id = 1
        return await call_next(request)

    app.include_router(route.router)
    return TestClient(app)


@pytest.fixture
def service(tmp_path):
    clock = Clock()
    svc = LiveService(LiveStore(tmp_path / "live", clock=clock), feeds=[], risk=LiveRisk(), clock=clock)
    obs = fixture_observations()
    svc.ingest(obs["usgs"] + obs["polymarket"] + obs["fred"][:2])
    runtime.set_service(svc)
    yield svc
    runtime.set_service(None)


def parse_sse(text):
    frames = []
    for block in text.split("\n\n"):
        fields = {}
        for line in block.splitlines():
            if line.startswith(":") or ":" not in line:
                continue
            key, value = line.split(":", 1)
            fields[key] = value.strip()
        if "data" in fields:
            frames.append(fields)
    return frames


def test_sse_stream_replays_backlog_with_types_ids_and_provenance(monkeypatch, service):
    with client(monkeypatch).stream("GET", "/live/stream?since_seq=0&max_events=4") as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        body = "".join(response.iter_text())
    frames = parse_sse(body)
    assert len(frames) == 4
    for frame in frames:
        event = json.loads(frame["data"])
        assert frame["event"] == event["type"] and int(frame["id"]) == event["seq"]
        assert event["available_at"] and event["provenance"]["delay"] and event["licence"]["status"]
    assert [json.loads(f["data"])["seq"] for f in frames] == [1, 2, 3, 4]


def test_sse_filters_by_type_and_resumes_from_last_event_id(monkeypatch, service):
    c = client(monkeypatch)
    with c.stream("GET", "/live/stream?type=prediction.update&since_seq=0&max_events=1") as response:
        frames = parse_sse("".join(response.iter_text()))
    assert [f["event"] for f in frames] == ["prediction.update"]
    with c.stream("GET", "/live/stream?max_events=2", headers={"Last-Event-ID": "3"}) as response:
        seqs = [json.loads(f["data"])["seq"] for f in parse_sse("".join(response.iter_text()))]
    assert seqs == [4, 5]
    assert c.get("/live/stream?type=nope").status_code == 422


def test_health_and_recent(monkeypatch, service):
    c = client(monkeypatch)
    health = c.get("/live/health").json()
    assert health["mode"] == "online" and health["risk_coverage"]["covered"]
    recent = c.get("/live/recent?type=geo.event&limit=2").json()
    assert recent["count"] == 2 and all(e["type"] == "geo.event" for e in recent["events"])
    after = c.get("/live/recent?since=4").json()
    assert all(e["seq"] > 4 for e in after["events"]) and after["count"] == 2
    first = c.get("/live/recent").json()["events"][0]
    assert all(e["available_at"] > first["available_at"] or e["seq"] > first["seq"]
               for e in c.get(f"/live/recent?since={first['available_at']}").json()["events"])
    assert c.get("/live/recent?since=yesterday").status_code == 422


def test_gate_and_not_running(monkeypatch, tmp_path):
    runtime.set_service(None)
    assert client(monkeypatch, org=None).get("/live/health").status_code == 401
    assert client(monkeypatch, production=True).get("/live/health").status_code == 503
    assert client(monkeypatch).get("/live/health").json()["mode"] == "NOT_RUNNING"
    assert client(monkeypatch).get("/live/stream").status_code == 503
    assert client(monkeypatch).get("/live/recent").status_code == 503


def test_live_router_is_registered_in_the_app():
    from backend.main import app

    paths = set(app.openapi()["paths"])
    assert {"/live/stream", "/live/health", "/live/recent"} <= paths
