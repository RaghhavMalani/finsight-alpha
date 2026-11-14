"""Sourced knowledge graph: schema guards, as_of-respecting propagation and the API."""
import copy
import json

import pytest

from src.geo.graph import graph as G
from src.geo.graph import load_graph, propagate

QUAKE = {"kind": "earthquake", "magnitude": 6.8, "lat": 23.9, "lon": 121.6, "time": "2026-11-15T00:00:00Z"}


def seed() -> dict:
    return json.loads((G.SEED_DIR / "v1.json").read_text(encoding="utf-8"))


def write(tmp_path, data) -> object:
    path = tmp_path / "seed.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return load_graph(path=path)


def test_every_edge_and_node_in_the_seed_is_sourced_and_valid():
    graph = load_graph()
    assert len(graph.nodes) >= 30 and len(graph.edges) >= 30
    for item in (*graph.nodes.values(), *graph.edges):
        assert item.source.url.startswith("https://") and item.source.title and item.source.available_at
    # Every supply relationship quotes the filing or report that states it.
    assert all(e.source.excerpt for e in graph.edges if e.type == "supplies")


@pytest.mark.parametrize("mutate,message", [
    (lambda e: e["source"].update(url=""), "https"),
    (lambda e: e["source"].update(url="http://example.org/x"), "https"),
    (lambda e: e.update(mechanism=""), "mechanism"),
    (lambda e: e.update(confidence=0), "confidence"),
    (lambda e: e.update(type="rumoured_to_supply"), "unknown edge type"),
    (lambda e: e["source"].update(available_at="2020-01-01T00:00:00Z"), "precedes"),
    (lambda e: e["source"].update(available_at="2026-11-14"), "timezone-aware"),
])
def test_an_unsourced_or_malformed_edge_is_rejected(tmp_path, mutate, message):
    data = seed()
    mutate(next(e for e in data["edges"] if e["type"] == "supplies"))
    with pytest.raises(ValueError, match=message):
        write(tmp_path, data)


def test_edges_must_join_the_right_node_types(tmp_path):
    data = seed()
    edge = next(e for e in data["edges"] if e["type"] == "supplies")
    edge["dst"] = "security:nvda"
    with pytest.raises(ValueError, match="cannot join"):
        write(tmp_path, data)


def test_a_quake_near_tsmc_reaches_tickers_through_cited_hops():
    result = propagate(load_graph(), QUAKE, as_of="2026-11-15T01:00:00Z")
    assert result["status"] == "AVAILABLE"
    exposed = {r["security"] for r in result["securities"]}
    assert {"security:tsm", "security:nvda", "security:amd"} <= exposed
    for chain in result["chains"]:
        for h in chain["hops"]:
            assert h["source"]["url"].startswith("https://") and h["mechanism"]


def test_a_distant_quake_reaches_nothing():
    far = {**QUAKE, "lat": -33.9, "lon": 18.4}
    assert propagate(load_graph(), far, as_of="2026-11-15T01:00:00Z")["chains"] == []


def test_edge_learned_after_the_event_is_excluded(tmp_path):
    """Sabotage: removing the available_at filter in propagate() makes this fail."""
    data = seed()
    for e in data["edges"]:
        if e["id"] == "supplies:tsmc:nvidia":
            e["source"]["available_at"] = "2026-12-01T00:00:00Z"
    graph = write(tmp_path, data)
    result = propagate(graph, QUAKE, as_of="2026-12-31T00:00:00Z")
    assert all(h["edge"] != "supplies:tsmc:nvidia" for c in result["chains"] for h in c["hops"])
    assert result["excluded_not_yet_available"] >= 1
    # Once the event happens after the edge became available, it is used.
    later = propagate(graph, {**QUAKE, "time": "2026-12-02T00:00:00Z"}, as_of="2026-12-31T00:00:00Z")
    assert any(h["edge"] == "supplies:tsmc:nvidia" for c in later["chains"] for h in c["hops"])


def test_as_of_before_the_event_is_unavailable_not_empty_success():
    result = propagate(load_graph(), QUAKE, as_of="2026-11-14T23:00:00Z")
    assert result["status"] == "UNAVAILABLE" and result["chains"] == []


def test_radius_is_declared_and_monotone_in_magnitude():
    assert G.impact_radius_km("earthquake", 6.0) == 100.0
    assert G.impact_radius_km("earthquake", 7.0) == 200.0
    with pytest.raises(ValueError):
        G.impact_radius_km("earthquake", None)


def test_api_reads_and_propagates():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.routes import geo_graph

    app = FastAPI()
    app.include_router(geo_graph.router)
    client = TestClient(app)
    body = client.get("/geo/graph").json()
    assert body["version"] == "v1" and len(body["edges"]) >= 30
    # Explicit past instants: the route refuses a future as_of, so the test must not depend on "now".
    r = client.post("/geo/graph/propagate",
                    json={**QUAKE, "time": "2026-11-14T11:05:00Z", "as_of": "2026-11-14T11:10:00Z"})
    assert r.status_code == 200 and r.json()["securities"]
    assert client.post("/geo/graph/propagate", json={**QUAKE, "as_of": "2999-01-01T00:00:00Z"}).status_code == 422
    assert client.get("/geo/graph?version=nope").status_code == 404


def test_the_real_app_requires_a_session_for_the_graph():
    from fastapi.testclient import TestClient
    from backend.main import app

    assert TestClient(app).get("/geo/graph").status_code == 401
