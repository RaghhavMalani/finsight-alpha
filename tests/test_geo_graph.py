"""Sourced knowledge graph: schema guards, as_of-respecting propagation, honest statuses and the API."""
from datetime import timedelta
import json

import pytest

from src.geo.graph import graph as G
from src.geo.graph import load_graph, propagate
from src.geo.graph.model import parse_instant

T, AS_OF = "2026-11-16T00:00:00Z", "2026-11-16T01:00:00Z"  # after every source in the seed was checked
QUAKE = {"kind": "earthquake", "magnitude": 6.8, "lat": 23.9, "lon": 121.6, "time": T}
HSINCHU = {"kind": "earthquake", "magnitude": 6.0, "lat": 24.8138, "lon": 120.9675, "time": T}


def seed() -> dict:
    return json.loads((G.SEED_DIR / "v1.json").read_text(encoding="utf-8"))


def write(tmp_path, data):
    path = tmp_path / "seed.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return load_graph(path=path)


def supply(data):
    return next(e for e in data["edges"] if e["id"] == "supplies:tsmc:nvidia")


def fab(data):
    return next(n for n in data["nodes"] if n["id"] == "facility:tsmc:fab-12a")


def test_every_item_in_the_seed_is_sourced_and_dated():
    graph = load_graph()
    assert len(graph.nodes) >= 40 and len(graph.edges) >= 40
    for item in (*graph.nodes.values(), *graph.edges):
        assert item.source.url.startswith("https://") and item.source.title and item.source.date_basis
    for edge in (e for e in graph.edges if e.type == "supplies"):
        assert len(edge.source.excerpt.split()) >= 8  # a sentence from the source, not just a name
    # Filings are dated by when they were filed, not by their fiscal period end.
    filings = {e.source.date for e in graph.edges if "sec.gov/Archives" in e.source.url}
    assert filings == {"2026-02-25", "2026-02-04", "2025-11-25"}
    assert all(e.source.date_basis == "filed" for e in graph.edges if "sec.gov/Archives" in e.source.url)


# Each mutation removes or corrupts one thing a guard protects; loading must refuse it.
EDGE_CASES = [
    (lambda e: e["source"].update(url=""), "https"),
    (lambda e: e["source"].update(url="http://example.org/x"), "https"),
    (lambda e: e["source"].update(title=" "), "title"),
    (lambda e: e["source"].update(date="2025"), "YYYY-MM-DD"),
    (lambda e: e["source"].update(date="2025-13-45"), "YYYY-MM-DD"),
    (lambda e: e["source"].update(date_basis="guessed"), "date_basis"),
    (lambda e: e["source"].update(available_at="2020-01-01T00:00:00Z"), "precedes"),
    (lambda e: e["source"].update(available_at="2026-11-14"), "timezone-aware"),
    (lambda e: e["source"].update(excerpt="Taiwan Semiconductor Manufacturing Company Limited"), "quote the sentence"),
    (lambda e: e.update(mechanism=""), "mechanism"),
    (lambda e: e.update(mechanism="x" * 241), "mechanism"),
    (lambda e: e.update(confidence=0), "confidence"),
    (lambda e: e.update(confidence=1.01), "confidence"),
    (lambda e: e.update(type="rumoured_to_supply"), "unknown edge type"),
    (lambda e: e.update(id="Bad Id"), "Bad edge id"),
    (lambda e: e.update(dst="company:does-not-exist"), "endpoint missing"),
    (lambda e: e.update(dst="security:nvda"), "cannot join"),
]


@pytest.mark.parametrize("mutate,message", EDGE_CASES)
def test_a_malformed_or_unsourced_edge_is_rejected(tmp_path, mutate, message):
    data = seed()
    mutate(supply(data))
    with pytest.raises(ValueError, match=message):
        write(tmp_path, data)


