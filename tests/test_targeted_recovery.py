from __future__ import annotations

from src.dynamics.targeted_recovery import (
    D0321_ARTIFACT_HASH,
    load_frozen_targeted_recovery,
    run_targeted_recovery,
    verify_targeted_recovery,
)


def test_smoke_profile_never_opens_confirmation_or_historical_cells() -> None:
    artifact = run_targeted_recovery("smoke")

    assert artifact["frozen"] is False
    assert artifact["evaluation"]["development_worlds"] == 8
    assert artifact["evaluation"]["confirmation_worlds"] == 0
    assert artifact["evaluation"]["historical_worlds"] == 0
    assert artifact["locked_configuration"]["confirmation_results_seen"] is False
    assert artifact["locked_configuration"]["historical_results_used"] is False


def test_frozen_targeted_recovery_is_valid_and_fail_closed() -> None:
    artifact = load_frozen_targeted_recovery()
    report = verify_targeted_recovery(artifact)

    assert report["valid"], report["errors"]
    assert artifact["parent"]["artifact_hash"] == D0321_ARTIFACT_HASH
    assert artifact["evaluation"]["development_worlds"] == 80
    assert artifact["evaluation"]["confirmation_worlds"] == 80
    assert artifact["evaluation"]["historical_worlds"] == 20
    assert artifact["graduation"]["decision"] == "NO_GRADUATE"
    assert artifact["capability"]["new_estimator_added"] is False
    assert artifact["routing"]["hawkes_started"] is False
    assert artifact["real_market_claim"]["rerun_performed"] is False


def test_confirmation_retains_root_level_evidence_and_locked_controls() -> None:
    artifact = load_frozen_targeted_recovery()
    double_well = next(
        row for row in artifact["confirmation_cases"] if row["role"] == "double_well"
    )
    topology = double_well["topology_repair"]

    assert topology["bootstrap"]["replicates"]
    assert all(
        {
            "roots",
            "root_order",
            "sign_topology_pass",
            "barrier_exists",
            "barrier_height",
        }
        <= set(replicate)
        for replicate in topology["bootstrap"]["replicates"]
    )
    assert artifact["confirmation_metrics"]["false_basin_discovery_rate"] <= 0.05
    assert artifact["confirmation_metrics"]["sealed_holdout_compliance"] is True
