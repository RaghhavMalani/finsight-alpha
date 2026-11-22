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
    # Every recorded quake predates the checked sources, so none can be AVAILABLE at its own time.
    assert {e["point_in_time"]["status"] for e in recorded} <= {"UNAVAILABLE", "BELOW_THRESHOLD"}
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
