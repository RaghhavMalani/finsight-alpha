"""Load the versioned seed and propagate an event to exposed securities through cited edges."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
import math
from pathlib import Path
import re

from .model import Edge, Node, Source, parse_instant

SEED_DIR = Path(__file__).with_name("seed")
LATEST = "v2"
EARTH_KM = 6371.0088
# Declared, coarse and unfitted: how far an event of each kind plausibly disrupts a site.
MIN_QUAKE_MAGNITUDE = 5.0
MAX_QUAKE_RADIUS_KM = 600.0
FIXED_RADIUS_KM = {"cyclone": 300.0, "conflict": 200.0, "disruption": 150.0}
# A site reaches companies through these edges (company -> site); customers follow via supplies.
SITE_LINKS = frozenset({"operates", "ships_through"})


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(min(1.0, h)))


@dataclass(frozen=True)
class Graph:
    version: str
    sha256: str
    nodes: dict[str, Node]
    edges: tuple[Edge, ...]

    def known(self, cutoff) -> tuple[dict[str, Node], list[Edge]]:
        """Items whose source was available at the cutoff; an edge needs both endpoints known."""
        nodes = {k: n for k, n in self.nodes.items() if parse_instant(n.source.available_at) <= cutoff}
        edges = [e for e in self.edges
                 if parse_instant(e.source.available_at) <= cutoff and e.src in nodes and e.dst in nodes]
        return nodes, edges

    def to_dict(self, as_of: str) -> dict:
        nodes, edges = self.known(parse_instant(as_of))
        return {"version": self.version, "sha256": self.sha256, "as_of": as_of,
                "nodes_not_yet_available": len(self.nodes) - len(nodes),
                "edges_not_yet_available": len(self.edges) - len(edges),
                "nodes": [asdict(n) for n in nodes.values()], "edges": [asdict(e) for e in edges]}


def load_graph(version: str = LATEST, *, path: Path | None = None) -> Graph:
    if path is None:
        if not isinstance(version, str) or not re.fullmatch(r"v[0-9]{1,6}", version):
            raise FileNotFoundError("Unknown graph version")  # never a path into the filesystem
        path = SEED_DIR / f"{version}.json"
    raw = path.read_bytes()
    seed = json.loads(raw)
    if not isinstance(seed, dict) or seed.get("schema_version") != "geo-graph-seed/2":
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


def impact_radius_km(kind: str, magnitude: float | None) -> float | None:
    """Radius in km, or None when the event is below the declared disruption threshold."""
    if kind == "earthquake":
        if magnitude is None or not math.isfinite(magnitude):
            raise ValueError("An earthquake needs a finite magnitude")
        if magnitude < MIN_QUAKE_MAGNITUDE:
            return None
        # M5 50 km, M6 100 km, M7 200 km, M8 400 km, capped.
        return min(MAX_QUAKE_RADIUS_KM, 50.0 * 2 ** (magnitude - MIN_QUAKE_MAGNITUDE))
    if kind not in FIXED_RADIUS_KM:
        raise ValueError(f"Unknown event kind {kind!r}")
    return FIXED_RADIUS_KM[kind]


def _event(event: dict) -> tuple[str, float, float, float | None]:
    kind = event.get("kind")
    try:
        lat, lon = float(event["lat"]), float(event["lon"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("An event needs numeric lat and lon") from None
    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("Event coordinates out of range")
    magnitude = event.get("magnitude")
    return kind, lat, lon, None if magnitude is None else float(magnitude)


def propagate(graph: Graph, event: dict, *, as_of: str, max_paths: int = 50) -> dict:
    """Ranked chains event -> site -> linked company -> its customers -> listings -> sectors.

    Only nodes and edges whose source was available at or before both the event and ``as_of`` are
    used, so replaying a past event never sees a relationship learned afterwards. The status says
    what the answer means: an empty list is never reported as an AVAILABLE "no exposure".
    """
    kind, lat, lon, magnitude = _event(event)
    when, asked = parse_instant(event["time"]), parse_instant(as_of)
    base = {"graph": {"version": graph.version, "sha256": graph.sha256}, "as_of": as_of,
            "securities": [], "chains": [], "chains_total": 0, "sites": [], "unlinked_sites": []}
    radius = impact_radius_km(kind, magnitude)
    described = {**event, "radius_km": radius}
    if asked < when:
        return {**base, "status": "UNAVAILABLE", "reason": "as_of precedes the event", "event": described}
    cutoff = min(when, asked)
    nodes, edges = graph.known(cutoff)
    base |= {"cutoff": cutoff.isoformat(), "event": described,
             "nodes_not_yet_available": len(graph.nodes) - len(nodes),
             "edges_not_yet_available": len(graph.edges) - len(edges)}
    if radius is None:
        return {**base, "status": "BELOW_THRESHOLD",
                "reason": f"earthquakes under M{MIN_QUAKE_MAGNITUDE} are below the declared disruption threshold"}
    located = [n for n in nodes.values() if n.lat is not None]
    if not located:
        return {**base, "status": "UNAVAILABLE",
                "reason": "the graph had no sourced sites available at the event time"}
    distances = sorted((haversine_km((lat, lon), (n.lat, n.lon)), n.id) for n in located)
    base["nearest_site_km"] = round(distances[0][0])
    in_radius = [(d, nodes[i]) for d, i in distances if d <= radius]
    if not in_radius:
        return {**base, "status": "NO_COVERAGE",
                "reason": "no sourced site in the graph lies within the event radius; "
                          "this says nothing about real exposure"}

    out: dict[str, list[Edge]] = {}
    inbound: dict[str, list[Edge]] = {}
    for e in edges:
        out.setdefault(e.src, []).append(e)
        inbound.setdefault(e.dst, []).append(e)

    def hop(e: Edge) -> dict:
        return {"edge": e.id, "type": e.type, "from": e.src, "to": e.dst, "confidence": e.confidence,
                "mechanism": e.mechanism, "source": asdict(e.source)}

    chains, sites = [], []
    for distance, site in in_radius:
        proximity = 1.0 - distance / radius
        before = len(chains)
        for link in (e for e in inbound.get(site.id, []) if e.type in SITE_LINKS):
            if nodes[link.src].type != "company":
                continue
            # The linked company itself, then each sourced customer one supply hop on.
            reach = [(link.src, [link], link.confidence)]
            reach += [(s.dst, [link, s], link.confidence * s.confidence)
                      for s in out.get(link.src, []) if s.type == "supplies"]
            for company, path, weight in reach:
                for listing in (e for e in out.get(company, []) if e.type == "listed_as"):
                    sectors = [e for e in out.get(listing.dst, []) if e.type == "exposed_to"]
                    chains.append({
                        "site": site.id, "distance_km": round(distance), "site_precision": site.location_precision,
                        "company": company, "security": listing.dst,
                        "score": round(proximity * weight * listing.confidence, 4),
                        "hops": [hop(e) for e in (*path, listing, *sectors)],
                    })
        sites.append({"site": site.id, "name": site.name, "type": site.type, "distance_km": round(distance),
                      "precision": site.location_precision, "linked": len(chains) > before,
                      "source": asdict(site.source)})
    chains.sort(key=lambda c: (-c["score"], c["distance_km"], c["site"], c["security"], c["company"]))
    # One row per exposed security: its strongest chain and every affected site that reaches it.
    by_security: dict[str, dict] = {}
    for c in chains:
        row = by_security.setdefault(c["security"], {"security": c["security"], "score": c["score"],
                                                     "best_chain": c, "sites": set()})
        row["sites"].add(c["site"])
    ranked = sorted(({**r, "sites": sorted(r["sites"])} for r in by_security.values()),
                    key=lambda r: (-r["score"], r["security"]))
    result = {**base, "sites": sites, "unlinked_sites": [s for s in sites if not s["linked"]],
              "securities": ranked, "chains": chains[:max_paths], "chains_total": len(chains)}
    if not ranked:
        return {**result, "status": "PARTIAL",
                "reason": "sites lie within the event radius but the graph has no sourced link from them to a security"}
    return {**result, "status": "AVAILABLE"}
