from __future__ import annotations

import copy

from src.dynamics.evidence_capture import (
    capture_state_diffusion_evidence,
    capture_topology_stage_evidence,
    make_world_evidence_record,
    verify_world_evidence_record,
)
from src.dynamics.evidence_contract import capture_sindy_bootstrap_evidence
from src.dynamics.instrumentation_artifact import (
    build_evidence_instrumentation_contract,
    load_frozen_evidence_instrumentation_contract,
    verify_evidence_instrumentation_contract,
)
from src.dynamics.selection_freeze import canonical_sha256


def _sindy() -> dict:
    return capture_sindy_bootstrap_evidence(
        ["1", "x", "x2", "x3", "x4"],
        [
            [0.0, 1.1, 0.0, -0.8, 0.0],
            [0.0, 1.0, 0.2, -0.7, 0.0],
            [0.0, 0.9, 0.0, -0.9, 0.1],
            [0.0, 1.2, 0.0, -0.6, 0.0],
        ],
        truth_terms=["x", "x3"],
    )


def _topology() -> dict:
    roots = [
        [
            {"state": -1.0, "derivative": -2.0, "stable": True, "cluster_id": 0},
            {"state": 0.0, "derivative": 1.0, "stable": False, "cluster_id": 1},
            {"state": 1.0, "derivative": -2.0, "stable": True, "cluster_id": 2},
        ],
        [
            {"state": -0.9, "derivative": -1.8, "stable": True, "cluster_id": 0},
            {"state": 0.1, "derivative": 0.9, "stable": False, "cluster_id": 1},
            {"state": 1.1, "derivative": -2.2, "stable": True, "cluster_id": 2},
        ],
    ]
    clusters = [
        {
            "cluster_id": 0,
            "location": -0.95,
            "persistence": 0.9,
            "stable_support": 1.0,
            "stable": True,
            "occupancy_count": 24,
        },
        {
            "cluster_id": 1,
            "location": 0.05,
            "persistence": 0.85,
            "stable_support": 0.0,
            "stable": False,
            "occupancy_count": 18,
        },
        {
            "cluster_id": 2,
            "location": 1.05,
            "persistence": 0.95,
            "stable_support": 1.0,
            "stable": True,
            "occupancy_count": 22,
        },
    ]
    return capture_topology_stage_evidence(
        roots_by_bootstrap=roots,
        root_clusters=clusters,
        root_certificate=clusters,
        minimum_cluster_occupancy=18,
        holdout_mean_nll_gain_vs_ou=0.08,
        root_persistence_support=0.85,
        stability_support=1.0,
        sign_topology_support=0.75,
        barrier_support=0.80,
    )


def test_contract_is_evidence_only_and_frozen_artifact_verifies() -> None:
    generated = build_evidence_instrumentation_contract()
    frozen = load_frozen_evidence_instrumentation_contract()

    assert generated == frozen
    assert frozen["boundaries"]["worlds_executed"] == 0
    assert frozen["boundaries"]["scientific_outcome_claims"] is False
    assert frozen["evidence_records"] == []
    assert frozen["scientific_result"] is None
    assert frozen["market_claim_eligible"] is False
    assert verify_evidence_instrumentation_contract(frozen)["valid"]


def test_sindy_capture_retains_term_level_bootstrap_evidence() -> None:
    evidence = _sindy()
    terms = {row["term"]: row for row in evidence["terms"]}

    assert terms["x"]["inclusion_frequency"] == 1.0
    assert terms["x3"]["inclusion_frequency"] == 1.0
    assert terms["x2"]["inclusion_frequency"] == 0.25
    assert terms["x3"]["coefficient_sign_per_bootstrap"] == ["NEGATIVE"] * 4
    assert len(terms["x"]["coefficients_per_bootstrap"]) == 4
    assert all(row["structural_support_identity"] for row in evidence["replicates"])
    assert evidence["truth_terms"] == ["x", "x3"]


def test_diffusion_capture_exposes_bins_residuals_and_each_boolean_gate() -> None:
    evidence = capture_state_diffusion_evidence(
        drift_reconstruction_score=0.91,
        g_reconstruction_score=0.88,
        states=[-1.5, -0.5, 0.5, 1.5],
        cross_fitted_residuals=[-0.4, 0.5, -0.8, 1.2],
        true_g=[0.5, 0.7, 1.0, 1.4],
        estimated_g=[0.55, 0.68, 0.92, 1.30],
        bin_edges=[-2.0, 0.0, 2.0],
        twice_log_likelihood_ratio=4.2,
        diffusion_max_min_ratio=1.60,
        bootstrap_dominance=0.82,
    )

    gates = {row["gate"]: row["passed"] for row in evidence["gate_results"]}
    assert gates == {
        "twice_log_likelihood_ratio": True,
        "diffusion_max_min_ratio": False,
        "bootstrap_dominance": True,
    }
    assert evidence["final_conjunction"]["passed"] is False
    assert evidence["final_conjunction"]["decomposition_key"] == (
        "diffusion_max_min_ratio"
    )
    assert [row["samples"] for row in evidence["state_support_bins"]] == [2, 2]
    assert len(evidence["cross_fitted_residuals"]) == 4


def test_topology_capture_exposes_roots_clusters_persistence_and_basins() -> None:
    evidence = _topology()

    assert len(evidence["roots_before_clustering"]) == 6
    assert [row["classification"] for row in evidence["roots_before_clustering"][:3]] == [
        "STABLE",
        "UNSTABLE",
        "STABLE",
    ]
    assert len(evidence["bootstrap_persistence"]) == 3
    assert evidence["basin_assignment"]["status"] == "AVAILABLE"
    assert evidence["final_topology_gate"]["passed"] is True


def test_world_record_fails_closed_on_missing_evidence_and_gate_tampering() -> None:
    record = make_world_evidence_record(
        world_id="replication-double-well-001",
        world_hash="a" * 64,
        role="double_well",
        seed=101_001,
        sindy=_sindy(),
        state_diffusion=None,
        topology=_topology(),
    )
    assert verify_world_evidence_record(record)["valid"]

    missing = copy.deepcopy(record)
    missing["sindy"] = None
    missing.pop("evidence_hash")
    missing["evidence_hash"] = canonical_sha256(missing)
    report = verify_world_evidence_record(missing)
    assert not report["valid"]
    assert any("required evidence section" in error for error in report["errors"])

    tampered = copy.deepcopy(record)
    tampered["topology"]["final_topology_gate"]["passed"] = False
    tampered.pop("evidence_hash")
    tampered["evidence_hash"] = canonical_sha256(tampered)
    report = verify_world_evidence_record(tampered)
    assert not report["valid"]
    assert any("final conjunction" in error for error in report["errors"])


def test_contract_verifier_rejects_rehashed_outcome_and_threshold_tampering() -> None:
    artifact = build_evidence_instrumentation_contract()

    outcome = copy.deepcopy(artifact)
    outcome["scientific_result"] = "PASS"
    outcome.pop("artifact_hash")
    outcome["artifact_hash"] = canonical_sha256(outcome)
    assert not verify_evidence_instrumentation_contract(outcome)["valid"]

    threshold = copy.deepcopy(artifact)
    threshold["frozen_instrument"]["thresholds"]["diffusion_max_min_ratio"] = 1.60
    threshold.pop("artifact_hash")
    threshold["artifact_hash"] = canonical_sha256(threshold)
    assert not verify_evidence_instrumentation_contract(threshold)["valid"]
