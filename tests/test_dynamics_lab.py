"""Deterministic tests for the Dynamics Lab D0.1 theory contract."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from backend.main import app
from backend.routes.dynamics import (
    DynamicsObservation,
    OUFitRequest,
    ou_certification_suite,
    ou_power_map,
    reference_ou_experiment,
    reference_stat_arb_experiment,
)
from src.dynamics import (
    HypothesisLedger,
    MarketTheory,
    OUTheory,
    certify_ou,
    generate_exact_ou,
    verify_selection_freeze,
)


def _irregular_clock(observations: int = 180) -> tuple[list[float], list[datetime]]:
    pattern = (0.25, 0.5, 1.0, 1.75, 3.0, 0.75, 2.0)
    deltas = [pattern[index % len(pattern)] for index in range(observations - 1)]
    timestamps = [datetime(2025, 1, 2, 21, 0, tzinfo=timezone.utc)]
    for delta_time in deltas:
        timestamps.append(timestamps[-1] + timedelta(days=delta_time))
    return deltas, timestamps


def test_ou_implements_framework_neutral_market_theory_protocol() -> None:
    theory = OUTheory()

    assert isinstance(theory, MarketTheory)
    assert all(callable(getattr(theory, method)) for method in ("fit", "forecast", "score", "falsify", "compare"))


def test_exact_irregular_ou_recovers_parameters_and_emits_core_artifact() -> None:
    deltas, timestamps = _irregular_clock()
    artifact = certify_ou(
        generate_exact_ou(deltas, theta=0.18, mu=0.0, sigma=0.24, seed=212),
        observable="synthetic residual",
        observed_at=timestamps,
        available_at=timestamps,
        as_of=timestamps[-1],
    )
    payload = artifact.to_dict()

    assert artifact.parameters["theta"] == pytest.approx(0.18, abs=0.05)
    assert artifact.parameters["mu"] == pytest.approx(0.0, abs=0.05)
    assert artifact.parameters["sigma"] == pytest.approx(0.24, abs=0.04)
    assert artifact.parameter_uncertainty["half_life"]["ci_low"] is not None
    assert artifact.scientific_verdict.value == "ACCEPT"
    assert artifact.predictive_verdict.value == "ACCEPT"
    assert artifact.economic_verdict.value == "ABSTAIN"
    assert artifact.final_market_claim.value == "ABSTAIN"
    assert artifact.market_claim_eligible is False
    assert {entry.theory for entry in artifact.baseline_scores} == {
        "Random walk",
        "Persistence",
        "Historical mean",
        "AR(1)",
        "Rolling z-score",
    }
    assert payload["world_hash"]
    assert payload["train_window"]["end_index"] == payload["holdout_window"]["start_index"]
    irregular_check = next(
        check for check in artifact.falsification_checks if check.code == "irregular_time_transition"
    )
    assert irregular_check.details["irregular"] is True


def test_unadjusted_hypothesis_search_cannot_be_scientifically_accepted() -> None:
    deltas, timestamps = _irregular_clock()
    artifact = certify_ou(
        generate_exact_ou(deltas, seed=212),
        observed_at=timestamps,
        available_at=timestamps,
        as_of=timestamps[-1],
        hypothesis_ledger=HypothesisLedger(
            hypotheses_considered=24,
            selection_procedure="searched parameter families",
            selection_timestamp=timestamps[0],
            selection_metric="holdout RMSE",
            holdout_untouched=True,
        ),
    )

    assert artifact.scientific_verdict.value == "ABSTAIN"
    check = next(item for item in artifact.falsification_checks if item.code == "multiple_testing")
    assert check.status.value == "NOT_MEASURED"


def test_point_in_time_contract_rejects_future_availability() -> None:
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    observations = [
        DynamicsObservation(
            value=float(index),
            observed_at=start + timedelta(days=index),
            available_at=start + timedelta(days=index, hours=1),
        )
        for index in range(64)
    ]

    with pytest.raises(ValidationError, match="not available"):
        OUFitRequest(
            experiment_name="future leak",
            observable="residual",
            as_of=observations[-2].available_at,
            observations=observations,
        )


def test_reference_experiment_has_three_verdicts_and_is_reproducible() -> None:
    first = reference_ou_experiment()
    second = reference_ou_experiment()

    assert first["artifact_hash"] == second["artifact_hash"]
    assert first["scientific_verdict"] == "ACCEPT"
    assert first["predictive_verdict"] == "ACCEPT"
    assert first["economic_verdict"] == "ABSTAIN"
    assert first["final_market_claim"] == "ABSTAIN"
    assert first["market_claim_eligible"] is False
    assert first["world"]["point_in_time_enforced"] is True
    assert len(first["series"]) == 180


def test_frozen_suite_reports_zero_false_accepts_and_expected_failures() -> None:
    suite = ou_certification_suite()

    assert suite["frozen"] is True
    assert suite["headline"] == {
        "theory_false_accept_rate": 0.0,
        "false_accepts": 0,
        "negative_controls": 8,
        "theory_true_accept_rate": 1.0,
        "true_accepts": 2,
        "positive_controls": 2,
        "theory_abstention_rate": 0.0,
        "abstentions": 0,
        "total_controls": 10,
        "theory_false_reject_rate": 0.0,
        "false_rejects": 0,
    }
    assert all(task["correct"] for task in suite["tasks"])
    assert any("residual_distribution" in task["killed_by"] for task in suite["tasks"])
    assert any("structural_stability" in task["killed_by"] for task in suite["tasks"])
    assert any("theta_positive" in task["killed_by"] for task in suite["tasks"])


def test_http_surface_exposes_reference_and_certification_contracts() -> None:
    paths = app.openapi()["paths"]

    assert "/dynamics/experiments/reference-ou" in paths
    assert "/dynamics/certification/ou" in paths
    assert "/dynamics/fit/ou" in paths
    assert "/dynamics/stat-arb/search" in paths
    assert "/dynamics/experiments/reference-stat-arb" in paths
    assert "/dynamics/power/ou" in paths


def test_reference_stat_arb_search_remembers_the_full_hypothesis_family() -> None:
    result = reference_stat_arb_experiment()
    assert verify_selection_freeze(result)["valid"] is True
    ledger = result["discovery_ledger"]

    assert result["schema_version"] == "dynamics-stat-arb/0.2.1"
    assert ledger["eligible_securities"] == 8
    assert ledger["candidate_pairs"] == 28
    assert ledger["pairs_screened"] == 28
    assert ledger["cointegrated_candidates"] == 1
    assert ledger["ou_fits_completed"] == 1
    assert ledger["certified"] == 1
    assert ledger["economic_survivors"] == 0
    assert len(result["screening_ledger"]) == 28
    assert sum(bool(candidate["selected"]) for candidate in result["screening_ledger"]) == 1

    survivor = result["pair_artifacts"][0]
    ou_artifact = survivor["ou_artifact"]
    assert survivor["pair_id"] == "ANCHOR~PAIRED"
    assert survivor["hedge_ratio"]["frozen_before_holdout"] is True
    assert survivor["certified"] is True
    assert ou_artifact["hypothesis_ledger"]["hypotheses_considered"] == 28
    assert ou_artifact["hypothesis_ledger"]["multiplicity_adjustment"].startswith(
        "Benjamini-Hochberg"
    )
    multiplicity = next(
        check for check in ou_artifact["falsification_checks"] if check["code"] == "multiple_testing"
    )
    assert multiplicity["status"] == "PASS"
    assert ou_artifact["scientific_verdict"] == "ACCEPT"
    assert ou_artifact["predictive_verdict"] == "ACCEPT"
    assert ou_artifact["economic_verdict"] == "ABSTAIN"
    assert result["economic_verdict"] == "ABSTAIN"

    artifact_body = {key: value for key, value in result.items() if key != "artifact_hash"}
    expected_hash = hashlib.sha256(
        json.dumps(artifact_body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    assert result["artifact_hash"] == expected_hash
    assert result["freeze"] == {
        "milestone": "D0.2.1",
        "frozen": True,
        "content_addressing": "SHA-256 over canonical JSON excluding artifact_hash",
        "discovery_run_id": ledger["discovery_run_id"],
        "pit_world_hash": result["world"]["world_hash"],
    }
    assert result["candidate_compression"] == {
        "hypotheses_screened": 28,
        "multiple_testing_survivors": 1,
        "scientific_predictive_survivors": 1,
        "economic_survivors": 0,
        "notation": "28 → 1 → 1 → 0",
    }
    assert result["search_survival_rate"] == {
        "economically_certified_hypotheses": 0,
        "hypotheses_screened": 28,
        "value": 0.0,
        "fraction": "0/28",
    }
    assert all(
        {"pair_id", "engle_granger_statistic", "p_value", "adjusted_p_value"}
        <= candidate.keys()
        for candidate in result["screening_ledger"]
    )

    sealed_holdout = survivor["sealed_holdout"]
    assert sealed_holdout["window"] == ledger["holdout_window"]
    assert sealed_holdout["untouched_during_estimation"] is True
    assert len(sealed_holdout["values"]) == ledger["holdout_window"]["observations"]
    holdout_body = dict(sealed_holdout)
    commitment_hash = holdout_body.pop("commitment_hash")
    expected_commitment = hashlib.sha256(
        json.dumps(
            {
                "pair_id": survivor["pair_id"],
                "world_hash": result["world"]["world_hash"],
                "sealed_holdout": holdout_body,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    assert commitment_hash == expected_commitment
    assert survivor["execution_evidence"] is None
    assert {
        "parameters",
        "falsification_checks",
        "baseline_scores",
        "scientific_verdict",
        "predictive_verdict",
        "economic_verdict",
        "market_claim_eligible",
    } <= ou_artifact.keys()


def test_pilot_power_map_exposes_all_six_axes_and_decision_probabilities() -> None:
    result = ou_power_map(repetitions=2)

    assert result["schema_version"] == "dynamics-power/0.2.0"
    assert result["axes"] == [
        "theta",
        "sigma",
        "observations",
        "delta_time",
        "measurement_noise",
        "break_magnitude",
    ]
    assert len(result["cells"]) == 12
    assert {cell["expected"] for cell in result["cells"]} == {"ACCEPT", "REJECT"}
    for cell in result["cells"]:
        probabilities = (
            cell["acceptance_probability"],
            cell["rejection_probability"],
            cell["abstention_probability"],
        )
        assert sum(probabilities) == pytest.approx(1.0)
        assert 0.0 <= cell["correct_certification_probability"] <= 1.0
