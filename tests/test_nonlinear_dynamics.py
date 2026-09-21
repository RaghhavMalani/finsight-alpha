"""Deterministic D0.3 nonlinear dynamics and freeze-boundary tests."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest

from backend.main import app
from src.dynamics.nonlinear import (
    DEFAULT_PARENT_ARTIFACT,
    PARENT_ARTIFACT_HASH,
    PARENT_FILE_SHA256,
    NonlinearDynamicsError,
    fit_nonlinear_dynamics,
    generate_nonlinear_reference,
    load_frozen_stat_arb_survivor,
    run_nonlinear_certification_suite,
)


def test_d02_1_parent_is_byte_identical_and_internally_verified() -> None:
    raw = DEFAULT_PARENT_ARTIFACT.read_bytes()
    inherited = load_frozen_stat_arb_survivor()

    assert hashlib.sha256(raw).hexdigest() == PARENT_FILE_SHA256
    assert inherited["artifact"]["artifact_hash"] == PARENT_ARTIFACT_HASH
    assert inherited["verification"]["valid"] is True
    assert inherited["pair_id"] == "ANCHOR~PAIRED"
    assert inherited["train_end"] == 112
    assert len(inherited["values"]) == 156


def test_reference_reuses_exact_survivor_and_frozen_outer_split() -> None:
    first = generate_nonlinear_reference()
    second = generate_nonlinear_reference()

    assert first["artifact_hash"] == second["artifact_hash"]
    assert first["schema_version"] == "dynamics-nonlinear/0.3.0"
    assert first["parent"]["artifact_hash"] == PARENT_ARTIFACT_HASH
    assert first["parent"]["file_sha256"] == PARENT_FILE_SHA256
    assert first["parent"]["discovery_rerun"] is False
    assert first["parent"]["reuse_policy"] == (
        "exact frozen survivor; no pair rediscovery"
    )
    assert first["experiment"]["pair_id"] == "ANCHOR~PAIRED"
    assert first["experiment"]["evidence_class"] == (
        "controlled-synthetic continuation"
    )
    assert first["world"]["source"] == "controlled-synthetic-stat-arb"
    assert first["split"]["train_observations"] == 112
    assert first["split"]["sealed_holdout_observations"] == 44
    assert first["split"]["sealed_holdout"][
        "untouched_during_complexity_selection"
    ] is True
    monitor = first["dynamical_stability_monitor"]
    assert monitor["name"] == "Dynamical Stability Monitor"
    assert "not a crash predictor" in monitor["claim_boundary"]
    assert monitor["model"] == first["verdicts"]["selected_model"]
    assert len(monitor["windows"]) == 5
    assert all(window["end_index"] <= 112 for window in monitor["windows"])
    assert {
        "certified_state_count",
        "state_count_change",
        "restoring_strength_weakening",
        "barrier_shrinking",
        "status",
    } <= monitor["trend"].keys()


def test_nested_models_and_effective_potential_are_explicit() -> None:
    payload = generate_nonlinear_reference()

    assert [model["code"] for model in payload["models"]] == [
        "M0",
        "M1",
        "M2",
        "M3",
    ]
    assert "g(x)^(-2)" in payload["theory"]["stationary_density"]
    assert "2log g(x)" in payload["theory"]["effective_potential"]
    assert "distinct" in payload["theory"]["warning"]
    for code in ("M2", "M3"):
        ledger = payload["complexity_selection"][code]
        assert ledger["selected_before_outer_holdout"] is True
        assert (
            ledger["selection_boundary_index"]
            < ledger["outer_holdout_start_index"]
            == 112
        )
        assert len(ledger["candidate_table"]) == 12
    assert all(
        point["diffusion"] > 0.0 for point in payload["fields"]["M3"]["points"]
    )


def test_fixed_points_are_fail_closed_for_display() -> None:
    payload = generate_nonlinear_reference()

    for code in ("M1", "M2", "M3"):
        for point in payload["fields"][code]["fixed_points"]:
            if point["certified_for_display"]:
                assert point["stable"] is True
                assert point["bootstrap_root_support"] >= 0.80
                assert point["bootstrap_stable_support"] >= 0.80
                assert point["local_transition_support"] >= 8
                assert point["status"] == "CERTIFIED"
            else:
                assert point["status"] == "WITHHELD"


def test_reference_fails_closed_and_keeps_economics_behind_reality_ladder() -> None:
    payload = generate_nonlinear_reference()

    assert payload["verdicts"]["selected_model"] == "M1"
    assert payload["verdicts"]["nonlinear_dynamics"] == "REJECT"
    assert payload["verdicts"]["economic"] == "ABSTAIN"
    assert payload["verdicts"]["market_claim"] == "ABSTAIN"
    assert payload["promotion"]["M2"]["fail_closed"] is True
    assert payload["promotion"]["M3"]["fail_closed"] is True
    assert any(
        stage["status"] == "NOT_MEASURED"
        for stage in payload["execution"]["reality_ladder"]
    )


def test_irregular_times_are_used_and_future_availability_is_rejected() -> None:
    inherited = load_frozen_stat_arb_survivor()
    artifact = fit_nonlinear_dynamics(
        inherited["values"],
        observable="frozen spread",
        observed_at=inherited["observed_at"],
        available_at=inherited["available_at"],
        as_of=inherited["available_at"][-1],
        sealed_holdout_start=112,
        bootstrap_repetitions=8,
    )
    assert artifact["world"]["unique_delta_times"] > 1
    assert artifact["world"]["irregular_time_used"] is True

    future = list(inherited["available_at"])
    future[-1] = future[-1] + timedelta(days=1)
    with pytest.raises(NonlinearDynamicsError, match="unavailable"):
        fit_nonlinear_dynamics(
            inherited["values"],
            observable="future leak",
            observed_at=inherited["observed_at"],
            available_at=future,
            as_of=inherited["available_at"][-1],
            sealed_holdout_start=112,
            bootstrap_repetitions=8,
        )


def test_artifact_is_content_addressed() -> None:
    payload = generate_nonlinear_reference()
    body = {key: value for key, value in payload.items() if key != "artifact_hash"}
    expected = hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    assert payload["artifact_hash"] == expected


def test_control_suite_exposes_measured_required_rates() -> None:
    suite = run_nonlinear_certification_suite(repetitions=1)
    metrics = suite["metrics"]

    assert suite["control_worlds"] == 11
    assert suite["runs"] == 11
    assert len(suite["cases"]) == 11
    assert {
        "theory_class_accuracy",
        "false_nonlinear_discovery_rate",
        "false_nonlinear_non_discovery_rate",
        "false_basin_discovery_rate",
        "economic_abstention_rate_without_execution_evidence",
        "nonlinear_oos_dominance_rate",
    } <= metrics.keys()
    assert all(0.0 <= float(value) <= 1.0 for value in metrics.values())
    assert metrics["economic_abstention_rate_without_execution_evidence"] == 1.0


def test_http_surface_exposes_d03_contracts() -> None:
    paths = app.openapi()["paths"]

    assert "/dynamics/fit/nonlinear" in paths
    assert "/dynamics/experiments/reference-nonlinear" in paths
    assert "/dynamics/certification/nonlinear" in paths
