"""Precompute Global Eye v2 propagation for the checked Replay earthquakes and declared scenarios.

Replay must not contact the API, so the page reads this static projection instead of calling
``POST /geo/graph/propagate``. Every number in it comes from ``propagate()`` over the sourced seed;
nothing is added. The output is content addressed and its expected name, SHA-256 and length are
compiled into the page, which refuses any other bytes.

    python scripts/export_geo_projection.py           # write the projection and the pin
    python scripts/export_geo_projection.py --check   # exit 1 if the committed files drifted

Writes:
    frontend-v2/public/geo/projection.<sha16>.json
    frontend-v2/src/components/globe/geo-pin.generated.ts
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.geo.graph.graph import (  # noqa: E402
    FIXED_RADIUS_KM, MAX_QUAKE_RADIUS_KM, MIN_QUAKE_MAGNITUDE, SEED_DIR, LATEST, load_graph, propagate,
)
from src.geo.graph.model import parse_instant  # noqa: E402

FRONTEND = ROOT / "frontend-v2"
OUT_DIR = FRONTEND / "public" / "geo"
PIN = FRONTEND / "src" / "components" / "globe" / "geo-pin.generated.ts"
MANIFEST = FRONTEND / "public" / "replay-manifest.json"
REPLAY_ID = "world:quakes"
SCHEMA = "geo-projection/1"
MAX_BYTES = 2_000_000  # the page refuses anything larger before parsing

# Declared hypothetical events. They are not recorded quakes: each is dated at the graph's
# knowledge cutoff so the sourced relationships exist, and the page labels them SCENARIO.
# Coordinates and magnitudes are the fixtures of tests/test_geo_graph.py.
SCENARIOS = (
    {"id": "scenario:taiwan-m6.8", "label": "Scenario: M6.8 earthquake, eastern Taiwan",
     "kind": "earthquake", "magnitude": 6.8, "lat": 23.9, "lon": 121.6},
    {"id": "scenario:hormuz-conflict", "label": "Scenario: conflict at the Strait of Hormuz",
     "kind": "conflict", "magnitude": None, "lat": 26.57, "lon": 56.25},
    {"id": "scenario:hsinchu-m4.8", "label": "Scenario: M4.8 earthquake at Hsinchu",
     "kind": "earthquake", "magnitude": 4.8, "lat": 24.8138, "lon": 120.9675},
)


def _instant(ms: int) -> str:
    t = datetime.fromtimestamp(ms // 1000, tz=timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%S") + f".{ms % 1000:03d}Z"


def _compact(result: dict) -> dict:
    """The propagate() answer with hops as edge ids; sources live once in the edge table."""
    out = {k: result[k] for k in ("status", "reason", "cutoff", "nearest_site_km", "chains_total",
                                  "nodes_not_yet_available", "edges_not_yet_available") if k in result}
    out["radius_km"] = result["event"]["radius_km"]
    out["sites"] = [{"site": s["site"], "distance_km": s["distance_km"], "linked": s["linked"]}
                    for s in result["sites"]]
    out["securities"] = [{
        "security": r["security"], "score": r["score"], "sites": r["sites"],
        "best_chain": {"site": r["best_chain"]["site"], "distance_km": r["best_chain"]["distance_km"],
                       "company": r["best_chain"]["company"], "score": r["best_chain"]["score"],
                       "hops": [h["edge"] for h in r["best_chain"]["hops"]]},
    } for r in result["securities"]]
    return out


def build() -> bytes:
    graph = load_graph(LATEST)
    seed_lf = (SEED_DIR / f"{LATEST}.json").read_bytes().replace(b"\r\n", b"\n")
    manifest = json.loads(MANIFEST.read_bytes())
    entry = manifest["artifacts"][REPLAY_ID]
    if entry.get("status") != "AVAILABLE":
        raise SystemExit(f"{REPLAY_ID} is not AVAILABLE in the Replay manifest")
    raw = (FRONTEND / "public" / entry["url"].lstrip("/")).read_bytes()
    if len(raw) != entry["bytes"] or sha256(raw).hexdigest() != entry["sha256"]:
        raise SystemExit(f"{entry['url']} does not match its Replay manifest pin")
    world = json.loads(raw)
    cutoff = max([n.source.available_at for n in graph.nodes.values()]
                 + [e.source.available_at for e in graph.edges], key=parse_instant)

    events = []
    for q in world["events"]:
        time = _instant(q["time"])
        event = {"kind": "earthquake", "lat": q["lat"], "lon": q["lon"], "magnitude": q["mag"], "time": time}
        events.append({
            "id": q["stableId"], "origin": "recorded", "label": q.get("place") or "Unnamed location",
            "kind": "earthquake", "lat": q["lat"], "lon": q["lon"], "magnitude": q["mag"], "time": time,
            # What was knowable when the quake happened (the point-in-time answer).
            "point_in_time": _compact(propagate(graph, event, as_of=time)),
            # The same location against the graph as checked; relationships learned afterwards.
            "retrospective": _compact(propagate(graph, {**event, "time": cutoff}, as_of=cutoff)),
        })
    for s in SCENARIOS:
        event = {"kind": s["kind"], "lat": s["lat"], "lon": s["lon"], "magnitude": s["magnitude"], "time": cutoff}
        events.append({**s, "origin": "scenario", "time": cutoff,
                       "point_in_time": _compact(propagate(graph, event, as_of=cutoff)), "retrospective": None})

    projection = {
        "schema_version": SCHEMA,
        "generator": "scripts/export_geo_projection.py",
        "graph": {"version": graph.version, "path": f"src/geo/graph/seed/{LATEST}.json",
                  "seed_sha256_lf": sha256(seed_lf).hexdigest(), "knowledge_cutoff": cutoff,
                  "nodes": len(graph.nodes), "edges": len(graph.edges)},
        "input": {"artifact": REPLAY_ID, "url": entry["url"], "sha256": entry["sha256"],
                  "bytes": entry["bytes"], "as_of": entry["as_of"], "events": len(world["events"])},
        "precision": "Coordinates are city or passage centroids; distances approximate (whole km).",
        "radius_rule": (f"Earthquake {MIN_QUAKE_MAGNITUDE:g}: 50 km, doubling per magnitude, capped at "
                        f"{MAX_QUAKE_RADIUS_KM:g} km; under M{MIN_QUAKE_MAGNITUDE:g} below threshold; "
                        + "; ".join(f"{k} {v:g} km" for k, v in FIXED_RADIUS_KM.items()) + "."),
        "score_rule": "chain score = proximity (1 - distance / radius) x product of the cited hop confidences",
        "nodes": {k: asdict(n) for k, n in sorted(graph.nodes.items())},
        "edges": {e.id: asdict(e) for e in sorted(graph.edges, key=lambda e: e.id)},
        "events": events,
    }
    body = json.dumps(projection, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(body) > MAX_BYTES:
        raise SystemExit(f"Projection is {len(body)} bytes, over the {MAX_BYTES} limit")
    return body


def pin_text(name: str, digest: str, size: int) -> str:
    return (
        "// Generated by scripts/export_geo_projection.py. Do not edit; rerun the exporter.\n"
        "export const GEO_PROJECTION_PIN = {\n"
        f'  url: "/geo/{name}",\n'
        f'  sha256: "{digest}",\n'
        f"  bytes: {size},\n"
        f"  maxBytes: {MAX_BYTES},\n"
        "} as const;\n"
    )


def main(argv: list[str]) -> int:
    body = build()
    digest = sha256(body).hexdigest()
    name = f"projection.{digest[:16]}.json"
    pin = pin_text(name, digest, len(body))
    if "--check" in argv:
        existing = sorted(p.name for p in OUT_DIR.glob("projection.*.json")) if OUT_DIR.exists() else []
        problems = []
        if existing != [name]:
            problems.append(f"expected only {name} in {OUT_DIR}, found {existing}")
        elif (OUT_DIR / name).read_bytes() != body:
            problems.append(f"{name} bytes differ from a fresh export")
        if not PIN.exists() or PIN.read_bytes().replace(b"\r\n", b"\n") != pin.encode():
            problems.append(f"{PIN.name} differs from a fresh export")
        for p in problems:
            print(f"DRIFT: {p}", file=sys.stderr)
        if problems:
            print("Rerun: python scripts/export_geo_projection.py", file=sys.stderr)
            return 1
        print(f"Geo projection matches a fresh export: {name} ({len(body)} bytes)")
        return 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("projection.*.json"):
        if old.name != name:
            old.unlink()
    (OUT_DIR / name).write_bytes(body)
    PIN.write_bytes(pin.encode())
    print(f"Wrote {name} ({len(body)} bytes) and {PIN.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
