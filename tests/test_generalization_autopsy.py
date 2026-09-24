from __future__ import annotations

import copy
import math

from src.dynamics.generalization_autopsy import (
    D033_ARTIFACT_HASH,
    D033_SOURCE_SHA256,
    GATE_DEFINITIONS,
    gate_margin,
    run_generalization_autopsy,
    signed_worsening,
    verify_generalization_autopsy,
    waterfall_attrition,
    wilson_interval,
)
from src.dynamics.selection_freeze import canonical_sha256


def _rehash(artifact: dict) -> dict:
    artifact = copy.deepcopy(artifact)
    artifact.pop("artifact_hash", None)
    artifact["artifact_hash"] = canonical_sha256(artifact)
    return artifact


def test_signed_worsening_and_gate_margin_have_one_orientation() -> None:
    assert math.isclose(signed_worsening(0.95, 0.75, "higher"), 0.20)
    assert math.isclose(signed_worsening(0.00, 0.10, "lower"), 0.10)
    assert math.isclose(gate_margin(0.90, 0.95, "higher"), -0.05)
    assert math.isclose(gate_margin(0.10, 0.05, "lower"), -0.05)


def test_wilson_interval_and_waterfall_arithmetic() -> None:
    interval = wilson_interval(15, 20)
    assert interval is not None
    assert math.isclose(interval[0], 0.531299122381256, rel_tol=1e-12)
    assert math.isclose(interval[1], 0.8881382985923343, rel_tol=1e-12)
    assert waterfall_attrition(20, 15) == 0.25
    assert waterfall_attrition(0, 0) is None


def test_autopsy_preserves_split_isolation_and_path_metrics() -> None:
    artifact = run_generalization_autopsy()
    development = artifact["worlds"]["development"]
    confirmation = artifact["worlds"]["confirmation"]

    assert {row["seed"] for row in development}.isdisjoint(
        {row["seed"] for row in confirmation}
    )
    double = artifact["path_information"]["double_well"]["world_records"]
    diffusion = artifact["path_information"]["state_diffusion"]["world_records"]
    assert len(double) == 40
    assert len(diffusion) == 40
    assert all(
        math.isclose(
            row["left_basin_occupancy"]
            + row["right_basin_occupancy"]
            + row["barrier_region_occupancy"],
            1.0,
        )
        for row in double
    )
    assert all(0.0 <= row["state_support_coverage"] <= 1.0 for row in diffusion)


def test_flags_are_evidence_backed_and_unsupported_flags_remain_false() -> None:
    artifact = run_generalization_autopsy()
    flags = {row["code"]: row for row in artifact["diagnostic_flags"]}

    assert all(not row["active"] or row["evidence"] for row in flags.values())
    assert flags["ORACLE_POWER_DROP"]["active"] is False
    assert flags["FIELD_RECOVERY_DROP"]["active"] is False
    assert flags["ROOT_PERSISTENCE_DROP"]["active"] is False
    assert flags["NUMERICAL_INSTABILITY"]["active"] is False
    assert artifact["sindy_structure_stability"]["status"] == "UNAVAILABLE"


def test_verifier_rejects_rehashed_rate_parent_source_and_gate_tampering() -> None:
    artifact = run_generalization_autopsy()

    bad_rate = copy.deepcopy(artifact)
    bad_rate["metric_table"][0]["confirmation"]["numerator"] += 1
    report = verify_generalization_autopsy(_rehash(bad_rate))
    assert not report["valid"]
    assert any("rate" in error or "metric table" in error for error in report["errors"])

    bad_parent = copy.deepcopy(artifact)
    bad_parent["parent_seals"][-1]["artifact_hash"] = "0" * 64
    assert not verify_generalization_autopsy(_rehash(bad_parent))["valid"]

    bad_source = copy.deepcopy(artifact)
    bad_source["sealed_d0_3_3_source_sha256"] = "0" * 64
    assert not verify_generalization_autopsy(_rehash(bad_source))["valid"]

    bad_gate = copy.deepcopy(artifact)
    bad_gate["gate_definitions"]["linear_specificity"]["gate"] = 0.90
    assert not verify_generalization_autopsy(_rehash(bad_gate))["valid"]

    bad_path_seal = copy.deepcopy(artifact)
    bad_path_seal["path_information"]["definitions"][
        "double_well_coverage"
    ] = "tampered"
    path_report = verify_generalization_autopsy(_rehash(bad_path_seal))
    assert not path_report["valid"]
    assert any("frozen evidence seal" in error for error in path_report["errors"])

    assert artifact["parent_seals"][-1]["artifact_hash"] == D033_ARTIFACT_HASH
    assert artifact["sealed_d0_3_3_source_sha256"] == D033_SOURCE_SHA256
    assert artifact["gate_definitions"] == GATE_DEFINITIONS
