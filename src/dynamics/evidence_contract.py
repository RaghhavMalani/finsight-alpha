"""D0.3.3.2 evidence instrumentation contract.

This milestone freezes what a future nonlinear replication must retain. It
does not simulate a world, fit an estimator, alter a threshold, or make a
scientific outcome claim. The capture helpers accept already-computed
intermediates so D0.3.4 can make every decision transition observable while
reusing the byte-frozen D0.3.3 instrument.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

from src.dynamics.selection_freeze import canonical_sha256

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D0332_ARTIFACT = (
    ROOT / "eval/dynamics/d0_3_3_2/evidence_instrumentation_contract.json"
)
EVIDENCE_CONTRACT_SOURCE = Path(__file__)

D033_ARTIFACT_HASH = "729af3f253a8878b158e21124bcea70f5d388d4f60f07f0c6ec1c2c3597f3fdc"
D033_FILE_SHA256 = "b038c55bcc7fc7632e8befb6a0daa2d679d957292f0a9c3e83fba8d174616993"
D033_SOURCE_SHA256 = "a910fc6f10aa24662773dcfdcbba53a3fb0162d09fa30bc034d7a9eb88db4be6"
D0331_ARTIFACT_HASH = "e62fe93798a94ce1c41c76c5ad6c0120496c15e520a57eab80a9520442822336"
D0331_FILE_SHA256 = "f4e508ced989df02e75f7fe22f549b4d7b96aea3e7acfb641afbbc72f9046722"
D0331_SOURCE_SHA256 = "47e68d38b0337839baf1f1ae44e3c46cf5afbf810e9a30d6b974408c83a83bd3"

PARENT_SEALS: tuple[dict[str, str], ...] = (
    {
        "milestone": "D0.3.3",
        "artifact": "eval/dynamics/d0_3_3/targeted_recovery.json",
        "artifact_hash": D033_ARTIFACT_HASH,
        "file_sha256": D033_FILE_SHA256,
        "source": "src/dynamics/targeted_recovery.py",
        "source_sha256": D033_SOURCE_SHA256,
    },
    {
        "milestone": "D0.3.3.1",
        "artifact": "eval/dynamics/d0_3_3_1/generalization_autopsy.json",
        "artifact_hash": D0331_ARTIFACT_HASH,
        "file_sha256": D0331_FILE_SHA256,
        "source": "src/dynamics/generalization_autopsy.py",
        "source_sha256": D0331_SOURCE_SHA256,
    },
)

FROZEN_THRESHOLDS: dict[str, float] = {
    "topology_certificate_score": 0.40,
    "root_minimum_local_support": 4.0,
    "double_well_minimum_holdout_gain": -0.20,
    "diffusion_twice_log_likelihood_ratio": 0.0,
    "diffusion_max_min_ratio": 1.70,
    "diffusion_bootstrap_dominance": 0.50,
}

ROLE_SECTION_REQUIREMENTS: dict[str, tuple[str, ...]] = {
    "double_well": ("sindy", "topology"),
    "state_diffusion": ("state_diffusion",),
    "linear_control": ("sindy", "state_diffusion", "topology"),
    "no_basin_control": ("sindy", "topology"),
}

STREAM_CONTRACTS: dict[str, dict[str, Any]] = {
    "sindy": {
        "purpose": "Separate true-term stability from spurious support selection.",
        "required_fields": [
            "library",
            "library_identity",
            "truth_terms",
            "truth_support_identity",
            "bootstrap_repetitions",
            "replicates",
            "terms",
        ],
        "replicate_fields": [
            "replicate",
            "selected_terms",
            "coefficients",
            "coefficient_signs",
            "structural_support_identity",
        ],
        "term_fields": [
            "term",
            "truth_term",
            "inclusion_count",
            "inclusion_frequency",
            "coefficients_per_bootstrap",
            "coefficient_sign_per_bootstrap",
            "coefficient_uncertainty",
        ],
    },
    "state_diffusion": {
        "purpose": "Expose every transition from cross-fitted innovations to the final conjunction.",
        "required_fields": [
            "drift_reconstruction_score",
            "g_reconstruction_score",
            "cross_fitted_residuals",
            "state_support_bins",
            "support_coverage",
            "diffusion_contrast",
            "gate_results",
            "final_conjunction",
        ],
        "support_bin_fields": [
            "bin",
            "left",
            "right",
            "samples",
            "conditional_variance_estimate",
            "true_g",
            "estimated_g",
        ],
        "decision_gates": [
            "twice_log_likelihood_ratio",
            "diffusion_max_min_ratio",
            "bootstrap_dominance",
        ],
    },
    "topology": {
        "purpose": "Expose root formation, clustering, stability, persistence, basin assignment, and certification.",
        "required_fields": [
            "roots_before_clustering",
            "root_clusters",
            "root_certificate",
            "bootstrap_persistence",
            "basin_assignment",
            "gate_results",
            "final_topology_gate",
        ],
        "root_fields": [
            "bootstrap",
            "root",
            "state",
            "derivative",
            "stable",
            "classification",
            "cluster_id",
        ],
        "decision_gates": [
            "root_cluster_triplet",
            "minimum_cluster_occupancy",
            "sealed_holdout_gain",
            "root_persistence",
            "stability_support",
            "sign_topology",
            "barrier_support",
            "certificate_score",
        ],
    },
}

WORLD_EVIDENCE_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:finsight:dynamics:d0.3.4:world-evidence",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "schema_version",
        "world",
        "sindy",
        "state_diffusion",
        "topology",
        "evidence_hash",
    ],
    "properties": {
        "schema_version": {"const": "dynamics-world-evidence/0.3.4"},
        "world": {
            "type": "object",
            "additionalProperties": False,
            "required": ["world_id", "world_hash", "split", "role", "seed"],
            "properties": {
                "world_id": {"type": "string", "minLength": 1},
                "world_hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
                "split": {"enum": ["replication"]},
                "role": {"enum": list(ROLE_SECTION_REQUIREMENTS)},
                "seed": {"type": "integer", "minimum": 0},
            },
        },
        "sindy": {"type": ["object", "null"]},
        "state_diffusion": {"type": ["object", "null"]},
        "topology": {"type": ["object", "null"]},
        "evidence_hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
    },
}

REPLICATION_ARTIFACT_SPEC: dict[str, Any] = {
    "schema_version": "dynamics-evidence-complete-replication/0.3.4",
    "required_top_level_fields": [
        "schema_version",
        "milestone",
        "preregistration",
        "frozen_instrument",
        "seed_ledger",
        "world_evidence",
        "capability_estimates",
        "decision_decomposition",
        "artifact_hash",
    ],
    "world_evidence_schema_id": WORLD_EVIDENCE_SCHEMA["$id"],
    "world_count_rule": "exactly 100 records per preregistered role; no silent omission",
    "incomplete_record_policy": "fail closed; incomplete worlds remain explicit and out of denominators",
    "decision_decomposition_rule": (
        "group each world by the sorted set of failed contributing gates; "
        "retain PASS as an explicit zero-failure group"
    ),
    "uncertainty_rule": "report Wilson 95 percent intervals for every capability proportion",
    "outcome_rule": "estimate operating characteristics; do not retune the D0.3.3 instrument",
}


class EvidenceContractError(ValueError):
    """Raised when evidence is incomplete, inconsistent, or outcome-bearing."""


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise EvidenceContractError(f"{label} must be a finite number")
    result = float(value)
    if not math.isfinite(result):
        raise EvidenceContractError(f"{label} must be a finite number")
    return result


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _support_identity(terms: Sequence[str]) -> str:
    return canonical_sha256({"selected_terms": sorted(str(term) for term in terms)})


def _coefficient_sign(value: float, tolerance: float) -> str:
    if value > tolerance:
        return "POSITIVE"
    if value < -tolerance:
        return "NEGATIVE"
    return "ZERO"


def capture_sindy_bootstrap_evidence(
    term_names: Sequence[str],
    coefficient_replicates: Sequence[Sequence[float]],
    *,
    truth_terms: Sequence[str],
    selected_tolerance: float = 1.0e-12,
) -> dict[str, Any]:
    """Capture term selection, signs, coefficients, uncertainty, and support IDs."""

    names = [str(term) for term in term_names]
    if not names or len(names) != len(set(names)):
        raise EvidenceContractError("SINDy library terms must be non-empty and unique")
    unknown_truth = set(truth_terms) - set(names)
    if unknown_truth:
        raise EvidenceContractError(f"truth support is outside the library: {unknown_truth}")
    tolerance = _finite(selected_tolerance, "selected_tolerance")
    if tolerance < 0.0:
        raise EvidenceContractError("selected_tolerance cannot be negative")
    matrix = np.asarray(coefficient_replicates, dtype=float)
    if matrix.ndim != 2 or matrix.shape[0] == 0 or matrix.shape[1] != len(names):
        raise EvidenceContractError(
            "coefficient_replicates must be a non-empty matrix aligned to term_names"
        )
    if not np.all(np.isfinite(matrix)):
        raise EvidenceContractError("coefficient_replicates contain non-finite values")

    replicates: list[dict[str, Any]] = []
    for index, row in enumerate(matrix):
        selected = [name for name, value in zip(names, row) if abs(float(value)) > tolerance]
        coefficients = {name: float(value) for name, value in zip(names, row)}
        signs = {
            name: _coefficient_sign(float(value), tolerance)
            for name, value in zip(names, row)
        }
        replicates.append(
            {
                "replicate": index,
                "selected_terms": selected,
                "coefficients": coefficients,
                "coefficient_signs": signs,
                "structural_support_identity": _support_identity(selected),
            }
        )

    terms: list[dict[str, Any]] = []
    truth = set(str(term) for term in truth_terms)
    for column, name in enumerate(names):
        values = matrix[:, column]
        selected_mask = np.abs(values) > tolerance
        selected_values = values[selected_mask]
        terms.append(
            {
                "term": name,
                "truth_term": name in truth,
                "inclusion_count": int(np.sum(selected_mask)),
                "inclusion_frequency": float(np.mean(selected_mask)),
                "coefficients_per_bootstrap": [float(value) for value in values],
                "coefficient_sign_per_bootstrap": [
                    _coefficient_sign(float(value), tolerance) for value in values
                ],
                "coefficient_uncertainty": {
                    "mean": float(np.mean(values)),
                    "standard_deviation": float(np.std(values)),
                    "q05": float(np.quantile(values, 0.05)),
                    "median": float(np.median(values)),
                    "q95": float(np.quantile(values, 0.95)),
                    "selected_mean": (
                        float(np.mean(selected_values)) if selected_values.size else None
                    ),
                    "selected_standard_deviation": (
                        float(np.std(selected_values)) if selected_values.size else None
                    ),
                },
            }
        )
    return {
        "library": names,
        "library_identity": canonical_sha256({"library": names}),
        "truth_terms": sorted(truth),
        "truth_support_identity": _support_identity(sorted(truth)),
        "selected_tolerance": tolerance,
        "bootstrap_repetitions": int(matrix.shape[0]),
        "replicates": replicates,
        "terms": terms,
    }
