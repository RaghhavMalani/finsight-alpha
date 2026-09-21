"""D0.3.2.1 oracle ceiling and failure-decomposition tests."""

from __future__ import annotations

from src.dynamics.estimator_tournament import ESTIMATOR_IDS
from src.dynamics.failure_decomposition import (
    D032_ARTIFACT_HASH,
    D032_FILE_SHA256,
    _evaluate_case,
    _load_parent,
    load_frozen_failure_decomposition,
    run_failure_decomposition,
    verify_failure_decomposition,
)
from src.dynamics.identifiability import _reference_specs


def _smoke() -> dict[str, object]:
    return run_failure_decomposition(20, 4)


def test_oracle_receives_family_support_but_not_true_parameters() -> None:
    artifact = _smoke()

    assert artifact["parent"]["artifact_hash"] == D032_ARTIFACT_HASH
    assert artifact["parent"]["file_sha256"] == D032_FILE_SHA256
    assert artifact["protocol"]["true_parameters_supplied"] is False
    assert artifact["evaluation"]["aggregate_winner_score"] is None
    assert artifact["evaluation"]["worlds"] == 20
    for case in artifact["cases"]:
        oracle = case["oracle"]
        assert oracle is not None
        assert oracle["candidate_families_only"] is True
        assert oracle["true_parameters_supplied"] is False
        assert oracle["sealed_holdout_observations"] > 0


def test_power_gap_information_and_term_stability_are_exposed() -> None:
    artifact = _smoke()
    nonlinear = next(
        row for row in artifact["oracle_power_surface"] if row["family"] == "cubic"
    )

    assert nonlinear["classification"] in {
        "DATA_LIMITED",
        "ESTIMATOR_LIMITED",
        "IDENTIFIABLE",
    }
    assert set(nonlinear["practical_power"]) == set(ESTIMATOR_IDS)
    assert nonlinear["information"]["median_per_step_kl"] >= 0.0
    spectrum = nonlinear["sindy_term_stability"]
    assert set(spectrum["inclusion_frequency"]) == {"1", "x", "x2", "x3", "x4"}
    assert "x" in spectrum["true_terms"]
    coefficient = nonlinear["coefficient_error"]
    assert coefficient["median_oracle_support"] >= 0.0
    assert coefficient["median_full_library"] >= 0.0


def test_sample_complexity_is_bounded_or_explicitly_extrapolated() -> None:
    artifact = _smoke()
    row = artifact["sample_complexity"][0]

    assert row["oracle"]["display"]
    assert "method" in row["oracle"]
    for estimate in row["practical"].values():
        assert estimate["display"]
        assert isinstance(estimate["extrapolated"], bool)


def test_basin_waterfall_separates_field_and_certification_loss() -> None:
    parent = _load_parent()
    parent_case = next(
        case
        for case in parent["cases"]
        if case["cell_id"] == "double-well-n500" and case["repetition"] == 0
    )
    spec = next(
        item for item in _reference_specs() if item.cell_id == "double-well-n500"
    )
    result = _evaluate_case(parent_case, spec, stability_bootstraps=4)
    topology = result["basin_decomposition"]

    assert topology is not None
    assert topology["true_drift_extraction"]["topology_match"] is True
    assert topology["primary_failure"] in {
        "COEFFICIENT_ESTIMATION",
        "STRUCTURE_SELECTION",
        "CERTIFICATION_GATE",
        "NONE",
    }


def test_frozen_failure_decomposition_is_content_addressed() -> None:
    artifact = load_frozen_failure_decomposition()
    report = verify_failure_decomposition(artifact)

    assert report["valid"] is True
    assert report["errors"] == []
    assert artifact["evaluation"]["worlds"] == 290
    assert artifact["evaluation"]["cells"] == 29
    assert artifact["real_market_claim"]["market_claim"] == "ABSTAIN"
    assert artifact["real_market_claim"]["rerun_performed"] is False
    assert artifact["routing"]["hawkes_deferred"] is True
