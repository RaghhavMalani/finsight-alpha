"""Positive-whitelist public projections of sealed Phase 5 snapshots.

Only PUBLIC-tier market-factor rows with an active derived-publication grant are
published. Raw factor returns, prices, volumes, run contracts and profile
settings never leave the local runtime. Every artifact is content-addressed and
old artifacts are never pruned.
"""

from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path

from src.data.license_policy import derived_publication_license
from src.replay.publication import assert_derived, canonical_bytes

from .contracts import CLAIMS

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "regimes-replay/1"
KINDS = ("snapshot", "timeline", "factors", "lineage", "history", "matrix")
PER_ASSET = {"snapshot", "timeline", "factors", "lineage", "history"}
PUBLIC_SOURCES = {"US-MKT": "ken-french:daily-factors", "IN-MKT": "iima:daily-factors"}
FROZEN_RESEARCH = "data/exports/research_os_v0_1/flagship.json"
PATH_SEMANTICS = "PARAMETER_RETROSPECTIVE"
FORBIDDEN_KEYS = {"settings", "contract", "smoothed", "predict_proba", "raw_values", "signals_raw"}
SNAPSHOT_KEYS = {
    "asset", "market", "series_label", "not_a", "country", "tier", "badges",
    "requested_as_of", "state_at", "stale_calendar_days", "observation_unit",
    "input_hash", "run_ids", "profile_sha256", "evidence_scope", "evidence_quality",
    "calendar", "module_statuses", "issues", "claims", "current", "volatility",
    "hmm", "coupling", "momentum", "factors", "fracture", "frozen_research",
    "layers",
}
LAYERS = {
    "current": "CURRENT STATE AT CUTOFF: PIT-valid for the admitted capture",
    "within_run": "WITHIN-RUN HISTORICAL PATH: PARAMETER_RETROSPECTIVE, filtered with parameters estimated through the cutoff",
    "sealed": "SEALED MULTI-CUTOFF TIMELINE: the as-known-at-each-run sequence of published snapshots",
}


def frozen_research():
    raw = (ROOT / FROZEN_RESEARCH).read_bytes()
    value = json.loads(raw)
    verdicts = _find_verdicts(value)
    return {
        "title": "FROZEN RESEARCH OS RESULT",
        "source": FROZEN_RESEARCH,
        "sha256": sha256(raw).hexdigest(),
        "verdicts": verdicts,
        "research_os": "NOT_CALIBRATED / CLOSED",
        "inference_replacement": "NOT_CONFIRMED",
        "note": "Phase 5 descriptive views never recompute or override these verdicts",
    }


def _find_verdicts(value):
    wanted = {"STATISTICAL", "ECONOMIC", "REGIME_DEPENDENCE", "CROSS_MARKET"}
    if isinstance(value, dict):
        if wanted <= set(value) and all(isinstance(value[k], str) for k in wanted):
            return {k: value[k] for k in sorted(wanted)}
        for child in value.values():
            found = _find_verdicts(child)
            if found:
                return found
    if isinstance(value, list):
        for child in value:
            found = _find_verdicts(child)
            if found:
                return found
    return None


def _pick(value, keys):
    return {k: value[k] for k in keys if k in value}


HMM_KEYS = (
    "n_states", "labels", "labelling_rule", "semantic_hash", "converged",
    "convergence_rule", "iterations", "log_likelihood", "transition_matrix",
    "expected_duration", "duration_unit", "transition_entropy", "occupancy",
    "occupancy_counts", "means_standardized", "covariances_standardized",
    "return_mean", "return_variance", "feature_units", "current_state",
    "current_posterior", "recent_switches", "switch_window", "mahalanobis_current",
    "ood_limit", "ood", "posterior_semantics", "path_semantics", "seed", "features",
    "rows", "config",
)


def _hmm(run):
    if run["status"] == "UNAVAILABLE":
        return {"status": "UNAVAILABLE", "reason": run.get("reason")}
    out = {"status": run["status"], **_pick(run["diagnostics"], HMM_KEYS)}
    tail = run["paths"].get("posterior_tail") or []
    out["posterior_tail"] = {"dates": [t[:10] for t, _ in tail], "rows": [p for _, p in tail]}
    return out