NODE_CASES = [
    (lambda n: n.update(id="Bad Id"), "Bad node id"),
    (lambda n: n.update(type="rumour"), "unknown node type"),
    (lambda n: n.update(name=""), "name required"),
    (lambda n: n["source"].update(url="ftp://example.org"), "https"),
    (lambda n: n.update(lat=None), "lat, lon and a precision"),
    (lambda n: n.update(location_precision=""), "lat, lon and a precision"),
    (lambda n: n.update(lat=91.0), "out of range"),
    (lambda n: n.update(lon=-181.0), "out of range"),
]


@pytest.mark.parametrize("mutate,message", NODE_CASES)
def test_a_malformed_or_unsourced_node_is_rejected(tmp_path, mutate, message):
    data = seed()
    mutate(fab(data))
    with pytest.raises(ValueError, match=message):
        write(tmp_path, data)


def test_structural_seed_errors_are_rejected(tmp_path):
    data = seed()
    data["schema_version"] = "geo-graph-seed/1"
    with pytest.raises(ValueError, match="schema"):
        write(tmp_path, data)
    data = seed()
    data["nodes"].append(dict(fab(data)))
    with pytest.raises(ValueError, match="Duplicate node"):
        write(tmp_path, data)
    data = seed()
    data["edges"].append(dict(supply(data)))
    with pytest.raises(ValueError, match="Duplicate edge"):
        write(tmp_path, data)
    data = seed()
    next(n for n in data["nodes"] if n["id"] == "company:tsmc").update(lat=24.8, lon=120.9)
    with pytest.raises(ValueError, match="only facilities"):
        write(tmp_path, data)


def test_a_quake_near_tsmc_reaches_tickers_through_cited_hops():
    result = propagate(load_graph(), QUAKE, as_of=AS_OF)
    assert result["status"] == "AVAILABLE"
    assert {"security:tsm", "security:nvda", "security:amd", "security:adi", "security:aapl"} <= {
        r["security"] for r in result["securities"]}
    assert result["chains_total"] >= len(result["chains"]) > 0
    for chain in result["chains"]:
        assert chain["site_precision"] and isinstance(chain["distance_km"], int)
        for h in chain["hops"]:
            assert h["source"]["url"].startswith("https://") and h["mechanism"]


def test_score_weights_proximity_by_every_edge_confidence():
    result = propagate(load_graph(), HSINCHU, as_of=AS_OF)
    score = {r["security"]: r["score"] for r in result["securities"]}
    # At the Hsinchu centroid proximity is 1, so the score is the product of edge confidences.
    assert score["security:tsm"] == 1.0
    assert score["security:amd"] == 0.95 and score["security:nvda"] == 0.9
    assert score["security:adi"] == 0.8 and score["security:aapl"] == 0.7


def test_empty_answers_say_why_instead_of_looking_like_no_exposure():
    graph = load_graph()
    far = propagate(graph, {**QUAKE, "lat": 36.99, "lon": 127.11, "magnitude": 8.0}, as_of=AS_OF)
    assert far["status"] == "NO_COVERAGE" and "says nothing about real exposure" in far["reason"]
    assert far["nearest_site_km"] > 400 and far["securities"] == []
    small = propagate(graph, {**HSINCHU, "magnitude": 2.0}, as_of=AS_OF)
    assert small["status"] == "BELOW_THRESHOLD" and small["securities"] == []
    hormuz = propagate(graph, {"kind": "conflict", "lat": 26.57, "lon": 56.25, "time": T}, as_of=AS_OF)
    assert hormuz["status"] == "PARTIAL" and hormuz["securities"] == []
    assert [s["site"] for s in hormuz["unlinked_sites"]] == ["chokepoint:hormuz"]
    # Before the earliest sourced fact in the graph, nothing is known: UNAVAILABLE, never NO_COVERAGE.
    first = min(parse_instant(n.source.available_at) for n in graph.nodes.values())
    t0 = (first - timedelta(days=1)).isoformat().replace("+00:00", "Z")
    early = propagate(graph, {**HSINCHU, "time": t0}, as_of=t0)
    assert early["status"] == "UNAVAILABLE" and early["nodes_not_yet_available"] == len(graph.nodes)
    before = propagate(graph, QUAKE, as_of="2026-11-15T23:00:00Z")
    assert before["status"] == "UNAVAILABLE" and before["reason"] == "as_of precedes the event"


