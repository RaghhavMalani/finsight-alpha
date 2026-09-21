"""D0.3.2 common-world estimator tournament tests."""

from __future__ import annotations

from src.dynamics.estimator_tournament import (
    D031_ARTIFACT_HASH,
    D031_FILE_SHA256,
    ESTIMATOR_IDS,
    load_frozen_estimator_tournament,
    run_estimator_tournament,
    verify_estimator_tournament,
)


def test_smoke_tournament_uses_one_world_and_no_aggregate_winner() -> None:
    artifact = run_estimator_tournament(3)

    assert artifact["parent"]["artifact_hash"] == D031_ARTIFACT_HASH
    assert artifact["parent"]["file_sha256"] == D031_FILE_SHA256
    assert artifact["evaluation"]["worlds"] == 3
    assert artifact["evaluation"]["common_state_normalization"] == "pre-holdout z-score"
    assert artifact["evaluation"]["aggregate_winner_score"] is None
    assert artifact["evaluation"]["winner_selection_policy"].startswith("PROHIBITED")
    for case in artifact["cases"]:
        assert case["split"]["identical_for_all_estimators"] is True
        rows = case["estimators"]
        assert [row["estimator_id"] for row in rows] == list(ESTIMATOR_IDS)
        assert not any(row["numerical_failure"] for row in rows)
        assert len({row["identified_model"] for row in rows}) == 1
        assert len({round(row["sealed_oos"]["mean_nll"], 12) for row in rows}) == 1
        assert rows[0]["common_baseline"]["shared_by_all_estimators"] is True


def test_sindy_reports_law_recovery_without_changing_market_claim() -> None:
    artifact = run_estimator_tournament(3)
    sindy = next(row for row in artifact["estimators"] if row["estimator_id"] == "EST-SINDY-D032")

    assert sindy["law_recovery"] is not None
    assert set(sindy["law_recovery"]) == {
        "worlds",
        "mean_term_precision",
        "mean_term_recall",
        "median_coefficient_error",
        "structural_equation_match_rate",
    }
    assert artifact["real_market_claim"]["selected_model"] == "M1"
    assert artifact["real_market_claim"]["market_claim"] == "ABSTAIN"
    assert artifact["real_market_claim"]["rerun_performed"] is False


def test_frozen_tournament_is_content_addressed_and_verifiable() -> None:
    artifact = load_frozen_estimator_tournament()
    report = verify_estimator_tournament(artifact)

    assert report["valid"] is True
    assert report["errors"] == []
    assert artifact["evaluation"]["worlds"] == 290
    assert artifact["evaluation"]["fits"] == 1450
    assert len(artifact["graduation"]) == 5
