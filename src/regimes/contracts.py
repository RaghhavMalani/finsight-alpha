"""Envelope vocabulary, issue hooks and evidence propagation for Phase 5."""

from src.truth.contracts import canonical_hash

SCHEMA = "regimes/1"
STATUSES = {"AVAILABLE", "PARTIAL", "UNAVAILABLE", "LOCAL_ONLY"}
CLAIMS = {
    "inference_certified": False,
    "market_claim_eligible": False,
    "causal_claim_eligible": False,
    "validated_alpha": False,
    "trusted_graph": False,
    "precise_edge_confidence": False,
}
ISSUE_KINDS = {
    "HMM_UNCONVERGED",
    "INSUFFICIENT_WARMUP",
    "LOW_STATE_OCCUPANCY",
    "REGIME_INSTABILITY",
    "FACTOR_COVERAGE_PARTIAL",
    "CALENDAR_UNAVAILABLE",
    "EVENT_STREAM_UNAVAILABLE",
    "STALE_INPUT",
    "SOURCE_RESTRICTED",
    "INPUT_LINEAGE_INVALID",
    "INTRADAY_COVERAGE_LOW",
    "MODEL_OOD_DIAGNOSTIC",
    "GARCH_UNCONVERGED",
    "SERIES_UNAVAILABLE",
    "PLUGIN_RUN_FAILED",
}
SEVERITY_ORDER = {"INFO": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}
QUALITY_ORDER = [
    "PUBLICATION_TIMESTAMP",
    "RECEIVE_TIMESTAMP_CAPTURED",
    "CONSERVATIVE_MARKET_TIME",
    "CONSERVATIVE_VINTAGE_DAY",
    "CAPTURE_ONLY",
]
MODULES = (
    "volatility",
    "hmm",
    "coupling",
    "seasonality",
    "factors",
    "momentum",
    "events",
    "matrix",
    "fracture",
    "iohmm",
)


def issue(kind, severity, reason, *, asset, evidence):
    if kind not in ISSUE_KINDS or severity not in SEVERITY_ORDER:
        raise ValueError("Unknown issue kind or severity")
    return {
        "id": canonical_hash([kind, asset, evidence]),
        "kind": kind,
        "severity": severity,
        "reason": reason,
        "asset": asset,
        "evidence": evidence,
        "status": "OPEN",
    }


def module_status(status, reason=None, *, unblock=None, badges=()):
    if status not in STATUSES:
        raise ValueError("Unknown module status")
    if status != "AVAILABLE" and not reason:
        raise ValueError("A non-available module needs its exact reason")
    return {
        "status": status,
        "reason": reason,
        "unblock": unblock,
        "badges": list(badges),
    }


def weakest_quality(qualities):
    present = [q for q in QUALITY_ORDER if q in set(qualities)]
    if not present or set(qualities) - set(QUALITY_ORDER):
        raise ValueError("Unknown or missing clock quality")
    return present[-1]
