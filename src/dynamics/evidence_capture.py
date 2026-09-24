"""Evidence capture helpers governed by the D0.3.3.2 contract."""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

import numpy as np

from src.dynamics.evidence_contract import (
    EvidenceContractError,
    FROZEN_THRESHOLDS,
    ROLE_SECTION_REQUIREMENTS,
    STREAM_CONTRACTS,
)
from src.dynamics.selection_freeze import canonical_sha256


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise EvidenceContractError(f"{label} must be a finite number")
    result = float(value)
    if not math.isfinite(result):
        raise EvidenceContractError(f"{label} must be a finite number")
    return result


def _contrast(values: Sequence[float | None]) -> float | None:
    positive = [float(value) for value in values if value is not None and value > 0.0]
    return max(positive) / min(positive) if len(positive) >= 2 else None


def _gate(
    name: str,
    value: float,
    comparator: str,
    threshold: float,
) -> dict[str, Any]:
    if comparator == ">=":
        passed = value >= threshold
    elif comparator == "<=":
        passed = value <= threshold
    else:
        raise EvidenceContractError(f"unsupported gate comparator: {comparator}")
    return {
        "gate": name,
        "value": float(value),
        "comparator": comparator,
        "threshold": float(threshold),
        "passed": bool(passed),
        "contributes_to_final": True,
    }


def capture_state_diffusion_evidence(
    *,
    drift_reconstruction_score: float,
    g_reconstruction_score: float,
    states: Sequence[float],
    cross_fitted_residuals: Sequence[float],
    true_g: Sequence[float],
    estimated_g: Sequence[float],
    bin_edges: Sequence[float],
    twice_log_likelihood_ratio: float,
    diffusion_max_min_ratio: float,
    bootstrap_dominance: float,
) -> dict[str, Any]:
    """Capture support-bin evidence and the exact frozen diffusion conjunction."""

    arrays = [
        np.asarray(values, dtype=float)
        for values in (states, cross_fitted_residuals, true_g, estimated_g)
    ]
    if not arrays[0].size or any(array.ndim != 1 for array in arrays):
        raise EvidenceContractError("diffusion evidence arrays must be non-empty vectors")
    if len({array.size for array in arrays}) != 1:
        raise EvidenceContractError("diffusion evidence arrays must have equal length")
    if any(not np.all(np.isfinite(array)) for array in arrays):
        raise EvidenceContractError("diffusion evidence arrays contain non-finite values")
    edges = np.asarray(bin_edges, dtype=float)
    if (
        edges.ndim != 1
        or edges.size < 2
        or not np.all(np.isfinite(edges))
        or not np.all(np.diff(edges) > 0.0)
    ):
        raise EvidenceContractError("bin_edges must be finite and strictly increasing")

    bins: list[dict[str, Any]] = []
    for index, (left, right) in enumerate(zip(edges[:-1], edges[1:])):
        if index == edges.size - 2:
            mask = (arrays[0] >= left) & (arrays[0] <= right)
        else:
            mask = (arrays[0] >= left) & (arrays[0] < right)
        samples = int(np.sum(mask))
        bins.append(
            {
                "bin": index,
                "left": float(left),
                "right": float(right),
                "samples": samples,
                "conditional_variance_estimate": (
                    float(np.mean(np.square(arrays[1][mask]))) if samples else None
                ),
                "true_g": float(np.mean(arrays[2][mask])) if samples else None,
                "estimated_g": float(np.mean(arrays[3][mask])) if samples else None,
            }
        )

    llr = _finite(twice_log_likelihood_ratio, "twice_log_likelihood_ratio")
    ratio = _finite(diffusion_max_min_ratio, "diffusion_max_min_ratio")
    dominance = _finite(bootstrap_dominance, "bootstrap_dominance")
    gates = [
        _gate(
            "twice_log_likelihood_ratio",
            llr,
            ">=",
            FROZEN_THRESHOLDS["diffusion_twice_log_likelihood_ratio"],
        ),
        _gate(
            "diffusion_max_min_ratio",
            ratio,
            ">=",
            FROZEN_THRESHOLDS["diffusion_max_min_ratio"],
        ),
        _gate(
            "bootstrap_dominance",
            dominance,
            ">=",
            FROZEN_THRESHOLDS["diffusion_bootstrap_dominance"],
        ),
    ]
    failed = [row["gate"] for row in gates if not row["passed"]]
    occupied = [row for row in bins if row["samples"] > 0]
    return {
        "drift_reconstruction_score": _finite(
            drift_reconstruction_score, "drift_reconstruction_score"
        ),
        "g_reconstruction_score": _finite(
            g_reconstruction_score, "g_reconstruction_score"
        ),
        "cross_fitted_residuals": [float(value) for value in arrays[1]],
        "state_support_bins": bins,
        "support_coverage": {
            "occupied_bins": len(occupied),
            "total_bins": len(bins),
            "fraction": len(occupied) / len(bins),
            "minimum_samples_per_occupied_bin": min(
                (row["samples"] for row in occupied), default=0
            ),
        },
        "diffusion_contrast": {
            "conditional_variance": _contrast(
                [row["conditional_variance_estimate"] for row in bins]
            ),
            "true_g": _contrast([row["true_g"] for row in bins]),
            "estimated_g": _contrast([row["estimated_g"] for row in bins]),
            "decision_grid_max_min_ratio": ratio,
        },
        "gate_results": gates,
        "final_conjunction": {
            "expression": "LLR AND MAX_MIN_RATIO AND BOOTSTRAP_DOMINANCE",
            "passed": not failed,
            "failed_gates": failed,
            "decomposition_key": "+".join(sorted(failed)) if failed else "PASS",
        },
    }


