"""Load the versioned seed and propagate an event to exposed securities through cited edges."""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime
from hashlib import sha256
import json
import math
from pathlib import Path

from .model import Edge, Node, Source, parse_instant

SEED_DIR = Path(__file__).with_name("seed")
LATEST = "v1"
EARTH_KM = 6371.0088


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(h))


@dataclass(frozen=True)
class Graph:
    version: str
    sha256: str
    nodes: dict[str, Node]
    edges: tuple[Edge, ...]

    def to_dict(self) -> dict:
        return {"version": self.version, "sha256": self.sha256,
                "nodes": [asdict(n) for n in self.nodes.values()], "edges": [asdict(e) for e in self.edges]}


def load_graph(version: str = LATEST, *, path: Path | None = None) -> Graph:
    raw = (path or SEED_DIR / f"{version}.json").read_bytes()
    seed = json.loads(raw)
    if seed.get("schema_version") != "geo-graph-seed/1":
        raise ValueError("Unknown graph seed schema")
    nodes: dict[str, Node] = {}
    for item in seed["nodes"]:
        node = Node(**{**item, "source": Source(**item["source"])})
        node.validate()
        if node.id in nodes:
            raise ValueError(f"Duplicate node {node.id}")
        nodes[node.id] = node
    edges, seen = [], set()
    for item in seed["edges"]:
        edge = Edge(**{**item, "source": Source(**item["source"])})
        edge.validate(nodes)
        if edge.id in seen:
            raise ValueError(f"Duplicate edge {edge.id}")
        seen.add(edge.id)
        edges.append(edge)
    return Graph(seed["version"], sha256(raw).hexdigest(), nodes, tuple(edges))


# How far an event of each kind plausibly disrupts a site. Deliberately coarse and declared, not fitted.
def impact_radius_km(kind: str, magnitude: float | None) -> float:
    if kind == "earthquake":
        if magnitude is None:
            raise ValueError("An earthquake needs a magnitude")
        return min(600.0, 50.0 * 2 ** max(0.0, magnitude - 5.0))  # M6 100 km, M7 200 km, M8 400 km
    return {"cyclone": 300.0, "conflict": 200.0, "disruption": 150.0}.get(kind, 150.0)


def propagate(graph: Graph, event: dict, *, as_of: str, max_paths: int = 50) -> dict:
    """Ranked chains event -> located site -> operator -> customers -> securities -> sectors.

    Only nodes and edges whose ``available_at`` is at or before both the event and ``as_of`` are used,
    so a replay of a past event never sees a relationship learned afterwards.
    """
    when = parse_instant(event["time"])
    cutoff = min(when, parse_instant(as_of))
    if parse_instant(as_of) < when:
        return {"status": "UNAVAILABLE", "reason": "as_of precedes the event", "securities": [], "chains": []}
    kind = event.get("kind", "disruption")
    radius = impact_radius_km(kind, event.get("magnitude"))
    origin = (float(event["lat"]), float(event["lon"]))

    def known(item) -> bool:
        return parse_instant(item.source.available_at) <= cutoff

    nodes = {k: n for k, n in graph.nodes.items() if known(n)}
    edges = [e for e in graph.edges if known(e) and e.src in nodes and e.dst in nodes]
    excluded = len(graph.edges) - len(edges)
    out: dict[str, list[Edge]] = {}
    inbound: dict[str, list[Edge]] = {}
    for e in edges:
        out.setdefault(e.src, []).append(e)
        inbound.setdefault(e.dst, []).append(e)

    def hop(e: Edge) -> dict:
        return {"edge": e.id, "type": e.type, "from": e.src, "to": e.dst, "confidence": e.confidence,
                "mechanism": e.mechanism, "source": asdict(e.source)}

    chains = []
    for site in (n for n in nodes.values() if n.lat is not None):
        distance = haversine_km(origin, (site.lat, site.lon))
        if distance > radius:
            continue
        proximity = 1.0 - distance / radius
        operators = [e for e in inbound.get(site.id, []) if e.type == "operates"]
        if not operators:
            chains.append({"site": site.id, "distance_km": round(distance, 1), "score": round(proximity, 4),
                           "hops": [], "security": None, "note": "no sourced operator edge for this site yet"})
            continue
        for op in operators:
            # The operator itself and each sourced customer, one supply hop deep.
            reach = [(op.src, [op], op.confidence)]
            reach += [(s.dst, [op, s], op.confidence * s.confidence)
                      for s in out.get(op.src, []) if s.type == "supplies"]
            for company, path, weight in reach:
                for listing in (e for e in out.get(company, []) if e.type == "listed_as"):
                    sectors = [e for e in out.get(listing.dst, []) if e.type == "exposed_to"]
                    chains.append({
                        "site": site.id, "distance_km": round(distance, 1), "security": listing.dst,
                        "company": company, "score": round(proximity * weight * listing.confidence, 4),
                        "hops": [hop(e) for e in (*path, listing, *sectors)],
                    })
    chains.sort(key=lambda c: (-c["score"], c["distance_km"], c["site"], c.get("security") or ""))
    # One row per exposed security: its strongest chain and how many affected sites reach it.
    securities: dict[str, dict] = {}
    for c in chains:
        if c.get("security") is None:
            continue
        row = securities.setdefault(c["security"], {"security": c["security"], "score": c["score"],
                                                     "best_chain": c, "sites": set()})
        row["sites"].add(c["site"])
    ranked = sorted(({**r, "sites": sorted(r["sites"])} for r in securities.values()),
                    key=lambda r: (-r["score"], r["security"]))
    return {"status": "AVAILABLE", "graph": {"version": graph.version, "sha256": graph.sha256},
            "event": {**event, "radius_km": radius}, "as_of": as_of, "cutoff": cutoff.isoformat(),
            "excluded_not_yet_available": excluded, "securities": ranked, "chains": chains[:max_paths]}
