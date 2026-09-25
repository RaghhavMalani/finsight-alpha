from __future__ import annotations

import copy
import json
import math

from src.dynamics.hawkes_certification import (
    DEFAULT_D04_ARTIFACT,
    exact_hawkes_log_likelihood,
    simulate_exponential_hawkes,
)
from src.dynamics.hawkes_verifier import verify_hawkes_certification
from src.dynamics.selection_freeze import canonical_sha256


def _artifact() -> dict:
    return json.loads(DEFAULT_D04_ARTIFACT.read_text(encoding="utf-8"))


def _rehash(artifact: dict) -> dict:
    payload = copy.deepcopy(artifact)
    payload.pop("artifact_hash", None)
    payload["artifact_hash"] = canonical_sha256(payload)
    return payload


def test_frozen_hawkes_artifact_verifies_and_preserves_claim_boundaries() -> None:
    artifact = _artifact()
    report = verify_hawkes_certification(artifact)

    assert report["valid"], report["errors"]
    assert report["worlds"] == 12
    assert report["program_result"] == "PARTIALLY_CHARACTERIZED"
    assert artifact["causal_claim_eligible"] is False
    assert artifact["market_claim_eligible"] is False
    assert artifact["program_result"]["scalar_score"] is None
    assert artifact["nonlinear_program_boundary"] == {
        "tag": "dynamics-v0.3.4",
        "commit": "fef3d212c86716d33d9041cb014b757cd5574e19",
        "status": "PARTIALLY_CHARACTERIZED",
        "artifacts_regenerated": False,
    }


def test_world_suite_rejects_confounders_and_detects_strong_controls() -> None:
    artifact = _artifact()
    decisions = {
        row["world"]["world_id"]: row["decision"] for row in artifact["worlds"]
    }

    assert decisions["homogeneous_poisson"] == "REJECT"
    assert decisions["seasonal_poisson"] == "REJECT"
    assert decisions["clustered_renewal"] == "REJECT"
    assert decisions["exogenous_bursts"] == "REJECT"
    assert decisions["independent_streams"] == "REJECT"
    assert decisions["common_shock"] == "ABSTAIN"
    assert decisions["moderate_hawkes"] == "DETECT"
    assert decisions["near_critical_hawkes"] == "DETECT"
    assert decisions["directed_cross_excitation"] == "DETECT"
    assert decisions["bidirectional_excitation"] == "DETECT"


def test_metric_vector_records_strengths_and_unresolved_structure() -> None:
    metrics = {row["metric"]: row["estimate"] for row in _artifact()["metrics"]}

    assert metrics["false_excitation_discovery_rate"] == 0.0
    assert metrics["true_excitation_detection_rate"] == 0.8
    assert metrics["cross_excitation_precision"] == 1.0
    assert metrics["cross_excitation_recall"] == 0.6666666667
    assert metrics["branching_ratio_ci_coverage"] == 0.3333333333
    assert metrics["direction_recovery_accuracy"] == 0.5
    assert metrics["seasonality_confounding_rate"] == 0.0
    assert metrics["common_shock_confounding_rate"] == 0.0
    assert metrics["numerical_failure_rate"] == 0.0


def test_exact_event_time_likelihood_matches_closed_form_poisson_case() -> None:
    events = [[0.5, 1.5, 2.5]]
    likelihood = exact_hawkes_log_likelihood(
        events,
        [2.0],
        [[0.0]],
        [[1.0]],
        start=0.0,
        end=3.0,
    )

    assert math.isclose(likelihood, 3.0 * math.log(2.0) - 6.0)


def test_hawkes_simulator_is_deterministic_and_continuous_time() -> None:
    first = simulate_exponential_hawkes(
        baseline=[0.9, 0.8],
        alpha=[[0.1, 0.0], [0.4, 0.1]],
        beta=[[1.5, 1.5], [1.5, 1.5]],
        horizon=20.0,
        seed=812,
    )
    second = simulate_exponential_hawkes(
        baseline=[0.9, 0.8],
        alpha=[[0.1, 0.0], [0.4, 0.1]],
        beta=[[1.5, 1.5], [1.5, 1.5]],
        horizon=20.0,
        seed=812,
    )

    assert first == second
    assert all(stream == sorted(stream) for stream in first)
    assert all(0.0 <= event < 20.0 for stream in first for event in stream)


def test_verifier_rejects_rehashed_timestamp_and_stability_tampering() -> None:
    artifact = _artifact()
    timestamp_tamper = copy.deepcopy(artifact)
    timestamp_tamper["worlds"][0]["world"]["event_times"][0][0] += 0.01
    timestamp_report = verify_hawkes_certification(_rehash(timestamp_tamper))
    assert not timestamp_report["valid"]
    assert any(
        "world hash does not reconcile" in error for error in timestamp_report["errors"]
    )

    stability_tamper = copy.deepcopy(artifact)
    stability_tamper["worlds"][3]["fit"]["spectral_radius"] = 0.99
    stability_report = verify_hawkes_certification(_rehash(stability_tamper))
    assert not stability_report["valid"]
    assert any("spectral radius" in error for error in stability_report["errors"])


def test_verifier_rejects_rehashed_baseline_and_metric_tampering() -> None:
    artifact = _artifact()
    baseline_tamper = copy.deepcopy(artifact)
    baseline_tamper["worlds"][3]["baselines"][0]["oos_log_likelihood"] += 1.0
    baseline_report = verify_hawkes_certification(_rehash(baseline_tamper))
    assert not baseline_report["valid"]
    assert any(
        "baseline OOS likelihood does not reconcile" in error
        for error in baseline_report["errors"]
    )

    metric_tamper = copy.deepcopy(artifact)
    metric_tamper["metrics"][0]["estimate"] = 0.5
    metric_report = verify_hawkes_certification(_rehash(metric_tamper))
    assert not metric_report["valid"]
    assert any(
        "metric estimate does not reconcile" in error
        for error in metric_report["errors"]
    )


def test_every_world_retains_event_times_boundaries_parameters_and_diagnostics() -> (
    None
):
    for row in _artifact()["worlds"]:
        world = row["world"]
        fit = row["fit"]
        diagnostics = row["diagnostics"]
        assert world["event_times"]
        assert (
            world["observation_window"]["left_censoring"]
            == "OBSERVATION_START_RECORDED"
        )
        assert (
            world["observation_window"]["right_censoring"] == "OBSERVATION_END_RECORDED"
        )
        assert fit["baseline"] and fit["alpha"] and fit["beta"]
        assert fit["branching_matrix"]
        assert "spectral_radius" in fit
        assert fit["optimizer"]["method"] == "L-BFGS-B deterministic multi-start"
        assert fit["parameter_uncertainty"]["repetitions"] == 64
        assert diagnostics["transformed_intervals"]
        assert diagnostics["falsification_register"]
        assert row["causal_claim_eligible"] is False
        assert row["market_claim_eligible"] is False
