"""Module 8: cross-market regime matrix composed from sealed snapshots only.

Rows keep their own state_at and evidence. Nothing is forward-filled to make the
matrix rectangular; a missing module is a PARTIAL/UNAVAILABLE cell, never zero.
Summaries are descriptive: no transmission, prediction or causal reading.
"""

from itertools import combinations

import numpy as np

SEMANTICS = (
    "Descriptive cross-market comparison. Each row is evaluated at its own state_at; "
    "historical agreement uses only dates present in both series. No forward fill, "
    "no transmission, prediction or causal claim."
)


def _cell(value, status, *, reason=None, run_id=None, detail=None):
    return {"value": value, "status": status, "reason": reason, "run_id": run_id, "detail": detail}


def _vol_stress(vol):
    tail = (vol.get("paths") or {}).get("tail") or []
    z = tail[-1].get("vol_z") if tail else None
    return None if z is None else min(max((z + 2) / 6, 0.0), 1.0)


def row(snapshot):
    runs, modules = snapshot["runs"], snapshot["module_statuses"]
    vol, two, mom, fac = runs["volatility"], runs["hmm2"], runs["momentum"], runs["factors"]

    def status(name):
        return modules[name]["status"]

    stress = _vol_stress(vol)
    return {
        "asset": snapshot["asset"],
        "market": snapshot["market"],
        "series_label": snapshot["series_label"],
        "tier": snapshot["tier"],
        "state_at": snapshot["state_at"],
        "observation_unit": snapshot["observation_unit"],
        "badges": snapshot["badges"],
        "cells": {
            "current_state": _cell(
                two["current"]["hmm_state"], status("hmm"), reason=modules["hmm"]["reason"], run_id=two["run_id"]
            ),
            "volatility_stress": _cell(
                stress,
                status("volatility"),
                reason=modules["volatility"]["reason"],
                run_id=vol["run_id"],
                detail={"volatility_state": vol["current"]["volatility_state"], "mapping": "clip((vol_z + 2) / 6, 0, 1), frozen D0.4.2 V"},
            ),
            "hmm_confidence": _cell(
                two["current"]["hmm_posterior"], status("hmm"), reason=modules["hmm"]["reason"], run_id=two["run_id"]
            ),
            "momentum_state": _cell(
                mom["current"]["momentum_sign"],
                status("momentum"),
                reason=modules["momentum"]["reason"],
                run_id=mom["run_id"],
                detail={"signal": mom["current"]["momentum_signal"], "definition": "12-1 market-factor signal"},
            ),
            "factor_exposure": _cell(
                fac["current"]["mom_mkt_beta"],
                status("factors"),
                reason=modules["factors"]["reason"],
                run_id=fac["run_id"],
                detail={"neutrality": fac["current"]["neutrality"], "meaning": "MOM factor beta on MKT (partial set); an exposure, not measured crowding"},
            ),
            "event_pressure": _cell(None, "UNAVAILABLE", reason=modules["events"]["reason"]),
            "data_quality": _cell(
                sum(i["severity"] in {"MEDIUM", "HIGH"} for i in snapshot["issues"]),
                "AVAILABLE",
                detail={"open_issue_kinds": sorted({i["kind"] for i in snapshot["issues"]})},
            ),
            "evidence_quality": _cell(snapshot["evidence_quality"]["weakest"], "AVAILABLE", detail=snapshot["evidence_quality"]),
        },
        "paths": {
            "hmm2_states": (two.get("paths") or {}).get("states") or [],
            "rv_20": [r.get("rv_20") for r in (vol.get("paths") or {}).get("tail", [])],
        },
    }


def _transitions(states):
    last = None
    for stamp, label in reversed(states):
        if last is None:
            last = label
        elif label != last:
            return stamp
    return None


def build(snapshots):
    rows = [row(s) for s in snapshots]
    pairs, history = [], []
    for a, b in combinations(rows, 2):
        sa, sb = a["cells"]["current_state"], b["cells"]["current_state"]
        both = sa["status"] != "UNAVAILABLE" and sb["status"] != "UNAVAILABLE"
        from .service import _days

        pairs.append(
            {
                "pair": [a["asset"], b["asset"]],
                "same_state": (sa["value"] == sb["value"]) if both else None,
                "state_at": [a["state_at"], b["state_at"]],
                "state_at_gap_days": abs(_days(a["state_at"], b["state_at"])) if a["state_at"] and b["state_at"] else None,
                "volatility_stress_gap": (
                    abs(a["cells"]["volatility_stress"]["value"] - b["cells"]["volatility_stress"]["value"])
                    if a["cells"]["volatility_stress"]["value"] is not None
                    and b["cells"]["volatility_stress"]["value"] is not None
                    else None
                ),
            }
        )
        left = {t[:10]: s for t, s in a["paths"]["hmm2_states"]}
        right = {t[:10]: s for t, s in b["paths"]["hmm2_states"]}
        common = sorted(set(left) & set(right))
        history.append(
            {
                "pair": [a["asset"], b["asset"]],
                "overlapping_dates": len(common),
                "agreement_share": float(np.mean([left[d] == right[d] for d in common])) if common else None,
                "first_overlap": common[0] if common else None,
                "last_overlap": common[-1] if common else None,
                "method": "Inner join on observation dates; no fill; parameter-retrospective filtered states of each run",
            }
        )
    stresses = [r["cells"]["volatility_stress"]["value"] for r in rows if r["cells"]["volatility_stress"]["value"] is not None]
    rotation = sorted(
        (
            {"asset": r["asset"], "last_state_change": _transitions(r["paths"]["hmm2_states"]), "state": r["cells"]["current_state"]["value"]}
            for r in rows
        ),
        key=lambda item: item["last_state_change"] or "",
    )
    for r in rows:
        r.pop("paths")
    return {
        "rows": rows,
        "summaries": {
            "state_agreement": pairs,
            "historical_agreement": history,
            "volatility_dispersion": float(np.std(stresses, ddof=1)) if len(stresses) >= 2 else None,
            "rotation_observations": rotation,
        },
        "semantics": SEMANTICS,
    }