def test_edge_learned_after_the_event_is_excluded(tmp_path):
    """Sabotage: without the available_at filter in Graph.known() this fails."""
    data = seed()
    supply(data)["source"]["available_at"] = "2026-12-01T00:00:00Z"
    graph = write(tmp_path, data)
    result = propagate(graph, QUAKE, as_of="2026-12-31T00:00:00Z")
    assert all(h["edge"] != "supplies:tsmc:nvidia" for c in result["chains"] for h in c["hops"])
    assert result["edges_not_yet_available"] == 1
    later = propagate(graph, {**QUAKE, "time": "2026-12-02T00:00:00Z"}, as_of="2026-12-31T00:00:00Z")
    assert any(h["edge"] == "supplies:tsmc:nvidia" for c in later["chains"] for h in c["hops"])


def test_node_learned_after_the_event_takes_its_edges_with_it(tmp_path):
    """Sabotage: without the node filter, or the both-endpoints-known check, this fails."""
    data = seed()
    next(n for n in data["nodes"] if n["id"] == "company:nvidia")["source"]["available_at"] = "2026-12-01T00:00:00Z"
    graph = write(tmp_path, data)
    result = propagate(graph, QUAKE, as_of="2026-12-31T00:00:00Z")
    assert "security:nvda" not in {r["security"] for r in result["securities"]}
    assert result["nodes_not_yet_available"] == 1 and result["edges_not_yet_available"] >= 2
    data = seed()
    fab(data)["source"]["available_at"] = "2026-12-01T00:00:00Z"
    graph = write(tmp_path, data)
    sites = {s["site"] for s in propagate(graph, HSINCHU, as_of="2026-12-31T00:00:00Z")["sites"]}
    assert "facility:tsmc:fab-12a" not in sites and "facility:tsmc:fab-12b" in sites


def test_ships_through_edges_are_traversed(tmp_path):
    """A synthetic, test-only edge: the shipped seed has no ships_through edges yet."""
    data = seed()
    template = supply(data)
    data["edges"].append({**template, "id": "ships_through:amd:hormuz", "type": "ships_through",
                          "src": "company:amd", "dst": "chokepoint:hormuz", "confidence": 0.5,
                          "mechanism": "Synthetic test edge."})
    result = propagate(write(tmp_path, data), {"kind": "conflict", "lat": 26.57, "lon": 56.25, "time": T}, as_of=AS_OF)
    assert result["status"] == "AVAILABLE" and result["unlinked_sites"] == []
    assert [r["security"] for r in result["securities"]] == ["security:amd"]


def test_radius_is_declared_bounded_and_monotone():
    assert G.impact_radius_km("earthquake", 4.99) is None
    assert G.impact_radius_km("earthquake", 5.0) == 50.0
    assert G.impact_radius_km("earthquake", 6.0) == 100.0
    assert G.impact_radius_km("earthquake", 7.0) == 200.0
    assert G.impact_radius_km("earthquake", 9.5) == G.MAX_QUAKE_RADIUS_KM == 600.0
    assert G.impact_radius_km("cyclone", None) == 300.0
    for bad in (("earthquake", None), ("earthquake", float("nan")), ("meteor", 9.0)):
        with pytest.raises(ValueError):
            G.impact_radius_km(*bad)


@pytest.mark.parametrize("bad", [{"lat": float("nan")}, {"lat": 95.0}, {"lon": None}, {"kind": "meteor"},
                                 {"time": "2026-11-16"}, {"time": "2026-11-16T00:00:00"}])
