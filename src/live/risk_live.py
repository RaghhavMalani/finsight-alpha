"""Live Risk adapter: re-evaluates the Data rules that live inputs can answer.

Read-only. It loads the reviewed Risk policy (``eval/risk_manager/v0.1/policy.json``)
through ``src.risk_manager.policy`` and validates every alert with the same
``validate_rule`` the publication path uses. It never writes Risk publication
artifacts; alerts exist only as live records.

Covered (input = a stored ``feed.health`` record):
- R-DATA-ATTEMPT   FINDING when a feed has DOWN_AFTER consecutive failed attempts.
- R-DATA-HEALTH    FINDING when a feed is DEGRADED (partial rows, rejections, error rate).
- R-DATA-FRESHNESS FINDING when the last success is older than the policy's daily 7-day bound.
Not covered: R-DATA-GAPS, R-DATA-MIRROR and every MODEL / RESEARCH / PORTFOLIO /
SIMULATOR / SYSTEM rule. They need retained evidence bundles (session calendars,
model snapshots, research ledgers), not live feed inputs.
"""

from __future__ import annotations

from pathlib import Path

from src.risk_manager.policy import load, validate_rule

from . import model
from .model import Observation
from .scheduler import DOWN_AFTER

PROJECT_ROOT = Path(__file__).resolve().parents[2]
COVERED = ("R-DATA-ATTEMPT", "R-DATA-HEALTH", "R-DATA-FRESHNESS")
NOT_COVERED_REASON = ("needs retained evidence bundles (calendars, model snapshots, research ledgers); "
                      "not answerable from live feed inputs")
FRESHNESS_DAYS = 7
LICENCE = model.licence("INTERNAL_DERIVED", "FinSight Forge live Risk adapter over reviewed policy v0.1",
                        "https://github.com/RaghhavMalani/finsight-alpha", "PUBLIC")


class LiveRisk:
    def __init__(self, root: Path = PROJECT_ROOT, policy: dict | None = None):
        self.policy = policy or load(root)
        self.rules = {r["rule_id"]: r for r in self.policy["rules"]}
        missing = [r for r in COVERED if r not in self.rules]
        if missing:
            raise ValueError(f"policy lacks covered rules {missing}")
        if "daily >7 days" not in self.rules["R-DATA-FRESHNESS"]["predicate"]:
            raise ValueError("R-DATA-FRESHNESS predicate changed; review FRESHNESS_DAYS")
        self._outcomes: dict[tuple[str, str], str] = {}

    def coverage(self) -> dict:
        others = sorted(r for r in self.rules if r not in COVERED and r != "R-COVERAGE")
        return {"policy_sha256": self.policy["sha256"], "covered": list(COVERED),
                "not_covered": others, "not_covered_reason": NOT_COVERED_REASON,
                "writes_publication_artifacts": False}

    def _checks(self, snap: dict):
        status = snap["status"]
        yield ("R-DATA-ATTEMPT", status == "DOWN", snap["consecutive_failures"], DOWN_AFTER, "GTE",
               "SOURCE_ATTEMPT_FAILED", f"{snap['consecutive_failures']} consecutive failed attempts; "
               f"last error: {snap.get('last_error') or 'none'}")
        yield ("R-DATA-HEALTH", status == "DEGRADED", status, "UP", "EXACT", "PARTIAL_SOURCE_HEALTH",
               f"feed status {status}; error rate {snap.get('error_rate')}; "
               f"partial errors {len(snap.get('partial_errors') or [])}; rejected rows {snap.get('rejected_last')}")
        lag = snap.get("lag_s")
        if lag is not None and snap["cadence_s"] <= 86400:
            days = lag / 86400
            yield ("R-DATA-FRESHNESS", days > FRESHNESS_DAYS, round(days, 4), FRESHNESS_DAYS, "GT",
                   "SOURCE_STALE", f"last success {days:.2f} days before evaluation")

    def evaluate(self, snap: dict, health_record: dict) -> list[Observation]:
        """Alerts only on outcome transitions; an initial CLEAR is not news."""
        if snap["status"] in ("UNAVAILABLE", "STARTING"):
            return []
        alerts = []
        for rule_id, triggered, value, threshold, comparison, code, detail in self._checks(snap):
            outcome = "FINDING" if triggered else "CLEAR"
            key = (rule_id, snap["feed"])
            if self._outcomes.get(key, "CLEAR") == outcome:
                continue
            self._outcomes[key] = outcome
            rule = self.rules[rule_id]
            item = {"rule_id": rule_id, "rule_version": rule["rule_version"], "category": rule["category"],
                    "reason_code": code if triggered else None}
            validate_rule(item, self.policy)
            check_id = f"{rule['check_id']}:{snap['feed']}:live"
            alerts.append(Observation(
                type="risk.alert", source="finsight:risk-live", source_id=check_id,
                revision=f"{outcome}@{health_record['seq']}", observed_at=health_record["available_at"],
                effective_at=None, licence=LICENCE, confidence="DERIVED",
                provenance={"feed": "risk-live", "url": "internal:src/live/risk_live.py",
                            "fetched_at": health_record["available_at"],
                            "content_sha256": model.sha256_hex(model.canonical(snap)),
                            "parser": "live-risk/1", "delay": "DERIVED: evaluated on each stored feed.health record",
                            "policy_sha256": self.policy["sha256"],
                            "inputs": [{"id": health_record["id"], "seq": health_record["seq"],
                                        "type": "feed.health"}]},
                payload={**item, "check_id": check_id, "severity": rule["severity"], "outcome": outcome,
                         "subject": snap["feed"], "scope": "LIVE_FEED", "value": value, "threshold": threshold,
                         "comparison": comparison, "unit": rule["unit"], "predicate": rule["predicate"],
                         "reason": detail if triggered else "Condition cleared on this health record.",
                         "remediation": rule["remediation"],
                         "publication": "NONE: read-only live evaluation; no Risk artifacts written"},
            ))
        return alerts
