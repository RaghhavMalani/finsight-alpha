"""D0.3.4 evidence-complete nonlinear replication.

This module executes the preregistered large-sample replication while importing
the byte-frozen D0.3.3 estimator. It adds evidence capture, not a new estimator,
threshold, operating point, or market claim.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import numpy as np

from src.dynamics.evidence_capture import (
    capture_state_diffusion_evidence,
    capture_topology_stage_evidence,
    make_world_evidence_record,
    verify_world_evidence_record,
)
from src.dynamics.evidence_contract import (
    D033_SOURCE_SHA256,
    FROZEN_THRESHOLDS,
    PARENT_SEALS,
    capture_sindy_bootstrap_evidence,
)
from src.dynamics.estimator_tournament import (
    FieldEstimate,
    _bootstrap_dominance,
    _fit_exact_ou,
    _fit_sindy,
    _point_scores,
    _polynomial_design,
    _reconstruction_errors,
    _score,
    _sparse_polynomial,
    _support,
    _unstandardize_law,
    _world_hash,
)
from src.dynamics.failure_decomposition import _fit_constant_candidate
from src.dynamics.identifiability import (
    TOPOLOGY_LOCATION_TOLERANCE,
    WorldSpec,
    _match_points,
    _simulate_world,
    _truth_functions,
)
from src.dynamics.instrumentation_artifact import (
    load_frozen_evidence_instrumentation_contract,
)
from src.dynamics.nonlinear import _raw_roots
from src.dynamics.selection_freeze import canonical_sha256
from src.dynamics.targeted_recovery import (
    DOUBLE_WELL_MINIMUM_HOLDOUT_GAIN,
    GRADUATION_GATES,
    HOLDOUT_FRACTION,
    ROOT_BOOTSTRAPS,
    ROOT_CLUSTER_RADIUS,
    ROOT_MINIMUM_LOCAL_SUPPORT,
    _barrier_summary,
    _cluster_roots,
    _crossfit_folds,
    _dt,
    _moving_block_indices,
    _select_cluster_triplet,
    _standardized_training,
    _topology_match,
    verify_targeted_recovery,
)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D034_ARTIFACT = (
    ROOT / "eval/dynamics/d0_3_4/evidence_complete_replication.json"
)
REPLICATION_SOURCE = Path(__file__)

D0332_ARTIFACT = (
    ROOT / "eval/dynamics/d0_3_3_2/evidence_instrumentation_contract.json"
)
D0332_ARTIFACT_HASH = (
    "e2f281e346fdde6cbfb0a0811600328c6802b17c890a4c84e2298f4750770cbc"
)
D0332_FILE_SHA256 = (
    "29fda477868634ae2a266f6b9399e41a52d41340c9c3d42bfebd1e7291fbbd1f"
)

PRIOR_SEED_SOURCES: tuple[dict[str, str], ...] = (
    {
        "milestone": "D0.3.1",
        "artifact": "eval/dynamics/d0_3_1/nonlinear_identifiability.json",
        "file_sha256": (
            "40ab6d4098461a1adb93e61bb395eff2e141209c05fe978b0878955a0969d213"
        ),
    },
    {
        "milestone": "D0.3.2",
        "artifact": "eval/dynamics/d0_3_2/estimator_tournament.json",
        "file_sha256": (
            "033732cb23c86a12a63cc0783ee84ae518fe7fcddb76cd5eb9aced899b8f19d0"
        ),
    },
    {
        "milestone": "D0.3.2.1",
        "artifact": "eval/dynamics/d0_3_2_1/failure_decomposition.json",
        "file_sha256": (
            "ce4d92b294c802b72be531a969011e3c82196881173ae172ff62c1b1f8609688"
        ),
    },
    {
        "milestone": "D0.3.3",
        "artifact": "eval/dynamics/d0_3_3/targeted_recovery.json",
        "file_sha256": (
            "b038c55bcc7fc7632e8befb6a0daa2d679d957292f0a9c3e83fba8d174616993"
        ),
    },
)

SCHEMA_VERSION = "dynamics-evidence-complete-replication/0.3.4"
WORLD_COUNT_PER_ROLE = 100
TOTAL_WORLDS = 400
REPLICATION_WORLD_LEDGER_HASH = (
    "31a2f767e679c6c48ab98e5f4136080653047f0162709865d49bd61f9759dea8"
)
SINDY_DIAGNOSTICS_HASH = (
    "a335b3f05a83dd1a632a38156292ef88c93c7e7940a0d42f2d1a1c8676af0239"
)
REPLICATION_SEED_BASE = 193_000
ROLE_ORDER = (
    "linear_control",
    "no_basin_control",
    "double_well",
    "state_diffusion",
)
ROLE_SEED_OFFSETS = {
    "linear_control": 0,
    "no_basin_control": 1_000,
    "double_well": 2_000,
    "state_diffusion": 3_000,
}
SINDY_TERMS = ("1", "x", "x2", "x3", "x4")
SINDY_SELECTION_TOLERANCE = 0.025
DIFFUSION_RECONSTRUCTION_THRESHOLD = 0.35


class EvidenceCompleteReplicationError(ValueError):
    """Raised when D0.3.4 violates a preregistered or evidence boundary."""


@dataclass(frozen=True)
class ReplicationWorld:
    role: str
    repetition: int
    seed: int
    spec: WorldSpec


def _source_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _rate(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def _truth_points(theta: float, cubic: float) -> tuple[float, float]:
    root = math.sqrt(theta / cubic)
    return -root, root


def _replication_plan() -> list[ReplicationWorld]:
    """Return the fixed 400-world ledger without observing any outcome."""

    rows: list[ReplicationWorld] = []
    offset = 7
    for index in range(WORLD_COUNT_PER_ROLE):
        observations = (480, 560, 640, 720, 800)[(index + 2 * offset) % 5]
        theta = (0.20, 0.28, 0.36, 0.44)[(index + offset) % 4]
        sigma = (0.22, 0.28, 0.34, 0.40)[(2 * index + offset) % 4]
        spec = WorldSpec(
            cell_id=f"replication-linear-control-{index:03d}",
            family="linear_ou",
            observations=observations,
            expected_model="M1",
            effect_band="control",
            theta=theta,
            sigma=sigma,
            expected_stable_points=(0.0,),
        )
        rows.append(
            ReplicationWorld(
                "linear_control",
                index,
                REPLICATION_SEED_BASE + ROLE_SEED_OFFSETS["linear_control"] + index,
                spec,
            )
        )
    for index in range(WORLD_COUNT_PER_ROLE):
        observations = (480, 560, 640, 720, 800)[(index + offset) % 5]
        sigma = (0.22, 0.28, 0.34, 0.40)[(index + 3 * offset) % 4]
        spec = WorldSpec(
            cell_id=f"replication-no-basin-control-{index:03d}",
            family="random_walk",
            observations=observations,
            expected_model="ABSTAIN",
            effect_band="control",
            sigma=sigma,
            assumption_violation="no stationary restoring force",
        )
        rows.append(
            ReplicationWorld(
                "no_basin_control",
                index,
                REPLICATION_SEED_BASE + ROLE_SEED_OFFSETS["no_basin_control"] + index,
                spec,
            )
        )
    for index in range(WORLD_COUNT_PER_ROLE):
        observations = (420, 480, 540, 600, 660, 700)[(index + offset) % 6]
        theta = (0.62, 0.70, 0.78, 0.86)[(index + 2 * offset) % 4]
        cubic = (0.60, 0.68, 0.76, 0.84)[(2 * index + offset) % 4]
        sigma = (0.34, 0.40, 0.46, 0.50)[(3 * index + offset) % 4]
        left, right = _truth_points(theta, cubic)
        spec = WorldSpec(
            cell_id=f"replication-double-well-{index:03d}",
            family="double_well",
            observations=observations,
            expected_model="M2",
            effect_band="targeted",
            theta=theta,
            sigma=sigma,
            cubic=cubic,
            expected_stable_points=(left, right),
            expected_unstable_points=(0.0,),
        )
        rows.append(
            ReplicationWorld(
                "double_well",
                index,
                REPLICATION_SEED_BASE + ROLE_SEED_OFFSETS["double_well"] + index,
                spec,
            )
        )
    for index in range(WORLD_COUNT_PER_ROLE):
        observations = (480, 560, 640, 720, 800)[(index + offset) % 5]
        gamma = (0.52, 0.58, 0.65, 0.72, 0.78)[(2 * index + offset) % 5]
        theta = (0.28, 0.32, 0.36, 0.40)[(index + offset) % 4]
        sigma = (0.20, 0.22, 0.25, 0.28)[(3 * index + offset) % 4]
        spec = WorldSpec(
            cell_id=f"replication-state-diffusion-{index:03d}",
            family="state_diffusion",
            observations=observations,
            expected_model="M3",
            effect_band="targeted",
            theta=theta,
            sigma=sigma,
            gamma=gamma,
            expected_stable_points=(0.0,),
        )
        rows.append(
            ReplicationWorld(
                "state_diffusion",
                index,
                REPLICATION_SEED_BASE + ROLE_SEED_OFFSETS["state_diffusion"] + index,
                spec,
            )
        )
    return rows


def _plan_ledger(plan: Sequence[ReplicationWorld]) -> list[dict[str, Any]]:
    return [
        {
            "world_id": world.spec.cell_id,
            "role": world.role,
            "repetition": world.repetition,
            "seed": world.seed,
            "family": world.spec.family,
            "observations": world.spec.observations,
            "expected_model": world.spec.expected_model,
            "theta": world.spec.theta,
            "sigma": world.spec.sigma,
            "cubic": world.spec.cubic,
            "gamma": world.spec.gamma,
            "expected_stable_points": list(world.spec.expected_stable_points),
            "expected_unstable_points": list(world.spec.expected_unstable_points),
        }
        for world in plan
    ]


def _walk_seeds(value: Any) -> Iterable[int]:
    if isinstance(value, Mapping):
        for key, item in value.items():
            if key == "seed" and isinstance(item, int) and not isinstance(item, bool):
                yield item
            else:
                yield from _walk_seeds(item)
    elif isinstance(value, list):
        for item in value:
            yield from _walk_seeds(item)


def _prior_seed_evidence() -> tuple[set[int], list[dict[str, Any]]]:
    seeds: set[int] = set()
    sources: list[dict[str, Any]] = []
    for seal in PRIOR_SEED_SOURCES:
        path = ROOT / seal["artifact"]
        if not path.exists() or _file_sha256(path) != seal["file_sha256"]:
            raise EvidenceCompleteReplicationError(
                f"prior seed artifact bytes changed: {seal['milestone']}"
            )
        payload = json.loads(path.read_text(encoding="utf-8"))
        local = set(_walk_seeds(payload))
        seeds.update(local)
        sources.append(
            {
                **seal,
                "artifact_hash": str(payload.get("artifact_hash")),
                "seed_count": len(local),
                "seed_digest": canonical_sha256(sorted(local)),
            }
        )
    return seeds, sources


def _preregistration(
    plan: Sequence[ReplicationWorld], prior_sources: Sequence[Mapping[str, Any]]
) -> dict[str, Any]:
    ledger = _plan_ledger(plan)
    return {
        "question": (
            "Do the frozen D0.3.3 nonlinear capabilities and limitations replicate "
            "under a larger untouched seed ledger when every causal decision trace "
            "is retained?"
        ),
        "design": "fixed large-sample replication; no development split",
        "worlds": TOTAL_WORLDS,
        "worlds_per_role": WORLD_COUNT_PER_ROLE,
        "roles": list(ROLE_ORDER),
        "seed_base": REPLICATION_SEED_BASE,
        "plan_hash": canonical_sha256(ledger),
        "prior_seed_sources": [dict(row) for row in prior_sources],
        "prior_seed_disjointness_required": True,
        "execution_rule": "execute all 400 worlds; no tuning and no early stopping",
        "root_bootstraps": ROOT_BOOTSTRAPS,
        "frozen_thresholds": dict(FROZEN_THRESHOLDS),
        "sindy_selection_tolerance": SINDY_SELECTION_TOLERANCE,
        "admission_rule": (
            "100 percent D0.3.3.2 evidence completeness; otherwise "
            "INSTRUMENTATION_INVALID and excluded from scientific denominators"
        ),
        "reported_capabilities": [
            "linear_specificity",
            "false_nonlinear_discovery_rate",
            "false_basin_discovery_rate",
            "double_well_detection",
            "basin_precision",
            "basin_recall",
            "potential_topology_accuracy",
            "state_diffusion_detection",
            "numerical_failure_rate",
        ],
        "uncertainty": "Wilson score 95 percent interval for every proportion",
        "classification_rule": (
            "use the Wilson interval against each frozen D0.3.3 capability gate; "
            "return CAPABILITY_SUPPORTED, LIMITATION_REPLICATED, or UNRESOLVED"
        ),
        "forbidden": [
            "development-set selection",
            "threshold tuning",
            "estimator changes",
            "stopping early",
            "real-market rerun",
            "market-claim promotion",
            "Hawkes dynamics",
        ],
    }


def _truth_law(spec: WorldSpec) -> dict[str, float]:
    if spec.family == "double_well":
        return {"x": float(spec.theta), "x3": -float(spec.cubic)}
    if spec.family == "linear_ou":
        return {"x": -float(spec.theta)}
    return {}


def _raw_coefficients(
    fit: FieldEstimate, center: float, scale: float
) -> list[float]:
    recovered = _unstandardize_law(fit.law_coefficients or {}, center, scale) or {}
    return [float(recovered.get(term, 0.0)) for term in SINDY_TERMS]


def _fit_repaired_diffusion_with_evidence(
    origins: np.ndarray,
    increments: np.ndarray,
    delta_times: np.ndarray,
    grid: np.ndarray,
) -> tuple[FieldEstimate, np.ndarray]:
    """Run the frozen D0.3.3 diffusion equations and retain residuals."""

    folds = _crossfit_folds(len(origins))
    diffusion_coefficients = np.asarray([0.0, 0.0, 0.0], dtype=float)
    drift_coefficients = np.zeros(5, dtype=float)
    out_of_fold = np.zeros_like(increments)
    for _ in range(4):
        current_log_variance = _polynomial_design(origins, 2) @ diffusion_coefficients
        current_variance = np.exp(np.clip(current_log_variance, -12.0, 6.0))
        for fold in (0, 1):
            train = folds != fold
            test = folds == fold
            coefficients, _ = _sparse_polynomial(
                _polynomial_design(origins[train], 4),
                increments[train] / delta_times[train],
                delta_times[train] / np.maximum(current_variance[train], 1e-8),
                regularization=0.02,
                threshold=0.035,
            )
            predicted = _polynomial_design(origins[test], 4) @ coefficients
            out_of_fold[test] = (
                increments[test] - predicted * delta_times[test]
            ) / np.sqrt(delta_times[test])
        squared = np.maximum(np.square(out_of_fold), 1e-10)
        log_target = np.log(squared) + 1.2703628454614782
        low, high = np.quantile(log_target, [0.025, 0.975])
        log_target = np.clip(log_target, low, high)
        diffusion_coefficients, diffusion_df = _sparse_polynomial(
            _polynomial_design(origins, 2),
            log_target,
            np.ones_like(delta_times),
            regularization=0.04,
            threshold=0.035,
        )
        variance = np.exp(
            np.clip(
                _polynomial_design(origins, 2) @ diffusion_coefficients,
                -12.0,
                6.0,
            )
        )
        drift_coefficients, drift_df = _sparse_polynomial(
            _polynomial_design(origins, 4),
            increments / delta_times,
            delta_times / np.maximum(variance, 1e-8),
            regularization=0.02,
            threshold=0.035,
        )
    drift_grid = _polynomial_design(grid, 4) @ drift_coefficients
    diffusion_grid = np.exp(
        0.5
        * np.clip(
            _polynomial_design(grid, 2) @ diffusion_coefficients,
            -12.0,
            6.0,
        )
    )
    constant = math.sqrt(max(float(np.mean(np.square(out_of_fold))), 1e-10))
    law = {
        name: float(value)
        for name, value in zip(SINDY_TERMS, drift_coefficients)
        if abs(float(value)) >= 1e-10
    }
    fit = FieldEstimate(
        estimator_id="EST-SINDY-D032-REPAIR-D033",
        grid=grid,
        drift=drift_grid,
        diffusion=diffusion_grid,
        constant_diffusion=constant,
        drift_effective_df=float(drift_df),
        diffusion_effective_df=float(diffusion_df),
        law_coefficients=law,
        uncertainty={
            "method": "two-fold moving-block cross-fitted innovations",
            "positive_parameterization": "g(x)=exp(0.5 * log g^2(x))",
            "alternations": 4,
        },
    )
    return fit, out_of_fold


def _capture_diffusion(
    spec: WorldSpec,
    values: np.ndarray,
    observed_at: Sequence[Any],
    seed: int,
) -> dict[str, Any]:
    (
        train_end,
        center,
        scale,
        origins,
        increments,
        train_dt,
        holdout_origins,
        holdout_targets,
        holdout_dt,
    ) = _standardized_training(values, observed_at)
    lower, upper = np.quantile(origins, [0.01, 0.99])
    grid = np.linspace(float(lower), float(upper), 161)
    fit, residuals = _fit_repaired_diffusion_with_evidence(
        origins, increments, train_dt, grid
    )
    constant_score = _point_scores(
        fit,
        holdout_origins,
        holdout_targets,
        holdout_dt,
        state_dependent=False,
    )
    state_score = _point_scores(
        fit,
        holdout_origins,
        holdout_targets,
        holdout_dt,
        state_dependent=True,
    )
    llr = float(2.0 * np.sum(constant_score["point_nll"] - state_score["point_nll"]))
    dominance = _bootstrap_dominance(
        constant_score["point_nll"], state_score["point_nll"], seed + 2_011
    )
    ratio = float(np.max(fit.diffusion) / max(np.min(fit.diffusion), 1e-10))
    support = _support(grid, origins)
    drift_error, diffusion_error = _reconstruction_errors(
        spec, fit, support, center, scale
    )
    raw_states = center + scale * origins
    _, true_diffusion_fn = _truth_functions(spec)
    true_g = true_diffusion_fn(raw_states)
    estimated_g = scale * fit.diffusion_at(origins, state_dependent=True)
    edges = np.unique(np.quantile(raw_states, np.linspace(0.0, 1.0, 9)))
    if len(edges) < 2:
        raise EvidenceCompleteReplicationError("diffusion support bins collapsed")
    evidence = capture_state_diffusion_evidence(
        drift_reconstruction_score=drift_error,
        g_reconstruction_score=diffusion_error,
        states=raw_states,
        cross_fitted_residuals=residuals,
        true_g=true_g,
        estimated_g=estimated_g,
        bin_edges=edges,
        twice_log_likelihood_ratio=llr,
        diffusion_max_min_ratio=ratio,
        bootstrap_dominance=dominance,
    )
    evidence["diagnostics"] = {
        "sealed_holdout_evaluated": True,
        "sealed_holdout_observations": len(holdout_targets),
        "fit_boundary": "all parameters frozen before sealed holdout",
        "mean_nll_gain": float(
            constant_score["mean_nll"] - state_score["mean_nll"]
        ),
        "variance_signal": bool(llr > 0.0 and dominance >= 0.50),
        "g_reconstruction_pass": bool(
            diffusion_error <= DIFFUSION_RECONSTRUCTION_THRESHOLD
        ),
        "positive_diffusion": bool(np.all(fit.diffusion > 0.0)),
        "cross_fit": dict(fit.uncertainty or {}),
        "training_observations": train_end,
    }
    return evidence


def _capture_topology_and_sindy(
    spec: WorldSpec,
    values: np.ndarray,
    observed_at: Sequence[Any],
    seed: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run the frozen D0.3.3 topology path and retain every bootstrap trace."""

    (
        train_end,
        center,
        scale,
        origins,
        increments,
        train_dt,
        holdout_origins,
        holdout_targets,
        holdout_dt,
    ) = _standardized_training(values, observed_at)
    lower, upper = np.quantile(origins, [0.005, 0.995])
    lower = max(-4.5, float(lower) - 0.75)
    upper = min(4.5, float(upper) + 0.75)
    grid = np.linspace(lower, upper, 241)
    raw_grid = center + scale * grid
    raw_origins = values[: train_end - 1]

    fit = _fit_sindy(origins, increments, train_dt, grid)
    raw_drift = scale * fit.drift
    full_roots = _raw_roots(raw_grid, raw_drift)
    full_topology = _topology_match(full_roots, spec)
    ou_fit = _fit_exact_ou(origins, increments, train_dt)
    ou_score = _score(ou_fit, holdout_origins, holdout_targets, holdout_dt)
    field_score = _point_scores(
        fit,
        holdout_origins,
        holdout_targets,
        holdout_dt,
        state_dependent=False,
    )
    holdout_gain = float(ou_score["mean_nll"] - field_score["mean_nll"])

    rng = np.random.default_rng(seed + 1_019)
    replicate_roots: list[list[dict[str, Any]]] = []
    replicate_fields: list[np.ndarray] = []
    coefficient_replicates: list[list[float]] = []
    for _ in range(ROOT_BOOTSTRAPS):
        indices = _moving_block_indices(len(origins), rng)
        replicate_fit = _fit_sindy(
            origins[indices],
            increments[indices],
            train_dt[indices],
            grid,
        )
        replicate_drift = scale * replicate_fit.drift
        roots: list[dict[str, Any]] = []
        for root in _raw_roots(raw_grid, replicate_drift):
            state = float(root["state"])
            occupancy_count = int(
                np.sum(np.abs(raw_origins - state) <= ROOT_CLUSTER_RADIUS)
            )
            nearest = (
                min(full_roots, key=lambda item: abs(float(item["state"]) - state))
                if full_roots
                else None
            )
            roots.append(
                {
                    "state": state,
                    "derivative": float(root["derivative"]),
                    "stable": bool(root["stable"]),
                    "stability_sign": "STABLE" if root["stable"] else "UNSTABLE",
                    "occupancy_count": occupancy_count,
                    "occupancy_fraction": occupancy_count / max(len(raw_origins), 1),
                    "nearest_full_root": (
                        float(nearest["state"]) if nearest is not None else None
                    ),
                    "nearest_full_root_distance": (
                        abs(float(nearest["state"]) - state)
                        if nearest is not None
                        else None
                    ),
                }
            )
        replicate_roots.append(roots)
        replicate_fields.append(replicate_drift)
        coefficient_replicates.append(
            _raw_coefficients(replicate_fit, center, scale)
        )
    if len(replicate_fields) != ROOT_BOOTSTRAPS:
        raise EvidenceCompleteReplicationError(
            "a required SINDy bootstrap replicate is missing"
        )

    clusters, annotated = _cluster_roots(replicate_roots, full_roots, raw_origins)
    triplet = _select_cluster_triplet(clusters)
    if triplet is not None:
        target_ids = [int(row["cluster_id"]) for row in triplet]
        left_midpoint = 0.5 * (
            float(triplet[0]["location"]) + float(triplet[1]["location"])
        )
        right_midpoint = 0.5 * (
            float(triplet[1]["location"]) + float(triplet[2]["location"])
        )
    else:
        target_ids = []
        left_midpoint = 0.0
        right_midpoint = 0.0

    sign_passes = 0
    barrier_passes = 0
    for roots, field in zip(annotated, replicate_fields):
        selected: list[Mapping[str, Any]] = []
        for cluster_id in target_ids:
            matches = [root for root in roots if root.get("cluster_id") == cluster_id]
            if matches:
                selected.append(
                    min(
                        matches,
                        key=lambda root: abs(
                            float(root["state"])
                            - float(clusters[cluster_id]["location"])
                        ),
                    )
                )
        pattern_pass = bool(
            len(selected) == 3
            and bool(selected[0]["stable"])
            and not bool(selected[1]["stable"])
            and bool(selected[2]["stable"])
        )
        direction_pass = bool(
            pattern_pass
            and float(np.interp(left_midpoint, raw_grid, field)) < 0.0
            and float(np.interp(right_midpoint, raw_grid, field)) > 0.0
        )
        sign_passes += direction_pass
        barrier = _barrier_summary(raw_grid, field, roots)
        barrier_passes += bool(pattern_pass and barrier["exists"])

    successful = len(replicate_fields)
    sign_support = sign_passes / successful
    barrier_support = barrier_passes / successful
    if triplet is None:
        root_support = 0.0
        stability_support = 0.0
        minimum_occupancy = 0
        root_certificate: list[dict[str, Any]] = []
    else:
        root_support = min(float(row["persistence"]) for row in triplet)
        stability_support = min(
            (
                float(row["stable_support"])
                if bool(row["stable"])
                else 1.0 - float(row["stable_support"])
            )
            for row in triplet
        )
        minimum_occupancy = min(int(row["occupancy_count"]) for row in triplet)
        root_certificate = [dict(row) for row in triplet]

    oracle_topology = None
    if spec.family == "double_well":
        raw_dt = _dt(observed_at)[: train_end - 1]
        oracle_fit = _fit_constant_candidate(
            raw_origins,
            np.diff(values[:train_end]),
            raw_dt,
            (1, 3),
        )
        oracle_roots = _raw_roots(raw_grid, oracle_fit.drift(raw_grid))
        oracle_topology = _topology_match(oracle_roots, spec)

    topology = capture_topology_stage_evidence(
        roots_by_bootstrap=annotated,
        root_clusters=clusters,
        root_certificate=root_certificate,
        minimum_cluster_occupancy=minimum_occupancy,
        holdout_mean_nll_gain_vs_ou=holdout_gain,
        root_persistence_support=root_support,
        stability_support=stability_support,
        sign_topology_support=sign_support,
        barrier_support=barrier_support,
    )
    topology["diagnostics"] = {
        "sealed_holdout_evaluated": True,
        "sealed_holdout_observations": len(holdout_targets),
        "fit_boundary": "field and root clusters frozen before sealed holdout",
        "full_field": {
            **full_topology,
            "roots": full_roots,
            "barrier": _barrier_summary(raw_grid, raw_drift, full_roots),
        },
        "oracle_support_fit": oracle_topology,
        "bootstrap": {
            "method": "moving-block transition bootstrap",
            "requested": ROOT_BOOTSTRAPS,
            "successful": successful,
            "root_cluster_radius": ROOT_CLUSTER_RADIUS,
        },
    }

    truth_coefficients = _truth_law(spec)
    sindy = capture_sindy_bootstrap_evidence(
        SINDY_TERMS,
        coefficient_replicates,
        truth_terms=sorted(truth_coefficients),
        selected_tolerance=SINDY_SELECTION_TOLERANCE,
    )
    sindy["truth_coefficients"] = {
        term: float(truth_coefficients.get(term, 0.0)) for term in SINDY_TERMS
    }
    sindy["point_fit_coefficients"] = {
        term: value
        for term, value in zip(
            SINDY_TERMS, _raw_coefficients(fit, center, scale)
        )
    }
    return topology, sindy