def _normalize_root(
    root: Mapping[str, Any], *, bootstrap: int, root_index: int
) -> dict[str, Any]:
    state = _finite(root.get("state"), "root.state")
    derivative = _finite(root.get("derivative"), "root.derivative")
    stable = derivative < 0.0
    if "stable" in root and bool(root["stable"]) is not stable:
        raise EvidenceContractError("root stability conflicts with derivative sign")
    cluster_id = root.get("cluster_id")
    if cluster_id is not None and not isinstance(cluster_id, int):
        raise EvidenceContractError("root.cluster_id must be an integer or null")
    return {
        "bootstrap": bootstrap,
        "root": root_index,
        "state": state,
        "derivative": derivative,
        "stable": stable,
        "classification": "STABLE" if stable else "UNSTABLE",
        "cluster_id": cluster_id,
    }


def _basin_assignment(root_certificate: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    ordered = sorted(root_certificate, key=lambda row: float(row["location"]))
    if not (
        len(ordered) == 3
        and bool(ordered[0].get("stable"))
        and not bool(ordered[1].get("stable"))
        and bool(ordered[2].get("stable"))
    ):
        return {
            "status": "UNAVAILABLE",
            "reason": "certified stable-unstable-stable triplet absent",
            "basins": [],
        }
    separatrix = float(ordered[1]["location"])
    return {
        "status": "AVAILABLE",
        "reason": None,
        "separatrix": separatrix,
        "basins": [
            {
                "basin": "LEFT",
                "attractor": float(ordered[0]["location"]),
                "interval": [None, separatrix],
            },
            {
                "basin": "RIGHT",
                "attractor": float(ordered[2]["location"]),
                "interval": [separatrix, None],
            },
        ],
    }


def capture_topology_stage_evidence(
    *,
    roots_by_bootstrap: Sequence[Sequence[Mapping[str, Any]]],
    root_clusters: Sequence[Mapping[str, Any]],
    root_certificate: Sequence[Mapping[str, Any]],
    minimum_cluster_occupancy: int,
    holdout_mean_nll_gain_vs_ou: float,
    root_persistence_support: float,
    stability_support: float,
    sign_topology_support: float,
    barrier_support: float,
) -> dict[str, Any]:
    """Capture topology intermediates and the exact frozen final gate."""

    roots = [
        _normalize_root(root, bootstrap=bootstrap, root_index=index)
        for bootstrap, rows in enumerate(roots_by_bootstrap)
        for index, root in enumerate(rows)
    ]
    clusters: list[dict[str, Any]] = []
    for index, row in enumerate(root_clusters):
        location = _finite(row.get("location"), "cluster.location")
        persistence = _finite(row.get("persistence"), "cluster.persistence")
        stable_support_value = _finite(
            row.get("stable_support"), "cluster.stable_support"
        )
        stable = bool(row.get("stable", stable_support_value >= 0.5))
        clusters.append(
            {
                **dict(row),
                "cluster_id": int(row.get("cluster_id", index)),
                "location": location,
                "persistence": persistence,
                "stable_support": stable_support_value,
                "stable": stable,
                "classification": "STABLE" if stable else "UNSTABLE",
                "occupancy_count": int(row.get("occupancy_count", 0)),
            }
        )
    certificate = [dict(row) for row in root_certificate]
    ordered_certificate = sorted(certificate, key=lambda row: float(row["location"]))
    triplet_pass = bool(
        len(ordered_certificate) == 3
        and bool(ordered_certificate[0].get("stable"))
        and not bool(ordered_certificate[1].get("stable"))
        and bool(ordered_certificate[2].get("stable"))
    )
    occupancy = int(minimum_cluster_occupancy)
    if occupancy < 0:
        raise EvidenceContractError("minimum_cluster_occupancy cannot be negative")
    holdout_gain = _finite(
        holdout_mean_nll_gain_vs_ou, "holdout_mean_nll_gain_vs_ou"
    )
    supports = {
        "root_persistence": _finite(
            root_persistence_support, "root_persistence_support"
        ),
        "stability_support": _finite(stability_support, "stability_support"),
        "sign_topology": _finite(sign_topology_support, "sign_topology_support"),
        "barrier_support": _finite(barrier_support, "barrier_support"),
    }
    if any(value < 0.0 or value > 1.0 for value in supports.values()):
        raise EvidenceContractError("topology support values must be in [0, 1]")
    certificate_score = min(supports.values()) if triplet_pass else 0.0
    gates = [
        {
            "gate": "root_cluster_triplet",
            "value": triplet_pass,
            "comparator": "IS_TRUE",
            "threshold": True,
            "passed": triplet_pass,
            "contributes_to_final": True,
        },
        _gate(
            "minimum_cluster_occupancy",
            float(occupancy),
            ">=",
            FROZEN_THRESHOLDS["root_minimum_local_support"],
        ),
        _gate(
            "sealed_holdout_gain",
            holdout_gain,
            ">=",
            FROZEN_THRESHOLDS["double_well_minimum_holdout_gain"],
        ),
        _gate(
            "root_persistence",
            supports["root_persistence"],
            ">=",
            FROZEN_THRESHOLDS["topology_certificate_score"],
        ),
        _gate(
            "stability_support",
            supports["stability_support"],
            ">=",
            FROZEN_THRESHOLDS["topology_certificate_score"],
        ),
        _gate(
            "sign_topology",
            supports["sign_topology"],
            ">=",
            FROZEN_THRESHOLDS["topology_certificate_score"],
        ),
        _gate(
            "barrier_support",
            supports["barrier_support"],
            ">=",
            FROZEN_THRESHOLDS["topology_certificate_score"],
        ),
        _gate(
            "certificate_score",
            certificate_score,
            ">=",
            FROZEN_THRESHOLDS["topology_certificate_score"],
        ),
    ]
    failed = [row["gate"] for row in gates if not row["passed"]]
    return {
        "roots_before_clustering": roots,
        "root_clusters": clusters,
        "root_certificate": ordered_certificate,
        "bootstrap_persistence": [
            {
                "cluster_id": row["cluster_id"],
                "persistence": row["persistence"],
                "stable_support": row["stable_support"],
            }
            for row in clusters
        ],
        "basin_assignment": _basin_assignment(ordered_certificate),
        "gate_results": gates,
        "final_topology_gate": {
            "expression": (
                "TRIPLET AND LOCAL_SUPPORT AND HOLDOUT AND "
                "MIN(ROOT_PERSISTENCE, STABILITY, SIGN, BARRIER) >= 0.40"
            ),
            "certificate_score": certificate_score,
            "passed": not failed,
            "failed_gates": failed,
            "decomposition_key": "+".join(sorted(failed)) if failed else "PASS",
        },
    }


def make_world_evidence_record(
    *,
    world_id: str,
    world_hash: str,
    role: str,
    seed: int,
    sindy: Mapping[str, Any] | None,
    state_diffusion: Mapping[str, Any] | None,
    topology: Mapping[str, Any] | None,
) -> dict[str, Any]:
    """Assemble and content-address one future D0.3.4 world evidence record."""

    payload: dict[str, Any] = {
        "schema_version": "dynamics-world-evidence/0.3.4",
        "world": {
            "world_id": str(world_id),
            "world_hash": str(world_hash),
            "split": "replication",
            "role": str(role),
            "seed": int(seed),
        },
        "sindy": dict(sindy) if sindy is not None else None,
        "state_diffusion": (
            dict(state_diffusion) if state_diffusion is not None else None
        ),
        "topology": dict(topology) if topology is not None else None,
    }
    payload["evidence_hash"] = canonical_sha256(payload)
    report = verify_world_evidence_record(payload)
    if not report["valid"]:
        raise EvidenceContractError("; ".join(report["errors"]))
    return payload


def _verify_gate_trace(
    section: Mapping[str, Any], final_key: str, errors: list[str], label: str
) -> None:
    gates = section.get("gate_results")
    final = section.get(final_key)
    if not isinstance(gates, list) or not gates:
        errors.append(f"{label} gate_results are missing")
        return
    if not isinstance(final, Mapping):
        errors.append(f"{label} final decision is missing")
        return
    expected_failed = [
        row.get("gate")
        for row in gates
        if isinstance(row, Mapping)
        and row.get("contributes_to_final") is True
        and row.get("passed") is not True
    ]
    if final.get("failed_gates") != expected_failed:
        errors.append(f"{label} failed-gate decomposition does not reconcile")
    if final.get("passed") is not (not expected_failed):
        errors.append(f"{label} final conjunction does not reconcile")
    expected_key = "+".join(sorted(str(item) for item in expected_failed)) or "PASS"
    if final.get("decomposition_key") != expected_key:
        errors.append(f"{label} decomposition key does not reconcile")


def verify_world_evidence_record(record: Mapping[str, Any]) -> dict[str, Any]:
    """Fail closed on incomplete or internally inconsistent future evidence."""

    errors: list[str] = []
    body = dict(record)
    claimed_hash = body.pop("evidence_hash", None)
    calculated_hash = canonical_sha256(body)
    if claimed_hash != calculated_hash:
        errors.append("evidence_hash does not match canonical record")
    if record.get("schema_version") != "dynamics-world-evidence/0.3.4":
        errors.append("world evidence schema_version changed")
    world = record.get("world")
    if not isinstance(world, Mapping):
        errors.append("world identity is missing")
        world = {}
    role = world.get("role")
    if role not in ROLE_SECTION_REQUIREMENTS:
        errors.append("world role is unsupported")
        required: tuple[str, ...] = ()
    else:
        required = ROLE_SECTION_REQUIREMENTS[str(role)]
    if not isinstance(world.get("world_id"), str) or not world.get("world_id"):
        errors.append("world_id is missing")
    world_hash = world.get("world_hash")
    if (
        not isinstance(world_hash, str)
        or len(world_hash) != 64
        or any(character not in "0123456789abcdef" for character in world_hash)
    ):
        errors.append("world_hash must be lowercase SHA-256")
    if world.get("split") != "replication":
        errors.append("world split must be replication")
    if isinstance(world.get("seed"), bool) or not isinstance(world.get("seed"), int):
        errors.append("world seed must be an integer")
    for section in ("sindy", "state_diffusion", "topology"):
        value = record.get(section)
        if section in required and not isinstance(value, Mapping):
            errors.append(f"required evidence section is missing: {section}")
        if section not in required and value is not None:
            errors.append(f"out-of-contract evidence section is populated: {section}")

    sindy = record.get("sindy")
    if isinstance(sindy, Mapping):
        for field in STREAM_CONTRACTS["sindy"]["required_fields"]:
            if field not in sindy:
                errors.append(f"SINDy evidence omits {field}")
        replicates = sindy.get("replicates")
        terms = sindy.get("terms")
        repetitions = sindy.get("bootstrap_repetitions")
        if not isinstance(replicates, list) or len(replicates) != repetitions:
            errors.append("SINDy replicate count does not reconcile")
        if isinstance(terms, list) and isinstance(replicates, list):
            for term in terms:
                if not isinstance(term, Mapping):
                    errors.append("SINDy term evidence is malformed")
                    continue
                values = term.get("coefficients_per_bootstrap")
                signs = term.get("coefficient_sign_per_bootstrap")
                selected = term.get("inclusion_count")
                if not isinstance(values, list) or len(values) != len(replicates):
                    errors.append(f"SINDy coefficient trace is incomplete: {term.get('term')}")
                if not isinstance(signs, list) or len(signs) != len(replicates):
                    errors.append(f"SINDy sign trace is incomplete: {term.get('term')}")
                if isinstance(selected, int) and term.get("inclusion_frequency") != (
                    selected / len(replicates) if replicates else 0.0
                ):
                    errors.append(f"SINDy inclusion frequency does not reconcile: {term.get('term')}")

    diffusion = record.get("state_diffusion")
    if isinstance(diffusion, Mapping):
        for field in STREAM_CONTRACTS["state_diffusion"]["required_fields"]:
            if field not in diffusion:
                errors.append(f"state-diffusion evidence omits {field}")
        _verify_gate_trace(diffusion, "final_conjunction", errors, "state-diffusion")

    topology = record.get("topology")
    if isinstance(topology, Mapping):
        for field in STREAM_CONTRACTS["topology"]["required_fields"]:
            if field not in topology:
                errors.append(f"topology evidence omits {field}")
        for root in topology.get("roots_before_clustering", []):
            if isinstance(root, Mapping):
                expected_stable = float(root.get("derivative", math.nan)) < 0.0
                if root.get("stable") is not expected_stable:
                    errors.append("topology root classification conflicts with derivative")
        _verify_gate_trace(topology, "final_topology_gate", errors, "topology")
    return {
        "valid": not errors,
        "evidence_hash": claimed_hash,
        "calculated_hash": calculated_hash,
        "errors": errors,
    }