def test_propagate_refuses_a_malformed_event(bad):
    with pytest.raises(ValueError):
        propagate(load_graph(), {**QUAKE, **bad}, as_of=AS_OF)


def test_truncation_is_reported_and_hides_no_security():
    full = propagate(load_graph(), QUAKE, as_of=AS_OF, max_paths=500)
    cut = propagate(load_graph(), QUAKE, as_of=AS_OF, max_paths=3)
    assert len(cut["chains"]) == 3 and cut["chains_total"] == full["chains_total"] > 3
    assert [r["security"] for r in cut["securities"]] == [r["security"] for r in full["securities"]]


def test_version_cannot_address_the_filesystem():
    for version in ("../seed/v1", "v1/../v1", "", "v1\x00", "..", "V1", "v" + "9" * 7):
        with pytest.raises(FileNotFoundError):
            load_graph(version)


def client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.routes import geo_graph

    app = FastAPI()
    app.include_router(geo_graph.router)
    return TestClient(app)


def test_api_reads_the_graph_as_of_a_time_and_propagates():
    c = client()
    body = c.get("/geo/graph").json()
    assert body["version"] == G.LATEST and len(body["edges"]) >= 40 and body["edges_not_yet_available"] == 0
    early = c.get("/geo/graph", params={"as_of": "2026-11-14T12:00:00Z"}).json()
    cut = parse_instant("2026-11-14T12:00:00Z")
    later = [e.id for e in load_graph().edges if parse_instant(e.source.available_at) > cut]
    # The Apple edges were checked a day later than the rest of v1, so they are not yet available.
    apple = {e["id"] for e in seed()["edges"] if e["type"] == "supplies" and e["dst"] == "company:apple"}
    assert len(apple) == 4 and apple <= set(later)
    assert early["edges_not_yet_available"] == len(later) >= 4
    assert all("apple" not in e["id"] or e["type"] != "supplies" for e in early["edges"])
    # Explicit past instants: the route refuses a future as_of, so the test must not depend on "now".
    past = {**QUAKE, "time": "2026-11-14T11:05:00Z", "as_of": "2026-11-14T11:10:00Z"}
    r = c.post("/geo/graph/propagate", json=past)
    assert r.status_code == 200 and r.json()["status"] == "AVAILABLE" and r.json()["securities"]


def test_api_answers_bad_input_with_4xx_never_500():
    c = client()
    assert c.get("/geo/graph", params={"version": "../seed/v1"}).status_code == 404
    assert c.get("/geo/graph", params={"version": "../../../../frontend-v2/package"}).status_code == 404
    assert c.get("/geo/graph", params={"version": "v999"}).status_code == 404
    assert c.get("/geo/graph", params={"as_of": "2026-11-14"}).status_code == 422
    assert c.get("/geo/graph", params={"as_of": "2999-01-01T00:00:00Z"}).status_code == 422
    past = {**QUAKE, "time": "2026-11-14T11:05:00Z", "as_of": "2026-11-14T11:10:00Z"}
    assert c.post("/geo/graph/propagate", json={**past, "as_of": "2999-01-01T00:00:00Z"}).status_code == 422
    assert c.post("/geo/graph/propagate", json={**past, "as_of": "2026-11-14"}).status_code == 422
    assert c.post("/geo/graph/propagate", json={**past, "time": "yesterday"}).status_code == 422
    assert c.post("/geo/graph/propagate", json={**past, "kind": "meteor"}).status_code == 422
    nan = json.dumps(past).replace("23.9", "NaN")
    assert c.post("/geo/graph/propagate", content=nan, headers={"content-type": "application/json"}).status_code == 422
    assert c.post("/geo/graph/propagate?version=../seed/v1", json=past).status_code == 404


def test_the_real_app_requires_a_session_for_the_graph():
    from fastapi.testclient import TestClient
    from backend.main import app

    assert TestClient(app).get("/geo/graph").status_code == 401
