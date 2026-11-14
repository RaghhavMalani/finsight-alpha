"""Declarative research triggers: qualifying live events become SUGGESTED questions.

Suggestions only. Nothing here runs a model, an agent or a paid call; a
suggestion is a stored ``research.progress`` record with ``status: SUGGESTED``
that a person may choose to start. Places come from the reviewed exchange and
semiconductor hub list in ``src.geo.usgs.HUBS``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta

from src.geo.usgs import HUBS, haversine_km

from . import model
from .model import Observation

PLACES_SOURCE = "src/geo/usgs.py HUBS (exchange and semiconductor-supply hubs)"
LICENCE = model.licence("INTERNAL_DERIVED", "FinSight Forge research triggers; inherits input licences",
                        "https://github.com/RaghhavMalani/finsight-alpha", "LOCAL_ONLY")


@dataclass(frozen=True)
class Rule:
    id: str
    version: int
    on: str  # event type
    kind: str  # payload.kind
    where: dict = field(default_factory=dict)  # payload field -> (op, value)
    near_km: float | None = None  # nearest hub within this radius
    fresh_days: float | None = None  # input effective/observed within this many days of ingestion
    question: str = ""
    key: str = "subject"  # "subject": once per source item (a revised quake is the same quake); "record": per row


RULES = (
    Rule("quake-near-hub", 1, "geo.event", "earthquake", {"mag": (">=", 6.0)}, near_km=500,
         question="M{mag} earthquake {distance_km:.0f} km from {hub} ({place}): which covered companies have "
                  "facilities or suppliers near {hub}, and how did comparable events move them?"),
    Rule("conflict-near-hub", 1, "geo.event", "gdelt_event",
         {"quad_class": ("==", 4), "num_mentions": (">=", 50)}, near_km=300,
         question="Widely reported material-conflict event {distance_km:.0f} km from {hub} ({place}, "
                  "{num_mentions} mentions): is there exposure for assets tied to {hub}? Verify the "
                  "machine-coded event against primary reporting first."),
    Rule("extreme-weather-near-hub", 1, "geo.event", "nws_alert", {"severity": ("==", "Extreme")}, near_km=150,
         question="Extreme NWS alert ({event}) {distance_km:.0f} km from {hub}: operational exposure for "
                  "exchanges or data centres near {hub}?"),
    Rule("macro-revision", 1, "macro.release", "fred_vintage", {"is_revision": ("==", True)}, fresh_days=3,
         key="record",
         question="{series} for {period} was revised from {previous_vintage_value} to {value} "
                  "(vintage {vintage}): which retained studies used the earlier vintage?"),
    Rule("prediction-move", 1, "prediction.update", "prediction_market", {"move_pp": (">=", 10.0)},
         key="record",
         question="{venue} market '{question}' moved {move_pp:.1f} pp to {yes_price}: what news or data "
                  "release explains it, and does any covered asset price the same event?"),
)

_OPS = {">=": lambda a, b: a is not None and a >= b, "==": lambda a, b: a is not None and a == b}


def rules_digest() -> str:
    return model.sha256_hex(model.canonical([r.__dict__ for r in RULES]))


def nearest_hub(lat, lon):
    if lat is None or lon is None:
        return None, None
    best = min(((float(haversine_km(lat, lon, h[0], h[1])), name) for name, h in HUBS.items()))
    return best[1], best[0]


class Triggers:
    def __init__(self, rules=RULES):
        self.rules = rules
        self._last_yes: dict[str, float] = {}  # prediction market -> last seen yes price

    def evaluate(self, record: dict) -> list[Observation]:
        payload = dict(record.get("payload") or {})
        if record["type"] == "prediction.update" and payload.get("yes_price") is not None:
            prior = self._last_yes.get(record["source_id"])
            self._last_yes[record["source_id"]] = payload["yes_price"]
            payload["move_pp"] = abs(payload["yes_price"] - prior) * 100 if prior is not None else None
        out = []
        for rule in self.rules:
            if record["type"] != rule.on or payload.get("kind") != rule.kind:
                continue
            if not all(_OPS[op](payload.get(k), v) for k, (op, v) in rule.where.items()):
                continue
            if rule.fresh_days is not None:
                basis = record.get("effective_at") or record["observed_at"]
                if model.parse_iso(record["available_at"]) - model.parse_iso(basis) > timedelta(days=rule.fresh_days):
                    continue
            context = {**payload}
            if rule.near_km is not None:
                hub, distance = nearest_hub(payload.get("lat"), payload.get("lon"))
                if hub is None or distance > rule.near_km:
                    continue
                context.update(hub=hub, distance_km=distance)
            context = {k: ("n/a" if v is None else v) for k, v in context.items()}
            try:
                question = rule.question.format(**context)
            except (KeyError, ValueError):
                continue
            out.append(Observation(
                type="research.progress", source="finsight:triggers",
                source_id=(f"{rule.id}:{record['source']}:{record['source_id']}" if rule.key == "subject"
                           else f"{rule.id}:{record['id']}"),
                revision=f"v{rule.version}", observed_at=record["available_at"], effective_at=None,
                licence=LICENCE, confidence="DERIVED",
                provenance={"feed": "triggers", "url": "internal:src/live/triggers.py",
                            "fetched_at": record["available_at"], "content_sha256": rules_digest(),
                            "parser": "live-triggers/1", "delay": "DERIVED: evaluated when the input was stored",
                            "places_source": PLACES_SOURCE,
                            "inputs": [{"id": record["id"], "seq": record["seq"], "type": record["type"],
                                        "source": record["source"], "licence": record["licence"]["status"]}]},
                payload={"kind": "research_suggestion", "status": "SUGGESTED", "rule_id": rule.id,
                         "rule_version": rule.version, "question": question,
                         "hub": context.get("hub"), "distance_km": context.get("distance_km"),
                         "auto_run": False, "model_calls": 0, "cost_usd": 0,
                         "note": "Suggestion only; nothing is executed until a person starts it."},
            ))
        return out