def project_snapshot(snapshot):
    runs = snapshot["runs"]
    vol, two, four = runs["volatility"], runs["hmm2"], runs["hmm4"]
    mom, fac = runs["momentum"], runs["factors"]
    annual = 252 if snapshot["observation_unit"] == "session" else None
    current_vol = dict(vol["current"])
    if annual and current_vol.get("realized_vol_20") is not None:
        current_vol["realized_vol_20_annualised"] = current_vol["realized_vol_20"] * annual**0.5
    vd = vol.get("diagnostics") or {}
    payload = {
        **_pick(snapshot, SNAPSHOT_KEYS),
        "current": {
            "regime": dict(two["current"]) if two["status"] != "UNAVAILABLE" else None,
            "volatility": current_vol,
            "hmm4": dict(four["current"]) if four["status"] != "UNAVAILABLE" else None,
            "momentum": dict(mom["current"]) if mom["status"] != "UNAVAILABLE" else None,
            "factors": dict(fac["current"]) if fac["status"] != "UNAVAILABLE" else None,
            "units": {
                "volatility": "per observation" + ("; annualised value shown separately with sqrt(252) on XNYS session evidence" if annual else "; no annualisation without an evidenced calendar"),
                "duration": two.get("diagnostics", {}).get("duration_unit"),
            },
        },
        "volatility": {
            "status": vol["status"],
            "garch": {k: v for k, v in (vd.get("garch") or {}).items() if k != "warnings"},
            "arch_lm": vd.get("arch_lm"),
            "components": vd.get("components"),
            "cluster_score": vd.get("cluster_score"),
            "cluster_contributions": vd.get("cluster_contributions"),
            "state_counts": vd.get("state_counts"),
            "descriptive_engine": vd.get("descriptive_engine"),
            "confidence_meaning": vd.get("confidence_meaning"),
        },
        "hmm": {"hmm2": _hmm(two), "hmm4": _hmm(four)},
        "coupling": {
            "volatility_run": vol["run_id"],
            "hmm2_run": two["run_id"],
            "bound_producer_runs": two["contract"]["lineage"]["producer_runs"],
            "semantics": "hmm2 receives realized_vol_20 only as a declared plugin-output input bound to the sealed volatility run",
        },
        "momentum": {
            "status": mom["status"],
            **_pick(
                mom.get("diagnostics") or {},
                ("definition", "index_label", "signal_by_state", "signal_by_state_semantics", "mom_factor_by_regime", "mom_factor_semantics", "verdicts"),
            ),
        },
        "factors": {
            "status": fac["status"],
            **_pick(fac.get("diagnostics") or {}, ("name", "target", "controls", "full_window", "by_state", "stability", "seven_factor", "decomposition", "rolling_semantics", "regime_states")),
        },
        "frozen_research": frozen_research(),
        "layers": LAYERS,
    }
    payload.pop("runs", None)
    return payload


def _codes(values, vocabulary):
    index = {v: i for i, v in enumerate(vocabulary)}
    return [index[v] for v in values]


def project_timeline(snapshot):
    runs = snapshot["runs"]
    vol, two, four, mom = runs["volatility"], runs["hmm2"], runs["hmm4"], runs["momentum"]
    out = {
        "asset": snapshot["asset"],
        "observation_unit": snapshot["observation_unit"],
        "path_semantics": PATH_SEMANTICS + ": filtered states with parameters estimated through the cutoff; not as-known-then",
        "posterior_semantics": "FILTERED_FORWARD_RECURSION",
        "run_ids": snapshot["run_ids"],
    }
    states = (vol.get("paths") or {}).get("states") or []
    vocabulary = sorted({s for _, s in states})
    out["volatility"] = {
        "dates": [t[:10] for t, _ in states],
        "state_codes": _codes([s for _, s in states], vocabulary),
        "states": vocabulary,
        "rv_20": [None if v is None else round(v, 8) for _, v in (vol.get("paths") or {}).get("rv_20", [])],
        "rv_unit": "per observation",
        "tail": (vol.get("paths") or {}).get("tail", []),
    }
    for key, run in (("hmm2", two), ("hmm4", four)):
        paths = run.get("paths") or {}
        series = paths.get("states") or []
        labels = (run.get("diagnostics") or {}).get("labels") or []
        out[key] = {
            "dates": [t[:10] for t, _ in series],
            "state_codes": _codes([s for _, s in series], labels) if labels else [],
            "labels": labels,
            "confidence": [round(c, 6) for _, c in paths.get("confidence") or []],
        }
    out["momentum_signal_tail"] = (mom.get("paths") or {}).get("signal_tail") or []
    return out


