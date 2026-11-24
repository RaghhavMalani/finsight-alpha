"""Global Eye v2 projection: the committed Replay bytes are a fresh export of the sourced seed."""
from __future__ import annotations

from hashlib import sha256
import json
import re

from scripts import export_geo_projection as exporter


def _committed() -> tuple[bytes, dict]:
    pin = exporter.PIN.read_text(encoding="utf-8")
    name = re.search(r'file: "([^"]+)"', pin).group(1)
    return (exporter.OUT_DIR / name).read_bytes(), {
        "name": name, "sha256": re.search(r'sha256: "([0-9a-f]{64})"', pin).group(1),
        "bytes": int(re.search(r"bytes: (\d+)", pin).group(1)),
    }


def test_committed_projection_matches_a_fresh_export():
    # Drift guard: a seed, propagate() or Replay change without a re-export fails here.
    assert exporter.main(["--check"]) == 0
    body, pin = _committed()
    assert body == exporter.build()
    assert len(body) == pin["bytes"] and sha256(body).hexdigest() == pin["sha256"]
    assert pin["name"] == f"projection.{pin['sha256'][:16]}.json"


def test_point_in_time_answers_never_use_later_relationships():
    body, _ = _committed()
    projection = json.loads(body)
    recorded = [e for e in projection["events"] if e["origin"] == "recorded"]
    assert recorded and all(e["time"] < projection["graph"]["knowledge_cutoff"] for e in recorded)
    # A point-in-time answer may only use nodes and edges whose source was available by the quake.
    for e in recorded:
        answer = e["point_in_time"]
        for row in answer["securities"]:
            chain = row["best_chain"]
            hops = [projection["edges"][h] for h in chain["hops"]]
            used = {chain["site"], *(h["src"] for h in hops), *(h["dst"] for h in hops)}
            for item in (*hops, *(projection["nodes"][n] for n in used)):
                assert item["source"]["available_at"] <= e["time"], (e["id"], item["id"])
        for site in answer["sites"]:
            assert projection["nodes"][site["site"]]["source"]["available_at"] <= e["time"]
    for e in projection["events"]:
        for answer in (e["point_in_time"], e["retrospective"]):
            if answer is None:
                continue
            assert (answer["status"] == "AVAILABLE") == bool(answer["securities"])
            if answer["status"] in ("UNAVAILABLE", "BELOW_THRESHOLD"):
                # Not evaluated: no count is written, so nothing can read it as zero.
                assert answer["sites"] == [] and "chains_total" not in answer
                assert "nearest_site_km" not in answer
            for row in answer["securities"]:
                assert all(hop in projection["edges"] for hop in row["best_chain"]["hops"])


def test_scenarios_are_labelled_and_reach_securities_only_through_cited_edges():
    projection = json.loads(_committed()[0])
    scenarios = {e["id"]: e for e in projection["events"] if e["origin"] == "scenario"}
    assert {k: v["point_in_time"]["status"] for k, v in scenarios.items()} == {
        "scenario:taiwan-m6.8": "AVAILABLE", "scenario:hormuz-conflict": "PARTIAL",
        "scenario:hsinchu-m4.8": "BELOW_THRESHOLD"}
    assert all(e["label"].startswith("Scenario: ") for e in scenarios.values())
    reached = {r["security"] for r in scenarios["scenario:taiwan-m6.8"]["point_in_time"]["securities"]}
    assert reached == {"security:tsm", "security:amd", "security:nvda", "security:adi", "security:aapl"}
    for edge in projection["edges"].values():
        assert edge["source"]["url"].startswith("https://") and edge["source"]["title"]


def test_recorded_quakes_reach_sourced_sites_at_their_own_time():
    """Seed v2: sources dated before the Replay window let real recorded quakes reach the graph."""
    projection = json.loads(_committed()[0])
    recorded = [e for e in projection["events"] if e["origin"] == "recorded"]
    by_place: dict[str, set] = {}
    for e in recorded:
        if e["point_in_time"]["status"] == "AVAILABLE":
            by_place.setdefault(e["label"], set()).update(r["security"] for r in e["point_in_time"]["securities"])
    expected = {
        "121 km NNE of Teluknaga, Indonesia": {"security:7203.t"},  # M6.5 Java Sea: TMMIN Sunter
        "13 km N of Xunchang, China": {"security:300750.sz", "security:3750.hk"},  # CATL Yibin
        "15 km NNW of Xunchang, China": {"security:300750.sz", "security:3750.hk"},
        "0 km NNE of Y\u014dkaichiba, Japan": {"security:5401.t"},  # Nippon Steel Kashima
        "6 km E of Inglewood, New Zealand": {"security:meoh", "security:mx.to"},  # Methanex Motunui
    }
    for place, securities in expected.items():
        assert securities <= by_place.get(place, set()), place
    statuses = {e["point_in_time"]["status"] for e in recorded}
    assert statuses <= {"AVAILABLE", "PARTIAL", "NO_COVERAGE", "BELOW_THRESHOLD"}
    # The graph only grows with time, so a later look never reaches less than the point-in-time one.
    for e in recorded:
        if e["point_in_time"]["status"] == "AVAILABLE":
            assert e["retrospective"]["status"] == "AVAILABLE"
