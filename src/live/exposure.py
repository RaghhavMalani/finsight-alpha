"""Sourced exposure for live events: a quake near a mapped site becomes a suggested research
question that names the securities the knowledge graph reaches, with the cited chain for each.

Suggestion only: nothing here runs a model or a paid call. The graph is cut at the origin time of
the quake (never later than when it was stored), so a relationship this project learned after the
event cannot appear in its suggestion. A quake near an exchange or semiconductor hub also gets the
separate hub suggestion from ``triggers``; the two answer different questions.
"""
from __future__ import annotations

from functools import lru_cache

from src.geo.graph import load_graph, propagate

from . import model
from .model import Observation

RULE_ID, RULE_VERSION = "quake-exposure-graph", 1
MAX_SECURITIES = 8
LICENCE = model.licence("INTERNAL_DERIVED", "FinSight Forge sourced-exposure suggestions; inherits input licences",
                        "https://github.com/RaghhavMalani/finsight-alpha", "LOCAL_ONLY")


@lru_cache(maxsize=1)
def _graph():
    return load_graph()


def _number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _place(value) -> str:
    """Feed free text, reduced to printable characters and a bounded length."""
    text = "".join(ch for ch in str(value or "") if ch.isprintable())[:80].strip()
    return text or "location as reported"


def suggest(record: dict, graph=None) -> list[Observation]:
    payload = record.get("payload") or {}
    if record.get("type") != "geo.event" or payload.get("kind") != "earthquake":
        return []
    if not all(_number(payload.get(k)) for k in ("mag", "lat", "lon")):
        return []  # no numeric magnitude or location: no guess
    graph = graph or _graph()
    event = {"kind": "earthquake", "magnitude": payload["mag"], "lat": payload["lat"], "lon": payload["lon"],
             "time": record["observed_at"]}
    try:
        result = propagate(graph, event, as_of=record["available_at"], max_paths=1)
    except ValueError:
        return []  # a malformed event is not evidence of exposure
    if result["status"] != "AVAILABLE":
        return []  # below threshold, no coverage, or no sourced link: nothing to suggest
    securities = []
    for row in result["securities"][:MAX_SECURITIES]:
        best = row["best_chain"]
        securities.append({
            "security": row["security"],
            "ticker": graph.nodes[row["security"]].attrs.get("ticker"),
            "score": row["score"], "sites_reached": len(row["sites"]),
            "site": best["site"], "distance_km": best["distance_km"], "site_precision": best["site_precision"],
            "hops": [{"edge": h["edge"], "mechanism": h["mechanism"], "confidence": h["confidence"],
                      "source_url": h["source"]["url"], "source_date": h["source"]["date"],
                      "source_date_basis": h["source"]["date_basis"]} for h in best["hops"]],
        })
    # Name the site that carries the strongest chain, not merely the nearest one.
    top = securities[0]
    tickers = ", ".join(s["ticker"] or s["security"] for s in securities)
    question = (f"M{payload['mag']} earthquake {top['distance_km']} km from {graph.nodes[top['site']].name} "
                f"({_place(payload.get('place'))}): sourced links reach {tickers}. "
                "Did comparable events move these names beyond a matched control, and for how long?")
    return [Observation(
        type="research.progress", source="finsight:exposure",
        source_id=f"{RULE_ID}:{record['source']}:{record['source_id']}",
        # One suggestion per quake per rule version; the graph that produced it is in provenance.
        revision=f"v{RULE_VERSION}", observed_at=record["available_at"], effective_at=None,
        licence=LICENCE, confidence="DERIVED",
        provenance={"feed": "exposure", "url": "internal:src/live/exposure.py", "fetched_at": record["available_at"],
                    "content_sha256": graph.sha256, "parser": "live-exposure/1",
                    "delay": "DERIVED: evaluated when the input was stored",
                    "graph": result["graph"],
                    "inputs": [{"id": record["id"], "seq": record["seq"], "type": record["type"],
                                "source": record["source"], "licence": record["licence"]["status"]}]},
        payload={"kind": "research_suggestion", "status": "SUGGESTED", "rule_id": RULE_ID,
                 "rule_version": RULE_VERSION, "question": question,
                 "exposure": {"status": result["status"], "graph": result["graph"], "cutoff": result["cutoff"],
                              "radius_km": result["event"]["radius_km"],
                              "securities_total": len(result["securities"]), "securities": securities,
                              "sites_in_radius": len(result["sites"]),
                              "coordinates": "city or passage centroids; distances are approximate"},
                 "auto_run": False, "model_calls": 0, "cost_usd": 0,
                 "note": "Suggestion only; nothing is executed until a person starts it."},
    )]