def project_factors(snapshot):
    fac = snapshot["runs"]["factors"]
    paths = fac.get("paths") or {}
    return {
        "asset": snapshot["asset"],
        "name": (fac.get("diagnostics") or {}).get("name"),
        "status": fac["status"],
        "rolling_tail": paths.get("rolling_tail") or [],
        "decomposition_tail": paths.get("decomposition_tail") or [],
        "semantics": "RAW vs FACTOR-EXPLAINED vs RESIDUAL; unit-notional arithmetic attribution; not compounded P&L or alpha",
    }


def _chain(chain):
    if chain["status"] != "VERIFIED":
        return {"status": "INVALID", "run_id": chain["run_id"], "reason": chain["reason"]}
    return {
        **_pick(chain, ("status", "run_id", "plugin", "plugin_version", "as_of", "state_at", "code_manifest_sha256", "data_hash", "lineage_digest", "profile_sha256", "windows")),
        "execution": _pick(chain.get("execution") or {}, ("commit", "dirty_computation", "dependency_manifest_hash")),
        "sources": [
            {
                **_pick(s, ("source", "source_url", "source_version_id", "capture_sha256", "captured_at", "clock_quality", "availability_rule", "licence_decision", "calendar", "field_definition", "unit", "feed_scope", "price_basis", "signals")),
                "admissions": sorted(s.get("admissions", [])),
            }
            for s in chain.get("sources", [])
        ],
        "producers": [_chain(p) for p in chain.get("producers", [])],
    }


def project_lineage(snapshot):
    return {
        "asset": snapshot["asset"],
        "question": "Why is this regime state available?",
        "chain": "output -> sealed run -> signal -> admission -> capture -> source version -> availability rule -> licence decision",
        "runs": {k: _chain(v) for k, v in snapshot["lineage"].items()},
        "source_values": "LOCAL_ONLY",
    }


def project_history(previous, snapshot, snapshot_identity):
    entries = list((previous or {}).get("entries", []))
    runs = snapshot["runs"]
    entry = {
        "as_of": snapshot["requested_as_of"],
        "state_at": snapshot["state_at"],
        "run_ids": snapshot["run_ids"],
        "hmm2_state": runs["hmm2"]["current"].get("hmm_state"),
        "hmm2_posterior": runs["hmm2"]["current"].get("hmm_posterior"),
        "volatility_state": runs["volatility"]["current"].get("volatility_state"),
        "momentum_sign": runs["momentum"]["current"].get("momentum_sign"),
        "evidence": snapshot["evidence_quality"]["weakest"],
        "snapshot_artifact": snapshot_identity,
    }
    if not any(e["run_ids"] == entry["run_ids"] for e in entries):
        entries.append(entry)
    return {
        "asset": snapshot["asset"],
        "semantics": LAYERS["sealed"],
        "entries": sorted(entries, key=lambda e: e["as_of"]),
    }


