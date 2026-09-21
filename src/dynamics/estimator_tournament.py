"""D0.3.2 estimator tournament on the byte-frozen D0.3.1 universe.

Five interpretable estimator families see identical replayed worlds, train and
holdout boundaries, scoring rules, and promotion gates.  The module preserves
individual scientific axes and deliberately does not compute an aggregate
winner score.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import timedelta
from functools import lru_cache
from pathlib import Path
from statistics import median
from typing import Any, Callable, Mapping, Sequence

import numpy as np

from src.dynamics.identifiability import (
    DEFAULT_D031_ARTIFACT,
    POWER_THRESHOLD,
    TOPOLOGY_LOCATION_TOLERANCE,
    WorldSpec,
    _identified_model,
    _match_points,
    _reference_specs,
    _simulate_world,
    _truth_functions,
    verify_identifiability_artifact,
)
from src.dynamics.nonlinear import (
    MINIMUM_BOOTSTRAP_DOMINANCE,
    MINIMUM_FIELD_STABILITY,
    MINIMUM_M3_OVER_M2_IMPROVEMENT,
    MINIMUM_NONLINEAR_OOS_IMPROVEMENT,
    _fit_exact_ou,
    _raw_roots,
    _score,
    fit_nonlinear_dynamics,
)
from src.dynamics.selection_freeze import canonical_sha256


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D032_ARTIFACT = ROOT / "eval/dynamics/d0_3_2/estimator_tournament.json"
TOURNAMENT_SOURCE = Path(__file__)
IDENTIFIABILITY_SOURCE = Path(__file__).with_name("identifiability.py")
D031_ARTIFACT_HASH = "347a7d7de2992434d50eba2b8c1afd80b0fe69a872cbf77f2ac8b1334b551e72"
D031_FILE_SHA256 = "40ab6d4098461a1adb93e61bb395eff2e141209c05fe978b0878955a0969d213"
COMMON_NONLINEARITY_RATIO = 0.08
COMMON_MAX_CALIBRATION_ERROR = 0.20
COMMON_ROOT_SUPPORT = 8
PAIR_BOOTSTRAP_REPETITIONS = 200

ESTIMATOR_IDS = (
    "EST-SPLINE-D03",
    "EST-KM-D032",
    "EST-LOCALPOLY-D032",
    "EST-SINDY-D032",
    "EST-GP-D032",
)

ESTIMATOR_LABELS = {
    "EST-SPLINE-D03": "Spline likelihood incumbent",
    "EST-KM-D032": "Kramers-Moyal conditional moments",
    "EST-LOCALPOLY-D032": "Local polynomial fields",
    "EST-SINDY-D032": "Sparse stochastic equation discovery",
    "EST-GP-D032": "Sparse Gaussian-process fields",
}


class EstimatorTournamentError(ValueError):
    """Raised when a tournament would violate its frozen evidence boundary."""


@dataclass
class FieldEstimate:
    estimator_id: str
    grid: np.ndarray
    drift: np.ndarray
    diffusion: np.ndarray
    constant_diffusion: float
    drift_effective_df: float
    diffusion_effective_df: float
    law_coefficients: dict[str, float] | None = None
    uncertainty: dict[str, float] | None = None

    def drift_at(self, states: np.ndarray) -> np.ndarray:
        return np.interp(states, self.grid, self.drift)

    def diffusion_at(self, states: np.ndarray, *, state_dependent: bool) -> np.ndarray:
        if not state_dependent:
            return np.full_like(states, self.constant_diffusion, dtype=float)
        return np.maximum(np.interp(states, self.grid, self.diffusion), 1e-6)


def _ridge(
    design: np.ndarray,
    target: np.ndarray,
    weights: np.ndarray,
    regularization: float,
) -> tuple[np.ndarray, float, np.ndarray]:
    weighted_gram = design.T @ (weights[:, None] * design)
    system = weighted_gram + np.eye(design.shape[1]) * regularization
    rhs = design.T @ (weights * target)
    coefficients = np.linalg.solve(system, rhs)
    inverse = np.linalg.inv(system)
    effective_df = float(np.trace(inverse @ weighted_gram))
    return coefficients, effective_df, inverse


def _smooth(values: np.ndarray, repetitions: int = 2) -> np.ndarray:
    result = np.asarray(values, dtype=float)
    for _ in range(repetitions):
        padded = np.pad(result, (1, 1), mode="edge")
        result = 0.25 * padded[:-2] + 0.50 * padded[1:-1] + 0.25 * padded[2:]
    return result


def _fit_kramers_moyal(
    origins: np.ndarray,
    increments: np.ndarray,
    delta_times: np.ndarray,
    grid: np.ndarray,
) -> FieldEstimate:
    bin_count = min(16, max(5, len(origins) // 8))
    edges = np.unique(
        np.quantile(origins, np.linspace(0.0, 1.0, bin_count + 1))
    )
    if len(edges) < 6:
        raise EstimatorTournamentError("Kramers-Moyal state bins collapsed")
    assignments = np.clip(np.digitize(origins, edges[1:-1]), 0, len(edges) - 2)
    centers: list[float] = []
    drift_values: list[float] = []
    diffusion_values: list[float] = []
    for index in range(len(edges) - 1):
        mask = assignments == index
        if int(np.sum(mask)) < 5:
            continue
        local_dt = delta_times[mask]
        local_dx = increments[mask]
        drift = float(np.sum(local_dx) / np.sum(local_dt))
        residuals = local_dx - drift * local_dt
        diffusion = math.sqrt(
            max(float(np.sum(residuals**2) / np.sum(local_dt)), 1e-10)
        )
        centers.append(float(np.average(origins[mask], weights=local_dt)))
        drift_values.append(drift)
        diffusion_values.append(diffusion)
    if len(centers) < 4:
        raise EstimatorTournamentError("Kramers-Moyal has insufficient occupied bins")
    center_array = np.asarray(centers)
    drift_grid = _smooth(np.interp(grid, center_array, drift_values))
    diffusion_grid = np.maximum(
        _smooth(np.interp(grid, center_array, diffusion_values)), 1e-6
    )
    origin_drift = np.interp(origins, grid, drift_grid)
    residuals = increments - origin_drift * delta_times
    constant = math.sqrt(
        max(float(np.mean(residuals**2 / delta_times)), 1e-10)
    )
    return FieldEstimate(
        estimator_id="EST-KM-D032",
        grid=grid,
        drift=drift_grid,
        diffusion=diffusion_grid,
        constant_diffusion=constant,
        drift_effective_df=float(len(centers)),
        diffusion_effective_df=float(len(centers)),
    )


def _local_intercept(
    origins: np.ndarray,
    target: np.ndarray,
    base_weights: np.ndarray,
    grid: np.ndarray,
    bandwidth: float,
) -> np.ndarray:
    estimates = []
    for state in grid:
        distance = (origins - state) / bandwidth
        weights = base_weights * np.exp(-0.5 * distance**2)
        design = np.column_stack((np.ones_like(origins), origins - state))
        coefficients, _, _ = _ridge(design, target, weights, 1e-6)
        estimates.append(float(coefficients[0]))
    return np.asarray(estimates)


def _fit_local_polynomial(
    origins: np.ndarray,
    increments: np.ndarray,
    delta_times: np.ndarray,
    grid: np.ndarray,
) -> FieldEstimate:
    spread = max(float(np.std(origins, ddof=1)), 1e-4)
    bandwidth = max(0.75 * spread * len(origins) ** (-0.2), (grid[-1] - grid[0]) / 28.0)
    drift_target = increments / delta_times
    drift_grid = _local_intercept(
        origins, drift_target, delta_times, grid, bandwidth
    )
    origin_drift = np.interp(origins, grid, drift_grid)
    residuals = increments - origin_drift * delta_times
    variance_target = np.maximum(residuals**2 / delta_times, 1e-10)
    local_variance = _local_intercept(
        origins,
        variance_target,
        np.ones_like(delta_times),
        grid,
        bandwidth,
    )
    diffusion_grid = np.sqrt(np.maximum(local_variance, 1e-10))
    constant = math.sqrt(max(float(np.mean(variance_target)), 1e-10))
    effective_df = min(float((grid[-1] - grid[0]) / bandwidth * 1.5), len(origins) / 3.0)
    return FieldEstimate(
        estimator_id="EST-LOCALPOLY-D032",
        grid=grid,
        drift=drift_grid,
        diffusion=diffusion_grid,
        constant_diffusion=constant,
        drift_effective_df=effective_df,
        diffusion_effective_df=effective_df,
    )


def _polynomial_design(states: np.ndarray, degree: int) -> np.ndarray:
    return np.column_stack([np.power(states, power) for power in range(degree + 1)])


def _sparse_polynomial(
    design: np.ndarray,
    target: np.ndarray,
    weights: np.ndarray,
    *,
    regularization: float,
    threshold: float,
) -> tuple[np.ndarray, float]:
    scales = np.sqrt(np.mean(np.square(design), axis=0))
    scales = np.maximum(scales, 1e-8)
    normalized = design / scales
    active = np.ones(design.shape[1], dtype=bool)
    coefficients = np.zeros(design.shape[1], dtype=float)
    for _ in range(8):
        if not np.any(active):
            active[0] = True
        local, _, _ = _ridge(
            normalized[:, active], target, weights, regularization
        )
        updated = np.zeros_like(coefficients)
        updated[active] = local
        next_active = np.abs(updated) >= threshold
        if not np.any(next_active):
            next_active[int(np.argmax(np.abs(updated)))] = True
        if np.array_equal(next_active, active):
            coefficients = updated
            break
        coefficients = updated
        active = next_active
    coefficients = coefficients / scales
    return coefficients, float(np.sum(active))


def _fit_sindy(
    origins: np.ndarray,
    increments: np.ndarray,
    delta_times: np.ndarray,
    grid: np.ndarray,
) -> FieldEstimate:
    drift_design = _polynomial_design(origins, 4)
    drift_coefficients, drift_df = _sparse_polynomial(
        drift_design,
        increments / delta_times,
        delta_times,
        regularization=0.02,
        threshold=0.035,
    )
    drift_grid = _polynomial_design(grid, 4) @ drift_coefficients
    origin_drift = drift_design @ drift_coefficients
    residuals = increments - origin_drift * delta_times
    constant = math.sqrt(
        max(float(np.mean(residuals**2 / delta_times)), 1e-10)
    )
    log_scale_target = 0.5 * np.log(
        np.maximum(residuals**2 / delta_times, 1e-10)
    ) + 0.6351814227307391
    diffusion_design = _polynomial_design(origins, 2)
    diffusion_coefficients, diffusion_df = _sparse_polynomial(
        diffusion_design,
        log_scale_target,
        np.ones_like(delta_times),
        regularization=0.04,
        threshold=0.05,
    )
    diffusion_grid = np.exp(
        np.clip(_polynomial_design(grid, 2) @ diffusion_coefficients, -6.0, 2.0)
    )
    names = ("1", "x", "x2", "x3", "x4")
    law = {
        name: float(coefficient)
        for name, coefficient in zip(names, drift_coefficients)
        if abs(float(coefficient)) >= 1e-10
    }
    return FieldEstimate(
        estimator_id="EST-SINDY-D032",
        grid=grid,
        drift=drift_grid,
        diffusion=diffusion_grid,
        constant_diffusion=constant,
        drift_effective_df=drift_df,
        diffusion_effective_df=diffusion_df,
        law_coefficients=law,
    )


def _rbf_design(states: np.ndarray, centers: np.ndarray, length_scale: float) -> np.ndarray:
    radial = np.exp(
        -0.5 * np.square((states[:, None] - centers[None, :]) / length_scale)
    )
    return np.column_stack((np.ones_like(states), states, radial))


def _fit_sparse_gp(
    origins: np.ndarray,
    increments: np.ndarray,
    delta_times: np.ndarray,
    grid: np.ndarray,
) -> FieldEstimate:
    center_count = min(28, max(10, len(origins) // 12))
    centers = np.unique(np.quantile(origins, np.linspace(0.03, 0.97, center_count)))
    spread = max(float(np.std(origins, ddof=1)), 1e-4)
    length_scale = max(0.45 * spread, (grid[-1] - grid[0]) / 32.0)
    design = _rbf_design(origins, centers, length_scale)
    drift_coefficients, drift_df, drift_inverse = _ridge(
        design,
        increments / delta_times,
        delta_times,
        0.18,
    )
    grid_design = _rbf_design(grid, centers, length_scale)
    drift_grid = grid_design @ drift_coefficients
    residuals = increments - design @ drift_coefficients * delta_times
    constant = math.sqrt(
        max(float(np.mean(residuals**2 / delta_times)), 1e-10)
    )
    log_scale_target = 0.5 * np.log(
        np.maximum(residuals**2 / delta_times, 1e-10)
    ) + 0.6351814227307391
    diffusion_coefficients, diffusion_df, diffusion_inverse = _ridge(
        design,
        log_scale_target,
        np.ones_like(delta_times),
        0.30,
    )
    diffusion_grid = np.exp(np.clip(grid_design @ diffusion_coefficients, -6.0, 2.0))
    drift_variance = np.einsum("ij,jk,ik->i", grid_design, drift_inverse, grid_design)
    diffusion_variance = np.einsum(
        "ij,jk,ik->i", grid_design, diffusion_inverse, grid_design
    )
    return FieldEstimate(
        estimator_id="EST-GP-D032",
        grid=grid,
        drift=drift_grid,
        diffusion=diffusion_grid,
        constant_diffusion=constant,
        drift_effective_df=drift_df,
        diffusion_effective_df=diffusion_df,
        uncertainty={
            "median_drift_posterior_variance": float(np.median(drift_variance)),
            "median_log_diffusion_posterior_variance": float(
                np.median(diffusion_variance)
            ),
            "approximation": "fixed inducing-point RBF Gaussian process",
        },
    )


FIT_FUNCTIONS: dict[
    str,
    Callable[[np.ndarray, np.ndarray, np.ndarray, np.ndarray], FieldEstimate],
] = {
    "EST-KM-D032": _fit_kramers_moyal,
    "EST-LOCALPOLY-D032": _fit_local_polynomial,
    "EST-SINDY-D032": _fit_sindy,
    "EST-GP-D032": _fit_sparse_gp,
}


def _point_scores(
    fit: FieldEstimate,
    origins: np.ndarray,
    targets: np.ndarray,
    delta_times: np.ndarray,
    *,
    state_dependent: bool,
) -> dict[str, Any]:
    drift = fit.drift_at(origins)
    diffusion = fit.diffusion_at(origins, state_dependent=state_dependent)
    means = origins + drift * delta_times
    variances = np.maximum(diffusion**2 * delta_times, 1e-12)
    errors = targets - means
    nll = 0.5 * (np.log(2.0 * math.pi * variances) + errors**2 / variances)
    half_width = 1.6448536269514722 * np.sqrt(variances)
    covered = np.abs(errors) <= half_width
    innovations = errors / np.sqrt(variances)
    return {
        "mean_nll": float(np.mean(nll)),
        "point_nll": nll,
        "rmse": float(np.sqrt(np.mean(errors**2))),
        "coverage_90": float(np.mean(covered)),
        "calibration_error_90": float(abs(np.mean(covered) - 0.90)),
        "innovations": innovations,
    }


def _bootstrap_dominance(
    baseline_nll: np.ndarray,
    candidate_nll: np.ndarray,
    seed: int,
) -> float:
    difference = baseline_nll - candidate_nll
    rng = np.random.default_rng(seed)
    wins = 0
    for _ in range(PAIR_BOOTSTRAP_REPETITIONS):
        indices = rng.integers(0, len(difference), len(difference))
        wins += float(np.mean(difference[indices])) > 0.0
    return wins / PAIR_BOOTSTRAP_REPETITIONS


def _support(grid: np.ndarray, origins: np.ndarray) -> np.ndarray:
    radius = max((grid[-1] - grid[0]) / 18.0, float(np.std(origins)) * 0.15)
    return np.asarray([np.sum(np.abs(origins - state) <= radius) for state in grid])


def _nonlinearity_ratio(fit: FieldEstimate, support: np.ndarray) -> float:
    weights = np.maximum(support.astype(float), 1.0)
    design = np.column_stack((np.ones_like(fit.grid), fit.grid))
    coefficients, _, _ = _ridge(design, fit.drift, weights, 1e-8)
    linear = design @ coefficients
    numerator = math.sqrt(float(np.average((fit.drift - linear) ** 2, weights=weights)))
    denominator = math.sqrt(float(np.average(fit.drift**2, weights=weights)))
    return numerator / max(denominator, 1e-10)


def _field_stability(
    estimator_id: str,
    origins: np.ndarray,
    increments: np.ndarray,
    delta_times: np.ndarray,
    grid: np.ndarray,
    full: FieldEstimate,
) -> float:
    fit_function = FIT_FUNCTIONS[estimator_id]
    width = max(48, int(len(origins) * 0.65))
    first = fit_function(
        origins[:width], increments[:width], delta_times[:width], grid
    )
    last = fit_function(
        origins[-width:], increments[-width:], delta_times[-width:], grid
    )
    drift_scale = max(float(np.linalg.norm(full.drift)), 1e-8)
    diffusion_scale = max(float(np.linalg.norm(full.diffusion)), 1e-8)
    drift_error = float(np.linalg.norm(first.drift - last.drift)) / drift_scale
    diffusion_error = float(np.linalg.norm(first.diffusion - last.diffusion)) / diffusion_scale
    return float(math.exp(-0.5 * (drift_error + diffusion_error)))


def _certified_roots(
    fit: FieldEstimate, support: np.ndarray, promoted: bool
) -> tuple[list[float], list[float]]:
    if not promoted:
        return [], []
    roots = _raw_roots(fit.grid, fit.drift)
    stable: list[float] = []
    unstable: list[float] = []
    for root in roots:
        index = int(np.argmin(np.abs(fit.grid - float(root["state"]))))
        if int(support[index]) < COMMON_ROOT_SUPPORT:
            continue
        target = stable if bool(root["stable"]) else unstable
        target.append(float(root["state"]))
    return stable, unstable


def _reconstruction_errors(
    spec: WorldSpec,
    fit: FieldEstimate,
    support: np.ndarray,
    center: float,
    scale: float,
) -> tuple[float, float]:
    weights = np.maximum(support.astype(float), 1.0)
    weights /= float(np.sum(weights))
    truth_drift_fn, truth_diffusion_fn = _truth_functions(spec)
    raw_grid = center + scale * fit.grid
    true_drift = truth_drift_fn(raw_grid)
    true_diffusion = truth_diffusion_fn(raw_grid)
    estimated_drift = scale * fit.drift
    estimated_diffusion = (
        scale * fit.diffusion
        if spec.expected_model == "M3"
        else np.full_like(fit.grid, scale * fit.constant_diffusion)
    )
    drift_error = float(
        np.sum(weights * (estimated_drift - true_drift) ** 2)
        / max(float(np.sum(weights * true_drift**2)), 1e-10)
    )
    diffusion_error = float(
        np.sum(weights * (estimated_diffusion - true_diffusion) ** 2)
        / max(float(np.sum(weights * true_diffusion**2)), 1e-10)
    )
    return drift_error, diffusion_error


def _true_law(spec: WorldSpec) -> dict[str, float] | None:
    if spec.family in {"random_walk", "jump_contamination", "regime_switch"}:
        return None
    coefficients = {"x": -spec.theta}
    if spec.family == "double_well":
        coefficients["x"] = spec.theta
    if abs(spec.quadratic) > 0:
        coefficients["x2"] = spec.quadratic
    if abs(spec.cubic) > 0:
        coefficients["x3"] = -spec.cubic
    return {key: value for key, value in coefficients.items() if abs(value) > 1e-12}


def _unstandardize_law(
    recovered: Mapping[str, float] | None, center: float, scale: float
) -> dict[str, float] | None:
    if recovered is None:
        return None
    raw: dict[str, float] = {}
    for name, coefficient in recovered.items():
        power = 0 if name == "1" else int(name.removeprefix("x")) if name != "x" else 1
        for raw_power in range(power + 1):
            raw_name = "1" if raw_power == 0 else "x" if raw_power == 1 else f"x{raw_power}"
            contribution = (
                float(coefficient)
                * math.comb(power, raw_power)
                * (-center) ** (power - raw_power)
                * scale ** (1 - power)
            )
            raw[raw_name] = raw.get(raw_name, 0.0) + contribution
    return raw


def _law_recovery(
    spec: WorldSpec, recovered: Mapping[str, float] | None
) -> dict[str, Any] | None:
    truth = _true_law(spec)
    if truth is None or recovered is None:
        return None
    true_terms = set(truth)
    recovered_terms = {
        key for key, value in recovered.items() if abs(float(value)) >= 0.025
    }
    matches = true_terms & recovered_terms
    precision = len(matches) / len(recovered_terms) if recovered_terms else 0.0
    recall = len(matches) / len(true_terms) if true_terms else 1.0
    keys = true_terms | recovered_terms
    numerator = math.sqrt(
        sum((float(recovered.get(key, 0.0)) - truth.get(key, 0.0)) ** 2 for key in keys)
    )
    denominator = math.sqrt(sum(value**2 for value in truth.values()))
    return {
        "true_terms": sorted(true_terms),
        "recovered_terms": sorted(recovered_terms),
        "term_precision": precision,
        "term_recall": recall,
        "coefficient_error": numerator / max(denominator, 1e-10),
        "structural_equation_match": recovered_terms == true_terms,
        "coefficients": dict(recovered),
    }


def _evaluate_new_estimator(
    estimator_id: str,
    spec: WorldSpec,
    values: np.ndarray,
    observed_at: Sequence[Any],
    seed: int,
    common_ou_accepted: bool,
) -> dict[str, Any]:
    train_end = int(len(values) * 0.72)
    center = float(np.mean(values[:train_end]))
    scale = float(np.std(values[:train_end], ddof=1))
    if not math.isfinite(scale) or scale <= 1e-10:
        raise EstimatorTournamentError("pre-holdout state has no usable variation")
    standardized = (values - center) / scale
    origins = standardized[: train_end - 1]
    increments = np.diff(standardized[:train_end])
    delta_times = np.asarray(
        [(right - left).total_seconds() / 86_400.0 for left, right in zip(observed_at[:-1], observed_at[1:])]
    )
    train_dt = delta_times[: train_end - 1]
    holdout_origins = standardized[train_end - 1 : -1]
    holdout_targets = standardized[train_end:]
    holdout_dt = delta_times[train_end - 1 :]
    lower, upper = np.quantile(origins, [0.01, 0.99])
    grid = np.linspace(float(lower), float(upper), 121)
    support = _support(grid, origins)
    try:
        fit = FIT_FUNCTIONS[estimator_id](origins, increments, train_dt, grid)
        stability = _field_stability(
            estimator_id, origins, increments, train_dt, grid, fit
        )
    except (ValueError, FloatingPointError, np.linalg.LinAlgError) as exc:
        return {
            "estimator_id": estimator_id,
            "identified_model": "ABSTAIN",
            "correct_model": spec.expected_model == "ABSTAIN",
            "nonlinear_detected": False,
            "numerical_failure": True,
            "failure": str(exc),
            "runtime_work_units": len(origins),
        }

    ou_fit = _fit_exact_ou(origins, increments, train_dt)
    ou_score = _score(ou_fit, holdout_origins, holdout_targets, holdout_dt)
    ou_nll = 0.5 * (
        np.log(2.0 * math.pi * np.maximum(
            float(ou_fit.parameters["sigma"]) ** 2
            * (-np.expm1(-2.0 * float(ou_fit.parameters["theta"]) * holdout_dt))
            / (2.0 * float(ou_fit.parameters["theta"])),
            1e-12,
        ))
        + (
            holdout_targets
            - (
                float(ou_fit.parameters["mu"])
                + (holdout_origins - float(ou_fit.parameters["mu"]))
                * np.exp(-float(ou_fit.parameters["theta"]) * holdout_dt)
            )
        )
        ** 2
        / np.maximum(
            float(ou_fit.parameters["sigma"]) ** 2
            * (-np.expm1(-2.0 * float(ou_fit.parameters["theta"]) * holdout_dt))
            / (2.0 * float(ou_fit.parameters["theta"])),
            1e-12,
        )
    )
    m2_score = _point_scores(
        fit, holdout_origins, holdout_targets, holdout_dt, state_dependent=False
    )
    m3_score = _point_scores(
        fit, holdout_origins, holdout_targets, holdout_dt, state_dependent=True
    )
    penalty_scale = math.log(len(origins)) / (2.0 * len(origins))
    adjusted = {
        "M1": float(ou_score["mean_nll"] + 3.0 * penalty_scale),
        "M2": float(
            m2_score["mean_nll"]
            + (fit.drift_effective_df + 1.0) * penalty_scale
        ),
        "M3": float(
            m3_score["mean_nll"]
            + (fit.drift_effective_df + fit.diffusion_effective_df) * penalty_scale
        ),
    }
    m2_gain = adjusted["M1"] - adjusted["M2"]
    m3_gain = adjusted["M1"] - adjusted["M3"]
    m3_over_m2 = adjusted["M2"] - adjusted["M3"]
    m2_dominance = _bootstrap_dominance(
        ou_nll, m2_score["point_nll"], seed + 101
    )
    m3_dominance = _bootstrap_dominance(
        ou_nll, m3_score["point_nll"], seed + 202
    )
    nonlinearity = _nonlinearity_ratio(fit, support)
    diffusion_ratio = float(np.max(fit.diffusion) / max(np.min(fit.diffusion), 1e-8))
    m2_criteria = {
        "material_oos_gain": m2_gain >= MINIMUM_NONLINEAR_OOS_IMPROVEMENT,
        "bootstrap_dominance": m2_dominance >= MINIMUM_BOOTSTRAP_DOMINANCE,
        "nonlinear_field": nonlinearity >= COMMON_NONLINEARITY_RATIO,
        "field_stability": stability >= MINIMUM_FIELD_STABILITY,
        "forecast_calibration": (
            m2_score["calibration_error_90"] <= COMMON_MAX_CALIBRATION_ERROR
        ),
    }
    m3_criteria = {
        "material_oos_gain": m3_gain >= MINIMUM_NONLINEAR_OOS_IMPROVEMENT,
        "bootstrap_dominance": m3_dominance >= MINIMUM_BOOTSTRAP_DOMINANCE,
        "material_gain_over_m2": m3_over_m2 >= MINIMUM_M3_OVER_M2_IMPROVEMENT,
        "state_dependent_diffusion": diffusion_ratio >= 1.15,
        "field_stability": stability >= MINIMUM_FIELD_STABILITY,
        "forecast_calibration": (
            m3_score["calibration_error_90"] <= COMMON_MAX_CALIBRATION_ERROR
        ),
    }
    m2_promoted = all(m2_criteria.values())
    m3_promoted = all(m3_criteria.values())
    identified = (
        "M3" if m3_promoted else "M2" if m2_promoted else "M1" if common_ou_accepted else "ABSTAIN"
    )
    selected_score = m3_score if identified == "M3" else m2_score if identified == "M2" else ou_score
    stable_roots, unstable_roots = _certified_roots(
        fit, support, identified in {"M2", "M3"}
    )
    stable_roots = [center + scale * root for root in stable_roots]
    unstable_roots = [center + scale * root for root in unstable_roots]
    stable_matches = _match_points(
        spec.expected_stable_points, stable_roots, TOPOLOGY_LOCATION_TOLERANCE
    )
    unstable_matches = _match_points(
        spec.expected_unstable_points, unstable_roots, TOPOLOGY_LOCATION_TOLERANCE
    )
    topology_evaluated = spec.family == "double_well"
    topology_match = bool(
        topology_evaluated
        and stable_matches == len(spec.expected_stable_points)
        and unstable_matches == len(spec.expected_unstable_points)
        and len(stable_roots) == len(spec.expected_stable_points)
        and len(unstable_roots) == len(spec.expected_unstable_points)
    )
    drift_error, diffusion_error = _reconstruction_errors(spec, fit, support, center, scale)
    method_multiplier = {
        "EST-KM-D032": 2.0,
        "EST-LOCALPOLY-D032": float(len(grid) * 4),
        "EST-SINDY-D032": 9.0,
        "EST-GP-D032": float((fit.drift_effective_df + 2.0) ** 2),
    }[estimator_id]
    return {
        "estimator_id": estimator_id,
        "identified_model": identified,
        "correct_model": identified == spec.expected_model,
        "nonlinear_detected": identified in {"M2", "M3"},
        "numerical_failure": False,
        "sealed_oos": {
            "mean_nll": float(selected_score["mean_nll"]),
            "coverage_90": float(selected_score["coverage_90"]),
            "calibration_error_90": float(selected_score["calibration_error_90"]),
        },
        "field": {
            "nonlinearity_ratio": nonlinearity,
            "diffusion_max_min_ratio": diffusion_ratio,
            "stability": stability,
            "drift_reconstruction_error": drift_error,
            "diffusion_reconstruction_error": diffusion_error,
            "stable_points": stable_roots,
            "unstable_points": unstable_roots,
            "stable_point_matches": stable_matches,
            "unstable_point_matches": unstable_matches,
            "topology_evaluated": topology_evaluated,
            "topology_match": topology_match,
            "uncertainty": fit.uncertainty,
        },
        "promotion": {
            "M2": {"promoted": m2_promoted, "criteria": m2_criteria},
            "M3": {"promoted": m3_promoted, "criteria": m3_criteria},
        },
        "law_recovery": _law_recovery(
            spec, _unstandardize_law(fit.law_coefficients, center, scale)
        ),
        "runtime_work_units": int(math.ceil(len(origins) * method_multiplier)),
    }


def _evaluate_incumbent(
    spec: WorldSpec,
    parent_case: Mapping[str, Any],
    values: np.ndarray,
    observed_at: Sequence[Any],
    seed: int,
) -> dict[str, Any]:
    available_at = [timestamp + timedelta(minutes=12) for timestamp in observed_at]
    artifact = fit_nonlinear_dynamics(
        values.tolist(),
        observable=f"d0.3.1::{spec.cell_id}",
        observed_at=observed_at,
        available_at=available_at,
        as_of=available_at[-1],
        time_unit="day",
        train_fraction=0.72,
        source="controlled-synthetic-identifiability",
        revision=f"d0.3.1-{seed}",
        bootstrap_repetitions=8,
        seed=seed,
    )
    identified = _identified_model(artifact)
    parent_inference = parent_case["inference"]
    if identified != parent_inference["identified_model"]:
        raise EstimatorTournamentError("incumbent replay diverged from frozen D0.3.1")
    selected = next(
        model for model in artifact["models"] if model["code"] == artifact["verdicts"]["selected_model"]
    )
    m1 = next(model for model in artifact["models"] if model["code"] == "M1")
    return {
        "estimator_id": "EST-SPLINE-D03",
        "identified_model": identified,
        "correct_model": bool(parent_inference["correct_model"]),
        "nonlinear_detected": bool(parent_inference["nonlinear_detected"]),
        "numerical_failure": False,
        "sealed_oos": {
            "mean_nll": float(selected["holdout_score"]["mean_nll"]),
            "coverage_90": float(selected["holdout_score"]["coverage_90"]),
            "calibration_error_90": float(
                selected["holdout_score"]["calibration_error_90"]
            ),
        },
        "common_baseline": {
            "model": "M1",
            "scientific_verdict": str(m1["scientific_verdict"]),
            "accepted": m1["scientific_verdict"] == "ACCEPT",
            "shared_by_all_estimators": True,
        },
        "field": {
            "drift_reconstruction_error": parent_inference[
                "drift_reconstruction_error"
            ],
            "diffusion_reconstruction_error": parent_inference[
                "diffusion_reconstruction_error"
            ],
            "stable_points": parent_inference["stable_points"],
            "unstable_points": parent_inference["unstable_points"],
            "stable_point_matches": parent_inference["stable_point_matches"],
            "unstable_point_matches": parent_inference["unstable_point_matches"],
            "topology_evaluated": parent_inference["topology_evaluated"],
            "topology_match": parent_inference["topology_match"],
            "uncertainty": {"method": "transition bootstrap", "repetitions": 8},
        },
        "promotion": artifact["promotion"],
        "law_recovery": None,
        "runtime_work_units": int(len(values) * 4 * 8),
    }


def _world_hash(values: np.ndarray, observed_at: Sequence[Any]) -> str:
    return canonical_sha256(
        {
            "values": [float(value) for value in values],
            "observed_at": [timestamp.isoformat() for timestamp in observed_at],
        }
    )


def _evaluate_world(
    parent_case: Mapping[str, Any], spec: WorldSpec
) -> dict[str, Any]:
    seed = int(parent_case["seed"])
    values, observed_at, _ = _simulate_world(spec, seed)
    incumbent = _evaluate_incumbent(spec, parent_case, values, observed_at, seed)
    evaluations = [incumbent]
    common_ou_accepted = bool(incumbent["common_baseline"]["accepted"])
    for estimator_id in ESTIMATOR_IDS[1:]:
        evaluations.append(
            _evaluate_new_estimator(
                estimator_id, spec, values, observed_at, seed, common_ou_accepted
            )
        )
    return {
        "cell_id": spec.cell_id,
        "family": spec.family,
        "repetition": int(parent_case["repetition"]),
        "seed": seed,
        "world_hash": _world_hash(values, observed_at),
        "split": {
            "train_observations": int(len(values) * 0.72),
            "sealed_holdout_observations": len(values) - int(len(values) * 0.72),
            "identical_for_all_estimators": True,
        },
        "truth": dict(parent_case["truth"]),
        "estimators": evaluations,
    }


def _rate(numerator: int, denominator: int, empty: float = 0.0) -> float:
    return numerator / denominator if denominator else empty


def _estimator_summary(
    estimator_id: str, cases: Sequence[Mapping[str, Any]]
) -> dict[str, Any]:
    rows = [
        next(item for item in case["estimators"] if item["estimator_id"] == estimator_id)
        for case in cases
    ]
    usable = [row for row in rows if not row["numerical_failure"]]
    linear = [
        (case, row)
        for case, row in zip(cases, rows)
        if case["truth"]["expected_model"] == "M1"
    ]
    nonlinear = [
        (case, row)
        for case, row in zip(cases, rows)
        if case["truth"]["expected_model"] in {"M2", "M3"}
    ]
    state_diffusion = [
        row
        for case, row in nonlinear
        if case["truth"]["expected_model"] == "M3"
    ]
    misspecified = [
        row
        for case, row in zip(cases, rows)
        if case["truth"]["expected_model"] == "ABSTAIN"
    ]
    double_well = [
        row for case, row in zip(cases, rows) if case["family"] == "double_well"
    ]
    predicted = sum(len(row.get("field", {}).get("stable_points", [])) for row in double_well)
    truth_count = sum(
        len(case["truth"]["stable_points"])
        for case in cases
        if case["family"] == "double_well"
    )
    matched = sum(
        int(row.get("field", {}).get("stable_point_matches", 0)) for row in double_well
    )
    random_walk = [
        row for case, row in zip(cases, rows) if case["family"] == "random_walk"
    ]
    drift_errors = [
        float(row["field"]["drift_reconstruction_error"])
        for _, row in nonlinear
        if not row["numerical_failure"]
        and row.get("field", {}).get("drift_reconstruction_error") is not None
    ]
    diffusion_errors = [
        float(row["field"]["diffusion_reconstruction_error"])
        for _, row in nonlinear
        if not row["numerical_failure"]
        and row.get("field", {}).get("diffusion_reconstruction_error") is not None
    ]
    law_rows = [row["law_recovery"] for row in usable if row.get("law_recovery")]
    summary = {
        "estimator_id": estimator_id,
        "label": ESTIMATOR_LABELS[estimator_id],
        "runs": len(rows),
        "linear_specificity": _rate(
            sum(not row["nonlinear_detected"] for _, row in linear), len(linear)
        ),
        "false_nonlinear_discovery_rate": _rate(
            sum(row["nonlinear_detected"] for _, row in linear), len(linear)
        ),
        "nonlinear_detection_rate": _rate(
            sum(row["correct_model"] for _, row in nonlinear), len(nonlinear)
        ),
        "state_diffusion_detection_rate": _rate(
            sum(row["correct_model"] for row in state_diffusion), len(state_diffusion)
        ),
        "misspecification_abstention_rate": _rate(
            sum(row["identified_model"] == "ABSTAIN" for row in misspecified),
            len(misspecified),
        ),
        "basin_precision": _rate(matched, predicted, empty=1.0),
        "basin_recall": _rate(matched, truth_count),
        "potential_topology_accuracy": _rate(
            sum(row.get("field", {}).get("topology_match", False) for row in double_well),
            len(double_well),
        ),
        "false_basin_discovery_rate": _rate(
            sum(bool(row.get("field", {}).get("stable_points")) for row in random_walk),
            len(random_walk),
        ),
        "median_drift_reconstruction_error": median(drift_errors) if drift_errors else None,
        "median_diffusion_reconstruction_error": (
            median(diffusion_errors) if diffusion_errors else None
        ),
        "mean_sealed_oos_nll": (
            float(np.mean([row["sealed_oos"]["mean_nll"] for row in usable]))
            if usable
            else None
        ),
        "mean_calibration_error_90": (
            float(
                np.mean(
                    [row["sealed_oos"]["calibration_error_90"] for row in usable]
                )
            )
            if usable
            else None
        ),
        "median_runtime_work_units": (
            median([int(row["runtime_work_units"]) for row in rows]) if rows else None
        ),
        "numerical_failure_rate": _rate(
            sum(row["numerical_failure"] for row in rows), len(rows)
        ),
        "law_recovery": (
            {
                "worlds": len(law_rows),
                "mean_term_precision": float(
                    np.mean([row["term_precision"] for row in law_rows])
                ),
                "mean_term_recall": float(
                    np.mean([row["term_recall"] for row in law_rows])
                ),
                "median_coefficient_error": median(
                    [float(row["coefficient_error"]) for row in law_rows]
                ),
                "structural_equation_match_rate": _rate(
                    sum(row["structural_equation_match"] for row in law_rows),
                    len(law_rows),
                ),
            }
            if law_rows
            else None
        ),
    }
    return summary


def _envelope(
    estimator_id: str,
    cases: Sequence[Mapping[str, Any]],
    family: str,
    effect_key: str,
) -> list[dict[str, Any]]:
    groups: dict[tuple[float, int], list[bool]] = {}
    allowed = {"linear_ou", "cubic"} if family == "nonlinear_drift" else {"state_diffusion"}
    for case in cases:
        if case["family"] not in allowed:
            continue
        row = next(
            item for item in case["estimators"] if item["estimator_id"] == estimator_id
        )
        key = (float(case["truth"][effect_key]), int(case["truth"]["observations"]))
        groups.setdefault(key, []).append(bool(row["correct_model"]))
    return [
        {
            effect_key: effect,
            "observations": observations,
            "runs": len(results),
            "correct_selection_probability": sum(results) / len(results),
            "identifiable": sum(results) / len(results) >= POWER_THRESHOLD,
        }
        for (effect, observations), results in sorted(groups.items())
    ]


def _graduation(summary: Mapping[str, Any], incumbent: Mapping[str, Any]) -> dict[str, Any]:
    criteria = {
        "material_nonlinear_sensitivity_gain": (
            float(summary["nonlinear_detection_rate"])
            >= max(0.80, float(incumbent["nonlinear_detection_rate"]) + 0.20)
        ),
        "linear_specificity_preserved": float(summary["linear_specificity"]) >= 0.90,
        "false_structure_controlled": (
            float(summary["false_nonlinear_discovery_rate"]) <= 0.05
            and float(summary["false_basin_discovery_rate"]) <= 0.05
        ),
        "state_diffusion_identified": (
            float(summary["state_diffusion_detection_rate"]) >= 0.70
        ),
        "basin_recall": float(summary["basin_recall"]) >= 0.70,
        "topology_recovery": float(summary["potential_topology_accuracy"]) >= 0.70,
        "numerical_reliability": float(summary["numerical_failure_rate"]) <= 0.02,
    }
    return {
        "estimator_id": summary["estimator_id"],
        "graduated": all(criteria.values()),
        "criteria": criteria,
    }


def _load_parent() -> dict[str, Any]:
    raw = DEFAULT_D031_ARTIFACT.read_bytes()
    if hashlib.sha256(raw).hexdigest() != D031_FILE_SHA256:
        raise EstimatorTournamentError("frozen D0.3.1 artifact bytes changed")
    parent = json.loads(raw)
    if parent.get("artifact_hash") != D031_ARTIFACT_HASH:
        raise EstimatorTournamentError("frozen D0.3.1 content address changed")
    verification = verify_identifiability_artifact(parent)
    if not verification["valid"]:
        raise EstimatorTournamentError("frozen D0.3.1 artifact failed verification")
    return parent


@lru_cache(maxsize=4)
def run_estimator_tournament(case_limit: int | None = None) -> dict[str, Any]:
    """Run the frozen five-estimator tournament without selecting a winner."""

    parent = _load_parent()
    parent_cases = parent["cases"]
    if case_limit is not None:
        if not 1 <= case_limit <= len(parent_cases):
            raise EstimatorTournamentError("case_limit is outside the frozen universe")
        parent_cases = parent_cases[:case_limit]
    specs = {spec.cell_id: spec for spec in _reference_specs()}
    cases = [
        _evaluate_world(case, specs[str(case["cell_id"])]) for case in parent_cases
    ]
    summaries = [_estimator_summary(estimator_id, cases) for estimator_id in ESTIMATOR_IDS]
    incumbent = summaries[0]
    envelopes = {
        estimator_id: {
            "nonlinear_drift": _envelope(
                estimator_id, cases, "nonlinear_drift", "cubic"
            ),
            "state_dependent_diffusion": _envelope(
                estimator_id, cases, "state_diffusion", "gamma"
            ),
        }
        for estimator_id in ESTIMATOR_IDS
    }
    graduation = [_graduation(summary, incumbent) for summary in summaries]
    payload: dict[str, Any] = {
        "schema_version": "dynamics-estimator-tournament/0.3.2",
        "milestone": "D0.3.2",
        "frozen": case_limit is None,
        "parent": {
            "milestone": "D0.3.1",
            "artifact_hash": D031_ARTIFACT_HASH,
            "file_sha256": D031_FILE_SHA256,
            "runs": int(parent["runs"]),
            "same_worlds_replayed": True,
            "identifiability_source_sha256": hashlib.sha256(
                IDENTIFIABILITY_SOURCE.read_bytes()
            ).hexdigest(),
        },
        "question": (
            "Which interpretable estimator can materially improve nonlinear "
            "sensitivity while preserving specificity and false-structure control?"
        ),
        "evaluation": {
            "worlds": len(cases),
            "estimators": len(ESTIMATOR_IDS),
            "fits": len(cases) * len(ESTIMATOR_IDS),
            "identical_train_holdout_boundaries": True,
            "common_scoring": True,
            "common_state_normalization": "pre-holdout z-score",
            "aggregate_winner_score": None,
            "winner_selection_policy": "PROHIBITED in D0.3.2",
            "runtime_metric": "deterministic normalized work units",
        },
        "protocol": {
            "source_sha256": hashlib.sha256(TOURNAMENT_SOURCE.read_bytes()).hexdigest(),
            "mutation_policy": "frozen before reference tournament execution",
            "family_definitions": {
                "EST-SPLINE-D03": {
                    "implementation": "byte-frozen D0.3 spline likelihood hierarchy",
                    "configuration": "inherited without modification",
                },
                "EST-KM-D032": {
                    "implementation": "conditional first and second Kramers-Moyal moments",
                    "bins": "quantile; min(16, max(5, train_transitions // 8))",
                    "smoothing_passes": 2,
                },
                "EST-LOCALPOLY-D032": {
                    "implementation": "Gaussian-kernel local-linear intercepts",
                    "bandwidth": "max(0.75 * sd * n^-0.2, grid_range / 28)",
                },
                "EST-SINDY-D032": {
                    "implementation": "sequential thresholded ridge regression",
                    "drift_library": ["1", "x", "x2", "x3", "x4"],
                    "drift_regularization": 0.02,
                    "drift_threshold": 0.035,
                    "diffusion_log_library": ["1", "x", "x2"],
                    "diffusion_regularization": 0.04,
                    "diffusion_threshold": 0.05,
                },
                "EST-GP-D032": {
                    "implementation": "fixed inducing-point RBF Gaussian process approximation",
                    "maximum_inducing_points": 28,
                    "drift_regularization": 0.18,
                    "diffusion_regularization": 0.30,
                },
            },
            "minimum_nonlinear_oos_improvement": MINIMUM_NONLINEAR_OOS_IMPROVEMENT,
            "minimum_m3_over_m2_improvement": MINIMUM_M3_OVER_M2_IMPROVEMENT,
            "minimum_bootstrap_dominance": MINIMUM_BOOTSTRAP_DOMINANCE,
            "minimum_field_stability": MINIMUM_FIELD_STABILITY,
            "minimum_nonlinearity_ratio": COMMON_NONLINEARITY_RATIO,
            "maximum_calibration_error_90": COMMON_MAX_CALIBRATION_ERROR,
            "power_threshold": POWER_THRESHOLD,
            "neural_sde_excluded": True,
        },
        "estimators": summaries,
        "graduation": graduation,
        "identifiability_envelopes": envelopes,
        "cases": cases,
        "real_market_claim": {
            "selected_model": "M1",
            "market_claim": "ABSTAIN",
            "interpretation": (
                "No nonlinear structure was certified by an estimator whose "
                "nonlinear identification power is currently insufficient."
            ),
            "rerun_performed": False,
        },
        "routing": {
            "enabled": False,
            "milestone": "D0.3.3 only if estimator-specific envelopes warrant it",
        },
        "excluded_scope": [
            "global estimator winner",
            "automatic estimator routing",
            "neural SDE",
            "Hawkes dynamics",
            "real-market claim promotion",
        ],
    }
    payload["artifact_hash"] = canonical_sha256(payload)
    return payload


def verify_estimator_tournament(
    artifact: Mapping[str, Any], *, verify_local_sources: bool = True
) -> dict[str, Any]:
    """Verify D0.3.2 content addressing, lineage, and common-world accounting."""

    errors: list[str] = []
    body = dict(artifact)
    claimed_hash = body.pop("artifact_hash", None)
    calculated_hash = canonical_sha256(body)
    if claimed_hash != calculated_hash:
        errors.append("artifact_hash does not match canonical payload")
    if artifact.get("schema_version") != "dynamics-estimator-tournament/0.3.2":
        errors.append("schema_version is not dynamics-estimator-tournament/0.3.2")
    parent = artifact.get("parent", {})
    if not isinstance(parent, Mapping):
        errors.append("parent lineage is missing")
        parent = {}
    if parent.get("artifact_hash") != D031_ARTIFACT_HASH:
        errors.append("D0.3.1 parent content address changed")
    if parent.get("file_sha256") != D031_FILE_SHA256:
        errors.append("D0.3.1 parent byte hash changed")
    estimator_ids = [row.get("estimator_id") for row in artifact.get("estimators", [])]
    if estimator_ids != list(ESTIMATOR_IDS):
        errors.append("estimator family order or membership changed")
    if artifact.get("evaluation", {}).get("aggregate_winner_score") is not None:
        errors.append("D0.3.2 must not expose an aggregate winner score")
    if artifact.get("evaluation", {}).get("common_state_normalization") != "pre-holdout z-score":
        errors.append("common pre-holdout state normalization changed")
    protocol = artifact.get("protocol", {})
    if not isinstance(protocol, Mapping):
        errors.append("estimator protocol is missing")
        protocol = {}
    if protocol.get("mutation_policy") != "frozen before reference tournament execution":
        errors.append("estimator mutation policy changed")
    if set(protocol.get("family_definitions", {})) != set(ESTIMATOR_IDS):
        errors.append("estimator family definitions changed")
    cases = artifact.get("cases", [])
    if artifact.get("evaluation", {}).get("worlds") != len(cases):
        errors.append("world count does not reconcile to case ledger")
    for index, case in enumerate(cases):
        rows = case.get("estimators", []) if isinstance(case, Mapping) else []
        if [row.get("estimator_id") for row in rows] != list(ESTIMATOR_IDS):
            errors.append(f"case {index} does not contain the frozen estimator stack")
        if case.get("split", {}).get("identical_for_all_estimators") is not True:
            errors.append(f"case {index} does not certify a common split")
    claim = artifact.get("real_market_claim", {})
    if claim.get("market_claim") != "ABSTAIN" or claim.get("rerun_performed") is not False:
        errors.append("frozen real-market claim boundary changed")
    if verify_local_sources:
        if hashlib.sha256(TOURNAMENT_SOURCE.read_bytes()).hexdigest() != protocol.get(
            "source_sha256"
        ):
            errors.append("local D0.3.2 tournament source changed")
        raw = DEFAULT_D031_ARTIFACT.read_bytes()
        if hashlib.sha256(raw).hexdigest() != D031_FILE_SHA256:
            errors.append("local D0.3.1 artifact bytes changed")
        if hashlib.sha256(IDENTIFIABILITY_SOURCE.read_bytes()).hexdigest() != parent.get(
            "identifiability_source_sha256"
        ):
            errors.append("D0.3.1 replay source changed")
    return {
        "valid": not errors,
        "artifact_hash": claimed_hash,
        "calculated_hash": calculated_hash,
        "worlds": len(cases) if isinstance(cases, list) else 0,
        "errors": errors,
    }


def load_frozen_estimator_tournament(
    path: Path = DEFAULT_D032_ARTIFACT,
) -> dict[str, Any]:
    if not path.exists():
        raise EstimatorTournamentError(
            "the frozen D0.3.2 artifact is unavailable; run the freeze script"
        )
    artifact = json.loads(path.read_text(encoding="utf-8"))
    verification = verify_estimator_tournament(artifact)
    if not verification["valid"]:
        raise EstimatorTournamentError("; ".join(verification["errors"]))
    return artifact