def _execute_world(
    world: ReplicationWorld,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    values, observed_at, _ = _simulate_world(world.spec, world.seed)
    world_hash = _world_hash(values, observed_at)
    base = {
        "world_id": world.spec.cell_id,
        "role": world.role,
        "repetition": world.repetition,
        "seed": world.seed,
        "world_hash": world_hash,
    }
    try:
        sindy = None
        topology = None
        diffusion = None
        if world.role in {"double_well", "linear_control", "no_basin_control"}:
            topology, sindy = _capture_topology_and_sindy(
                world.spec, values, observed_at, world.seed
            )
        if world.role in {"state_diffusion", "linear_control"}:
            diffusion = _capture_diffusion(
                world.spec, values, observed_at, world.seed
            )
        record = make_world_evidence_record(
            world_id=world.spec.cell_id,
            world_hash=world_hash,
            role=world.role,
            seed=world.seed,
            sindy=sindy,
            state_diffusion=diffusion,
            topology=topology,
        )
        return (
            {
                **base,
                "admission_status": "EVIDENCE_COMPLETE",
                "evidence_hash": record["evidence_hash"],
                "numerical_failure": False,
                "failure": None,
            },
            record,
        )
    except (ValueError, FloatingPointError, np.linalg.LinAlgError) as exc:
        return (
            {
                **base,
                "admission_status": "INSTRUMENTATION_INVALID",
                "evidence_hash": None,
                "numerical_failure": True,
                "failure": {"type": type(exc).__name__, "message": str(exc)},
            },
            None,
        )


def _wilson95(numerator: int, denominator: int) -> list[float] | None:
    if denominator <= 0:
        return None
    z = 1.959963984540054
    proportion = numerator / denominator
    z2 = z * z
    denominator_adjustment = 1.0 + z2 / denominator
    center = (proportion + z2 / (2.0 * denominator)) / denominator_adjustment
    radius = (
        z
        * math.sqrt(
            proportion * (1.0 - proportion) / denominator
            + z2 / (4.0 * denominator * denominator)
        )
        / denominator_adjustment
    )
    return [max(0.0, center - radius), min(1.0, center + radius)]


def _metric(
    numerator: int, denominator: int, definition: str
) -> dict[str, Any]:
    return {
        "numerator": numerator,
        "denominator": denominator,
        "estimate": _rate(numerator, denominator),
        "wilson95": _wilson95(numerator, denominator),
        "definition": definition,
    }


def _gate(section: Mapping[str, Any], name: str) -> Mapping[str, Any]:
    return next(row for row in section["gate_results"] if row["gate"] == name)


def _decision_row(
    record: Mapping[str, Any], world: ReplicationWorld
) -> dict[str, Any]:
    topology = record.get("topology")
    diffusion = record.get("state_diffusion")
    topology_certified = bool(
        isinstance(topology, Mapping)
        and topology["final_topology_gate"]["passed"]
    )
    diffusion_certified = bool(
        isinstance(diffusion, Mapping) and diffusion["final_conjunction"]["passed"]
    )
    stable_points: list[float] = []
    unstable_points: list[float] = []
    if topology_certified and isinstance(topology, Mapping):
        stable_points = [
            float(row["location"])
            for row in topology["root_certificate"]
            if bool(row["stable"])
        ]
        unstable_points = [
            float(row["location"])
            for row in topology["root_certificate"]
            if not bool(row["stable"])
        ]
    topology_match = bool(
        topology_certified
        and _match_points(
            world.spec.expected_stable_points,
            stable_points,
            TOPOLOGY_LOCATION_TOLERANCE,
        )
        == len(world.spec.expected_stable_points)
        and _match_points(
            world.spec.expected_unstable_points,
            unstable_points,
            TOPOLOGY_LOCATION_TOLERANCE,
        )
        == len(world.spec.expected_unstable_points)
        and len(stable_points) == len(world.spec.expected_stable_points)
        and len(unstable_points) == len(world.spec.expected_unstable_points)
    )
    return {
        "world_id": world.spec.cell_id,
        "role": world.role,
        "topology_certified": topology_certified,
        "state_diffusion_certified": diffusion_certified,
        "nonlinear_detected": topology_certified or diffusion_certified,
        "stable_points": stable_points,
        "unstable_points": unstable_points,
        "topology_match": topology_match,
    }


def _capability_estimates(
    records: Sequence[Mapping[str, Any]],
    plan: Sequence[ReplicationWorld],
    execution_records: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    by_id = {world.spec.cell_id: world for world in plan}
    decisions = [
        _decision_row(record, by_id[record["world"]["world_id"]])
        for record in records
    ]
    double_well = [row for row in decisions if row["role"] == "double_well"]
    state_diffusion = [row for row in decisions if row["role"] == "state_diffusion"]
    linear = [row for row in decisions if row["role"] == "linear_control"]
    basin_controls = [
        row
        for row in decisions
        if row["role"] in {"linear_control", "no_basin_control"}
    ]
    matched_stable = sum(
        _match_points(
            by_id[row["world_id"]].spec.expected_stable_points,
            row["stable_points"],
            TOPOLOGY_LOCATION_TOLERANCE,
        )
        for row in double_well
    )
    true_stable = sum(
        len(by_id[row["world_id"]].spec.expected_stable_points)
        for row in double_well
    )
    predicted_stable = sum(len(row["stable_points"]) for row in double_well)
    numerical_failures = sum(
        bool(row.get("numerical_failure")) for row in execution_records
    )
    return {
        "linear_specificity": _metric(
            sum(not row["nonlinear_detected"] for row in linear),
            len(linear),
            "linear controls with no certified nonlinear mechanism",
        ),
        "false_nonlinear_discovery_rate": _metric(
            sum(row["nonlinear_detected"] for row in linear),
            len(linear),
            "linear controls with any certified nonlinear mechanism",
        ),
        "false_basin_discovery_rate": _metric(
            sum(row["topology_certified"] for row in basin_controls),
            len(basin_controls),
            "linear and no-basin controls with a certified basin topology",
        ),
        "double_well_detection": _metric(
            sum(row["topology_certified"] for row in double_well),
            len(double_well),
            "double-well worlds with a certified topology",
        ),
        "basin_precision": _metric(
            matched_stable,
            predicted_stable,
            "matched stable points divided by certified stable points",
        ),
        "basin_recall": _metric(
            matched_stable,
            true_stable,
            "matched stable points divided by true stable points",
        ),
        "potential_topology_accuracy": _metric(
            sum(row["topology_match"] for row in double_well),
            len(double_well),
            "double-well worlds with exact certified stable-unstable-stable topology",
        ),
        "state_diffusion_detection": _metric(
            sum(row["state_diffusion_certified"] for row in state_diffusion),
            len(state_diffusion),
            "state-dependent diffusion worlds clearing all frozen diffusion gates",
        ),
        "numerical_failure_rate": _metric(
            numerical_failures,
            len(execution_records),
            "executed worlds with a numerical or evidence-capture failure",
        ),
        "evidence_completeness": _metric(
            len(records),
            len(execution_records),
            "executed worlds admitted under the D0.3.3.2 evidence contract",
        ),
    }


def _count_summary(count: int, total: int) -> dict[str, Any]:
    return {"count": count, "total": total, "rate": _rate(count, total)}


def _counter_rows(counter: Counter[str]) -> list[dict[str, Any]]:
    total = sum(counter.values())
    return [
        {
            "pattern": key,
            "count": count,
            "fraction": count / total if total else None,
        }
        for key, count in sorted(counter.items())
    ]


def _decision_decomposition(
    records: Sequence[Mapping[str, Any]], plan: Sequence[ReplicationWorld]
) -> dict[str, Any]:
    by_id = {world.spec.cell_id: world for world in plan}
    decisions = {
        record["world"]["world_id"]: _decision_row(
            record, by_id[record["world"]["world_id"]]
        )
        for record in records
    }
    topology_patterns: dict[str, Counter[str]] = {}
    diffusion_patterns: dict[str, Counter[str]] = {}
    for record in records:
        role = str(record["world"]["role"])
        topology = record.get("topology")
        diffusion = record.get("state_diffusion")
        if isinstance(topology, Mapping):
            topology_patterns.setdefault(role, Counter())[str(
                topology["final_topology_gate"]["decomposition_key"]
            )] += 1
        if isinstance(diffusion, Mapping):
            diffusion_patterns.setdefault(role, Counter())[str(
                diffusion["final_conjunction"]["decomposition_key"]
            )] += 1

    double_false_negatives: Counter[str] = Counter()
    diffusion_false_negatives: Counter[str] = Counter()
    linear_false_positives: Counter[str] = Counter()
    basin_false_positives: Counter[str] = Counter()
    record_by_id = {record["world"]["world_id"]: record for record in records}
    for world_id, decision in decisions.items():
        record = record_by_id[world_id]
        if decision["role"] == "double_well" and not decision["topology_certified"]:
            double_false_negatives[str(
                record["topology"]["final_topology_gate"]["decomposition_key"]
            )] += 1
        if (
            decision["role"] == "state_diffusion"
            and not decision["state_diffusion_certified"]
        ):
            diffusion_false_negatives[str(
                record["state_diffusion"]["final_conjunction"]["decomposition_key"]
            )] += 1
        if decision["role"] == "linear_control" and decision["nonlinear_detected"]:
            mechanisms = []
            if decision["topology_certified"]:
                mechanisms.append("TOPOLOGY")
            if decision["state_diffusion_certified"]:
                mechanisms.append("STATE_DIFFUSION")
            linear_false_positives["+".join(mechanisms)] += 1
        if (
            decision["role"] in {"linear_control", "no_basin_control"}
            and decision["topology_certified"]
        ):
            basin_false_positives[decision["role"]] += 1

    double_records = [
        record for record in records if record["world"]["role"] == "double_well"
    ]
    topology_stages = {
        "oracle_support_topology": sum(
            bool(
                record["topology"]["diagnostics"].get("oracle_support_fit")
                and record["topology"]["diagnostics"]["oracle_support_fit"][
                    "topology_match"
                ]
            )
            for record in double_records
        ),
        "full_field_topology": sum(
            bool(
                record["topology"]["diagnostics"]["full_field"]["topology_match"]
            )
            for record in double_records
        ),
        "root_cluster_triplet": sum(
            bool(_gate(record["topology"], "root_cluster_triplet")["passed"])
            for record in double_records
        ),
        "minimum_cluster_occupancy": sum(
            bool(_gate(record["topology"], "minimum_cluster_occupancy")["passed"])
            for record in double_records
        ),
        "sealed_holdout_gain": sum(
            bool(_gate(record["topology"], "sealed_holdout_gain")["passed"])
            for record in double_records
        ),
        "root_persistence": sum(
            bool(_gate(record["topology"], "root_persistence")["passed"])
            for record in double_records
        ),
        "stability_support": sum(
            bool(_gate(record["topology"], "stability_support")["passed"])
            for record in double_records
        ),
        "sign_topology": sum(
            bool(_gate(record["topology"], "sign_topology")["passed"])
            for record in double_records
        ),
        "barrier_support": sum(
            bool(_gate(record["topology"], "barrier_support")["passed"])
            for record in double_records
        ),
        "certificate_score": sum(
            bool(_gate(record["topology"], "certificate_score")["passed"])
            for record in double_records
        ),
        "final_topology_gate": sum(
            bool(record["topology"]["final_topology_gate"]["passed"])
            for record in double_records
        ),
        "exact_topology_match": sum(
            decisions[record["world"]["world_id"]]["topology_match"]
            for record in double_records
        ),
    }
    return {
        "topology_gate_patterns": {
            role: _counter_rows(counter)
            for role, counter in sorted(topology_patterns.items())
        },
        "diffusion_conjunction_patterns": {
            role: _counter_rows(counter)
            for role, counter in sorted(diffusion_patterns.items())
        },
        "classification_errors": {
            "double_well_false_negatives": _counter_rows(double_false_negatives),
            "state_diffusion_false_negatives": _counter_rows(
                diffusion_false_negatives
            ),
            "linear_false_nonlinear_discoveries": _counter_rows(
                linear_false_positives
            ),
            "control_false_basin_discoveries": _counter_rows(
                basin_false_positives
            ),
        },
        "topology_waterfall": {
            stage: _count_summary(count, len(double_records))
            for stage, count in topology_stages.items()
        },
    }


def _entropy_rows(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    counts = [int(row["count"]) for row in rows if int(row["count"]) > 0]
    total = sum(counts)
    if total == 0:
        return {
            "observations": 0,
            "patterns": 0,
            "entropy_bits": None,
            "normalized_entropy": None,
        }
    probabilities = [count / total for count in counts]
    entropy = -sum(value * math.log2(value) for value in probabilities)
    normalized = entropy / math.log2(len(counts)) if len(counts) > 1 else 0.0
    return {
        "observations": total,
        "patterns": len(counts),
        "entropy_bits": entropy,
        "normalized_entropy": normalized,
    }


def _failure_entropy(decomposition: Mapping[str, Any]) -> dict[str, Any]:
    errors = decomposition["classification_errors"]
    return {
        "interpretation": (
            "descriptive Shannon entropy over observed exact gate-pattern counts; "
            "not a hypothesis test or capability gate"
        ),
        "by_error_class": {
            name: _entropy_rows(rows) for name, rows in errors.items()
        },
    }


def _coefficient_sign(value: float) -> str:
    if value > SINDY_SELECTION_TOLERANCE:
        return "POSITIVE"
    if value < -SINDY_SELECTION_TOLERANCE:
        return "NEGATIVE"
    return "ZERO"


def _distribution(values: Sequence[float]) -> dict[str, float] | None:
    if not values:
        return None
    array = np.asarray(values, dtype=float)
    return {
        "mean": float(np.mean(array)),
        "median": float(np.median(array)),
        "q05": float(np.quantile(array, 0.05)),
        "q95": float(np.quantile(array, 0.95)),
    }


def _sindy_role_diagnostics(
    records: Sequence[Mapping[str, Any]], role: str
) -> dict[str, Any]:
    members = [record for record in records if record["world"]["role"] == role]
    bootstrap_repetitions = 0
    true_opportunities = 0
    true_inclusions = 0
    false_opportunities = 0
    false_inclusions = 0
    selected_terms = 0
    selected_true_terms = 0
    sign_opportunities = 0
    correct_signs = 0
    exact_support = 0
    coefficient_errors: list[float] = []
    term_inclusions = Counter({term: 0 for term in SINDY_TERMS})
    truth_terms: set[str] = set()
    for record in members:
        sindy = record["sindy"]
        local_truth = set(str(term) for term in sindy["truth_terms"])
        truth_terms.update(local_truth)
        truth_coefficients = {
            term: float(value) for term, value in sindy["truth_coefficients"].items()
        }
        truth_vector = np.asarray(
            [truth_coefficients.get(term, 0.0) for term in SINDY_TERMS],
            dtype=float,
        )
        truth_norm = float(np.linalg.norm(truth_vector))
        for replicate in sindy["replicates"]:
            bootstrap_repetitions += 1
            selected = set(str(term) for term in replicate["selected_terms"])
            exact_support += selected == local_truth
            selected_terms += len(selected)
            selected_true_terms += len(selected & local_truth)
            true_opportunities += len(local_truth)
            true_inclusions += len(selected & local_truth)
            false_terms = set(SINDY_TERMS) - local_truth
            false_opportunities += len(false_terms)
            false_inclusions += len(selected & false_terms)
            for term in selected:
                term_inclusions[term] += 1
            for term in local_truth:
                sign_opportunities += 1
                if replicate["coefficient_signs"][term] == _coefficient_sign(
                    truth_coefficients[term]
                ):
                    correct_signs += 1
            if truth_norm > 0.0:
                recovered = np.asarray(
                    [float(replicate["coefficients"][term]) for term in SINDY_TERMS]
                )
                coefficient_errors.append(
                    float(np.linalg.norm(recovered - truth_vector)) / truth_norm
                )
    term_frequencies = {
        term: {
            "truth_term": term in truth_terms,
            "inclusion_count": int(term_inclusions[term]),
            "inclusion_frequency": (
                term_inclusions[term] / bootstrap_repetitions
                if bootstrap_repetitions
                else None
            ),
        }
        for term in SINDY_TERMS
    }
    true_frequencies = [
        row["inclusion_frequency"]
        for row in term_frequencies.values()
        if row["truth_term"] and row["inclusion_frequency"] is not None
    ]
    false_frequencies = [
        row["inclusion_frequency"]
        for row in term_frequencies.values()
        if not row["truth_term"] and row["inclusion_frequency"] is not None
    ]
    separation = (
        min(true_frequencies) - max(false_frequencies)
        if true_frequencies and false_frequencies
        else None
    )
    return {
        "worlds": len(members),
        "bootstrap_repetitions": bootstrap_repetitions,
        "true_term_recall": _rate(true_inclusions, true_opportunities),
        "structural_precision": _rate(selected_true_terms, selected_terms),
        "false_term_selection_rate": _rate(false_inclusions, false_opportunities),
        "exact_support_rate": _rate(exact_support, bootstrap_repetitions),
        "true_term_sign_correctness": _rate(correct_signs, sign_opportunities),
        "coefficient_relative_error": _distribution(coefficient_errors),
        "term_frequencies": term_frequencies,
        "true_false_frequency_separation": separation,
    }


def _sindy_diagnostics(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    applicable_roles = ("double_well", "linear_control", "no_basin_control")
    by_role = {
        role: _sindy_role_diagnostics(records, role) for role in applicable_roles
    }
    true_inclusions = 0
    true_opportunities = 0
    false_inclusions = 0
    false_opportunities = 0
    for record in records:
        sindy = record.get("sindy")
        if not isinstance(sindy, Mapping):
            continue
        truth = set(str(term) for term in sindy["truth_terms"])
        for replicate in sindy["replicates"]:
            selected = set(str(term) for term in replicate["selected_terms"])
            true_inclusions += len(selected & truth)
            true_opportunities += len(truth)
            false = set(SINDY_TERMS) - truth
            false_inclusions += len(selected & false)
            false_opportunities += len(false)
    return {
        "selection_tolerance": SINDY_SELECTION_TOLERANCE,
        "metric_naming": {
            "structural_precision": (
                "selected true terms divided by all selected terms; this avoids "
                "the ambiguous phrase false-term precision"
            ),
            "false_term_selection_rate": (
                "selected false-term opportunities divided by all false-term opportunities"
            ),
        },
        "aggregate": {
            "true_term_inclusion_frequency": _rate(
                true_inclusions, true_opportunities
            ),
            "false_term_inclusion_frequency": _rate(
                false_inclusions, false_opportunities
            ),
            "frequency_separation": (
                _rate(true_inclusions, true_opportunities)
                - _rate(false_inclusions, false_opportunities)
                if true_opportunities and false_opportunities
                else None
            ),
        },
        "by_role": by_role,
    }


def _parent_metric_counts(parent: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    metrics = parent["confirmation_metrics"]
    counts = metrics["counts"]
    denominators = {
        "linear_specificity": int(counts["linear_controls"]),
        "false_nonlinear_discovery_rate": int(counts["linear_controls"]),
        "false_basin_discovery_rate": int(counts["basin_controls"]),
        "double_well_detection": int(counts["double_well"]),
        "basin_precision": int(counts["predicted_stable_points"]),
        "basin_recall": int(counts["true_stable_points"]),
        "potential_topology_accuracy": int(counts["double_well"]),
        "state_diffusion_detection": int(counts["state_diffusion"]),
        "numerical_failure_rate": int(counts["repair_evaluations"]),
    }
    return {
        name: _metric(
            int(round(float(metrics[name]) * denominator)),
            denominator,
            "frozen D0.3.3 confirmation estimate",
        )
        for name, denominator in denominators.items()
    }


def _replication_delta(
    replication: Mapping[str, Any], parent: Mapping[str, Any]
) -> dict[str, Any]:
    confirmation = _parent_metric_counts(parent)
    lower_is_better = {
        "false_nonlinear_discovery_rate",
        "false_basin_discovery_rate",
        "numerical_failure_rate",
    }
    rows: dict[str, Any] = {}
    for name, old in confirmation.items():
        new = replication[name]
        old_interval = old["wilson95"]
        new_interval = new["wilson95"]
        interpretation = "UNRESOLVED"
        if old_interval is not None and new_interval is not None:
            if name in lower_is_better:
                if new_interval[1] < old_interval[0]:
                    interpretation = "IMPROVED"
                elif new_interval[0] > old_interval[1]:
                    interpretation = "DEGRADED"
                else:
                    interpretation = "OVERLAPPING_UNCERTAINTY"
            elif new_interval[0] > old_interval[1]:
                interpretation = "IMPROVED"
            elif new_interval[1] < old_interval[0]:
                interpretation = "DEGRADED"
            else:
                interpretation = "OVERLAPPING_UNCERTAINTY"
        rows[name] = {
            "d0_3_3_confirmation": old,
            "d0_3_4_replication": new,
            "absolute_delta": (
                float(new["estimate"]) - float(old["estimate"])
                if new["estimate"] is not None and old["estimate"] is not None
                else None
            ),
            "uncertainty_interpretation": interpretation,
            "comparison_design": "independent seed ledgers; unpaired intervals",
        }
    return rows


CAPABILITY_GATES: dict[str, tuple[str, float] | None] = {
    "linear_specificity": (">=", GRADUATION_GATES["linear_specificity"]),
    "false_nonlinear_discovery_rate": (
        "<=",
        GRADUATION_GATES["false_nonlinear_discovery_rate_max"],
    ),
    "false_basin_discovery_rate": (
        "<=",
        GRADUATION_GATES["false_basin_discovery_rate_max"],
    ),
    "double_well_detection": (">=", GRADUATION_GATES["double_well_detection"]),
    "basin_precision": None,
    "basin_recall": (">=", GRADUATION_GATES["basin_recall"]),
    "potential_topology_accuracy": (
        ">=",
        GRADUATION_GATES["potential_topology_accuracy"],
    ),
    "state_diffusion_detection": (
        ">=",
        GRADUATION_GATES["state_diffusion_detection"],
    ),
    "numerical_failure_rate": (
        "<=",
        GRADUATION_GATES["numerical_failure_rate_max"],
    ),
}


def _capability_classifications(
    metrics: Mapping[str, Any], evidence_complete: bool
) -> dict[str, Any]:
    rows: dict[str, Any] = {}
    for name, gate in CAPABILITY_GATES.items():
        interval = metrics[name]["wilson95"]
        if not evidence_complete:
            classification = "UNRESOLVED"
            reason = "the 400-world evidence admission rule failed"
        elif gate is None:
            classification = "UNRESOLVED"
            reason = "D0.3.3 preregistered no basin-precision graduation threshold"
        elif interval is None:
            classification = "UNRESOLVED"
            reason = "the admitted denominator is empty"
        else:
            comparator, threshold = gate
            if comparator == ">=":
                if interval[0] >= threshold:
                    classification = "CAPABILITY_SUPPORTED"
                    reason = "the Wilson lower bound clears the frozen gate"
                elif interval[1] < threshold:
                    classification = "LIMITATION_REPLICATED"
                    reason = "the Wilson upper bound remains below the frozen gate"
                else:
                    classification = "UNRESOLVED"
                    reason = "the Wilson interval crosses the frozen gate"
            else:
                if interval[1] <= threshold:
                    classification = "CAPABILITY_SUPPORTED"
                    reason = "the Wilson upper bound clears the frozen maximum"
                elif interval[0] > threshold:
                    classification = "LIMITATION_REPLICATED"
                    reason = "the Wilson lower bound exceeds the frozen maximum"
                else:
                    classification = "UNRESOLVED"
                    reason = "the Wilson interval crosses the frozen maximum"
        rows[name] = {
            "classification": classification,
            "gate": (
                {"comparator": gate[0], "threshold": gate[1]}
                if gate is not None
                else None
            ),
            "estimate": metrics[name]["estimate"],
            "wilson95": interval,
            "reason": reason,
        }
    return rows


def _program_result(
    classifications: Mapping[str, Any], evidence_complete: bool
) -> dict[str, Any]:
    if not evidence_complete:
        return {
            "status": "INSTRUMENTATION_INVALID",
            "scalar_pass_fail": None,
            "reason": "fewer than 400 worlds supplied complete contract evidence",
        }
    counts = Counter(
        str(row["classification"]) for row in classifications.values()
    )
    if counts["CAPABILITY_SUPPORTED"] == len(classifications):
        status = "CAPABILITY_VECTOR_SUPPORTED"
    elif counts["LIMITATION_REPLICATED"] == len(classifications):
        status = "LIMITATION_VECTOR_REPLICATED"
    else:
        status = "PARTIALLY_CHARACTERIZED"
    return {
        "status": status,
        "scalar_pass_fail": None,
        "classification_counts": dict(sorted(counts.items())),
        "reason": "D0.3.4 reports a capability vector, not a scalar graduation vote",
    }


def _analysis_bundle(
    records: Sequence[Mapping[str, Any]],
    plan: Sequence[ReplicationWorld],
    execution_records: Sequence[Mapping[str, Any]],
    parent: Mapping[str, Any],
) -> dict[str, Any]:
    metrics = _capability_estimates(records, plan, execution_records)
    decomposition = _decision_decomposition(records, plan)
    evidence_complete = bool(
        len(records) == TOTAL_WORLDS
        and len(execution_records) == TOTAL_WORLDS
        and all(
            row.get("admission_status") == "EVIDENCE_COMPLETE"
            for row in execution_records
        )
    )
    classifications = _capability_classifications(metrics, evidence_complete)
    return {
        "capability_estimates": metrics,
        "decision_decomposition": decomposition,
        "sindy_diagnostics": _sindy_diagnostics(records),
        "failure_entropy": _failure_entropy(decomposition),
        "replication_delta": _replication_delta(metrics, parent),
        "capability_classifications": classifications,
        "program_result": _program_result(classifications, evidence_complete),
    }


def _parent_seals(contract: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [
        *[dict(row) for row in PARENT_SEALS],
        {
            "milestone": "D0.3.3.2",
            "artifact": "eval/dynamics/d0_3_3_2/evidence_instrumentation_contract.json",
            "artifact_hash": D0332_ARTIFACT_HASH,
            "file_sha256": D0332_FILE_SHA256,
            "capture_sources": [
                dict(row)
                for row in contract["capture_implementation"]["sources"]
            ],
        },
    ]


def _seed_ledger(
    plan: Sequence[ReplicationWorld],
    prior_seeds: set[int],
    prior_sources: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    ledger = _plan_ledger(plan)
    replication_seeds = [world.seed for world in plan]
    return {
        "plan_hash": canonical_sha256(ledger),
        "replication_worlds": ledger,
        "replication_seed_count": len(set(replication_seeds)),
        "replication_seed_digest": canonical_sha256(sorted(replication_seeds)),
        "prior_seed_count": len(prior_seeds),
        "prior_seed_digest": canonical_sha256(sorted(prior_seeds)),
        "prior_seed_sources": [dict(row) for row in prior_sources],
        "disjoint_from_prior": not bool(set(replication_seeds) & prior_seeds),
    }


@lru_cache(maxsize=1)
def run_evidence_complete_replication() -> dict[str, Any]:
    """Execute all 400 preregistered worlds without selection or early stopping."""

    if _file_sha256(D0332_ARTIFACT) != D0332_FILE_SHA256:
        raise EvidenceCompleteReplicationError("D0.3.3.2 contract bytes changed")
    contract = load_frozen_evidence_instrumentation_contract()
    if contract.get("artifact_hash") != D0332_ARTIFACT_HASH:
        raise EvidenceCompleteReplicationError("D0.3.3.2 content address changed")
    parent = _load_targeted_recovery_portable()
    prior_seeds, prior_sources = _prior_seed_evidence()
    plan = _replication_plan()
    ledger = _plan_ledger(plan)
    replication_seeds = [world.seed for world in plan]
    if len(plan) != TOTAL_WORLDS or len(set(replication_seeds)) != TOTAL_WORLDS:
        raise EvidenceCompleteReplicationError("replication plan is not 400 unique worlds")
    if set(replication_seeds) & prior_seeds:
        raise EvidenceCompleteReplicationError("replication seeds overlap prior milestones")
    role_counts = Counter(world.role for world in plan)
    if role_counts != Counter({role: WORLD_COUNT_PER_ROLE for role in ROLE_ORDER}):
        raise EvidenceCompleteReplicationError("replication role counts changed")

    preregistration = _preregistration(plan, prior_sources)
    preregistration_hash = canonical_sha256(preregistration)
    execution_records: list[dict[str, Any]] = []
    world_evidence: list[dict[str, Any]] = []
    for world in plan:
        execution, evidence = _execute_world(world)
        execution_records.append(execution)
        if evidence is not None:
            world_evidence.append(evidence)

    analysis = _analysis_bundle(world_evidence, plan, execution_records, parent)
    payload: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "milestone": "D0.3.4",
        "frozen": True,
        "title": "Evidence-complete nonlinear replication",
        "parent_seals": _parent_seals(contract),
        "preregistration": preregistration,
        "preregistration_hash": preregistration_hash,
        "frozen_instrument": {
            "milestone": "D0.3.3",
            "estimator_source_sha256": D033_SOURCE_SHA256,
            "thresholds": dict(FROZEN_THRESHOLDS),
            "mutation_policy": "NO ESTIMATOR, EQUATION, THRESHOLD, OR OPERATING-POINT CHANGES",
        },
        "implementation_sources": {
            "d0_3_3_2_capture_sources": [
                dict(row)
                for row in contract["capture_implementation"]["sources"]
            ],
            "d0_3_4_replication_source": {
                "source": "src/dynamics/evidence_complete_replication.py",
                "sha256": _source_sha256(REPLICATION_SOURCE),
            },
        },
        "seed_ledger": _seed_ledger(plan, prior_seeds, prior_sources),
        "execution": {
            "planned_worlds": TOTAL_WORLDS,
            "executed_worlds": len(execution_records),
            "admitted_worlds": len(world_evidence),
            "development_worlds": 0,
            "tuning_events": 0,
            "stopped_early": False,
            "root_bootstraps_per_topology_world": ROOT_BOOTSTRAPS,
            "plan_hash_before_execution": canonical_sha256(ledger),
        },
        "execution_records": execution_records,
        "world_evidence": world_evidence,
        **analysis,
        "real_market_claim": {
            "selected_model": "M1",
            "market_claim": "ABSTAIN",
            "rerun_performed": False,
            "historical_result_overwritten": False,
            "interpretation": (
                "No nonlinear structure was certified by an estimator whose "
                "nonlinear identification power is currently insufficient."
            ),
        },
        "market_claim_eligible": False,
        "routing": {
            "next_milestone_selected": None,
            "repair_started": False,
            "hawkes_started": False,
            "event_dynamics_locked": True,
        },
        "excluded_scope": [
            "estimator repair",
            "threshold selection",
            "operating-point changes",
            "development set",
            "early stopping",
            "real-market rerun",
            "market-claim promotion",
            "Hawkes dynamics",
        ],
    }
    payload["artifact_hash"] = canonical_sha256(payload)
    return payload


def verify_evidence_complete_replication(
    artifact: Mapping[str, Any], *, verify_local_sources: bool = True
) -> dict[str, Any]:
    """Recompute D0.3.4 metrics and reject lineage or evidence drift."""

    errors: list[str] = []
    body = dict(artifact)
    claimed_hash = body.pop("artifact_hash", None)
    calculated_hash = canonical_sha256(body)
    if claimed_hash != calculated_hash:
        errors.append("artifact_hash does not match canonical payload")
    if artifact.get("schema_version") != SCHEMA_VERSION:
        errors.append("schema_version is not the frozen D0.3.4 schema")
    if artifact.get("milestone") != "D0.3.4" or artifact.get("frozen") is not True:
        errors.append("D0.3.4 artifact identity changed")

    contract = load_frozen_evidence_instrumentation_contract()
    parent = _load_targeted_recovery_portable()
    if artifact.get("parent_seals") != _parent_seals(contract):
        errors.append("parent seals changed")
    instrument = artifact.get("frozen_instrument", {})
    if not isinstance(instrument, Mapping):
        errors.append("frozen instrument declaration is missing")
        instrument = {}
    if instrument.get("estimator_source_sha256") != D033_SOURCE_SHA256:
        errors.append("D0.3.3 estimator source seal changed")
    if instrument.get("thresholds") != FROZEN_THRESHOLDS:
        errors.append("frozen D0.3.3 thresholds changed")
    if instrument.get("mutation_policy") != (
        "NO ESTIMATOR, EQUATION, THRESHOLD, OR OPERATING-POINT CHANGES"
    ):
        errors.append("frozen instrument mutation policy changed")

    prior_seeds, prior_sources = _prior_seed_evidence()
    plan = _replication_plan()
    ledger = _plan_ledger(plan)
    expected_preregistration = _preregistration(plan, prior_sources)
    if artifact.get("preregistration") != expected_preregistration:
        errors.append("preregistration changed")
    if artifact.get("preregistration_hash") != canonical_sha256(
        expected_preregistration
    ):
        errors.append("preregistration hash does not reconcile")
    expected_seed_ledger = _seed_ledger(plan, prior_seeds, prior_sources)
    if artifact.get("seed_ledger") != expected_seed_ledger:
        errors.append("seed ledger or prior-seed proof changed")
    replication_seeds = {world.seed for world in plan}
    if replication_seeds & prior_seeds:
        errors.append("replication seeds overlap a prior Dynamics milestone")

    execution = artifact.get("execution", {})
    if not isinstance(execution, Mapping):
        errors.append("execution summary is missing")
        execution = {}
    if (
        execution.get("planned_worlds") != TOTAL_WORLDS
        or execution.get("executed_worlds") != TOTAL_WORLDS
        or execution.get("admitted_worlds") != TOTAL_WORLDS
        or execution.get("development_worlds") != 0
        or execution.get("tuning_events") != 0
        or execution.get("stopped_early") is not False
        or execution.get("root_bootstraps_per_topology_world") != ROOT_BOOTSTRAPS
        or execution.get("plan_hash_before_execution")
        != canonical_sha256(ledger)
    ):
        errors.append("400-world no-tuning execution boundary changed")

    execution_records = artifact.get("execution_records", [])
    evidence_records = artifact.get("world_evidence", [])
    if not isinstance(execution_records, list) or len(execution_records) != TOTAL_WORLDS:
        errors.append("execution_records must contain exactly 400 worlds")
        execution_records = []
    if not isinstance(evidence_records, list) or len(evidence_records) != TOTAL_WORLDS:
        errors.append("world_evidence must contain exactly 400 admitted records")
        evidence_records = []

    expected_by_id = {world.spec.cell_id: world for world in plan}
    expected_ids = set(expected_by_id)
    execution_by_id: dict[str, Mapping[str, Any]] = {}
    for row in execution_records:
        if not isinstance(row, Mapping):
            errors.append("execution record is malformed")
            continue
        world_id = str(row.get("world_id"))
        if world_id in execution_by_id:
            errors.append(f"duplicate execution world: {world_id}")
        execution_by_id[world_id] = row
        expected = expected_by_id.get(world_id)
        if expected is None:
            errors.append(f"unexpected execution world: {world_id}")
            continue
        if (
            row.get("role") != expected.role
            or row.get("repetition") != expected.repetition
            or row.get("seed") != expected.seed
        ):
            errors.append(f"execution identity changed: {world_id}")
        if row.get("admission_status") != "EVIDENCE_COMPLETE":
            errors.append(f"world is not evidence-complete: {world_id}")
        if row.get("numerical_failure") is not False or row.get("failure") is not None:
            errors.append(f"world has a frozen numerical failure: {world_id}")
    if set(execution_by_id) != expected_ids:
        errors.append("execution world identity set changed")

    evidence_by_id: dict[str, Mapping[str, Any]] = {}
    for record in evidence_records:
        if not isinstance(record, Mapping):
            errors.append("world evidence record is malformed")
            continue
        report = verify_world_evidence_record(record)
        if not report["valid"]:
            errors.extend(
                f"{record.get('world', {}).get('world_id')}: {message}"
                for message in report["errors"]
            )
        world = record.get("world", {})
        world_id = str(world.get("world_id"))
        if world_id in evidence_by_id:
            errors.append(f"duplicate evidence world: {world_id}")
        evidence_by_id[world_id] = record
        expected = expected_by_id.get(world_id)
        if expected is None:
            errors.append(f"unexpected evidence world: {world_id}")
            continue
        if world.get("role") != expected.role or world.get("seed") != expected.seed:
            errors.append(f"evidence identity changed: {world_id}")
        execution_row = execution_by_id.get(world_id, {})
        if execution_row.get("evidence_hash") != record.get("evidence_hash"):
            errors.append(f"execution/evidence hash mismatch: {world_id}")
    if set(evidence_by_id) != expected_ids:
        errors.append("evidence world identity set changed")

    replication_world_ledger: list[dict[str, Any]] = []
    if evidence_by_id and execution_by_id:
        for world_id, expected in expected_by_id.items():
            evidence_hash = str(
                evidence_by_id.get(world_id, {})
                .get("world", {})
                .get("world_hash", "")
            )
            execution_hash = str(
                execution_by_id.get(world_id, {}).get("world_hash", "")
            )
            if len(evidence_hash) != 64 or any(
                character not in "0123456789abcdef" for character in evidence_hash
            ):
                errors.append(f"invalid world hash: {world_id}")
            if execution_hash != evidence_hash:
                errors.append(f"execution world hash changed: {world_id}")
            replication_world_ledger.append(
                {
                    "world_id": world_id,
                    "role": expected.role,
                    "seed": expected.seed,
                    "world_hash": evidence_hash,
                }
            )
    if len({row["world_hash"] for row in replication_world_ledger}) != len(
        replication_world_ledger
    ):
        errors.append("replication world hashes are not unique")
    if canonical_sha256(replication_world_ledger) != REPLICATION_WORLD_LEDGER_HASH:
        errors.append("replication world hash ledger changed")

    if len(evidence_records) == TOTAL_WORLDS and len(execution_records) == TOTAL_WORLDS:
        try:
            expected_analysis = _analysis_bundle(
                evidence_records, plan, execution_records, parent
            )
        except (KeyError, TypeError, ValueError) as exc:
            errors.append(f"analysis recomputation failed: {exc}")
        else:
            for key, value in expected_analysis.items():
                if key == "sindy_diagnostics":
                    continue
                if canonical_sha256(artifact.get(key)) != canonical_sha256(value):
                    errors.append(f"{key} does not reconcile")
    if canonical_sha256(artifact.get("sindy_diagnostics")) != SINDY_DIAGNOSTICS_HASH:
        errors.append("sindy diagnostics do not match the frozen evidence seal")

    implementation = artifact.get("implementation_sources", {})
    expected_implementation = {
        "d0_3_3_2_capture_sources": [
            dict(row) for row in contract["capture_implementation"]["sources"]
        ],
        "d0_3_4_replication_source": {
            "source": "src/dynamics/evidence_complete_replication.py",
            "sha256": _source_sha256(REPLICATION_SOURCE),
        },
    }
    if implementation != expected_implementation:
        errors.append("implementation source seals changed")
    if verify_local_sources:
        if _file_sha256(D0332_ARTIFACT) != D0332_FILE_SHA256:
            errors.append("local D0.3.3.2 artifact bytes changed")
        d033_source = ROOT / "src/dynamics/targeted_recovery.py"
        if _source_sha256(d033_source) != D033_SOURCE_SHA256:
            errors.append("local D0.3.3 estimator source changed")

    market = artifact.get("real_market_claim", {})
    if (
        not isinstance(market, Mapping)
        or market.get("selected_model") != "M1"
        or market.get("market_claim") != "ABSTAIN"
        or market.get("rerun_performed") is not False
        or market.get("historical_result_overwritten") is not False
        or artifact.get("market_claim_eligible") is not False
    ):
        errors.append("forbidden real-market claim or rerun detected")
    routing = artifact.get("routing", {})
    if (
        not isinstance(routing, Mapping)
        or routing.get("repair_started") is not False
        or routing.get("hawkes_started") is not False
        or routing.get("event_dynamics_locked") is not True
    ):
        errors.append("post-replication work leaked into D0.3.4")
    return {
        "valid": not errors,
        "artifact_hash": claimed_hash,
        "calculated_hash": calculated_hash,
        "executed_worlds": len(execution_records),
        "evidence_complete_worlds": len(evidence_records),
        "program_result": artifact.get("program_result", {}).get("status"),
        "errors": errors,
    }


def load_frozen_evidence_complete_replication(
    path: Path = DEFAULT_D034_ARTIFACT,
) -> dict[str, Any]:
    if not path.exists():
        raise EvidenceCompleteReplicationError(
            "the frozen D0.3.4 artifact is unavailable; run the freeze script"
        )
    artifact = json.loads(path.read_text(encoding="utf-8"))
    report = verify_evidence_complete_replication(artifact)
    if not report["valid"]:
        raise EvidenceCompleteReplicationError("; ".join(report["errors"]))
    return artifact
D033_ARTIFACT = ROOT / "eval/dynamics/d0_3_3/targeted_recovery.json"
D033_FILE_SHA256 = (
    "b038c55bcc7fc7632e8befb6a0daa2d679d957292f0a9c3e83fba8d174616993"
)
def _load_targeted_recovery_portable() -> dict[str, Any]:
    """Load D0.3.3 while treating CRLF and LF as the same sealed source."""

    if _file_sha256(D033_ARTIFACT) != D033_FILE_SHA256:
        raise EvidenceCompleteReplicationError("D0.3.3 artifact bytes changed")
    artifact = json.loads(D033_ARTIFACT.read_text(encoding="utf-8"))
    report = verify_targeted_recovery(artifact, verify_local_sources=False)
    if not report["valid"]:
        raise EvidenceCompleteReplicationError(
            "invalid frozen D0.3.3 parent: " + "; ".join(report["errors"])
        )
    source = ROOT / "src/dynamics/targeted_recovery.py"
    if _source_sha256(source) != D033_SOURCE_SHA256:
        raise EvidenceCompleteReplicationError("D0.3.3 estimator source changed")
    return artifact


