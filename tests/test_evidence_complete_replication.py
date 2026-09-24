from __future__ import annotations

import copy
import json
from collections import Counter

from src.dynamics.evidence_complete_replication import (
    DEFAULT_D034_ARTIFACT,
    ROLE_ORDER,
    TOTAL_WORLDS,
    WORLD_COUNT_PER_ROLE,
    _prior_seed_evidence,
    _replication_plan,
    verify_evidence_complete_replication,
)
from src.dynamics.selection_freeze import canonical_sha256


def test_replication_plan_is_preregistered_and_seed_disjoint() -> None:
    plan = _replication_plan()
    prior_seeds, _ = _prior_seed_evidence()

    assert len(plan) == TOTAL_WORLDS == 400
    assert len({world.spec.cell_id for world in plan}) == TOTAL_WORLDS
    assert len({world.seed for world in plan}) == TOTAL_WORLDS
    assert Counter(world.role for world in plan) == Counter(
        {role: WORLD_COUNT_PER_ROLE for role in ROLE_ORDER}
    )
    assert not ({world.seed for world in plan} & prior_seeds)


def test_frozen_replication_recomputes_from_400_complete_records() -> None:
    artifact = json.loads(DEFAULT_D034_ARTIFACT.read_text(encoding="utf-8"))
    report = verify_evidence_complete_replication(artifact)

    assert report["valid"], report["errors"]
    assert report["executed_worlds"] == 400
    assert report["evidence_complete_worlds"] == 400
    assert report["program_result"] == "PARTIALLY_CHARACTERIZED"
    assert artifact["execution"]["development_worlds"] == 0
    assert artifact["execution"]["tuning_events"] == 0
    assert artifact["execution"]["stopped_early"] is False
    assert artifact["capability_estimates"]["evidence_completeness"]["estimate"] == 1.0


def test_replication_world_hash_ledger_rejects_rehashed_tampering() -> None:
    artifact = json.loads(DEFAULT_D034_ARTIFACT.read_text(encoding="utf-8"))
    tampered = copy.deepcopy(artifact)
    world_id = tampered["world_evidence"][0]["world"]["world_id"]
    tampered["world_evidence"][0]["world"]["world_hash"] = "0" * 64
    execution = next(
        row for row in tampered["execution_records"] if row["world_id"] == world_id
    )
    execution["world_hash"] = "0" * 64
    tampered.pop("artifact_hash")
    tampered["artifact_hash"] = canonical_sha256(tampered)

    report = verify_evidence_complete_replication(tampered)

    assert not report["valid"]
    assert "replication world hash ledger changed" in report["errors"]


def test_sindy_diagnostics_seal_rejects_rehashed_tampering() -> None:
    artifact = json.loads(DEFAULT_D034_ARTIFACT.read_text(encoding="utf-8"))
    tampered = copy.deepcopy(artifact)
    tampered["sindy_diagnostics"]["aggregate"][
        "true_term_inclusion_frequency"
    ] = 0.0
    tampered.pop("artifact_hash")
    tampered["artifact_hash"] = canonical_sha256(tampered)

    report = verify_evidence_complete_replication(tampered)

    assert not report["valid"]
    assert (
        "sindy diagnostics do not match the frozen evidence seal"
        in report["errors"]
    )


def test_capability_vector_and_market_boundary_remain_non_scalar() -> None:
    artifact = json.loads(DEFAULT_D034_ARTIFACT.read_text(encoding="utf-8"))
    classifications = {
        name: row["classification"]
        for name, row in artifact["capability_classifications"].items()
    }

    assert classifications["state_diffusion_detection"] == "LIMITATION_REPLICATED"
    assert classifications["basin_recall"] == "CAPABILITY_SUPPORTED"
    assert classifications["potential_topology_accuracy"] == "UNRESOLVED"
    assert artifact["program_result"]["scalar_pass_fail"] is None
    assert artifact["real_market_claim"]["selected_model"] == "M1"
    assert artifact["real_market_claim"]["market_claim"] == "ABSTAIN"
    assert artifact["real_market_claim"]["rerun_performed"] is False
    assert artifact["market_claim_eligible"] is False


def test_every_applicable_world_retains_requested_bootstrap_evidence() -> None:
    artifact = json.loads(DEFAULT_D034_ARTIFACT.read_text(encoding="utf-8"))
    for record in artifact["world_evidence"]:
        role = record["world"]["role"]
        if role in {"linear_control", "no_basin_control", "double_well"}:
            assert record["sindy"]["bootstrap_repetitions"] == 32
            assert len(record["sindy"]["replicates"]) == 32
            assert record["topology"]["diagnostics"]["bootstrap"]["successful"] == 32
        if role in {"linear_control", "state_diffusion"}:
            assert record["state_diffusion"]["cross_fitted_residuals"]
            assert record["state_diffusion"]["state_support_bins"]
            assert len(record["state_diffusion"]["gate_results"]) == 3
