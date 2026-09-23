"""D0.3.3 targeted nonlinear recovery.

This milestone repairs only the two estimator-limited failure modes isolated by
D0.3.2.1. Development worlds calibrate prespecified operating rules. The
confirmation worlds are evaluated only after those rules are locked, and the
historical D0.3.2.1 failures are reopened last as an audit rather than a tuning
target.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

from src.dynamics.estimator_tournament import (
    FieldEstimate,
    _bootstrap_dominance,
    _evaluate_new_estimator,
    _fit_exact_ou,
    _fit_sindy,
    _point_scores,
    _polynomial_design,
    _reconstruction_errors,
    _score,
    _sparse_polynomial,
    _support,
    _world_hash,
)
from src.dynamics.failure_decomposition import (
    _fit_constant_candidate,
    _oracle_comparison,
    load_frozen_failure_decomposition,
)
from src.dynamics.identifiability import (
    TOPOLOGY_LOCATION_TOLERANCE,
    WorldSpec,
    _match_points,
    _reference_specs,
    _simulate_world,
    _truth_functions,
)
from src.dynamics.nonlinear import _raw_roots
from src.dynamics.selection_freeze import canonical_sha256

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D033_ARTIFACT = ROOT / "eval/dynamics/d0_3_3/targeted_recovery.json"
DEFAULT_D0321_ARTIFACT = ROOT / "eval/dynamics/d0_3_2_1/failure_decomposition.json"
TARGETED_RECOVERY_SOURCE = Path(__file__)
D0321_ARTIFACT_HASH = "b6b8b5e7851791254df33935fe28ffcb433d4533013f7a0d13380705f614f781"
D0321_FILE_SHA256 = "ce4d92b294c802b72be531a969011e3c82196881173ae172ff62c1b1f8609688"
D0321_SOURCE_SHA256 = "1f10fc1b70b8772aca4a137807e642ba73cb99c8e9ffb0a575bacc7e89c76920"
CONFIRMATION_WORLD_LEDGER_HASH = (
    "413b6aa257c7b913c899dc1caa4290acb04241f8a5e5f49f090152194a3ad17e"
)

DEVELOPMENT_SEED_BASE = 73_000
CONFIRMATION_SEED_BASE = 83_000
WORLDS_PER_FAMILY = 20
ROOT_BOOTSTRAPS = 32
ROOT_CLUSTER_RADIUS = 0.32
ROOT_MINIMUM_LOCAL_SUPPORT = 4
HOLDOUT_FRACTION = 0.28
DOUBLE_WELL_MINIMUM_HOLDOUT_GAIN = -0.20
DIFFUSION_RATIO_FLOOR = 1.70
DIFFUSION_BOOTSTRAP_FLOOR = 0.50
DIFFUSION_RECONSTRUCTION_THRESHOLD = 0.35
TOPOLOGY_THRESHOLDS = (0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95)
DIFFUSION_LLR_THRESHOLDS = (0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 16.0)

GRADUATION_GATES: dict[str, float] = {
    "linear_specificity": 0.95,
    "false_nonlinear_discovery_rate_max": 0.05,
    "false_basin_discovery_rate_max": 0.05,
    "double_well_detection": 0.80,
    "basin_recall": 0.75,
    "potential_topology_accuracy": 0.75,
    "state_diffusion_detection": 0.80,
    "numerical_failure_rate_max": 0.02,
}


class TargetedRecoveryError(ValueError):
    """Raised when D0.3.3 violates a frozen lineage or evaluation boundary."""


@dataclass(frozen=True)
class PlannedWorld:
    split: str
    role: str
    repetition: int
    seed: int
    spec: WorldSpec


def _rate(numerator: int, denominator: int, *, empty: float = 0.0) -> float:
    return numerator / denominator if denominator else empty


def _dt(observed_at: Sequence[Any]) -> np.ndarray:
    return np.asarray(
        [
            (right - left).total_seconds() / 86_400.0
            for left, right in zip(observed_at[:-1], observed_at[1:])
        ],
        dtype=float,
    )


def _truth_points(theta: float, cubic: float) -> tuple[float, float]:
    root = math.sqrt(theta / cubic)
    return -root, root


def _planned_worlds(
    split: str, *, count: int = WORLDS_PER_FAMILY
) -> list[PlannedWorld]:
    if split not in {"development", "confirmation"}:
        raise TargetedRecoveryError("split must be development or confirmation")
    if not 1 <= count <= WORLDS_PER_FAMILY:
        raise TargetedRecoveryError("world count is outside the preregistered plan")
    base = DEVELOPMENT_SEED_BASE if split == "development" else CONFIRMATION_SEED_BASE
    offset = 0 if split == "development" else 3
    rows: list[PlannedWorld] = []
    for index in range(count):
        observations = (420, 480, 540, 600, 660, 700)[(index + offset) % 6]
        theta = (0.62, 0.70, 0.78, 0.86)[(index + 2 * offset) % 4]
        cubic = (0.60, 0.68, 0.76, 0.84)[(2 * index + offset) % 4]
        sigma = (0.34, 0.40, 0.46, 0.50)[(3 * index + offset) % 4]
        left, right = _truth_points(theta, cubic)
        spec = WorldSpec(
            cell_id=f"{split}-double-well-{index:02d}",
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
        rows.append(PlannedWorld(split, "double_well", index, base + index, spec))
    for index in range(count):
        observations = (480, 560, 640, 720, 800)[(index + offset) % 5]
        gamma = (0.52, 0.58, 0.65, 0.72, 0.78)[(2 * index + offset) % 5]
        theta = (0.28, 0.32, 0.36, 0.40)[(index + offset) % 4]
        sigma = (0.20, 0.22, 0.25, 0.28)[(3 * index + offset) % 4]
        spec = WorldSpec(
            cell_id=f"{split}-state-diffusion-{index:02d}",
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
            PlannedWorld(split, "state_diffusion", index, base + 1_000 + index, spec)
        )
    for index in range(count):
        observations = (480, 560, 640, 720, 800)[(index + 2 * offset) % 5]
        theta = (0.20, 0.28, 0.36, 0.44)[(index + offset) % 4]
        sigma = (0.22, 0.28, 0.34, 0.40)[(2 * index + offset) % 4]
        spec = WorldSpec(
            cell_id=f"{split}-linear-control-{index:02d}",
            family="linear_ou",
            observations=observations,
            expected_model="M1",
            effect_band="control",
            theta=theta,
            sigma=sigma,
            expected_stable_points=(0.0,),
        )
        rows.append(
            PlannedWorld(split, "linear_control", index, base + 2_000 + index, spec)
        )
    for index in range(count):
        observations = (480, 560, 640, 720, 800)[(index + offset) % 5]
        sigma = (0.22, 0.28, 0.34, 0.40)[(index + 3 * offset) % 4]
        spec = WorldSpec(
            cell_id=f"{split}-no-basin-control-{index:02d}",
            family="random_walk",
            observations=observations,
            expected_model="ABSTAIN",
            effect_band="control",
            sigma=sigma,
            assumption_violation="no stationary restoring force",
        )
        rows.append(
            PlannedWorld(split, "no_basin_control", index, base + 3_000 + index, spec)
        )
    return rows


def _plan_ledger(rows: Sequence[PlannedWorld]) -> list[dict[str, Any]]:
    return [
        {
            "split": row.split,
            "role": row.role,
            "repetition": row.repetition,
            "seed": row.seed,
            "cell_id": row.spec.cell_id,
            "family": row.spec.family,
            "observations": row.spec.observations,
            "theta": row.spec.theta,
            "sigma": row.spec.sigma,
            "cubic": row.spec.cubic,
            "gamma": row.spec.gamma,
        }
        for row in rows
    ]


def _crossfit_folds(length: int) -> np.ndarray:
    block = max(8, int(round(math.sqrt(length))))
    return (np.arange(length) // block) % 2


def _fit_repaired_diffusion(
    origins: np.ndarray,
    increments: np.ndarray,
    delta_times: np.ndarray,
    grid: np.ndarray,
) -> FieldEstimate:
    """Alternating SINDy drift and cross-fitted positive log diffusion."""

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
            np.clip(_polynomial_design(origins, 2) @ diffusion_coefficients, -12.0, 6.0)
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
        0.5 * np.clip(_polynomial_design(grid, 2) @ diffusion_coefficients, -12.0, 6.0)
    )
    constant = math.sqrt(max(float(np.mean(np.square(out_of_fold))), 1e-10))
    names = ("1", "x", "x2", "x3", "x4")
    law = {
        name: float(value)
        for name, value in zip(names, drift_coefficients)
        if abs(float(value)) >= 1e-10
    }
    return FieldEstimate(
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


def _standardized_training(values: np.ndarray, observed_at: Sequence[Any]) -> tuple[
    int,
    float,
    float,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
]:
    train_end = int(len(values) * (1.0 - HOLDOUT_FRACTION))
    center = float(np.mean(values[:train_end]))
    scale = float(np.std(values[:train_end], ddof=1))
    if not math.isfinite(scale) or scale <= 1e-10:
        raise TargetedRecoveryError("pre-holdout state has no usable variation")
    standardized = (values - center) / scale
    delta_times = _dt(observed_at)
    origins = standardized[: train_end - 1]
    increments = np.diff(standardized[:train_end])
    train_dt = delta_times[: train_end - 1]
    holdout_origins = standardized[train_end - 1 : -1]
    holdout_targets = standardized[train_end:]
    holdout_dt = delta_times[train_end - 1 :]
    return (
        train_end,
        center,
        scale,
        origins,
        increments,
        train_dt,
        holdout_origins,
        holdout_targets,
        holdout_dt,
    )


def _evaluate_diffusion_repair(
    spec: WorldSpec,
    values: np.ndarray,
    observed_at: Sequence[Any],
    seed: int,
) -> dict[str, Any]:
    try:
        (
            _,
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
        fit = _fit_repaired_diffusion(origins, increments, train_dt, grid)
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
        llr = float(
            2.0 * np.sum(constant_score["point_nll"] - state_score["point_nll"])
        )
        dominance = _bootstrap_dominance(
            constant_score["point_nll"], state_score["point_nll"], seed + 2_011
        )
        ratio = float(np.max(fit.diffusion) / max(np.min(fit.diffusion), 1e-10))
        support = _support(grid, origins)
        _, reconstruction_error = _reconstruction_errors(
            spec, fit, support, center, scale
        )
        variance_signal = bool(llr > 0.0 and dominance >= 0.50)
        eligible = bool(
            ratio >= DIFFUSION_RATIO_FLOOR and dominance >= DIFFUSION_BOOTSTRAP_FLOOR
        )
        return {
            "numerical_failure": False,
            "sealed_holdout_evaluated": True,
            "sealed_holdout_observations": len(holdout_targets),
            "fit_boundary": "all parameters frozen before sealed holdout",
            "twice_log_likelihood_ratio": llr,
            "mean_nll_gain": float(
                constant_score["mean_nll"] - state_score["mean_nll"]
            ),
            "bootstrap_dominance": dominance,
            "diffusion_max_min_ratio": ratio,
            "variance_signal": variance_signal,
            "threshold_eligible": eligible,
            "diffusion_reconstruction_error": reconstruction_error,
            "g_reconstruction_pass": bool(
                reconstruction_error is not None
                and reconstruction_error <= DIFFUSION_RECONSTRUCTION_THRESHOLD
            ),
            "positive_diffusion": bool(np.all(fit.diffusion > 0.0)),
            "cross_fit": dict(fit.uncertainty),
            "grid": [float(center + scale * state) for state in grid[::8]],
            "diffusion": [float(scale * value) for value in fit.diffusion[::8]],
        }
    except (ValueError, FloatingPointError, np.linalg.LinAlgError) as exc:
        return {
            "numerical_failure": True,
            "sealed_holdout_evaluated": False,
            "failure": str(exc),
            "threshold_eligible": False,
            "twice_log_likelihood_ratio": -1.0e12,
        }


def _moving_block_indices(length: int, rng: np.random.Generator) -> np.ndarray:
    block = max(8, int(round(math.sqrt(length))))
    chunks: list[np.ndarray] = []
    while sum(len(chunk) for chunk in chunks) < length:
        start = int(rng.integers(0, length))
        chunks.append((start + np.arange(block)) % length)
    return np.concatenate(chunks)[:length]


def _topology_match(
    roots: Sequence[Mapping[str, Any]], spec: WorldSpec
) -> dict[str, Any]:
    stable = [float(root["state"]) for root in roots if bool(root["stable"])]
    unstable = [float(root["state"]) for root in roots if not bool(root["stable"])]
    stable_matches = _match_points(
        spec.expected_stable_points, stable, TOPOLOGY_LOCATION_TOLERANCE
    )
    unstable_matches = _match_points(
        spec.expected_unstable_points, unstable, TOPOLOGY_LOCATION_TOLERANCE
    )
    match = bool(
        stable_matches == len(spec.expected_stable_points)
        and unstable_matches == len(spec.expected_unstable_points)
        and len(stable) == len(spec.expected_stable_points)
        and len(unstable) == len(spec.expected_unstable_points)
    )
    return {
        "stable_points": stable,
        "unstable_points": unstable,
        "stable_matches": stable_matches,
        "unstable_matches": unstable_matches,
        "topology_match": match,
    }


def _potential(grid: np.ndarray, drift: np.ndarray) -> np.ndarray:
    increments = -0.5 * (drift[:-1] + drift[1:]) * np.diff(grid)
    values = np.concatenate(([0.0], np.cumsum(increments)))
    return values - float(np.min(values))


def _best_sus_triplet(
    roots: Sequence[Mapping[str, Any]],
) -> tuple[Mapping[str, Any], Mapping[str, Any], Mapping[str, Any]] | None:
    ordered = sorted(roots, key=lambda root: float(root["state"]))
    candidates = [
        (ordered[index], ordered[index + 1], ordered[index + 2])
        for index in range(max(0, len(ordered) - 2))
        if bool(ordered[index]["stable"])
        and not bool(ordered[index + 1]["stable"])
        and bool(ordered[index + 2]["stable"])
    ]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda item: float(item[2]["state"]) - float(item[0]["state"]),
    )


def _barrier_summary(
    grid: np.ndarray,
    drift: np.ndarray,
    roots: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    triplet = _best_sus_triplet(roots)
    if triplet is None:
        return {"exists": False, "height": 0.0}
    landscape = _potential(grid, drift)
    indices = [int(np.argmin(np.abs(grid - float(root["state"])))) for root in triplet]
    left, barrier, right = [float(landscape[index]) for index in indices]
    height = min(barrier - left, barrier - right)
    return {"exists": bool(height > 0.0), "height": float(max(height, 0.0))}


def _cluster_roots(
    replicate_roots: Sequence[Sequence[Mapping[str, Any]]],
    full_roots: Sequence[Mapping[str, Any]],
    origins: np.ndarray,
) -> tuple[list[dict[str, Any]], list[list[dict[str, Any]]]]:
    clusters: list[dict[str, Any]] = []
    for rep_index, roots in enumerate(replicate_roots):
        for root in sorted(roots, key=lambda item: float(item["state"])):
            state = float(root["state"])
            candidates = [
                cluster
                for cluster in clusters
                if abs(state - float(cluster["center"])) <= ROOT_CLUSTER_RADIUS
            ]
            if candidates:
                cluster = min(
                    candidates, key=lambda item: abs(state - float(item["center"]))
                )
            else:
                cluster = {"center": state, "members": []}
                clusters.append(cluster)
            cluster["members"].append({**root, "replicate": rep_index})
            cluster["center"] = float(
                np.median([float(item["state"]) for item in cluster["members"]])
            )

    successful = max(len(replicate_roots), 1)
    summaries: list[dict[str, Any]] = []
    for cluster_index, cluster in enumerate(
        sorted(clusters, key=lambda row: row["center"])
    ):
        center = float(cluster["center"])
        per_replicate: dict[int, Mapping[str, Any]] = {}
        for member in cluster["members"]:
            rep = int(member["replicate"])
            current = per_replicate.get(rep)
            if current is None or abs(float(member["state"]) - center) < abs(
                float(current["state"]) - center
            ):
                per_replicate[rep] = member
        states = np.asarray(
            [float(member["state"]) for member in per_replicate.values()]
        )
        derivatives = np.asarray(
            [float(member["derivative"]) for member in per_replicate.values()]
        )
        stable_support = float(
            np.mean([bool(member["stable"]) for member in per_replicate.values()])
        )
        location = float(np.median(states))
        nearest = (
            min(full_roots, key=lambda item: abs(float(item["state"]) - location))
            if full_roots
            else None
        )
        occupancy_count = int(np.sum(np.abs(origins - location) <= ROOT_CLUSTER_RADIUS))
        summary = {
            "cluster_id": cluster_index,
            "location": location,
            "location_ci95": [
                float(np.quantile(states, 0.025)),
                float(np.quantile(states, 0.975)),
            ],
            "persistence": len(per_replicate) / successful,
            "stable": stable_support >= 0.50,
            "stable_support": stable_support,
            "derivative_median": float(np.median(derivatives)),
            "derivative_ci95": [
                float(np.quantile(derivatives, 0.025)),
                float(np.quantile(derivatives, 0.975)),
            ],
            "occupancy_count": occupancy_count,
            "occupancy_fraction": occupancy_count / max(len(origins), 1),
            "data_support": (
                "HIGH"
                if occupancy_count >= 16
                else "MEDIUM" if occupancy_count >= 8 else "LOW"
            ),
            "nearest_full_root": float(nearest["state"]) if nearest else None,
            "nearest_full_root_distance": (
                abs(float(nearest["state"]) - location) if nearest else None
            ),
        }
        summaries.append(summary)
    annotated: list[list[dict[str, Any]]] = []
    for rep_index, roots in enumerate(replicate_roots):
        rows: list[dict[str, Any]] = []
        for root in roots:
            nearby = [
                cluster
                for cluster in summaries
                if abs(float(root["state"]) - float(cluster["location"]))
                <= ROOT_CLUSTER_RADIUS
            ]
            cluster = (
                min(
                    nearby,
                    key=lambda item: abs(
                        float(root["state"]) - float(item["location"])
                    ),
                )
                if nearby
                else None
            )
            rows.append(
                {
                    **root,
                    "cluster_id": cluster["cluster_id"] if cluster else None,
                    "cluster_location_ci95": (
                        cluster["location_ci95"] if cluster else None
                    ),
                    "nearest_corresponding_root": (
                        cluster["nearest_full_root"] if cluster else None
                    ),
                }
            )
        annotated.append(rows)
    return summaries, annotated


def _select_cluster_triplet(
    clusters: Sequence[Mapping[str, Any]],
) -> tuple[Mapping[str, Any], Mapping[str, Any], Mapping[str, Any]] | None:
    ordered = sorted(clusters, key=lambda item: float(item["location"]))
    candidates: list[tuple[Mapping[str, Any], Mapping[str, Any], Mapping[str, Any]]] = (
        []
    )
    for left_index in range(len(ordered)):
        for middle_index in range(left_index + 1, len(ordered)):
            for right_index in range(middle_index + 1, len(ordered)):
                triplet = (
                    ordered[left_index],
                    ordered[middle_index],
                    ordered[right_index],
                )
                if (
                    bool(triplet[0]["stable"])
                    and not bool(triplet[1]["stable"])
                    and bool(triplet[2]["stable"])
                ):
                    candidates.append(triplet)
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda rows: (
            min(float(row["persistence"]) for row in rows),
            float(rows[2]["location"]) - float(rows[0]["location"]),
        ),
    )


def _evaluate_topology_repair(
    spec: WorldSpec,
    values: np.ndarray,
    observed_at: Sequence[Any],
    seed: int,
    *,
    bootstraps: int,
    retain_replicates: bool,
) -> dict[str, Any]:
    try:
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
        for _ in range(bootstraps):
            indices = _moving_block_indices(len(origins), rng)
            try:
                replicate_fit = _fit_sindy(
                    origins[indices],
                    increments[indices],
                    train_dt[indices],
                    grid,
                )
            except (ValueError, FloatingPointError, np.linalg.LinAlgError):
                continue
            replicate_drift = scale * replicate_fit.drift
            roots: list[dict[str, Any]] = []
            for root in _raw_roots(raw_grid, replicate_drift):
                state = float(root["state"])
                occupancy_count = int(
                    np.sum(np.abs(raw_origins - state) <= ROOT_CLUSTER_RADIUS)
                )
                nearest = (
                    min(
                        full_roots,
                        key=lambda item: abs(float(item["state"]) - state),
                    )
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
                        "occupancy_fraction": occupancy_count
                        / max(len(raw_origins), 1),
                        "nearest_full_root": (
                            float(nearest["state"]) if nearest else None
                        ),
                        "nearest_full_root_distance": (
                            abs(float(nearest["state"]) - state) if nearest else None
                        ),
                    }
                )
            replicate_roots.append(roots)
            replicate_fields.append(replicate_drift)

        clusters, annotated = _cluster_roots(replicate_roots, full_roots, raw_origins)
        triplet = _select_cluster_triplet(clusters)
        sign_passes = 0
        barrier_passes = 0
        detailed_replicates: list[dict[str, Any]] = []
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
        for rep_index, (roots, field) in enumerate(zip(annotated, replicate_fields)):
            selected: list[Mapping[str, Any]] = []
            for cluster_id in target_ids:
                matches = [
                    root for root in roots if root.get("cluster_id") == cluster_id
                ]
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
            if retain_replicates:
                detailed_replicates.append(
                    {
                        "replicate": rep_index,
                        "roots": roots,
                        "root_order": "-".join(
                            "S" if bool(root["stable"]) else "U"
                            for root in sorted(roots, key=lambda item: item["state"])
                        ),
                        "sign_topology_pass": direction_pass,
                        "barrier_exists": bool(barrier["exists"]),
                        "barrier_height": float(barrier["height"]),
                    }
                )
        successful = max(len(replicate_fields), 1)
        sign_support = sign_passes / successful
        barrier_support = barrier_passes / successful
        if triplet is None:
            root_support = 0.0
            stability_support = 0.0
            minimum_occupancy = 0
            certificate_score = 0.0
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
            certificate_score = min(
                root_support, stability_support, sign_support, barrier_support
            )
            root_certificate = [dict(row) for row in triplet]
        eligible = bool(
            triplet is not None
            and minimum_occupancy >= ROOT_MINIMUM_LOCAL_SUPPORT
            and holdout_gain >= DOUBLE_WELL_MINIMUM_HOLDOUT_GAIN
        )
        certificate_score = certificate_score if eligible else 0.0

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
        return {
            "numerical_failure": False,
            "sealed_holdout_evaluated": True,
            "sealed_holdout_observations": len(holdout_targets),
            "fit_boundary": "field and root clusters frozen before sealed holdout",
            "holdout_mean_nll_gain_vs_ou": holdout_gain,
            "holdout_gate": holdout_gain >= DOUBLE_WELL_MINIMUM_HOLDOUT_GAIN,
            "full_field": {
                **full_topology,
                "roots": full_roots,
                "barrier": _barrier_summary(raw_grid, raw_drift, full_roots),
            },
            "oracle_support_fit": oracle_topology,
            "root_clusters": clusters,
            "root_certificate": root_certificate,
            "root_clustering_pass": triplet is not None,
            "root_persistence_support": root_support,
            "stability_support": stability_support,
            "sign_topology_support": sign_support,
            "barrier_support": barrier_support,
            "minimum_cluster_occupancy": minimum_occupancy,
            "threshold_eligible": eligible,
            "certificate_score": certificate_score,
            "bootstrap": {
                "method": "moving-block transition bootstrap",
                "requested": bootstraps,
                "successful": len(replicate_fields),
                "root_cluster_radius": ROOT_CLUSTER_RADIUS,
                "replicates": detailed_replicates if retain_replicates else None,
            },
        }
    except (ValueError, FloatingPointError, np.linalg.LinAlgError) as exc:
        return {
            "numerical_failure": True,
            "sealed_holdout_evaluated": False,
            "failure": str(exc),
            "threshold_eligible": False,
            "certificate_score": 0.0,
        }


def _evaluate_planned_world(world: PlannedWorld, *, bootstraps: int) -> dict[str, Any]:
    values, observed_at, _ = _simulate_world(world.spec, world.seed)
    case: dict[str, Any] = {
        "split": world.split,
        "role": world.role,
        "cell_id": world.spec.cell_id,
        "repetition": world.repetition,
        "seed": world.seed,
        "world_hash": _world_hash(values, observed_at),
        "truth": {
            "family": world.spec.family,
            "expected_model": world.spec.expected_model,
            "observations": world.spec.observations,
            "theta": world.spec.theta,
            "sigma": world.spec.sigma,
            "cubic": world.spec.cubic,
            "gamma": world.spec.gamma,
            "stable_points": list(world.spec.expected_stable_points),
            "unstable_points": list(world.spec.expected_unstable_points),
        },
        "oracle": (
            _oracle_comparison(world.spec, values, observed_at)
            if world.role in {"double_well", "state_diffusion"}
            else None
        ),
        "before": None,
        "topology_repair": None,
        "diffusion_repair": None,
    }
    if world.role in {"double_well", "linear_control", "no_basin_control"}:
        case["topology_repair"] = _evaluate_topology_repair(
            world.spec,
            values,
            observed_at,
            world.seed,
            bootstraps=bootstraps,
            retain_replicates=world.role == "double_well",
        )
    if world.role in {"state_diffusion", "linear_control"}:
        case["diffusion_repair"] = _evaluate_diffusion_repair(
            world.spec, values, observed_at, world.seed
        )
    if world.role in {"double_well", "state_diffusion"}:
        before = _evaluate_new_estimator(
            "EST-SINDY-D032",
            world.spec,
            values,
            observed_at,
            world.seed,
            True,
        )
        case["before"] = {
            "identified_model": before["identified_model"],
            "correct_model": bool(before["correct_model"]),
            "topology_match": bool(
                before.get("field", {}).get("topology_match", False)
            ),
            "certified_correct": bool(
                before["correct_model"]
                and (
                    world.role != "double_well"
                    or before.get("field", {}).get("topology_match", False)
                )
            ),
        }
    return case


def _topology_roc(
    cases: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    truth = [row for row in cases if row["role"] == "double_well"]
    controls = [
        row for row in cases if row["role"] in {"linear_control", "no_basin_control"}
    ]
    rows = []
    for threshold in TOPOLOGY_THRESHOLDS:
        detected = sum(
            bool(row["topology_repair"]["threshold_eligible"])
            and float(row["topology_repair"]["certificate_score"]) >= threshold
            for row in truth
        )
        false = sum(
            bool(row["topology_repair"]["threshold_eligible"])
            and float(row["topology_repair"]["certificate_score"]) >= threshold
            for row in controls
        )
        rows.append(
            {
                "persistence_threshold": threshold,
                "true_basin_recall": _rate(detected, len(truth)),
                "false_basin_discovery_rate": _rate(false, len(controls)),
                "true_discoveries": detected,
                "false_discoveries": false,
            }
        )
    return rows


def _diffusion_roc(
    cases: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    truth = [row for row in cases if row["role"] == "state_diffusion"]
    controls = [row for row in cases if row["role"] == "linear_control"]
    rows = []
    for threshold in DIFFUSION_LLR_THRESHOLDS:
        detected = sum(
            bool(row["diffusion_repair"]["threshold_eligible"])
            and float(row["diffusion_repair"]["twice_log_likelihood_ratio"])
            >= threshold
            for row in truth
        )
        false = sum(
            bool(row["diffusion_repair"]["threshold_eligible"])
            and float(row["diffusion_repair"]["twice_log_likelihood_ratio"])
            >= threshold
            for row in controls
        )
        rows.append(
            {
                "twice_log_likelihood_ratio_threshold": threshold,
                "state_diffusion_recall": _rate(detected, len(truth)),
                "false_state_diffusion_rate": _rate(false, len(controls)),
                "true_discoveries": detected,
                "false_discoveries": false,
            }
        )
    return rows


def _choose_operating_point(
    rows: Sequence[Mapping[str, Any]],
    *,
    threshold_key: str,
    recall_key: str,
    false_key: str,
) -> Mapping[str, Any]:
    eligible = [row for row in rows if float(row[false_key]) <= 0.05]
    if not eligible:
        return max(rows, key=lambda row: float(row[threshold_key]))
    return max(
        eligible,
        key=lambda row: (float(row[recall_key]), float(row[threshold_key])),
    )


def _calibrate(cases: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    topology_roc = _topology_roc(cases)
    diffusion_roc = _diffusion_roc(cases)
    topology = _choose_operating_point(
        topology_roc,
        threshold_key="persistence_threshold",
        recall_key="true_basin_recall",
        false_key="false_basin_discovery_rate",
    )
    diffusion = _choose_operating_point(
        diffusion_roc,
        threshold_key="twice_log_likelihood_ratio_threshold",
        recall_key="state_diffusion_recall",
        false_key="false_state_diffusion_rate",
    )
    return {
        "selection_rule": (
            "maximize development recall subject to <=5% control false discovery; "
            "break recall ties toward the more conservative threshold"
        ),
        "topology_roc": topology_roc,
        "diffusion_roc": diffusion_roc,
        "locked_topology_persistence": float(topology["persistence_threshold"]),
        "locked_diffusion_llr": float(
            diffusion["twice_log_likelihood_ratio_threshold"]
        ),
        "confirmation_results_seen": False,
    }


def _apply_locked_gates(
    cases: Sequence[dict[str, Any]], locked: Mapping[str, Any]
) -> None:
    topology_threshold = float(locked["locked_topology_persistence"])
    diffusion_threshold = float(locked["locked_diffusion_llr"])
    for case in cases:
        topology = case.get("topology_repair")
        diffusion = case.get("diffusion_repair")
        topology_certified = bool(
            topology
            and topology["threshold_eligible"]
            and float(topology["certificate_score"]) >= topology_threshold
        )
        diffusion_certified = bool(
            diffusion
            and diffusion["threshold_eligible"]
            and float(diffusion["twice_log_likelihood_ratio"]) >= diffusion_threshold
        )
        topology_match = False
        stable_points: list[float] = []
        unstable_points: list[float] = []
        if topology_certified and topology:
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
            truth = case["truth"]
            topology_match = bool(
                _match_points(
                    truth["stable_points"], stable_points, TOPOLOGY_LOCATION_TOLERANCE
                )
                == len(truth["stable_points"])
                and _match_points(
                    truth["unstable_points"],
                    unstable_points,
                    TOPOLOGY_LOCATION_TOLERANCE,
                )
                == len(truth["unstable_points"])
                and len(stable_points) == len(truth["stable_points"])
                and len(unstable_points) == len(truth["unstable_points"])
            )
        case["after"] = {
            "topology_certified": topology_certified,
            "state_diffusion_certified": diffusion_certified,
            "nonlinear_detected": topology_certified or diffusion_certified,
            "stable_points": stable_points,
            "unstable_points": unstable_points,
            "topology_match": topology_match,
            "locked_topology_persistence": topology_threshold,
            "locked_diffusion_llr": diffusion_threshold,
        }


def _confirmation_metrics(cases: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    double_well = [row for row in cases if row["role"] == "double_well"]
    state_diffusion = [row for row in cases if row["role"] == "state_diffusion"]
    linear = [row for row in cases if row["role"] == "linear_control"]
    basin_controls = [
        row for row in cases if row["role"] in {"linear_control", "no_basin_control"}
    ]
    matched_stable = sum(
        _match_points(
            row["truth"]["stable_points"],
            row["after"]["stable_points"],
            TOPOLOGY_LOCATION_TOLERANCE,
        )
        for row in double_well
    )
    true_stable = sum(len(row["truth"]["stable_points"]) for row in double_well)
    predicted_stable = sum(len(row["after"]["stable_points"]) for row in double_well)
    numerical_failures = 0
    holdout_checks: list[bool] = []
    for row in cases:
        for key in ("topology_repair", "diffusion_repair"):
            repair = row.get(key)
            if repair is not None:
                numerical_failures += bool(repair["numerical_failure"])
                holdout_checks.append(bool(repair["sealed_holdout_evaluated"]))
    metrics = {
        "linear_specificity": _rate(
            sum(not row["after"]["nonlinear_detected"] for row in linear),
            len(linear),
        ),
        "false_nonlinear_discovery_rate": _rate(
            sum(row["after"]["nonlinear_detected"] for row in linear),
            len(linear),
        ),
        "false_basin_discovery_rate": _rate(
            sum(row["after"]["topology_certified"] for row in basin_controls),
            len(basin_controls),
        ),
        "double_well_detection": _rate(
            sum(row["after"]["topology_certified"] for row in double_well),
            len(double_well),
        ),
        "basin_precision": _rate(matched_stable, predicted_stable, empty=1.0),
        "basin_recall": _rate(matched_stable, true_stable),
        "potential_topology_accuracy": _rate(
            sum(row["after"]["topology_match"] for row in double_well),
            len(double_well),
        ),
        "state_diffusion_detection": _rate(
            sum(row["after"]["state_diffusion_certified"] for row in state_diffusion),
            len(state_diffusion),
        ),
        "numerical_failure_rate": _rate(numerical_failures, len(holdout_checks)),
        "sealed_holdout_required": True,
        "sealed_holdout_compliance": bool(holdout_checks and all(holdout_checks)),
        "counts": {
            "double_well": len(double_well),
            "state_diffusion": len(state_diffusion),
            "linear_controls": len(linear),
            "basin_controls": len(basin_controls),
            "matched_stable_points": matched_stable,
            "predicted_stable_points": predicted_stable,
            "true_stable_points": true_stable,
            "repair_evaluations": len(holdout_checks),
            "numerical_failures": numerical_failures,
        },
    }
    return metrics


def _graduation(metrics: Mapping[str, Any]) -> dict[str, Any]:
    checks = {
        "linear_specificity": float(metrics["linear_specificity"])
        >= GRADUATION_GATES["linear_specificity"],
        "false_nonlinear_discovery": float(metrics["false_nonlinear_discovery_rate"])
        <= GRADUATION_GATES["false_nonlinear_discovery_rate_max"],
        "false_basin_discovery": float(metrics["false_basin_discovery_rate"])
        <= GRADUATION_GATES["false_basin_discovery_rate_max"],
        "double_well_detection": float(metrics["double_well_detection"])
        >= GRADUATION_GATES["double_well_detection"],
        "basin_recall": float(metrics["basin_recall"])
        >= GRADUATION_GATES["basin_recall"],
        "potential_topology_accuracy": float(metrics["potential_topology_accuracy"])
        >= GRADUATION_GATES["potential_topology_accuracy"],
        "state_diffusion_detection": float(metrics["state_diffusion_detection"])
        >= GRADUATION_GATES["state_diffusion_detection"],
        "numerical_failure": float(metrics["numerical_failure_rate"])
        <= GRADUATION_GATES["numerical_failure_rate_max"],
        "sealed_holdout": bool(metrics["sealed_holdout_compliance"]),
    }
    return {
        "checks": checks,
        "passed": all(checks.values()),
        "decision": "GRADUATE" if all(checks.values()) else "NO_GRADUATE",
    }


def _waterfall(
    cases: Sequence[Mapping[str, Any]], locked: Mapping[str, Any]
) -> dict[str, Any]:
    double_well = [row for row in cases if row["role"] == "double_well"]
    state_diffusion = [row for row in cases if row["role"] == "state_diffusion"]
    topology_threshold = float(locked["locked_topology_persistence"])

    field_correct = sum(
        bool(row["topology_repair"]["full_field"]["topology_match"])
        for row in double_well
    )
    before_correct = sum(
        bool(row["before"]["certified_correct"]) for row in double_well
    )
    after_correct = sum(bool(row["after"]["topology_match"]) for row in double_well)
    before_attrition = 1.0 - before_correct / field_correct if field_correct else None
    after_attrition = 1.0 - after_correct / field_correct if field_correct else None
    return {
        "double_well": {
            "runs": len(double_well),
            "oracle_support_topology": _rate(
                sum(
                    bool(
                        row["topology_repair"].get("oracle_support_fit")
                        and row["topology_repair"]["oracle_support_fit"][
                            "topology_match"
                        ]
                    )
                    for row in double_well
                ),
                len(double_well),
            ),
            "field_topology": _rate(field_correct, len(double_well)),
            "root_clustering": _rate(
                sum(
                    row["topology_repair"]["root_clustering_pass"]
                    for row in double_well
                ),
                len(double_well),
            ),
            "stability_support": _rate(
                sum(
                    float(row["topology_repair"]["sign_topology_support"])
                    >= topology_threshold
                    for row in double_well
                ),
                len(double_well),
            ),
            "certification_before": _rate(before_correct, len(double_well)),
            "certification_after": _rate(after_correct, len(double_well)),
            "certification_attrition_before": before_attrition,
            "certification_attrition_after": after_attrition,
        },
        "state_diffusion": {
            "runs": len(state_diffusion),
            "oracle_power": _rate(
                sum(
                    bool(row["oracle"] and row["oracle"]["correct"])
                    for row in state_diffusion
                ),
                len(state_diffusion),
            ),
            "variance_signal": _rate(
                sum(
                    row["diffusion_repair"]["variance_signal"]
                    for row in state_diffusion
                ),
                len(state_diffusion),
            ),
            "g_reconstruction": _rate(
                sum(
                    row["diffusion_repair"]["g_reconstruction_pass"]
                    for row in state_diffusion
                ),
                len(state_diffusion),
            ),
            "certification_before": _rate(
                sum(row["before"]["certified_correct"] for row in state_diffusion),
                len(state_diffusion),
            ),
            "certification_after": _rate(
                sum(
                    row["after"]["state_diffusion_certified"] for row in state_diffusion
                ),
                len(state_diffusion),
            ),
        },
    }


def _historical_audit(
    parent: Mapping[str, Any], locked: Mapping[str, Any], *, bootstraps: int
) -> dict[str, Any]:
    specs = {spec.cell_id: spec for spec in _reference_specs()}
    wanted = {"double-well-n500", "diffusion-g0.65-n600"}
    rows: list[dict[str, Any]] = []
    for parent_case in parent["cases"]:
        cell_id = str(parent_case["cell_id"])
        if cell_id not in wanted:
            continue
        spec = specs[cell_id]
        seed = int(parent_case["seed"])
        values, observed_at, _ = _simulate_world(spec, seed)
        role = "double_well" if spec.family == "double_well" else "state_diffusion"
        row: dict[str, Any] = {
            "split": "historical_audit",
            "role": role,
            "cell_id": cell_id,
            "repetition": int(parent_case["repetition"]),
            "seed": seed,
            "world_hash": _world_hash(values, observed_at),
            "truth": dict(parent_case["truth"]),
            "before": {
                "sindy_correct": bool(
                    parent_case["practical_correct"]["EST-SINDY-D032"]
                ),
                "best_practical_correct": any(
                    parent_case["practical_correct"].values()
                ),
                "certified_topology": bool(
                    parent_case.get("basin_decomposition")
                    and parent_case["basin_decomposition"]["certified_sindy"][
                        "topology_match"
                    ]
                ),
            },
            "topology_repair": None,
            "diffusion_repair": None,
        }
        if role == "double_well":
            row["topology_repair"] = _evaluate_topology_repair(
                spec,
                values,
                observed_at,
                seed,
                bootstraps=bootstraps,
                retain_replicates=True,
            )
        else:
            row["diffusion_repair"] = _evaluate_diffusion_repair(
                spec, values, observed_at, seed
            )
        rows.append(row)
    _apply_locked_gates(rows, locked)
    summary: dict[str, Any] = {}
    for cell_id in sorted(wanted):
        members = [row for row in rows if row["cell_id"] == cell_id]
        if "double-well" in cell_id:
            after = _rate(
                sum(row["after"]["topology_match"] for row in members), len(members)
            )
            before = _rate(
                sum(row["before"]["certified_topology"] for row in members),
                len(members),
            )
        else:
            after = _rate(
                sum(row["after"]["state_diffusion_certified"] for row in members),
                len(members),
            )
            before = _rate(
                sum(row["before"]["best_practical_correct"] for row in members),
                len(members),
            )
        summary[cell_id] = {"runs": len(members), "before": before, "after": after}
    return {
        "evaluated_after_confirmation": True,
        "used_for_threshold_selection": False,
        "summary": summary,
        "cases": rows,
    }


def _load_parent() -> dict[str, Any]:
    raw = DEFAULT_D0321_ARTIFACT.read_bytes()
    if hashlib.sha256(raw).hexdigest() != D0321_FILE_SHA256:
        raise TargetedRecoveryError("frozen D0.3.2.1 artifact bytes changed")
    parent = load_frozen_failure_decomposition()
    if parent.get("artifact_hash") != D0321_ARTIFACT_HASH:
        raise TargetedRecoveryError("frozen D0.3.2.1 content address changed")
    source = Path(__file__).with_name("failure_decomposition.py")
    if hashlib.sha256(source.read_bytes()).hexdigest() != D0321_SOURCE_SHA256:
        raise TargetedRecoveryError("frozen D0.3.2.1 source bytes changed")
    return parent


def _preregistration(
    development_plan: Sequence[PlannedWorld],
    confirmation_plan: Sequence[PlannedWorld],
    *,
    bootstraps: int,
) -> dict[str, Any]:
    return {
        "question": (
            "Can the two demonstrated estimator-limited failure modes be repaired "
            "without sacrificing specificity or false-structure protection?"
        ),
        "estimator_policy": "repair existing EST-SINDY-D032 family; no new competitor",
        "historical_failure_cells_forbidden_during_development": [
            "double-well-n500",
            "diffusion-g0.65-n600",
        ],
        "evaluation_order": [
            "development",
            "lock thresholds and source",
            "untouched confirmation",
            "historical audit",
        ],
        "development_plan_hash": canonical_sha256(_plan_ledger(development_plan)),
        "confirmation_plan_hash": canonical_sha256(_plan_ledger(confirmation_plan)),
        "development_worlds": len(development_plan),
        "confirmation_worlds": len(confirmation_plan),
        "seed_domains": {
            "development": [DEVELOPMENT_SEED_BASE, DEVELOPMENT_SEED_BASE + 3_999],
            "confirmation": [CONFIRMATION_SEED_BASE, CONFIRMATION_SEED_BASE + 3_999],
            "historical": "frozen D0.3.2.1 seeds only after confirmation",
        },
        "topology_repair": {
            "field_estimator": "unchanged EST-SINDY-D032 polynomial library",
            "root_bootstraps": bootstraps,
            "bootstrap_method": "moving-block transition bootstrap",
            "cluster_radius": ROOT_CLUSTER_RADIUS,
            "candidate_persistence_thresholds": list(TOPOLOGY_THRESHOLDS),
            "root_minimum_local_support": ROOT_MINIMUM_LOCAL_SUPPORT,
            "minimum_holdout_gain_vs_ou": DOUBLE_WELL_MINIMUM_HOLDOUT_GAIN,
            "certificate": "ordered stable-unstable-stable sign topology",
        },
        "diffusion_repair": {
            "field_estimator": "EST-SINDY-D032 drift and log-diffusion libraries",
            "cross_fit": "two-fold alternating moving blocks",
            "normalized_innovation": "(dX-f_hat(X)dt)/sqrt(dt)",
            "positive_parameterization": "g(x)=exp(0.5 log g^2(x))",
            "alternations": 4,
            "candidate_twice_llr_thresholds": list(DIFFUSION_LLR_THRESHOLDS),
            "diffusion_ratio_floor": DIFFUSION_RATIO_FLOOR,
            "bootstrap_dominance_floor": DIFFUSION_BOOTSTRAP_FLOOR,
        },
        "operating_point_rule": (
            "maximize development recall subject to <=5% control false discovery; "
            "break recall ties toward the more conservative threshold"
        ),
        "graduation_gates": dict(GRADUATION_GATES),
        "sealed_holdout_required": True,
        "real_market_rerun_forbidden": True,
        "hawkes_forbidden": True,
    }


@lru_cache(maxsize=4)
def run_targeted_recovery(profile: str = "reference") -> dict[str, Any]:
    """Develop, lock, and confirm the two D0.3.2.1 targeted repairs."""

    if profile not in {"smoke", "development", "reference"}:
        raise TargetedRecoveryError("profile must be smoke, development, or reference")
    parent = _load_parent()
    count = 2 if profile == "smoke" else WORLDS_PER_FAMILY
    bootstraps = 8 if profile == "smoke" else ROOT_BOOTSTRAPS
    development_plan = _planned_worlds("development", count=count)
    confirmation_plan = _planned_worlds("confirmation", count=count)
    preregistration = _preregistration(
        development_plan, confirmation_plan, bootstraps=bootstraps
    )
    preregistration_hash = canonical_sha256(preregistration)

    development_cases = [
        _evaluate_planned_world(world, bootstraps=bootstraps)
        for world in development_plan
    ]
    calibration = _calibrate(development_cases)
    locked_configuration = {
        "preregistration_hash": preregistration_hash,
        "development_world_hashes": [row["world_hash"] for row in development_cases],
        "locked_topology_persistence": calibration["locked_topology_persistence"],
        "locked_diffusion_llr": calibration["locked_diffusion_llr"],
        "confirmation_results_seen": False,
        "historical_results_used": False,
        "source_sha256": hashlib.sha256(
            TARGETED_RECOVERY_SOURCE.read_bytes()
        ).hexdigest(),
    }
    locked_configuration["lock_hash"] = canonical_sha256(locked_configuration)
    _apply_locked_gates(development_cases, locked_configuration)

    confirmation_cases: list[dict[str, Any]] = []
    historical: dict[str, Any] | None = None
    confirmation_metrics: dict[str, Any] | None = None
    waterfall: dict[str, Any] | None = None
    graduation: dict[str, Any] | None = None
    if profile == "reference":
        confirmation_cases = [
            _evaluate_planned_world(world, bootstraps=bootstraps)
            for world in confirmation_plan
        ]
        _apply_locked_gates(confirmation_cases, locked_configuration)
        confirmation_metrics = _confirmation_metrics(confirmation_cases)
        waterfall = _waterfall(confirmation_cases, locked_configuration)
        graduation = _graduation(confirmation_metrics)
        historical = _historical_audit(
            parent, locked_configuration, bootstraps=bootstraps
        )

    payload: dict[str, Any] = {
        "schema_version": "dynamics-targeted-recovery/0.3.3",
        "milestone": "D0.3.3",
        "profile": profile,
        "frozen": profile == "reference",
        "question": preregistration["question"],
        "parent": {
            "milestone": "D0.3.2.1",
            "artifact": "eval/dynamics/d0_3_2_1/failure_decomposition.json",
            "artifact_hash": D0321_ARTIFACT_HASH,
            "file_sha256": D0321_FILE_SHA256,
            "source_sha256": D0321_SOURCE_SHA256,
            "preserved_byte_identically": True,
        },
        "preregistration": preregistration,
        "preregistration_hash": preregistration_hash,
        "calibration": calibration,
        "locked_configuration": locked_configuration,
        "evaluation_sequence": {
            "development_completed_before_lock": True,
            "confirmation_evaluated_after_lock": profile == "reference",
            "historical_cells_reopened_after_confirmation": profile == "reference",
        },
        "evaluation": {
            "development_worlds": len(development_cases),
            "confirmation_worlds": len(confirmation_cases),
            "historical_worlds": (
                len(historical["cases"]) if historical is not None else 0
            ),
            "root_bootstraps": bootstraps,
            "aggregate_winner_score": None,
        },
        "development_cases": development_cases,
        "confirmation_cases": confirmation_cases,
        "confirmation_metrics": confirmation_metrics,
        "causal_waterfall": waterfall,
        "graduation": graduation,
        "historical_audit": historical,
        "capability": {
            "status": (
                "CERTIFIED_CAPABILITY"
                if graduation and graduation["passed"]
                else "RESEARCH_ONLY"
            ),
            "new_estimator_added": False,
            "repair_scope": [
                "double-well certification",
                "state-diffusion extraction",
            ],
        },
        "routing": {
            "d0_4_hawkes_eligible": bool(graduation and graduation["passed"]),
            "hawkes_started": False,
            "hawkes_deferred_inside_d0_3_3": True,
        },
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
        "excluded_scope": [
            "new estimator family",
            "threshold tuning on confirmation worlds",
            "threshold tuning on historical failure cells",
            "real-market rerun",
            "Hawkes dynamics",
        ],
    }
    payload["artifact_hash"] = canonical_sha256(payload)
    return payload


def verify_targeted_recovery(
    artifact: Mapping[str, Any], *, verify_local_sources: bool = True
) -> dict[str, Any]:
    """Verify content addressing, lineage, split isolation, and claim boundaries."""

    errors: list[str] = []
    body = dict(artifact)
    claimed_hash = body.pop("artifact_hash", None)
    calculated_hash = canonical_sha256(body)
    if claimed_hash != calculated_hash:
        errors.append("artifact_hash does not match canonical payload")
    if artifact.get("schema_version") != "dynamics-targeted-recovery/0.3.3":
        errors.append("schema_version is not dynamics-targeted-recovery/0.3.3")
    parent = artifact.get("parent", {})
    if parent.get("artifact_hash") != D0321_ARTIFACT_HASH:
        errors.append("D0.3.2.1 parent content address changed")
    if parent.get("file_sha256") != D0321_FILE_SHA256:
        errors.append("D0.3.2.1 parent byte hash changed")
    if parent.get("source_sha256") != D0321_SOURCE_SHA256:
        errors.append("D0.3.2.1 parent source hash changed")
    if artifact.get("profile") == "reference" and artifact.get("frozen") is not True:
        errors.append("reference artifact is not frozen")
    preregistration = artifact.get("preregistration", {})
    if canonical_sha256(preregistration) != artifact.get("preregistration_hash"):
        errors.append("preregistration hash does not reconcile")
    expected_development_plan = _planned_worlds("development")
    expected_confirmation_plan = _planned_worlds("confirmation")
    if preregistration.get("development_plan_hash") != canonical_sha256(
        _plan_ledger(expected_development_plan)
    ):
        errors.append("development plan changed")
    if preregistration.get("confirmation_plan_hash") != canonical_sha256(
        _plan_ledger(expected_confirmation_plan)
    ):
        errors.append("confirmation plan changed")
    locked = artifact.get("locked_configuration", {})
    lock_body = dict(locked)
    lock_hash = lock_body.pop("lock_hash", None)
    if canonical_sha256(lock_body) != lock_hash:
        errors.append("locked configuration hash does not reconcile")
    if locked.get("confirmation_results_seen") is not False:
        errors.append("confirmation results contaminated threshold lock")
    if locked.get("historical_results_used") is not False:
        errors.append("historical failures contaminated threshold lock")
    development = artifact.get("development_cases", [])
    confirmation = artifact.get("confirmation_cases", [])
    development_seeds = {int(row["seed"]) for row in development}
    confirmation_seeds = {int(row["seed"]) for row in confirmation}
    if development_seeds & confirmation_seeds:
        errors.append("development and confirmation seeds overlap")
    sequence = artifact.get("evaluation_sequence", {})
    if artifact.get("profile") == "reference":
        if sequence.get("confirmation_evaluated_after_lock") is not True:
            errors.append("confirmation was not evaluated after threshold lock")
        if sequence.get("historical_cells_reopened_after_confirmation") is not True:
            errors.append("historical audit order changed")
        if len(development) != WORLDS_PER_FAMILY * 4:
            errors.append("development world count changed")
        if len(confirmation) != WORLDS_PER_FAMILY * 4:
            errors.append("confirmation world count changed")
        expected_confirmation = {
            row.spec.cell_id: row for row in expected_confirmation_plan
        }
        confirmation_world_ledger: list[dict[str, Any]] = []
        for case in confirmation:
            planned = expected_confirmation.get(str(case.get("cell_id")))
            if planned is None or int(case.get("seed", -1)) != planned.seed:
                errors.append(f"confirmation plan mismatch for {case.get('cell_id')}")
                continue
            world_hash = str(case.get("world_hash", ""))
            if len(world_hash) != 64 or any(
                character not in "0123456789abcdef" for character in world_hash
            ):
                errors.append(f"invalid confirmation world hash for {planned.spec.cell_id}")
            confirmation_world_ledger.append(
                {
                    "cell_id": planned.spec.cell_id,
                    "seed": planned.seed,
                    "world_hash": world_hash,
                }
            )
        if len({row["world_hash"] for row in confirmation_world_ledger}) != len(
            confirmation_world_ledger
        ):
            errors.append("confirmation world hashes are not unique")
        if canonical_sha256(confirmation_world_ledger) != CONFIRMATION_WORLD_LEDGER_HASH:
            errors.append("confirmation world ledger changed")
        metrics = artifact.get("confirmation_metrics")
        if not isinstance(metrics, Mapping):
            errors.append("confirmation metrics are missing")
        else:
            recalculated_metrics = _confirmation_metrics(confirmation)
            if canonical_sha256(metrics) != canonical_sha256(recalculated_metrics):
                errors.append("confirmation metrics do not reconcile")
            if artifact.get("graduation") != _graduation(recalculated_metrics):
                errors.append("graduation decision does not reconcile")
    capability = artifact.get("capability", {})
    if capability.get("new_estimator_added") is not False:
        errors.append("a forbidden new estimator was added")
    if artifact.get("evaluation", {}).get("aggregate_winner_score") is not None:
        errors.append("targeted repair must not expose an aggregate winner score")
    real = artifact.get("real_market_claim", {})
    if (
        real.get("selected_model") != "M1"
        or real.get("market_claim") != "ABSTAIN"
        or real.get("rerun_performed") is not False
        or real.get("historical_result_overwritten") is not False
    ):
        errors.append("real-market historical boundary changed")
    routing = artifact.get("routing", {})
    if (
        routing.get("hawkes_started") is not False
        or routing.get("hawkes_deferred_inside_d0_3_3") is not True
    ):
        errors.append("Hawkes exclusion changed")
    if verify_local_sources:
        raw = DEFAULT_D0321_ARTIFACT.read_bytes()
        if hashlib.sha256(raw).hexdigest() != D0321_FILE_SHA256:
            errors.append("local D0.3.2.1 artifact bytes changed")
        parent_artifact = json.loads(raw)
        if parent_artifact.get("artifact_hash") != D0321_ARTIFACT_HASH:
            errors.append("local D0.3.2.1 content address changed")
        source = Path(__file__).with_name("failure_decomposition.py")
        if hashlib.sha256(source.read_bytes()).hexdigest() != D0321_SOURCE_SHA256:
            errors.append("local D0.3.2.1 source bytes changed")
        if hashlib.sha256(
            TARGETED_RECOVERY_SOURCE.read_bytes()
        ).hexdigest() != locked.get("source_sha256"):
            errors.append("local D0.3.3 source changed")
    return {
        "valid": not errors,
        "artifact_hash": claimed_hash,
        "calculated_hash": calculated_hash,
        "development_worlds": len(development),
        "confirmation_worlds": len(confirmation),
        "errors": errors,
    }


def load_frozen_targeted_recovery(
    path: Path = DEFAULT_D033_ARTIFACT,
) -> dict[str, Any]:
    if not path.exists():
        raise TargetedRecoveryError(
            "the frozen D0.3.3 artifact is unavailable; run the freeze script"
        )
    artifact = json.loads(path.read_text(encoding="utf-8"))
    verification = verify_targeted_recovery(artifact)
    if not verification["valid"]:
        raise TargetedRecoveryError("; ".join(verification["errors"]))
    return artifact
