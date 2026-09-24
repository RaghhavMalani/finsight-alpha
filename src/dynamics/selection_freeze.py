"""Independent integrity checks for Dynamics D0.2.1 freeze artifacts."""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Mapping


def canonical_sha256(payload: Mapping[str, Any]) -> str:
    """Hash JSON-compatible evidence with the canonical Dynamics encoding."""

    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def verify_selection_freeze(artifact: Mapping[str, Any]) -> dict[str, Any]:
    """Verify content addressing and the selection-funnel accounting."""

    errors: list[str] = []
    payload = dict(artifact)
    claimed_hash = payload.pop("artifact_hash", None)
    calculated_hash = canonical_sha256(payload)
    if claimed_hash != calculated_hash:
        errors.append("artifact_hash does not match the canonical payload")

    schema_version = artifact.get("schema_version")
    if schema_version != "dynamics-stat-arb/0.2.1":
        errors.append("schema_version is not dynamics-stat-arb/0.2.1")

    freeze = artifact.get("freeze")
    world = artifact.get("world")
    ledger = artifact.get("discovery_ledger")
    compression = artifact.get("candidate_compression")
    survival = artifact.get("search_survival_rate")
    screens = artifact.get("screening_ledger")
    pair_artifacts = artifact.get("pair_artifacts")
    mappings = {
        "freeze": freeze,
        "world": world,
        "discovery_ledger": ledger,
        "candidate_compression": compression,
        "search_survival_rate": survival,
    }
    for label, value in mappings.items():
        if not isinstance(value, Mapping):
            errors.append(f"{label} is missing or is not an object")
    if not isinstance(screens, list):
        errors.append("screening_ledger is missing or is not an array")
        screens = []
    if not isinstance(pair_artifacts, list):
        errors.append("pair_artifacts is missing or is not an array")
        pair_artifacts = []

    if isinstance(freeze, Mapping) and isinstance(world, Mapping) and isinstance(ledger, Mapping):
        if freeze.get("milestone") != "D0.2.1" or freeze.get("frozen") is not True:
            errors.append("freeze identity is not the frozen D0.2.1 checkpoint")
        if freeze.get("discovery_run_id") != ledger.get("discovery_run_id"):
            errors.append("freeze discovery_run_id does not match the discovery ledger")
        if freeze.get("pit_world_hash") != world.get("world_hash"):
            errors.append("freeze PIT world hash does not match the world")
        if ledger.get("world_hash") != world.get("world_hash"):
            errors.append("discovery ledger world hash does not match the world")

    required_screen_fields = {
        "pair_id",
        "engle_granger_statistic",
        "p_value",
        "adjusted_p_value",
        "selected",
    }
    for index, screen in enumerate(screens):
        if not isinstance(screen, Mapping) or not required_screen_fields <= screen.keys():
            errors.append(f"screening_ledger[{index}] omits required selection evidence")

    pairs_screened = len(screens)
    selected = sum(
        1 for screen in screens if isinstance(screen, Mapping) and screen.get("selected") is True
    )
    certified = sum(
        1
        for pair in pair_artifacts
        if isinstance(pair, Mapping) and pair.get("certified") is True
    )
    economic = sum(
        1
        for pair in pair_artifacts
        if isinstance(pair, Mapping)
        and isinstance(pair.get("ou_artifact"), Mapping)
        and pair["ou_artifact"].get("market_claim_eligible") is True
    )

    expected_compression = {
        "hypotheses_screened": pairs_screened,
        "multiple_testing_survivors": selected,
        "scientific_predictive_survivors": certified,
        "economic_survivors": economic,
        "notation": f"{pairs_screened} → {selected} → {certified} → {economic}",
    }
    if compression != expected_compression:
        errors.append("candidate_compression does not reconcile to retained evidence")

    expected_survival = {
        "economically_certified_hypotheses": economic,
        "hypotheses_screened": pairs_screened,
        "value": economic / pairs_screened if pairs_screened else 0.0,
        "fraction": f"{economic}/{pairs_screened}",
    }
    if not isinstance(survival, Mapping):
        pass
    elif (
        survival.get("economically_certified_hypotheses")
        != expected_survival["economically_certified_hypotheses"]
        or survival.get("hypotheses_screened") != expected_survival["hypotheses_screened"]
        or survival.get("fraction") != expected_survival["fraction"]
        or not isinstance(survival.get("value"), (int, float))
        or not math.isclose(
            float(survival["value"]),
            float(expected_survival["value"]),
            rel_tol=0.0,
            abs_tol=1e-15,
        )
    ):
        errors.append("search_survival_rate does not reconcile to retained evidence")

    if isinstance(ledger, Mapping):
        ledger_expected = {
            "pairs_screened": pairs_screened,
            "cointegrated_candidates": selected,
            "certified": certified,
            "economic_survivors": economic,
        }
        if any(ledger.get(key) != value for key, value in ledger_expected.items()):
            errors.append("discovery ledger does not reconcile to retained evidence")

    required_ou_fields = {
        "parameters",
        "falsification_checks",
        "baseline_scores",
        "scientific_verdict",
        "predictive_verdict",
        "economic_verdict",
        "market_claim_eligible",
    }
    for index, pair in enumerate(pair_artifacts):
        if not isinstance(pair, Mapping):
            errors.append(f"pair_artifacts[{index}] is not an object")
            continue
        if "execution_evidence" not in pair:
            errors.append(f"pair_artifacts[{index}] omits execution_evidence")
        hedge = pair.get("hedge_ratio")
        if not isinstance(hedge, Mapping) or hedge.get("frozen_before_holdout") is not True:
            errors.append(f"pair_artifacts[{index}] hedge ratio was not frozen")
        elif isinstance(ledger, Mapping) and hedge.get("fit_window") != ledger.get(
            "hedge_ratio_window"
        ):
            errors.append(f"pair_artifacts[{index}] hedge window does not match the ledger")

        holdout = pair.get("sealed_holdout")
        if not isinstance(holdout, Mapping):
            errors.append(f"pair_artifacts[{index}] omits the sealed holdout")
        else:
            commitment_body = dict(holdout)
            commitment_hash = commitment_body.pop("commitment_hash", None)
            expected_commitment = canonical_sha256(
                {
                    "pair_id": pair.get("pair_id"),
                    "world_hash": world.get("world_hash") if isinstance(world, Mapping) else None,
                    "sealed_holdout": commitment_body,
                }
            )
            if commitment_hash != expected_commitment:
                errors.append(f"pair_artifacts[{index}] sealed holdout commitment is invalid")
            window = holdout.get("window")
            values = holdout.get("values")
            observed_at = holdout.get("observed_at")
            available_at = holdout.get("available_at")
            if holdout.get("untouched_during_estimation") is not True:
                errors.append(f"pair_artifacts[{index}] holdout is not recorded as untouched")
            if isinstance(ledger, Mapping) and window != ledger.get("holdout_window"):
                errors.append(f"pair_artifacts[{index}] holdout window does not match the ledger")
            observations = window.get("observations") if isinstance(window, Mapping) else None
            if (
                not isinstance(values, list)
                or not isinstance(observed_at, list)
                or not isinstance(available_at, list)
                or observations != len(values)
                or len(observed_at) != len(values)
                or len(available_at) != len(values)
            ):
                errors.append(f"pair_artifacts[{index}] sealed holdout arrays are inconsistent")

        ou_artifact = pair.get("ou_artifact")
        if not isinstance(ou_artifact, Mapping) or not required_ou_fields <= ou_artifact.keys():
            errors.append(f"pair_artifacts[{index}] omits required OU certification evidence")

    return {
        "valid": not errors,
        "artifact_hash": claimed_hash,
        "calculated_hash": calculated_hash,
        "candidate_compression": (
            compression.get("notation") if isinstance(compression, Mapping) else None
        ),
        "search_survival_rate": (
            survival.get("fraction") if isinstance(survival, Mapping) else None
        ),
        "errors": errors,
    }
