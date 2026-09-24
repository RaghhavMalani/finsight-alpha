"""D0.3.1 nonlinear power and identifiability boundary tests."""

from __future__ import annotations

import hashlib

from src.dynamics.identifiability import (
    DEFAULT_D03_ARTIFACT,
    ESTIMATOR_SOURCE,
    run_nonlinear_identifiability_suite,
    verify_identifiability_artifact,
)


def _suite() -> dict[str, object]:
    return run_nonlinear_identifiability_suite(1, "smoke")


def test_estimator_and_parent_are_pinned_before_power_measurement() -> None:
    suite = _suite()
    protocol = suite["estimator_protocol"]

    assert protocol["immutable"] is True
    assert protocol["milestone"] == "D0.3"
    assert protocol["hierarchy"] == ["M0", "M1", "M2", "M3"]
    assert protocol["source_sha256"] == hashlib.sha256(
        ESTIMATOR_SOURCE.read_bytes()
    ).hexdigest()
    assert protocol["parent_file_sha256"] == hashlib.sha256(
        DEFAULT_D03_ARTIFACT.read_bytes()
    ).hexdigest()


def test_frontiers_measure_detection_without_tuning() -> None:
    suite = _suite()

    assert suite["schema_version"] == "dynamics-identifiability/0.3.1"
    assert suite["profile"] == "smoke"
    assert suite["runs"] == suite["cells"] == 11
    assert suite["power_threshold"] == 0.80
    assert suite["frontiers"]["nonlinear_drift"]
    assert suite["frontiers"]["state_dependent_diffusion"]
    assert "estimator tuning" in suite["excluded_scope"]
    for frontier in suite["frontiers"]["nonlinear_drift"]:
        assert 0.0 <= frontier["correct_selection_probability"] <= 1.0
        assert frontier["identifiability"] in {
            "HIGH",
            "MEDIUM",
            "LOW",
            "UNRESOLVED",
        }


def test_truth_reconstruction_and_topology_are_scored() -> None:
    suite = _suite()
    nonlinear = [
        case
        for case in suite["cases"]
        if case["truth"]["expected_model"] in {"M2", "M3"}
    ]
    double_well = next(case for case in suite["cases"] if case["family"] == "double_well")

    assert all(
        case["inference"]["drift_reconstruction_error"] is not None
        for case in nonlinear
    )
    assert all(
        case["inference"]["diffusion_reconstruction_error"] is not None
        for case in nonlinear
    )
    assert double_well["truth"]["stable_points"] == [-1.0, 1.0]
    assert double_well["truth"]["unstable_points"] == [0.0]
    assert double_well["inference"]["topology_evaluated"] is True
    card = suite["capability_card"]
    assert 0.0 <= card["basin_precision"] <= 1.0
    assert 0.0 <= card["basin_recall"] <= 1.0
    assert 0.0 <= card["potential_topology_accuracy"] <= 1.0


def test_real_candidate_is_contextualized_by_measured_power() -> None:
    context = _suite()["real_market_context"]

    assert context["pair_id"] == "ANCHOR~PAIRED"
    assert context["d03_selected_model"] == "M1"
    assert context["identifiability"] in {"LOW", "MEDIUM", "HIGH"}
    assert "not evidence" in context["claim"]


def test_artifact_is_content_addressed_and_economics_fail_closed() -> None:
    suite = _suite()
    verification = verify_identifiability_artifact(suite)

    assert verification["valid"] is True
    assert verification["errors"] == []
    assert all(
        case["inference"]["economic_verdict"] == "ABSTAIN"
        for case in suite["cases"]
    )
