"""Nested nonlinear stochastic dynamics for Dynamics Lab D0.3.

Complexity is selected on a nested pre-holdout split, then frozen before the
sealed holdout is scored. The four models form a strict hierarchy: diffusion,
exact OU, nonlinear drift, and nonlinear drift with state diffusion.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from scipy.optimize import minimize
from scipy.stats import jarque_bera

from src.dynamics.selection_freeze import canonical_sha256, verify_selection_freeze
from src.dynamics.world import elapsed_in_unit


PARENT_ARTIFACT_HASH = "b5e759c3a4e71daad1d5eefb8303fa0e9da9ebca13ac36d79c488b4ec284d4b0"
PARENT_FILE_SHA256 = "e3c1d55e00c784b2b7ab6feb650ff02f284e86804d4ec2739118093401e43618"
DEFAULT_PARENT_ARTIFACT = (
    Path(__file__).resolve().parents[2]
    / "eval/dynamics/d0_2_1/selection_aware_certification.json"
)
MODEL_LABELS = {
    "M0": "Random diffusion",
    "M1": "Ornstein-Uhlenbeck",
    "M2": "Nonlinear drift + constant diffusion",
    "M3": "Nonlinear drift + state-dependent diffusion",
}
MINIMUM_NONLINEAR_OOS_IMPROVEMENT = 0.03
MINIMUM_M3_OVER_M2_IMPROVEMENT = 0.015
MINIMUM_BOOTSTRAP_DOMINANCE = 0.80
MINIMUM_FIELD_STABILITY = 0.72


class NonlinearDynamicsError(ValueError):
    """Raised when a D0.3 experiment cannot preserve its scientific boundary."""


@dataclass
class _Fit:
    code: str
    knots: np.ndarray
    regularization: float
    drift_coefficients: np.ndarray
    diffusion_coefficients: np.ndarray
    parameters: dict[str, Any]
    optimizer: dict[str, Any]
    nominal_parameters: int
    effective_parameters: float

    def drift(self, state: np.ndarray) -> np.ndarray:
        x = np.asarray(state, dtype=float)
        if self.code == "M0":
            return np.zeros_like(x)
        if self.code == "M1":
            theta = float(self.parameters["theta"])
            mu = float(self.parameters["mu"])
            return theta * (mu - x)
        return _spline_basis(x, self.knots) @ self.drift_coefficients

    def diffusion(self, state: np.ndarray) -> np.ndarray:
        x = np.asarray(state, dtype=float)
        if self.code in {"M0", "M1", "M2"}:
            return np.full_like(x, float(self.parameters["sigma"]))
        log_diffusion = _spline_basis(x, self.knots) @ self.diffusion_coefficients
        return np.exp(np.clip(log_diffusion, -6.0, 3.0))


def _jsonable(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        return [_jsonable(item) for item in value.tolist()]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def _spline_basis(state: np.ndarray, knots: np.ndarray) -> np.ndarray:
    """Linear B-spline/truncated-power basis with explicit, frozen knots."""

    x = np.asarray(state, dtype=float).reshape(-1)
    columns = [np.ones_like(x), x]
    columns.extend(np.maximum(x - float(knot), 0.0) for knot in knots)
    return np.column_stack(columns)


def _ridge_solution(
    design: np.ndarray,
    target: np.ndarray,
    weights: np.ndarray,
    regularization: float,
    *,
    unpenalized: int = 2,
) -> tuple[np.ndarray, float]:
    weights = np.asarray(weights, dtype=float)
    gram = design.T @ (weights[:, None] * design)
    rhs = design.T @ (weights * target)
    penalty = np.eye(design.shape[1], dtype=float)
    penalty[: min(unpenalized, design.shape[1]), :] = 0.0
    system = gram + regularization * penalty + np.eye(design.shape[1]) * 1e-10
    coefficients = np.linalg.solve(system, rhs)
    effective_df = float(np.trace(np.linalg.solve(system, gram)))
    return coefficients, effective_df


def _transition_arrays(
    values: np.ndarray, delta_times: np.ndarray, end: int
) -> tuple[np.ndarray, ...]:
    if end < 3:
        raise NonlinearDynamicsError("a model fit requires at least three observations")
    return values[: end - 1], np.diff(values[:end]), delta_times[: end - 1]


def _fit_random_diffusion(
    origins: np.ndarray, increments: np.ndarray, delta_times: np.ndarray
) -> _Fit:
    sigma = math.sqrt(max(float(np.mean(np.square(increments) / delta_times)), 1e-10))
    return _Fit(
        code="M0",
        knots=np.array([], dtype=float),
        regularization=0.0,
        drift_coefficients=np.array([], dtype=float),
        diffusion_coefficients=np.array([], dtype=float),
        parameters={"sigma": sigma},
        optimizer={"converged": True, "method": "closed-form irregular Gaussian MLE"},
        nominal_parameters=1,
        effective_parameters=1.0,
    )


def _ou_objective(
    raw: np.ndarray, origins: np.ndarray, targets: np.ndarray, delta_times: np.ndarray
) -> float:
    theta = math.exp(float(raw[0]))
    mu = float(raw[1])
    sigma = math.exp(float(raw[2]))
    decay = np.exp(-theta * delta_times)
    means = mu + (origins - mu) * decay
    variances = np.maximum(
        sigma * sigma * (-np.expm1(-2.0 * theta * delta_times)) / (2.0 * theta),
        1e-12,
    )
    residuals = targets - means
    return float(
        0.5 * np.sum(np.log(2.0 * math.pi * variances) + residuals**2 / variances)
    )


def _fit_exact_ou(
    origins: np.ndarray, increments: np.ndarray, delta_times: np.ndarray
) -> _Fit:
    targets = origins + increments
    mean_dt = float(np.mean(delta_times))
    lag_correlation = float(np.corrcoef(origins, targets)[0, 1])
    lag_correlation = float(
        np.clip(lag_correlation if math.isfinite(lag_correlation) else 0.5, 0.02, 0.995)
    )
    theta0 = max(-math.log(lag_correlation) / max(mean_dt, 1e-8), 1e-3)
    mu0 = float(np.mean(origins))
    sigma0 = math.sqrt(max(float(np.mean(increments**2 / delta_times)), 1e-8))
    result = minimize(
        _ou_objective,
        np.array([math.log(theta0), mu0, math.log(sigma0)]),
        args=(origins, targets, delta_times),
        method="L-BFGS-B",
        bounds=[(-8.0, 5.0), (-8.0, 8.0), (-8.0, 3.0)],
    )
    raw = result.x
    theta, mu, sigma = (
        math.exp(float(raw[0])),
        float(raw[1]),
        math.exp(float(raw[2])),
    )
    return _Fit(
        code="M1",
        knots=np.array([], dtype=float),
        regularization=0.0,
        drift_coefficients=np.array([], dtype=float),
        diffusion_coefficients=np.array([], dtype=float),
        parameters={"theta": theta, "mu": mu, "sigma": sigma},
        optimizer={
            "converged": bool(result.success),
            "method": "exact irregular-time OU Gaussian MLE",
            "message": str(result.message),
            "iterations": int(result.nit),
        },
        nominal_parameters=3,
        effective_parameters=3.0,
    )


def _fit_spline_dynamics(
    code: str,
    origins: np.ndarray,
    increments: np.ndarray,
    delta_times: np.ndarray,
    knots: np.ndarray,
    regularization: float,
) -> _Fit:
    design = _spline_basis(origins, knots)
    drift_target = increments / delta_times
    drift_coefficients, drift_df = _ridge_solution(
        design, drift_target, delta_times, regularization
    )
    drift_residuals = increments - design @ drift_coefficients * delta_times
    sigma = math.sqrt(
        max(float(np.mean(drift_residuals**2 / delta_times)), 1e-10)
    )
    if code == "M2":
        return _Fit(
            code=code,
            knots=knots,
            regularization=regularization,
            drift_coefficients=drift_coefficients,
            diffusion_coefficients=np.array([], dtype=float),
            parameters={"sigma": sigma},
            optimizer={"converged": True, "method": "weighted ridge Euler quasi-MLE"},
            nominal_parameters=len(drift_coefficients) + 1,
            effective_parameters=drift_df + 1.0,
        )

    diffusion_coefficients = np.zeros(design.shape[1], dtype=float)
    diffusion_coefficients[0] = math.log(sigma)
    diffusion_df = 1.0
    converged = False
    relative_change = math.inf
    for iteration in range(40):
        previous = np.concatenate((drift_coefficients, diffusion_coefficients))
        local_variance = np.exp(
            np.clip(2.0 * design @ diffusion_coefficients, -12.0, 6.0)
        )
        drift_weights = delta_times / np.maximum(local_variance, 1e-12)
        drift_coefficients, drift_df = _ridge_solution(
            design, drift_target, drift_weights, regularization
        )
        residuals = increments - design @ drift_coefficients * delta_times
        log_scale_target = 0.5 * np.log(
            np.maximum(residuals**2 / delta_times, 1e-10)
        ) + 0.6351814227307391
        diffusion_coefficients, diffusion_df = _ridge_solution(
            design,
            log_scale_target,
            np.ones_like(delta_times),
            regularization * 2.0,
        )
        current = np.concatenate((drift_coefficients, diffusion_coefficients))
        relative_change = float(
            np.linalg.norm(current - previous) / (1.0 + np.linalg.norm(previous))
        )
        if relative_change < 1e-6:
            converged = True
            break
    return _Fit(
        code=code,
        knots=knots,
        regularization=regularization,
        drift_coefficients=drift_coefficients,
        diffusion_coefficients=diffusion_coefficients,
        parameters={"positive_diffusion_parameterization": "g(x)=exp(spline(x))"},
        optimizer={
            "converged": converged,
            "method": "alternating penalized irregular Euler quasi-MLE",
            "iterations": iteration + 1,
            "relative_change": relative_change,
        },
        nominal_parameters=len(drift_coefficients) + len(diffusion_coefficients),
        effective_parameters=drift_df + diffusion_df,
    )


def _fit_model(
    code: str,
    origins: np.ndarray,
    increments: np.ndarray,
    delta_times: np.ndarray,
    knots: np.ndarray | None = None,
    regularization: float = 0.0,
) -> _Fit:
    if code == "M0":
        return _fit_random_diffusion(origins, increments, delta_times)
    if code == "M1":
        return _fit_exact_ou(origins, increments, delta_times)
    return _fit_spline_dynamics(
        code,
        origins,
        increments,
        delta_times,
        np.asarray(knots if knots is not None else [], dtype=float),
        regularization,
    )


def _transition_distribution(
    fit: _Fit, origins: np.ndarray, delta_times: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    if fit.code == "M1":
        theta = float(fit.parameters["theta"])
        mu = float(fit.parameters["mu"])
        sigma = float(fit.parameters["sigma"])
        decay = np.exp(-theta * delta_times)
        means = mu + (origins - mu) * decay
        variances = (
            sigma**2
            * (-np.expm1(-2.0 * theta * delta_times))
            / (2.0 * theta)
        )
        return means, np.maximum(variances, 1e-12)
    means = origins + fit.drift(origins) * delta_times
    variances = np.square(fit.diffusion(origins)) * delta_times
    return means, np.maximum(variances, 1e-12)


def _score(
    fit: _Fit, origins: np.ndarray, targets: np.ndarray, delta_times: np.ndarray
) -> dict[str, Any]:
    means, variances = _transition_distribution(fit, origins, delta_times)
    errors = targets - means
    innovations = errors / np.sqrt(variances)
    nll_values = 0.5 * (
        np.log(2.0 * math.pi * variances) + errors**2 / variances
    )
    half_width = 1.6448536269514722 * np.sqrt(variances)
    covered = np.abs(errors) <= half_width
    interval_score = (
        2.0 * half_width
        + 20.0 * np.maximum(-half_width - errors, 0.0)
        + 20.0 * np.maximum(errors - half_width, 0.0)
    )
    return {
        "mean_nll": float(np.mean(nll_values)),
        "total_log_likelihood": float(-np.sum(nll_values)),
        "rmse": float(np.sqrt(np.mean(errors**2))),
        "mae": float(np.mean(np.abs(errors))),
        "coverage_90": float(np.mean(covered)),
        "calibration_error_90": float(abs(np.mean(covered) - 0.90)),
        "mean_interval_score_90": float(np.mean(interval_score)),
        "innovation_mean": float(np.mean(innovations)),
        "innovation_std": (
            float(np.std(innovations, ddof=1)) if len(innovations) > 1 else 0.0
        ),
        "innovations": innovations,
    }


def _candidate_knots(origins: np.ndarray, count: int) -> np.ndarray:
    if count <= 0:
        return np.array([], dtype=float)
    quantiles = np.linspace(0.15, 0.85, count)
    return np.unique(np.quantile(origins, quantiles)).astype(float)


def _select_complexity(
    code: str,
    values: np.ndarray,
    delta_times: np.ndarray,
    outer_train_end: int,
    *,
    knot_counts: Sequence[int] = (0, 1, 2, 3),
    regularizations: Sequence[float] = (0.03, 0.15, 0.75),
) -> tuple[np.ndarray, float, dict[str, Any]]:
    inner_train_end = max(48, int(outer_train_end * 0.70))
    inner_train_end = min(inner_train_end, outer_train_end - 12)
    train_origins, train_increments, train_dt = _transition_arrays(
        values, delta_times, inner_train_end
    )
    validation_origins = values[inner_train_end - 1 : outer_train_end - 1]
    validation_targets = values[inner_train_end:outer_train_end]
    validation_dt = delta_times[inner_train_end - 1 : outer_train_end - 1]
    rows: list[dict[str, Any]] = []
    best_order: tuple[float, float, int, float] | None = None
    best_knots = np.array([], dtype=float)
    best_regularization = float(regularizations[0])
    for knot_count in knot_counts:
        knots = _candidate_knots(train_origins, int(knot_count))
        for regularization in regularizations:
            fit = _fit_model(
                code,
                train_origins,
                train_increments,
                train_dt,
                knots,
                float(regularization),
            )
            score = _score(
                fit, validation_origins, validation_targets, validation_dt
            )
            penalty = fit.effective_parameters * math.log(len(validation_targets)) / (
                2.0 * len(validation_targets)
            )
            adjusted = float(score["mean_nll"] + penalty)
            rows.append(
                {
                    "knot_count": int(len(knots)),
                    "knots": knots.tolist(),
                    "regularization": float(regularization),
                    "validation_mean_nll": score["mean_nll"],
                    "complexity_penalty": penalty,
                    "adjusted_validation_nll": adjusted,
                    "effective_parameters": fit.effective_parameters,
                    "optimizer_converged": bool(fit.optimizer["converged"]),
                }
            )
            order = (
                adjusted,
                fit.effective_parameters,
                len(knots),
                float(regularization),
            )
            if best_order is None or order < best_order:
                best_order = order
                best_knots = knots.copy()
                best_regularization = float(regularization)
    return best_knots, best_regularization, {
        "selected_before_outer_holdout": True,
        "selection_boundary_index": inner_train_end,
        "outer_holdout_start_index": outer_train_end,
        "selection_metric": (
            "inner validation mean NLL + effective-parameter BIC penalty"
        ),
        "candidate_table": rows,
        "selected": {
            "knot_count": int(len(best_knots)),
            "knots": best_knots.tolist(),
            "regularization": best_regularization,
        },
    }


def _point_nll(
    fit: _Fit, origins: np.ndarray, targets: np.ndarray, delta_times: np.ndarray
) -> np.ndarray:
    means, variances = _transition_distribution(fit, origins, delta_times)
    errors = targets - means
    return 0.5 * (
        np.log(2.0 * math.pi * variances) + errors**2 / variances
    )


def _cumulative_trapezoid(y: np.ndarray, x: np.ndarray) -> np.ndarray:
    areas = 0.5 * (y[1:] + y[:-1]) * np.diff(x)
    return np.concatenate((np.array([0.0]), np.cumsum(areas)))


def _field_values(
    fit: _Fit, grid: np.ndarray, train_origins: np.ndarray
) -> dict[str, np.ndarray]:
    drift = fit.drift(grid)
    diffusion = np.maximum(fit.diffusion(grid), 1e-8)
    drift_potential = -_cumulative_trapezoid(drift, grid)
    stationary_log_density = (
        -2.0 * np.log(diffusion)
        + _cumulative_trapezoid(2.0 * drift / np.square(diffusion), grid)
    )
    stationary_log_density -= float(np.max(stationary_log_density))
    density = np.exp(np.clip(stationary_log_density, -60.0, 0.0))
    normalizer = float(np.trapezoid(density, grid))
    if normalizer > 0:
        density /= normalizer
    effective_potential = -np.log(np.maximum(density, 1e-14))
    effective_potential -= float(np.min(effective_potential))
    spacing = max(float(np.median(np.diff(grid))), 1e-6)
    bandwidth = max(4.0 * spacing, 0.18)
    local_support = np.array(
        [np.sum(np.abs(train_origins - point) <= bandwidth) for point in grid],
        dtype=float,
    )
    return {
        "drift": drift,
        "diffusion": diffusion,
        "drift_potential": drift_potential,
        "stationary_density": density,
        "effective_potential": effective_potential,
        "local_support": local_support,
    }


def _raw_roots(grid: np.ndarray, drift: np.ndarray) -> list[dict[str, float | bool]]:
    roots: list[dict[str, float | bool]] = []
    for index in range(len(grid) - 1):
        left, right = float(drift[index]), float(drift[index + 1])
        if left == 0.0:
            root = float(grid[index])
        elif left * right > 0.0:
            continue
        else:
            weight = abs(left) / max(abs(left) + abs(right), 1e-12)
            root = float(grid[index] + weight * (grid[index + 1] - grid[index]))
        derivative = float(
            (drift[index + 1] - drift[index])
            / max(grid[index + 1] - grid[index], 1e-12)
        )
        if not roots or abs(root - float(roots[-1]["state"])) > 1e-6:
            roots.append(
                {
                    "state": root,
                    "derivative": derivative,
                    "stable": derivative < 0.0,
                }
            )
    return roots


def _bootstrap_fields(
    fit: _Fit,
    train_origins: np.ndarray,
    train_increments: np.ndarray,
    train_dt: np.ndarray,
    grid: np.ndarray,
    repetitions: int,
    seed: int,
) -> tuple[dict[str, Any], list[list[dict[str, float | bool]]]]:
    rng = np.random.default_rng(seed)
    field_samples: dict[str, list[np.ndarray]] = {
        "drift": [],
        "diffusion": [],
        "effective_potential": [],
    }
    roots: list[list[dict[str, float | bool]]] = []
    base = _field_values(fit, grid, train_origins)
    correlations: list[float] = []
    for _ in range(repetitions):
        indices = rng.integers(0, len(train_origins), len(train_origins))
        try:
            resampled = _fit_model(
                fit.code,
                train_origins[indices],
                train_increments[indices],
                train_dt[indices],
                fit.knots,
                fit.regularization,
            )
            fields = _field_values(resampled, grid, train_origins[indices])
        except (FloatingPointError, np.linalg.LinAlgError, ValueError):
            continue
        for key in field_samples:
            field_samples[key].append(fields[key])
        roots.append(_raw_roots(grid, fields["drift"]))
        if np.std(fields["drift"]) > 1e-9 and np.std(base["drift"]) > 1e-9:
            correlations.append(
                float(np.corrcoef(base["drift"], fields["drift"])[0, 1])
            )
    intervals: dict[str, Any] = {}
    for key, samples in field_samples.items():
        if samples:
            matrix = np.vstack(samples)
            intervals[key] = {
                "lower_90": np.quantile(matrix, 0.05, axis=0),
                "upper_90": np.quantile(matrix, 0.95, axis=0),
            }
        else:
            intervals[key] = {
                "lower_90": base[key],
                "upper_90": base[key],
            }
    intervals["successful_repetitions"] = len(roots)
    intervals["requested_repetitions"] = repetitions
    intervals["field_stability"] = (
        float(np.mean(np.asarray(correlations) >= 0.70)) if correlations else 0.0
    )
    return intervals, roots


def _certify_roots(
    grid: np.ndarray,
    fields: dict[str, np.ndarray],
    bootstrap_roots: list[list[dict[str, float | bool]]],
) -> list[dict[str, Any]]:
    candidates = _raw_roots(grid, fields["drift"])
    tolerance = max(float(np.ptp(grid)) * 0.08, 0.10)
    certified: list[dict[str, Any]] = []
    for candidate in candidates:
        matches: list[dict[str, float | bool]] = []
        for replicate in bootstrap_roots:
            nearby = [
                root
                for root in replicate
                if abs(float(root["state"]) - float(candidate["state"])) <= tolerance
            ]
            if nearby:
                matches.append(
                    min(
                        nearby,
                        key=lambda root: abs(
                            float(root["state"]) - float(candidate["state"])
                        ),
                    )
                )
        denominator = max(len(bootstrap_roots), 1)
        root_support = len(matches) / denominator
        stable_support = (
            sum(bool(root["stable"]) for root in matches) / denominator
        )
        grid_index = int(np.argmin(np.abs(grid - float(candidate["state"]))))
        local_support = int(fields["local_support"][grid_index])
        display = (
            root_support >= MINIMUM_BOOTSTRAP_DOMINANCE
            and stable_support >= MINIMUM_BOOTSTRAP_DOMINANCE
            and local_support >= 8
            and bool(candidate["stable"])
        )
        certified.append(
            {
                **candidate,
                "bootstrap_root_support": root_support,
                "bootstrap_stable_support": stable_support,
                "local_transition_support": local_support,
                "certified_for_display": display,
                "status": "CERTIFIED" if display else "WITHHELD",
            }
        )
    return certified


def _structural_field_stability(
    fit: _Fit,
    train_origins: np.ndarray,
    train_increments: np.ndarray,
    train_dt: np.ndarray,
    grid: np.ndarray,
) -> float:
    midpoint = len(train_origins) // 2
    if midpoint < 20 or len(train_origins) - midpoint < 20:
        return 0.0
    fields: list[np.ndarray] = []
    for indices in (slice(0, midpoint), slice(midpoint, None)):
        try:
            subfit = _fit_model(
                fit.code,
                train_origins[indices],
                train_increments[indices],
                train_dt[indices],
                fit.knots,
                fit.regularization,
            )
            fields.append(subfit.drift(grid))
        except (FloatingPointError, np.linalg.LinAlgError, ValueError):
            return 0.0
    if min(float(np.std(field)) for field in fields) <= 1e-9:
        return 1.0 if fit.code == "M0" else 0.0
    correlation = float(np.corrcoef(fields[0], fields[1])[0, 1])
    return float(np.clip((correlation + 1.0) / 2.0, 0.0, 1.0))


def _paired_bootstrap_dominance(
    challenger: _Fit,
    ou: _Fit,
    origins: np.ndarray,
    targets: np.ndarray,
    delta_times: np.ndarray,
    repetitions: int,
    seed: int,
) -> float:
    advantage = _point_nll(ou, origins, targets, delta_times) - _point_nll(
        challenger, origins, targets, delta_times
    )
    rng = np.random.default_rng(seed)
    positive = 0
    draws = max(100, repetitions * 4)
    for _ in range(draws):
        indices = rng.integers(0, len(advantage), len(advantage))
        positive += float(np.mean(advantage[indices])) > 0.0
    return positive / draws


def _diagnostics(score: Mapping[str, Any]) -> dict[str, float]:
    innovations = np.asarray(score["innovations"], dtype=float)
    jb = jarque_bera(innovations)
    lag_one = (
        float(np.corrcoef(innovations[:-1], innovations[1:])[0, 1])
        if len(innovations) > 3 and np.std(innovations) > 1e-9
        else 0.0
    )
    return {
        "jarque_bera_p_value": float(jb.pvalue),
        "lag_one_correlation": lag_one if math.isfinite(lag_one) else 0.0,
        "extreme_innovation_fraction": float(np.mean(np.abs(innovations) > 4.0)),
    }


def _check(
    code: str, passed: bool, message: str, *, critical: bool = True, value: Any = None
) -> dict[str, Any]:
    return {
        "code": code,
        "status": "PASS" if passed else "FAIL",
        "critical": critical,
        "message": message,
        "value": value,
    }


def _normalize_observations(
    values: Sequence[float],
    observed_at: Sequence[datetime] | None,
    available_at: Sequence[datetime] | None,
    as_of: datetime | None,
    time_unit: str,
) -> tuple[np.ndarray, list[datetime], list[datetime], datetime, np.ndarray]:
    numeric = np.asarray(values, dtype=float)
    if len(numeric) < 96 or len(numeric) > 10_000:
        raise NonlinearDynamicsError("D0.3 requires between 96 and 10,000 observations")
    if not np.all(np.isfinite(numeric)):
        raise NonlinearDynamicsError("all observations must be finite")
    if time_unit not in {"minute", "hour", "day"}:
        raise NonlinearDynamicsError("time_unit must be minute, hour, or day")
    if observed_at is None:
        unit = {"minute": 60.0, "hour": 3600.0, "day": 86400.0}[time_unit]
        origin = datetime(2000, 1, 1, tzinfo=timezone.utc)
        observed = [
            origin + timedelta(seconds=unit * index) for index in range(len(numeric))
        ]
    else:
        observed = list(observed_at)
    available = list(available_at) if available_at is not None else list(observed)
    if len(observed) != len(numeric) or len(available) != len(numeric):
        raise NonlinearDynamicsError(
            "observed_at and available_at must align with observations"
        )
    if any(item.tzinfo is None for item in observed + available):
        raise NonlinearDynamicsError("all timestamps must include a timezone")
    if any(right <= left for left, right in zip(observed, observed[1:])):
        raise NonlinearDynamicsError("observed_at must be strictly increasing")
    if any(a < o for o, a in zip(observed, available)):
        raise NonlinearDynamicsError("available_at cannot precede observed_at")
    resolved_as_of = as_of or available[-1]
    if resolved_as_of.tzinfo is None:
        raise NonlinearDynamicsError("as_of must include a timezone")
    if any(item > resolved_as_of for item in available):
        raise NonlinearDynamicsError(
            "an observation is unavailable in the requested point-in-time world"
        )
    delta_times = np.asarray(
        [
            elapsed_in_unit(left, right, time_unit)
            for left, right in zip(observed, observed[1:])
        ],
        dtype=float,
    )
    if np.any(delta_times <= 0.0) or not np.all(np.isfinite(delta_times)):
        raise NonlinearDynamicsError("elapsed observation times must be positive")
    return numeric, observed, available, resolved_as_of, delta_times


def _economic_gate(
    nonlinear_promoted: bool, evidence: Mapping[str, Any] | None
) -> tuple[list[dict[str, str]], str]:
    evidence = evidence or {}
    checks = [
        (
            "sealed nonlinear signal",
            nonlinear_promoted,
        ),
        (
            "independent execution evidence",
            evidence.get("independently_measured") is True,
        ),
        (
            "positive net economics after costs",
            float(evidence.get("net_return_bps", -math.inf)) > 0.0
            and float(evidence.get("round_trip_cost_bps", math.inf)) >= 0.0,
        ),
        ("fills and latency", evidence.get("latency_modelled") is True),
        ("borrow availability", evidence.get("borrow_confirmed") is True),
        ("capacity", float(evidence.get("capacity_usd", 0.0)) > 0.0),
    ]
    ladder = [
        {"stage": stage, "status": "PASS" if passed else "NOT_MEASURED"}
        for stage, passed in checks
    ]
    accepted = all(passed for _, passed in checks)
    return ladder, "ACCEPT" if accepted else "ABSTAIN"


def fit_nonlinear_dynamics(
    values: Sequence[float],
    *,
    observable: str,
    observed_at: Sequence[datetime] | None = None,
    available_at: Sequence[datetime] | None = None,
    as_of: datetime | None = None,
    time_unit: str = "day",
    train_fraction: float = 0.72,
    sealed_holdout_start: int | None = None,
    source: str = "source-supplied",
    revision: str = "unversioned",
    parent_artifact: Mapping[str, Any] | None = None,
    parent_file_sha256: str | None = None,
    execution_evidence: Mapping[str, Any] | None = None,
    bootstrap_repetitions: int = 48,
    seed: int = 703,
) -> dict[str, Any]:
    """Fit and fail-closed compare the frozen M0-M3 nonlinear hierarchy."""

    numeric, observed, available, resolved_as_of, delta_times = (
        _normalize_observations(
            values, observed_at, available_at, as_of, time_unit
        )
    )
    if not 0.60 <= train_fraction <= 0.85:
        raise NonlinearDynamicsError("train_fraction must be in [0.60, 0.85]")
    if not 8 <= bootstrap_repetitions <= 400:
        raise NonlinearDynamicsError("bootstrap_repetitions must be in [8, 400]")
    train_end = (
        int(sealed_holdout_start)
        if sealed_holdout_start is not None
        else int(len(numeric) * train_fraction)
    )
    if train_end < 64 or len(numeric) - train_end < 24:
        raise NonlinearDynamicsError(
            "the outer split requires at least 64 train and 24 sealed holdout observations"
        )

    center = float(np.mean(numeric[:train_end]))
    scale = float(np.std(numeric[:train_end], ddof=1))
    if not math.isfinite(scale) or scale <= 1e-10:
        raise NonlinearDynamicsError("the pre-holdout series has no usable variation")
    standardized = (numeric - center) / scale
    train_origins, train_increments, train_dt = _transition_arrays(
        standardized, delta_times, train_end
    )
    holdout_origins = standardized[train_end - 1 : -1]
    holdout_targets = standardized[train_end:]
    holdout_dt = delta_times[train_end - 1 :]
    if len(holdout_targets) != len(numeric) - train_end:
        raise NonlinearDynamicsError("sealed holdout alignment failed")

    complexity: dict[str, Any] = {}
    fits: dict[str, _Fit] = {
        "M0": _fit_model("M0", train_origins, train_increments, train_dt),
        "M1": _fit_model("M1", train_origins, train_increments, train_dt),
    }
    for code in ("M2", "M3"):
        knots, regularization, ledger = _select_complexity(
            code, standardized, delta_times, train_end
        )
        complexity[code] = ledger
        fits[code] = _fit_model(
            code,
            train_origins,
            train_increments,
            train_dt,
            knots,
            regularization,
        )

    lower, upper = np.quantile(train_origins, [0.01, 0.99])
    if upper - lower < 0.5:
        lower, upper = float(np.min(train_origins)), float(np.max(train_origins))
    grid = np.linspace(float(lower), float(upper), 121)
    scores = {
        code: _score(fit, holdout_origins, holdout_targets, holdout_dt)
        for code, fit in fits.items()
    }
    penalty_scale = math.log(len(train_origins)) / (2.0 * len(train_origins))
    adjusted_nll = {
        code: float(scores[code]["mean_nll"] + fit.effective_parameters * penalty_scale)
        for code, fit in fits.items()
    }
    bootstrap: dict[str, dict[str, Any]] = {}
    fields_by_model: dict[str, dict[str, np.ndarray]] = {}
    fixed_points: dict[str, list[dict[str, Any]]] = {}
    structural_stability: dict[str, float] = {}
    for offset, (code, fit) in enumerate(fits.items()):
        fields = _field_values(fit, grid, train_origins)
        intervals, roots = _bootstrap_fields(
            fit,
            train_origins,
            train_increments,
            train_dt,
            grid,
            bootstrap_repetitions,
            seed + 101 * offset,
        )
        fields_by_model[code] = fields
        bootstrap[code] = intervals
        fixed_points[code] = (
            [] if code == "M0" else _certify_roots(grid, fields, roots)
        )
        structural_stability[code] = _structural_field_stability(
            fit, train_origins, train_increments, train_dt, grid
        )

    diagnostics = {code: _diagnostics(score) for code, score in scores.items()}
    dominance = {
        code: _paired_bootstrap_dominance(
            fit,
            fits["M1"],
            holdout_origins,
            holdout_targets,
            holdout_dt,
            bootstrap_repetitions,
            seed + 911 + index,
        )
        for index, (code, fit) in enumerate(fits.items())
        if code in {"M2", "M3"}
    }

    model_checks: dict[str, list[dict[str, Any]]] = {}
    model_rows: list[dict[str, Any]] = []
    promotions: dict[str, dict[str, Any]] = {}
    for code, fit in fits.items():
        diagnostic = diagnostics[code]
        checks = [
            _check(
                "pit_world",
                True,
                "All inputs were available by the bound as-of timestamp.",
            ),
            _check(
                "irregular_time_likelihood",
                True,
                "Every transition uses its measured elapsed time.",
                value={
                    "unique_delta_times": int(len(np.unique(np.round(delta_times, 10)))),
                    "minimum": float(np.min(delta_times)),
                    "maximum": float(np.max(delta_times)),
                },
            ),
            _check(
                "optimizer_convergence",
                bool(fit.optimizer["converged"]),
                "The frozen model fit converged." if fit.optimizer["converged"] else (
                    "The frozen model fit did not meet its convergence tolerance."
                ),
                value=fit.optimizer,
            ),
            _check(
                "positive_diffusion",
                bool(np.all(fields_by_model[code]["diffusion"] > 0.0)),
                "Diffusion is strictly positive across the supported state grid.",
                value=float(np.min(fields_by_model[code]["diffusion"])),
            ),
            _check(
                "local_data_support",
                float(np.median(fields_by_model[code]["local_support"])) >= 8.0,
                "The reported state field is restricted to the pre-holdout support.",
                value=float(np.median(fields_by_model[code]["local_support"])),
            ),
            _check(
                "innovation_distribution",
                diagnostic["jarque_bera_p_value"] >= 0.005
                and diagnostic["extreme_innovation_fraction"] <= 0.10,
                "Sealed innovations pass the frozen normality and jump screen.",
                value=diagnostic,
            ),
            _check(
                "innovation_independence",
                abs(diagnostic["lag_one_correlation"]) <= 0.30,
                "Sealed innovation lag-one dependence is below tolerance.",
                value=diagnostic["lag_one_correlation"],
            ),
            _check(
                "structural_field_stability",
                structural_stability[code] >= MINIMUM_FIELD_STABILITY,
                "Pre-holdout half-sample drift fields meet the stability threshold.",
                value=structural_stability[code],
            ),
            _check(
                "bootstrap_field_stability",
                float(bootstrap[code]["field_stability"]) >= MINIMUM_FIELD_STABILITY,
                "Transition bootstrap fields meet the frozen stability threshold.",
                value=bootstrap[code]["field_stability"],
            ),
        ]
        if code in {"M2", "M3"}:
            checks.append(
                _check(
                    "complexity_frozen",
                    bool(complexity[code]["selected_before_outer_holdout"])
                    and complexity[code]["selection_boundary_index"] < train_end,
                    "Spline complexity was selected inside the pre-holdout world.",
                    value=complexity[code]["selected"],
                )
            )
        model_checks[code] = checks
        scientific_accept = all(
            item["status"] == "PASS" for item in checks if item["critical"]
        )
        score_public = {
            key: value for key, value in scores[code].items() if key != "innovations"
        }
        parameters: dict[str, Any]
        if code == "M0":
            parameters = {"sigma": float(fit.parameters["sigma"]) * scale}
        elif code == "M1":
            parameters = {
                "theta": fit.parameters["theta"],
                "mu": float(fit.parameters["mu"]) * scale + center,
                "sigma": float(fit.parameters["sigma"]) * scale,
                "half_life": math.log(2.0) / float(fit.parameters["theta"]),
            }
        else:
            parameters = {
                **fit.parameters,
                "knots_standardized": fit.knots,
                "knots_observable_units": fit.knots * scale + center,
                "drift_coefficients_standardized": fit.drift_coefficients,
                "diffusion_coefficients_log_scale": fit.diffusion_coefficients,
            }
        model_rows.append(
            {
                "code": code,
                "label": MODEL_LABELS[code],
                "equation": {
                    "M0": "dX_t = sigma dW_t",
                    "M1": "dX_t = theta(mu-X_t)dt + sigma dW_t",
                    "M2": "dX_t = f(X_t)dt + sigma dW_t",
                    "M3": "dX_t = f(X_t)dt + g(X_t)dW_t; g=exp(spline)",
                }[code],
                "parameters": parameters,
                "optimizer": fit.optimizer,
                "nominal_parameters": fit.nominal_parameters,
                "effective_parameters": fit.effective_parameters,
                "complexity_penalty": fit.effective_parameters * penalty_scale,
                "holdout_score": score_public,
                "adjusted_holdout_nll": adjusted_nll[code],
                "scientific_verdict": "ACCEPT" if scientific_accept else "REJECT",
                "checks": checks,
            }
        )

    for code in ("M2", "M3"):
        improvement_over_ou = adjusted_nll["M1"] - adjusted_nll[code]
        improvement_over_m2 = adjusted_nll["M2"] - adjusted_nll[code]
        diffusion = fields_by_model[code]["diffusion"]
        diffusion_ratio = float(np.max(diffusion) / max(np.min(diffusion), 1e-12))
        critical_pass = all(
            item["status"] == "PASS"
            for item in model_checks[code]
            if item["critical"]
        )
        reasons = {
            "scientific_checks_pass": critical_pass,
            "material_oos_gain_over_ou": (
                improvement_over_ou >= MINIMUM_NONLINEAR_OOS_IMPROVEMENT
            ),
            "bootstrap_dominance_over_ou": (
                dominance[code] >= MINIMUM_BOOTSTRAP_DOMINANCE
            ),
            "stable_field": (
                structural_stability[code] >= MINIMUM_FIELD_STABILITY
                and float(bootstrap[code]["field_stability"])
                >= MINIMUM_FIELD_STABILITY
            ),
        }
        if code == "M3":
            reasons.update(
                {
                    "material_gain_over_m2": (
                        improvement_over_m2 >= MINIMUM_M3_OVER_M2_IMPROVEMENT
                    ),
                    "meaningful_state_diffusion": diffusion_ratio >= 1.15,
                }
            )
        promoted = all(reasons.values())
        promotions[code] = {
            "verdict": "PROMOTE" if promoted else "REJECT",
            "fail_closed": True,
            "adjusted_nll_gain_over_ou": improvement_over_ou,
            "adjusted_nll_gain_over_m2": (
                improvement_over_m2 if code == "M3" else None
            ),
            "paired_bootstrap_dominance_over_ou": dominance[code],
            "diffusion_max_min_ratio": diffusion_ratio,
            "criteria": reasons,
        }
    for code in ("M2", "M3"):
        if promotions[code]["verdict"] == "PROMOTE":
            continue
        for root in fixed_points[code]:
            if root["certified_for_display"]:
                root["statistical_root_support_passed"] = True
                root["certified_for_display"] = False
                root["status"] = "WITHHELD"
                root["withheld_reason"] = "parent nonlinear model was not promoted"
    nonlinear_winner = next(
        (
            code
            for code in ("M3", "M2")
            if promotions[code]["verdict"] == "PROMOTE"
        ),
        None,
    )
    reality_ladder, economic_verdict = _economic_gate(
        nonlinear_winner is not None, execution_evidence
    )
    monitor_model = nonlinear_winner or "M1"
    stability_monitor = _dynamical_stability_monitor(
        monitor_model,
        fits[monitor_model],
        standardized,
        delta_times,
        observed,
        train_end,
        grid,
        center,
        scale,
        seed + 4_001,
    )

    field_payload: dict[str, Any] = {}
    for code, fields in fields_by_model.items():
        intervals = bootstrap[code]
        points = []
        for index, state in enumerate(grid):
            points.append(
                {
                    "state": float(state * scale + center),
                    "drift": float(fields["drift"][index] * scale),
                    "drift_lower_90": float(
                        intervals["drift"]["lower_90"][index] * scale
                    ),
                    "drift_upper_90": float(
                        intervals["drift"]["upper_90"][index] * scale
                    ),
                    "diffusion": float(fields["diffusion"][index] * scale),
                    "diffusion_lower_90": float(
                        intervals["diffusion"]["lower_90"][index] * scale
                    ),
                    "diffusion_upper_90": float(
                        intervals["diffusion"]["upper_90"][index] * scale
                    ),
                    "drift_potential": float(fields["drift_potential"][index]),
                    "stationary_density": float(
                        fields["stationary_density"][index] / scale
                    ),
                    "effective_potential": float(
                        fields["effective_potential"][index]
                    ),
                    "effective_potential_lower_90": float(
                        intervals["effective_potential"]["lower_90"][index]
                    ),
                    "effective_potential_upper_90": float(
                        intervals["effective_potential"]["upper_90"][index]
                    ),
                    "local_transition_support": int(fields["local_support"][index]),
                }
            )
        field_payload[code] = {
            "points": points,
            "bootstrap": {
                key: intervals[key]
                for key in (
                    "successful_repetitions",
                    "requested_repetitions",
                    "field_stability",
                )
            },
            "fixed_points": [
                {
                    **root,
                    "state": float(root["state"]) * scale + center,
                }
                for root in fixed_points[code]
            ],
        }

    parent_hash = (
        parent_artifact.get("artifact_hash") if parent_artifact is not None else None
    )
    world_manifest = {
        "observable": observable,
        "as_of": resolved_as_of.isoformat(),
        "time_unit": time_unit,
        "source": source,
        "revision": revision,
        "parent_artifact_hash": parent_hash,
        "observations": [
            {
                "value": float(value),
                "observed_at": observation.isoformat(),
                "available_at": availability.isoformat(),
            }
            for value, observation, availability in zip(
                numeric, observed, available
            )
        ],
    }
    world_hash = canonical_sha256(world_manifest)
    holdout_body = {
        "start_index": train_end,
        "observations": len(numeric) - train_end,
        "observed_at": [item.isoformat() for item in observed[train_end:]],
        "available_at": [item.isoformat() for item in available[train_end:]],
        "values": numeric[train_end:].tolist(),
        "untouched_during_complexity_selection": True,
    }
    holdout_commitment = canonical_sha256(
        {"world_hash": world_hash, "sealed_holdout": holdout_body}
    )
    payload: dict[str, Any] = {
        "schema_version": "dynamics-nonlinear/0.3.0",
        "milestone": "D0.3",
        "experiment": {
            "question": (
                "Does the frozen spread require nonlinear drift or "
                "state-dependent diffusion beyond OU?"
            ),
            "observable": observable,
            "model_hierarchy": [
                {"code": code, "label": MODEL_LABELS[code]}
                for code in ("M0", "M1", "M2", "M3")
            ],
            "excluded_scope": [
                "Hawkes processes",
                "regime routing",
                "symbolic discovery",
            ],
        },
        "world": {
            "world_hash": world_hash,
            "as_of": resolved_as_of.isoformat(),
            "time_unit": time_unit,
            "point_in_time_enforced": True,
            "observations": len(numeric),
            "source": source,
            "revision": revision,
            "irregular_time_used": True,
            "unique_delta_times": int(len(np.unique(np.round(delta_times, 10)))),
        },
        "parent": {
            "artifact_hash": parent_hash,
            "file_sha256": parent_file_sha256,
            "reuse_policy": "exact frozen survivor; no pair rediscovery",
            "discovery_rerun": False,
        },
        "split": {
            "outer_train_end_index": train_end,
            "train_observations": train_end,
            "sealed_holdout_observations": len(numeric) - train_end,
            "standardization_frozen_before_holdout": True,
            "center": center,
            "scale": scale,
            "holdout_commitment_hash": holdout_commitment,
            "sealed_holdout": holdout_body,
        },
        "estimation": {
            "basis_family": "linear truncated-power spline [1, x, max(x-k, 0)]",
            "drift_representation": "f(x)=sum a_k B_k(x)",
            "diffusion_representation": "log g(x)=sum b_k B_k(x)",
            "positive_diffusion_guarantee": "g(x)=exp(log g(x)) > 0",
            "likelihood": (
                "irregular-time Gaussian transition quasi-likelihood using each delta_t"
            ),
            "support_range": {
                "lower": float(grid[0] * scale + center),
                "upper": float(grid[-1] * scale + center),
                "rule": "pre-holdout transition-origin 1st to 99th percentile",
            },
            "data_density": (
                "local transition count within max(4 grid steps, 0.18 standardized units)"
            ),
            "complexity_freeze": (
                "knot count, placement, and regularization selected on nested "
                "pre-holdout validation only"
            ),
        },
        "complexity_selection": complexity,
        "theory": {
            "sde": "dX_t = f(X_t)dt + g(X_t)dW_t",
            "drift_potential": "V_drift(x) = - integral f(y) dy",
            "stationary_density": (
                "p(x) proportional to g(x)^(-2) exp(integral 2f(y)/g(y)^2 dy)"
            ),
            "effective_potential": (
                "U_eff(x) = -log p(x) = 2log g(x) "
                "- integral 2f(y)/g(y)^2 dy + constant"
            ),
            "warning": (
                "Drift potential and stationary effective potential are distinct "
                "when diffusion varies with state."
            ),
        },
        "models": model_rows,
        "fields": field_payload,
        "dynamical_stability_monitor": stability_monitor,
        "promotion": promotions,
        "verdicts": {
            "nonlinear_dynamics": (
                "ACCEPT" if nonlinear_winner is not None else "REJECT"
            ),
            "selected_model": nonlinear_winner or "M1",
            "economic": economic_verdict,
            "market_claim": economic_verdict,
        },
        "execution": {
            "reality_ladder": reality_ladder,
            "evidence": dict(execution_evidence or {}),
        },
        "decision_summary": (
            f"{nonlinear_winner} clears the fail-closed nonlinear gate."
            if nonlinear_winner is not None
            else "Neither nonlinear model clears the pre-registered OU comparison gate."
        )
        + (
            " Execution evidence supports an economic claim."
            if economic_verdict == "ACCEPT"
            else " Execution evidence is incomplete, so MARKET CLAIM ABSTAIN."
        ),
    }
    payload = _jsonable(payload)
    payload["artifact_hash"] = canonical_sha256(payload)
    return payload


def load_frozen_stat_arb_survivor(
    path: Path | str = DEFAULT_PARENT_ARTIFACT,
) -> dict[str, Any]:
    """Load exactly one certified D0.2.1 survivor after two-layer integrity checks."""

    resolved = Path(path)
    raw = resolved.read_bytes()
    file_sha256 = hashlib.sha256(raw).hexdigest()
    if file_sha256 != PARENT_FILE_SHA256:
        raise NonlinearDynamicsError(
            "D0.2.1 parent bytes changed; D0.3 refuses to continue"
        )
    artifact = json.loads(raw)
    verification = verify_selection_freeze(artifact)
    if not verification["valid"]:
        raise NonlinearDynamicsError(
            "D0.2.1 parent failed internal freeze verification: "
            + "; ".join(verification["errors"])
        )
    if artifact.get("artifact_hash") != PARENT_ARTIFACT_HASH:
        raise NonlinearDynamicsError(
            "D0.2.1 parent content address does not match the frozen checkpoint"
        )
    selected_ids = {
        row["pair_id"]
        for row in artifact["screening_ledger"]
        if row.get("selected") is True
    }
    survivors = [
        pair
        for pair in artifact["pair_artifacts"]
        if pair.get("certified") is True and pair.get("pair_id") in selected_ids
    ]
    if len(survivors) != 1:
        raise NonlinearDynamicsError(
            "D0.3 requires exactly one certified, selection-aware D0.2.1 survivor"
        )
    pair = survivors[0]
    ou_artifact = pair["ou_artifact"]
    series = ou_artifact["series"]
    return {
        "artifact": artifact,
        "pair": pair,
        "pair_id": pair["pair_id"],
        "values": [float(point["observed"]) for point in series],
        "observed_at": [
            datetime.fromisoformat(point["observed_at"]) for point in series
        ],
        "available_at": [
            datetime.fromisoformat(point["available_at"]) for point in series
        ],
        "train_end": int(ou_artifact["holdout_window"]["start_index"]),
        "file_sha256": file_sha256,
        "verification": verification,
    }


@lru_cache(maxsize=1)
def generate_nonlinear_reference() -> dict[str, Any]:
    """Extend the exact frozen D0.2.1 survivor without repeating pair discovery."""

    inherited = load_frozen_stat_arb_survivor()
    artifact = inherited["artifact"]
    pair = inherited["pair"]
    payload = fit_nonlinear_dynamics(
        inherited["values"],
        observable=pair["ou_artifact"]["observable"],
        observed_at=inherited["observed_at"],
        available_at=inherited["available_at"],
        as_of=datetime.fromisoformat(artifact["world"]["as_of"]),
        time_unit=artifact["world"]["time_unit"],
        sealed_holdout_start=inherited["train_end"],
        source=artifact["world"]["source"],
        revision="d0.3-reference-1",
        parent_artifact=artifact,
        parent_file_sha256=inherited["file_sha256"],
        bootstrap_repetitions=32,
        seed=703,
    )
    payload["experiment"].update(
        {
            "id": "dyn-d03-frozen-survivor-001",
            "pair_id": inherited["pair_id"],
            "market_claim_eligible": False,
            "evidence_class": "controlled-synthetic continuation",
        }
    )
    payload["parent"].update(
        {
            "milestone": artifact["freeze"]["milestone"],
            "world_hash": artifact["world"]["world_hash"],
            "discovery_run_id": artifact["discovery_ledger"]["discovery_run_id"],
            "candidate_compression": artifact["candidate_compression"]["notation"],
            "holdout_commitment_hash": pair["sealed_holdout"]["commitment_hash"],
            "integrity_valid": inherited["verification"]["valid"],
        }
    )
    payload["decision_summary"] = (
        "D0.3 reuses the exact D0.2.1 ANCHOR~PAIRED survivor and its 112/44 split "
        "without rediscovery. "
        + payload["decision_summary"]
    )
    payload["artifact_hash"] = canonical_sha256(
        {key: value for key, value in payload.items() if key != "artifact_hash"}
    )
    return payload


_CONTROL_SPECS: tuple[dict[str, Any], ...] = (
    {"name": "linear_ou", "expected_nonlinear": False, "expected_basin": True},
    {"name": "weak_ou", "expected_nonlinear": False, "expected_basin": True},
    {"name": "cubic", "expected_nonlinear": True, "expected_basin": True},
    {"name": "double_well", "expected_nonlinear": True, "expected_basin": True},
    {"name": "state_diffusion", "expected_nonlinear": True, "expected_basin": True},
    {"name": "random_walk", "expected_nonlinear": False, "expected_basin": False},
    {"name": "jump_diffusion", "expected_nonlinear": False, "expected_basin": True},
    {"name": "regime_switch", "expected_nonlinear": False, "expected_basin": True},
    {"name": "time_varying_ou", "expected_nonlinear": False, "expected_basin": True},
    {"name": "heavy_tail_ou", "expected_nonlinear": False, "expected_basin": True},
    {"name": "measurement_noise_ou", "expected_nonlinear": False, "expected_basin": True},
)


def _simulate_control(
    name: str, seed: int, observations: int = 168
) -> tuple[list[float], list[datetime]]:
    rng = np.random.default_rng(seed)
    pattern = np.asarray((0.45, 0.8, 1.0, 1.7, 0.6, 1.25, 2.1), dtype=float)
    delta_times = np.resize(pattern, observations - 1)
    latent = np.zeros(observations, dtype=float)
    for index, delta_time in enumerate(delta_times):
        x = latent[index]
        fraction = index / max(observations - 2, 1)
        if name == "random_walk":
            drift, diffusion = 0.0, 0.32
        elif name == "weak_ou":
            drift, diffusion = -0.08 * x, 0.32
        elif name == "cubic":
            drift, diffusion = -0.08 * x - 0.70 * x**3, 0.22
        elif name == "double_well":
            drift, diffusion = 0.90 * x - 0.72 * x**3, 0.24
        elif name == "state_diffusion":
            drift, diffusion = -0.42 * x, 0.10 + 0.34 * min(abs(x), 2.5)
        elif name == "regime_switch":
            drift, diffusion = (-(0.75 if fraction < 0.55 else 0.16) * x), 0.30
        elif name == "time_varying_ou":
            theta = 0.42 + 0.30 * math.sin(index / 13.0)
            drift, diffusion = -theta * x, 0.30
        else:
            drift, diffusion = -0.55 * x, 0.30
        substeps = max(1, int(math.ceil(delta_time / 0.25)))
        step = float(delta_time) / substeps
        next_value = x
        for _ in range(substeps):
            if name == "heavy_tail_ou":
                shock = float(rng.standard_t(4)) / math.sqrt(2.0)
            else:
                shock = float(rng.normal())
            next_value += drift * step + diffusion * math.sqrt(step) * shock
            if name == "jump_diffusion" and rng.random() < 0.065 * step:
                next_value += float(rng.normal(0.0, 1.25))
            if name in {
                "cubic",
                "double_well",
                "state_diffusion",
                "regime_switch",
                "time_varying_ou",
            }:
                if name == "cubic":
                    drift = -0.08 * next_value - 0.70 * next_value**3
                elif name == "double_well":
                    drift = 0.90 * next_value - 0.72 * next_value**3
                elif name == "state_diffusion":
                    drift = -0.42 * next_value
                    diffusion = 0.10 + 0.34 * min(abs(next_value), 2.5)
                elif name == "regime_switch":
                    drift = -(0.75 if fraction < 0.55 else 0.16) * next_value
                else:
                    drift = -theta * next_value
        latent[index + 1] = float(np.clip(next_value, -4.0, 4.0))
    observed = latent.copy()
    if name == "measurement_noise_ou":
        observed += rng.normal(0.0, 0.18, observations)
    start = datetime(2020, 1, 1, tzinfo=timezone.utc)
    timestamps = [start]
    for delta_time in delta_times:
        timestamps.append(timestamps[-1] + timedelta(days=float(delta_time)))
    return observed.tolist(), timestamps


@lru_cache(maxsize=8)
def run_nonlinear_certification_suite(repetitions: int = 2) -> dict[str, Any]:
    """Run deterministic positive and adversarial D0.3 controls."""

    if not 1 <= repetitions <= 12:
        raise NonlinearDynamicsError("control repetitions must be in [1, 12]")
    cases: list[dict[str, Any]] = []
    correct = 0
    nonlinear_false_positives = 0
    nonlinear_false_negatives = 0
    nonlinear_truths = 0
    linear_truths = 0
    false_basins = 0
    no_basin_truths = 0
    abstentions = 0
    nonlinear_dominance_successes = 0
    total_runs = len(_CONTROL_SPECS) * repetitions
    for spec_index, spec in enumerate(_CONTROL_SPECS):
        for repetition in range(repetitions):
            control_seed = 30_000 + spec_index * 100 + repetition
            values, observed = _simulate_control(spec["name"], control_seed)
            available = [item + timedelta(minutes=10) for item in observed]
            artifact = fit_nonlinear_dynamics(
                values,
                observable=f"control::{spec['name']}",
                observed_at=observed,
                available_at=available,
                as_of=available[-1],
                time_unit="day",
                train_fraction=0.72,
                source="controlled-synthetic",
                revision=f"d0.3-control-{control_seed}",
                bootstrap_repetitions=8,
                seed=control_seed,
            )
            accepted = artifact["verdicts"]["nonlinear_dynamics"] == "ACCEPT"
            expected = bool(spec["expected_nonlinear"])
            correct += accepted == expected
            nonlinear_truths += expected
            linear_truths += not expected
            nonlinear_false_positives += accepted and not expected
            nonlinear_false_negatives += (not accepted) and expected
            displayed_basins = sum(
                1
                for code in ("M2", "M3")
                for point in artifact["fields"][code]["fixed_points"]
                if point["certified_for_display"]
            )
            if not spec["expected_basin"]:
                no_basin_truths += 1
                false_basins += displayed_basins > 0
            abstentions += artifact["verdicts"]["economic"] == "ABSTAIN"
            best_dominance = max(
                artifact["promotion"][code][
                    "paired_bootstrap_dominance_over_ou"
                ]
                for code in ("M2", "M3")
            )
            nonlinear_dominance_successes += (
                expected and best_dominance >= MINIMUM_BOOTSTRAP_DOMINANCE
            )
            cases.append(
                {
                    "control": spec["name"],
                    "repetition": repetition,
                    "seed": control_seed,
                    "expected_nonlinear": expected,
                    "expected_basin": bool(spec["expected_basin"]),
                    "selected_model": artifact["verdicts"]["selected_model"],
                    "nonlinear_verdict": artifact["verdicts"][
                        "nonlinear_dynamics"
                    ],
                    "economic_verdict": artifact["verdicts"]["economic"],
                    "certified_nonlinear_basins": displayed_basins,
                    "best_oos_bootstrap_dominance": best_dominance,
                    "correct_theory_class": accepted == expected,
                }
            )
    metrics = {
        "theory_class_accuracy": correct / total_runs,
        "false_nonlinear_discovery_rate": (
            nonlinear_false_positives / linear_truths if linear_truths else 0.0
        ),
        "false_nonlinear_non_discovery_rate": (
            nonlinear_false_negatives / nonlinear_truths
            if nonlinear_truths
            else 0.0
        ),
        "false_basin_discovery_rate": (
            false_basins / no_basin_truths if no_basin_truths else 0.0
        ),
        "economic_abstention_rate_without_execution_evidence": (
            abstentions / total_runs
        ),
        "nonlinear_oos_dominance_rate": (
            nonlinear_dominance_successes / nonlinear_truths
            if nonlinear_truths
            else 0.0
        ),
    }
    return {
        "schema_version": "dynamics-nonlinear-controls/0.3.0",
        "repetitions": repetitions,
        "control_worlds": len(_CONTROL_SPECS),
        "runs": total_runs,
        "thresholds": {
            "minimum_nonlinear_oos_improvement": (
                MINIMUM_NONLINEAR_OOS_IMPROVEMENT
            ),
            "minimum_m3_over_m2_improvement": MINIMUM_M3_OVER_M2_IMPROVEMENT,
            "minimum_bootstrap_dominance": MINIMUM_BOOTSTRAP_DOMINANCE,
            "minimum_field_stability": MINIMUM_FIELD_STABILITY,
        },
        "metrics": metrics,
        "cases": cases,
        "interpretation": (
            "Metrics are measured from deterministic positive and adversarial "
            "controls; no target rate is hard-coded into a verdict."
        ),
    }


def _normal_cdf(value: float) -> float:
    return 0.5 * (1.0 + math.erf(value / math.sqrt(2.0)))


def _dynamical_stability_monitor(
    code: str,
    template: _Fit,
    values: np.ndarray,
    delta_times: np.ndarray,
    observed_at: Sequence[datetime],
    train_end: int,
    grid: np.ndarray,
    center: float,
    scale: float,
    seed: int,
) -> dict[str, Any]:
    """Track supported fixed-point geometry across expanding PIT windows."""

    first_end = max(64, int(train_end * 0.58))
    endpoints = sorted(
        {
            int(round(value))
            for value in np.linspace(first_end, train_end, 5)
        }
    )
    windows: list[dict[str, Any]] = []
    for window_index, end in enumerate(endpoints):
        origins, increments, local_dt = _transition_arrays(
            values, delta_times, end
        )
        fit = _fit_model(
            code,
            origins,
            increments,
            local_dt,
            template.knots,
            template.regularization,
        )
        fields = _field_values(fit, grid, origins)
        _, bootstrap_roots = _bootstrap_fields(
            fit,
            origins,
            increments,
            local_dt,
            grid,
            8,
            seed + window_index * 37,
        )
        roots = _certify_roots(grid, fields, bootstrap_roots)
        raw_roots = _raw_roots(grid, fields["drift"])
        basins: list[dict[str, Any]] = []
        for root in roots:
            if not root["certified_for_display"]:
                continue
            root_state = float(root["state"])
            root_index = int(np.argmin(np.abs(grid - root_state)))
            unstable_left = [
                float(candidate["state"])
                for candidate in raw_roots
                if not candidate["stable"] and float(candidate["state"]) < root_state
            ]
            unstable_right = [
                float(candidate["state"])
                for candidate in raw_roots
                if not candidate["stable"] and float(candidate["state"]) > root_state
            ]
            left_boundary = max(unstable_left) if unstable_left else float(grid[0])
            right_boundary = min(unstable_right) if unstable_right else float(grid[-1])
            left_index = int(np.argmin(np.abs(grid - left_boundary)))
            right_index = int(np.argmin(np.abs(grid - right_boundary)))
            potential = fields["effective_potential"]
            well = float(potential[root_index])
            left_barrier = float(np.max(potential[left_index : root_index + 1]) - well)
            right_barrier = float(np.max(potential[root_index : right_index + 1]) - well)
            barrier_height = max(min(left_barrier, right_barrier), 0.0)
            horizon = float(np.median(local_dt))
            mean, variance = _transition_distribution(
                fit,
                np.asarray([root_state]),
                np.asarray([horizon]),
            )
            standard_deviation = math.sqrt(float(variance[0]))
            exit_probability = _normal_cdf(
                (left_boundary - float(mean[0])) / standard_deviation
            ) + 1.0 - _normal_cdf(
                (right_boundary - float(mean[0])) / standard_deviation
            )
            basins.append(
                {
                    "state": root_state * scale + center,
                    "restoring_strength": -float(root["derivative"]),
                    "barrier_height": barrier_height,
                    "one_step_exit_probability": float(
                        np.clip(exit_probability, 0.0, 1.0)
                    ),
                    "horizon": horizon,
                    "bootstrap_stability": float(
                        root["bootstrap_stable_support"]
                    ),
                    "local_transition_support": int(
                        root["local_transition_support"]
                    ),
                }
            )
        windows.append(
            {
                "as_of": observed_at[end - 1].isoformat(),
                "end_index": end,
                "observations": end,
                "certified_stable_states": len(basins),
                "basins": basins,
            }
        )
    aggregate = [
        {
            "states": item["certified_stable_states"],
            "mean_restoring_strength": (
                float(np.mean([basin["restoring_strength"] for basin in item["basins"]]))
                if item["basins"]
                else None
            ),
            "minimum_barrier_height": (
                min(basin["barrier_height"] for basin in item["basins"])
                if item["basins"]
                else None
            ),
        }
        for item in windows
    ]
    previous, current = aggregate[-2], aggregate[-1]
    weakening = (
        previous["mean_restoring_strength"] is not None
        and current["mean_restoring_strength"] is not None
        and current["mean_restoring_strength"] < previous["mean_restoring_strength"]
    )
    shrinking = (
        previous["minimum_barrier_height"] is not None
        and current["minimum_barrier_height"] is not None
        and current["minimum_barrier_height"] < previous["minimum_barrier_height"]
    )
    return {
        "name": "Dynamical Stability Monitor",
        "claim_boundary": (
            "Describes PIT fixed-point stability; it is not a crash predictor."
        ),
        "window_protocol": (
            "Five expanding pre-holdout PIT windows; final complexity and state "
            "grid frozen; eight transition bootstraps per window."
        ),
        "model": code,
        "windows": windows,
        "trend": {
            "certified_state_count": current["states"],
            "state_count_change": current["states"] - previous["states"],
            "restoring_strength_weakening": weakening,
            "barrier_shrinking": shrinking,
            "status": (
                "WATCH"
                if weakening or shrinking or current["states"] != previous["states"]
                else "STABLE"
            ),
        },
    }