def validate_public(kind, payload, *, asset=None):
    if kind not in KINDS:
        raise ValueError("Unknown regimes publication kind")
    assert_derived(payload)
    text = json.dumps(payload, sort_keys=True)
    if "SYNTHETIC" in text or "synthetic" in text.lower().replace("synthetic test-only", ""):
        raise ValueError("Synthetic scope cannot enter public regimes Replay")

    def walk(value):
        if isinstance(value, dict):
            if FORBIDDEN_KEYS & set(value):
                raise ValueError("Raw contract/settings or smoothed field in public payload")
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(payload)
    if kind in PER_ASSET and payload.get("asset") not in PUBLIC_SOURCES:
        raise ValueError("Only PUBLIC market-factor rows are published")
    if kind == "snapshot":
        if set(payload) - SNAPSHOT_KEYS:
            raise ValueError("Undeclared snapshot field")
        if payload.get("tier") != "PUBLIC" or payload.get("evidence_scope") != "PUBLIC_DERIVED":
            raise ValueError("Local evidence cannot be published")
        if payload.get("claims") != CLAIMS:
            raise ValueError("Claim promotion")
        if payload["hmm"]["hmm2"].get("posterior_semantics") not in (None, "FILTERED_FORWARD_RECURSION"):
            raise ValueError("Only filtered posteriors may be published")
    if kind == "timeline":
        if not payload["path_semantics"].startswith(PATH_SEMANTICS) or payload["posterior_semantics"] != "FILTERED_FORWARD_RECURSION":
            raise ValueError("Timeline semantics must be filtered and parameter-retrospective")
    if kind == "matrix":
        for row in payload["rows"]:
            if row["tier"] != "PUBLIC" or row["asset"] not in PUBLIC_SOURCES:
                raise ValueError("Local rows cannot enter the public matrix")
    return True


def envelope(kind, payload, *, as_of, sources, input_hash):
    return {
        "schema_version": SCHEMA,
        "kind": kind,
        "as_of": as_of,
        "sources": sources,
        "input_hash": input_hash,
        "claims": dict(CLAIMS),
        "payload": payload,
    }


def publish(public, items, *, as_of):
    """items: list of (kind, asset_or_None, payload, sources, input_hash)."""
    from finsight.plugins.contracts import utc
    from src.replay.publication import ReplayPublisher

    public = Path(public)
    publisher = ReplayPublisher(public, as_of)
    pointer = public / "replay-manifest.json"
    publisher.manifest = json.loads(pointer.read_bytes())
    if utc(as_of) > utc(publisher.manifest["as_of"]):
        publisher.manifest["as_of"] = as_of
    entries = {}
    for kind, asset, payload, sources, input_hash in items:
        validate_public(kind, payload, asset=asset)
        grants = [derived_publication_license(s, None) for s in sources]
        if any(g["status"] != "ACTIVE" or "publish_derived" not in g["permitted_uses"] for g in grants):
            raise PermissionError("Derived-publication grant unavailable")
        value = envelope(kind, payload, as_of=as_of, sources=sources, input_hash=input_hash)
        raw = canonical_bytes(value)
        identity = "regimes:" + kind + ":" + sha256(raw).hexdigest()
        if identity not in publisher.manifest["artifacts"]:
            licence = grants[0] if len(grants) == 1 else {
                "status": "ACTIVE",
                "permitted_uses": ["publish_derived"],
                "dataset_key": "+".join(g["dataset_key"] for g in grants),
                "attribution": "; ".join(g["attribution"] for g in grants),
                "source_urls": sorted({u for g in grants for u in g.get("source_urls", [])}),
                "valid_through": None,
            }
            publisher.publish(
                identity,
                value,
                kind="regimes-" + kind,
                sources=sources,
                licence=licence,
                observed_at=as_of,
                available_at=as_of,
                input_hash=input_hash,
                scope="REAL_DERIVED_REGIMES",
                as_of=as_of,
            )
        entry = publisher.manifest["artifacts"][identity]
        if (public / entry["url"].lstrip("/")).read_bytes() != raw:
            raise ValueError("Immutable regimes publication substitution")
        route = "/regimes/" + kind + (f"?asset={asset}" if asset else "")
        publisher.manifest["routes"][route] = identity
        entries[(kind, asset)] = {"artifact_id": identity, **entry}
    staged = pointer.with_suffix(".json.tmp")
    staged.write_bytes(canonical_bytes(publisher.manifest))
    staged.replace(pointer)
    return entries
