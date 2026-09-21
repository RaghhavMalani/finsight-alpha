"""D0.3.2.1 oracle ceiling and nonlinear failure decomposition.

This diagnostic milestone keeps the byte-frozen D0.3.1 worlds and D0.3.2
practical estimators unchanged.  Family-aware oracles receive the correct
candidate support, never the generating parameters, and still estimate every
coefficient from the pre-holdout observations before a sealed likelihood-ratio
comparison.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from statistics import median
from typing import Any, Mapping, Sequence

import numpy as np
from scipy.optimize import minimize
from scipy.stats import chi2

from src.dynamics.estimator_tournament import (
    DEFAULT_D032_ARTIFACT,
    ESTIMATOR_IDS,
    _fit_sindy,
    _polynomial_design,
    _raw_roots,
    _sparse_polynomial,
    _support,
    _true_law,
    _unstandardize_law,
    _world_hash,
    load_frozen_estimator_tournament,
)
from src.dynamics.identifiability import (
    POWER_THRESHOLD,
    TOPOLOGY_LOCATION_TOLERANCE,
    WorldSpec,
    _match_points,
    _reference_specs,
    _simulate_world,
    _truth_functions,
)
from src.dynamics.selection_freeze import canonical_sha256

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D0321_ARTIFACT = ROOT / "eval/dynamics/d0_3_2_1/failure_decomposition.json"
FAILURE_DECOMPOSITION_SOURCE = Path(__file__)
D032_ARTIFACT_HASH = "b5302ed706d4ee75cc40e2275f32c75f61aa0c1853fcf3cc46b24db892a85c9f"
D032_FILE_SHA256 = "033732cb23c86a12a63cc0783ee84ae518fe7fcddb76cd5eb9aced899b8f19d0"
DEFAULT_STABILITY_BOOTSTRAPS = 40
ORACLE_ALPHA = 0.05
ROOT_SUPPORT = 8


class FailureDecompositionError(ValueError):
    """Raised when the diagnostic ceiling violates a frozen evidence boundary."""


@dataclass(frozen=True)
class GaussianCandidate:
    terms: tuple[int, ...]
    coefficients: np.ndarray
    sigma: float
    gamma: float = 0.0

    def drift(self, states: np.ndarray) -> np.ndarray:
        design = np.column_stack([states**power for power in self.terms])
        return design @ self.coefficients

    def diffusion(self, states: np.ndarray) -> np.ndarray:
        return self.sigma * np.exp(np.clip(self.gamma * states, -3.0, 3.0))


def _transition_arrays(
    values: np.ndarray, observed_at: Sequence[Any], train_end: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    delta_times = np.asarray(
        [
            (right - left).total_seconds() / 86_400.0
            for left, right in zip(observed_at[:-1], observed_at[1:])
        ],
        dtype=float,
    )
    return (
        values[: train_end - 1],
        np.diff(values[:train_end]),
        delta_times[: train_end - 1],
        values[train_end - 1 : -1],
        values[train_end:],
        delta_times[train_end - 1 :],
    )


def _fit_constant_candidate(
    origins: np.ndarray,
    increments: np.ndarray,
    delta_times: np.ndarray,
    terms: tuple[int, ...],
) -> GaussianCandidate:
    design = np.column_stack([origins**power for power in terms])
    gram = design.T @ (delta_times[:, None] * design)
    rhs = design.T @ increments
    coefficients = np.linalg.solve(
        gram + np.eye(len(terms)) * 1e-10,
        rhs,
    )
    residuals = increments - design @ coefficients * delta_times
    sigma = math.sqrt(max(float(np.mean(residuals**2 / delta_times)), 1e-10))
    return GaussianCandidate(terms, coefficients, sigma)


def _fit_state_diffusion_candidate(
    origins: np.ndarray,
    increments: np.ndarray,
    delta_times: np.ndarray,
) -> GaussianCandidate:
    baseline = _fit_constant_candidate(origins, increments, delta_times, (1,))

    def objective(raw: np.ndarray) -> float:
        coefficient, log_sigma, gamma = map(float, raw)
        means = coefficient * origins * delta_times
        diffusion = np.exp(np.clip(log_sigma + gamma * origins, -8.0, 3.0))
        variances = np.maximum(diffusion**2 * delta_times, 1e-12)
        residuals = increments - means
        return float(
            0.5 * np.sum(np.log(2.0 * math.pi * variances) + residuals**2 / variances)
        )

    result = minimize(
        objective,
        np.asarray(
            [
                float(baseline.coefficients[0]),
                math.log(baseline.sigma),
                0.0,
            ]
        ),
        method="L-BFGS-B",
        bounds=[(-5.0, 5.0), (-8.0, 3.0), (-5.0, 5.0)],
    )
    if not result.success or not np.all(np.isfinite(result.x)):
        raise FailureDecompositionError(
            f"state-diffusion oracle fit failed: {result.message}"
        )
    coefficient, log_sigma, gamma = map(float, result.x)
    return GaussianCandidate(
        (1,), np.asarray([coefficient]), math.exp(log_sigma), gamma
    )


def _point_nll(
    fit: GaussianCandidate,
    origins: np.ndarray,
    targets: np.ndarray,
    delta_times: np.ndarray,
) -> np.ndarray:
    means = origins + fit.drift(origins) * delta_times
    variances = np.maximum(
        fit.diffusion(origins) ** 2 * delta_times,
        1e-12,
    )
    residuals = targets - means
    return 0.5 * (np.log(2.0 * math.pi * variances) + residuals**2 / variances)


def _oracle_support(spec: WorldSpec) -> tuple[int, ...] | None:
    if spec.family in {"linear_ou", "cubic", "double_well"}:
        return (1, 3)
    if spec.family == "asymmetric":
        return (1, 2, 3)
    return None


def _oracle_comparison(
    spec: WorldSpec,
    values: np.ndarray,
    observed_at: Sequence[Any],
) -> dict[str, Any] | None:
    if spec.expected_model == "ABSTAIN":
        return None
    train_end = int(len(values) * 0.72)
    (
        train_origins,
        train_increments,
        train_dt,
        holdout_origins,
        holdout_targets,
        holdout_dt,
    ) = _transition_arrays(values, observed_at, train_end)
    null_fit = _fit_constant_candidate(train_origins, train_increments, train_dt, (1,))
    if spec.family == "state_diffusion":
        alternative = _fit_state_diffusion_candidate(
            train_origins, train_increments, train_dt
        )
        added_parameters = 1
        oracle_kind = "state_dependent_diffusion"
    else:
        support = _oracle_support(spec)
        if support is None:
            return None
        alternative = _fit_constant_candidate(
            train_origins, train_increments, train_dt, support
        )
        added_parameters = len(support) - 1
        oracle_kind = "nonlinear_drift"

    null_nll = _point_nll(null_fit, holdout_origins, holdout_targets, holdout_dt)
    alternative_nll = _point_nll(
        alternative, holdout_origins, holdout_targets, holdout_dt
    )
    log_likelihood_ratio = float(np.sum(null_nll - alternative_nll))
    critical_value = float(chi2.ppf(1.0 - ORACLE_ALPHA, added_parameters))
    alternative_selected = 2.0 * log_likelihood_ratio > critical_value
    expected_alternative = spec.expected_model in {"M2", "M3"}
    return {
        "kind": oracle_kind,
        "candidate_families_only": True,
        "true_parameters_supplied": False,
        "train_observations": train_end,
        "sealed_holdout_observations": len(values) - train_end,
        "null_support": ["x"],
        "alternative_support": (
            ["x", "exp(gamma*x) diffusion"]
            if spec.family == "state_diffusion"
            else ["x" if power == 1 else f"x{power}" for power in alternative.terms]
        ),
        "added_parameters": added_parameters,
        "alpha": ORACLE_ALPHA,
        "twice_log_likelihood_ratio": 2.0 * log_likelihood_ratio,
        "critical_value": critical_value,
        "selected_model": "H1" if alternative_selected else "H0",
        "expected_model": "H1" if expected_alternative else "H0",
        "correct": alternative_selected == expected_alternative,
        "holdout_mean_nll": {
            "H0": float(np.mean(null_nll)),
            "H1": float(np.mean(alternative_nll)),
        },
        "estimated_parameters": {
            "H0": {
                "drift": {
                    "x": float(null_fit.coefficients[0]),
                },
                "sigma": null_fit.sigma,
            },
            "H1": {
                "drift": {
                    ("x" if power == 1 else f"x{power}"): float(coefficient)
                    for power, coefficient in zip(
                        alternative.terms, alternative.coefficients
                    )
                },
                "sigma": alternative.sigma,
                "gamma": alternative.gamma,
            },
        },
    }


def _information_separation(
    spec: WorldSpec,
    values: np.ndarray,
    observed_at: Sequence[Any],
) -> dict[str, Any] | None:
    if spec.expected_model == "ABSTAIN":
        return None
    train_end = int(len(values) * 0.72)
    (
        train_origins,
        train_increments,
        train_dt,
        holdout_origins,
        _,
        holdout_dt,
    ) = _transition_arrays(values, observed_at, train_end)
    null_fit = _fit_constant_candidate(train_origins, train_increments, train_dt, (1,))
    truth_drift, truth_diffusion = _truth_functions(spec)
    truth_mean = holdout_origins + truth_drift(holdout_origins) * holdout_dt
    null_mean = holdout_origins + null_fit.drift(holdout_origins) * holdout_dt
    truth_variance = truth_diffusion(holdout_origins) ** 2 * holdout_dt
    if spec.measurement_noise > 0.0:
        truth_variance = truth_variance + 2.0 * spec.measurement_noise**2
    null_variance = np.maximum(
        null_fit.diffusion(holdout_origins) ** 2 * holdout_dt,
        1e-12,
    )
    truth_variance = np.maximum(truth_variance, 1e-12)
    conditional_kl = 0.5 * (
        np.log(null_variance / truth_variance)
        + (truth_variance + (truth_mean - null_mean) ** 2) / null_variance
        - 1.0
    )
    per_step = max(float(np.mean(conditional_kl)), 0.0)
    return {
        "method": "local Gaussian conditional-transition approximation",
        "direction": "truth || fitted linear constant-diffusion null",
        "sealed_holdout_steps": len(holdout_dt),
        "per_step_kl": per_step,
        "observed_steps": len(values) - 1,
        "information_mass": per_step * (len(values) - 1),
        "measurement_noise_variance_included": spec.measurement_noise > 0.0,
        "universal_bound_claimed": False,
    }


def _moving_block_indices(
    length: int, block_length: int, rng: np.random.Generator
) -> np.ndarray:
    chunks: list[np.ndarray] = []
    while sum(len(chunk) for chunk in chunks) < length:
        start = int(rng.integers(0, max(length - block_length + 1, 1)))
        chunks.append(np.arange(start, min(start + block_length, length)))
    return np.concatenate(chunks)[:length]


def _sindy_stability(
    spec: WorldSpec,
    values: np.ndarray,
    observed_at: Sequence[Any],
    *,
    bootstraps: int,
    seed: int,
) -> dict[str, Any] | None:
    truth = _true_law(spec)
    if truth is None:
        return None
    train_end = int(len(values) * 0.72)
    center = float(np.mean(values[:train_end]))
    scale = float(np.std(values[:train_end], ddof=1))
    standardized = (values - center) / scale
    origins, increments, delta_times, _, _, _ = _transition_arrays(
        standardized, observed_at, train_end
    )
    block_length = max(8, int(round(math.sqrt(len(origins)))))
    rng = np.random.default_rng(seed + 70_001)
    names = ("1", "x", "x2", "x3", "x4")
    inclusions = {name: 0 for name in names}
    failures = 0
    for _ in range(bootstraps):
        indices = _moving_block_indices(len(origins), block_length, rng)
        design = _polynomial_design(origins[indices], 4)
        try:
            coefficients, _ = _sparse_polynomial(
                design,
                increments[indices] / delta_times[indices],
                delta_times[indices],
                regularization=0.02,
                threshold=0.035,
            )
        except np.linalg.LinAlgError:
            failures += 1
            continue
        raw = _unstandardize_law(
            dict(zip(names, map(float, coefficients))), center, scale
        )
        for name in names:
            if abs(float((raw or {}).get(name, 0.0))) >= 0.025:
                inclusions[name] += 1
    successful = bootstraps - failures
    frequencies = {
        name: inclusions[name] / successful if successful else 0.0 for name in names
    }
    true_terms = set(truth)
    false_terms = set(names) - true_terms
    minimum_true = min((frequencies[name] for name in true_terms), default=1.0)
    maximum_false = max((frequencies[name] for name in false_terms), default=0.0)
    return {
        "method": "moving-block bootstrap stability selection",
        "bootstraps": bootstraps,
        "successful_bootstraps": successful,
        "block_length": block_length,
        "term_inclusion_frequency": frequencies,
        "true_terms": sorted(true_terms),
        "minimum_true_term_stability": minimum_true,
        "maximum_false_term_stability": maximum_false,
        "support_separable": minimum_true >= 0.80 and maximum_false <= 0.50,
    }


def _oracle_support_coefficients(
    spec: WorldSpec,
    values: np.ndarray,
    observed_at: Sequence[Any],
    practical_law: Mapping[str, Any] | None,
) -> dict[str, Any] | None:
    truth = _true_law(spec)
    if truth is None:
        return None
    train_end = int(len(values) * 0.72)
    origins, increments, delta_times, _, _, _ = _transition_arrays(
        values, observed_at, train_end
    )
    term_power = {"1": 0, "x": 1, "x2": 2, "x3": 3, "x4": 4}
    terms = sorted(truth, key=lambda item: term_power[item])
    powers = tuple(term_power[name] for name in terms)
    fit = _fit_constant_candidate(origins, increments, delta_times, powers)
    recovered = {
        name: float(coefficient) for name, coefficient in zip(terms, fit.coefficients)
    }
    denominator = math.sqrt(sum(float(value) ** 2 for value in truth.values()))
    oracle_error = math.sqrt(
        sum((recovered[name] - float(truth[name])) ** 2 for name in terms)
    ) / max(denominator, 1e-10)
    full_error = (
        float(practical_law["coefficient_error"]) if practical_law is not None else None
    )
    if full_error is None:
        primary = "UNAVAILABLE"
    elif oracle_error <= 0.25 and full_error >= max(0.50, 2.0 * oracle_error):
        primary = "STRUCTURE_SELECTION"
    elif oracle_error >= 0.50:
        primary = "COEFFICIENT_ESTIMATION"
    else:
        primary = "MIXED"
    return {
        "oracle_support": terms,
        "true_coefficients": dict(truth),
        "estimated_coefficients": recovered,
        "oracle_support_coefficient_error": oracle_error,
        "full_library_coefficient_error": full_error,
        "primary_failure": primary,
    }


def _topology_from_field(
    grid: np.ndarray,
    drift: np.ndarray,
    origins: np.ndarray,
    spec: WorldSpec,
    *,
    require_support: bool = False,
) -> dict[str, Any]:
    support = _support(grid, origins)
    stable: list[float] = []
    unstable: list[float] = []
    for root in _raw_roots(grid, drift):
        index = int(np.argmin(np.abs(grid - float(root["state"]))))
        if require_support and int(support[index]) < ROOT_SUPPORT:
            continue
        (stable if bool(root["stable"]) else unstable).append(float(root["state"]))
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


def _basin_decomposition(
    spec: WorldSpec,
    values: np.ndarray,
    observed_at: Sequence[Any],
    practical_sindy: Mapping[str, Any],
) -> dict[str, Any] | None:
    if spec.family != "double_well":
        return None
    train_end = int(len(values) * 0.72)
    raw_origins, raw_increments, delta_times, _, _, _ = _transition_arrays(
        values, observed_at, train_end
    )
    lower, upper = np.quantile(raw_origins, [0.01, 0.99])
    expected = [
        *map(float, spec.expected_stable_points),
        *map(float, spec.expected_unstable_points),
    ]
    if expected:
        lower = min(float(lower), min(expected) - 0.5)
        upper = max(float(upper), max(expected) + 0.5)
    raw_grid = np.linspace(float(lower), float(upper), 121)
    truth_drift, _ = _truth_functions(spec)
    true_topology = _topology_from_field(
        raw_grid, truth_drift(raw_grid), raw_origins, spec
    )

    oracle_fit = _fit_constant_candidate(
        raw_origins, raw_increments, delta_times, (1, 3)
    )
    oracle_topology = _topology_from_field(
        raw_grid, oracle_fit.drift(raw_grid), raw_origins, spec
    )

    center = float(np.mean(values[:train_end]))
    scale = float(np.std(values[:train_end], ddof=1))
    standardized = (values - center) / scale
    origins, increments, dt, _, _, _ = _transition_arrays(
        standardized, observed_at, train_end
    )
    standardized_grid = (raw_grid - center) / scale
    sindy_fit = _fit_sindy(origins, increments, dt, standardized_grid)
    sindy_topology = _topology_from_field(
        raw_grid, scale * sindy_fit.drift, raw_origins, spec
    )
    certified = {
        "stable_points": list(practical_sindy["field"]["stable_points"]),
        "unstable_points": list(practical_sindy["field"]["unstable_points"]),
        "topology_match": bool(practical_sindy["field"]["topology_match"]),
    }
    if not true_topology["topology_match"]:
        primary = "TOPOLOGY_EXTRACTION_OR_SUPPORT"
    elif not oracle_topology["topology_match"]:
        primary = "COEFFICIENT_ESTIMATION"
    elif not sindy_topology["topology_match"]:
        primary = "STRUCTURE_SELECTION"
    elif not certified["topology_match"]:
        primary = "CERTIFICATION_GATE"
    else:
        primary = "NONE"
    return {
        "true_drift_extraction": true_topology,
        "oracle_support_fit": oracle_topology,
        "full_sindy_field": sindy_topology,
        "certified_sindy": certified,
        "primary_failure": primary,
    }


def _evaluate_case(
    parent_case: Mapping[str, Any],
    spec: WorldSpec,
    *,
    stability_bootstraps: int,
) -> dict[str, Any]:
    seed = int(parent_case["seed"])
    values, observed_at, _ = _simulate_world(spec, seed)
    world_hash = _world_hash(values, observed_at)
    if world_hash != parent_case["world_hash"]:
        raise FailureDecompositionError(
            f"world replay diverged for {spec.cell_id} seed {seed}"
        )
    practical = {
        row["estimator_id"]: bool(row["correct_model"])
        for row in parent_case["estimators"]
    }
    sindy = next(
        row
        for row in parent_case["estimators"]
        if row["estimator_id"] == "EST-SINDY-D032"
    )
    return {
        "cell_id": spec.cell_id,
        "family": spec.family,
        "repetition": int(parent_case["repetition"]),
        "seed": seed,
        "world_hash": world_hash,
        "truth": dict(parent_case["truth"]),
        "oracle": _oracle_comparison(spec, values, observed_at),
        "practical_correct": practical,
        "information": _information_separation(spec, values, observed_at),
        "sindy_term_stability": _sindy_stability(
            spec,
            values,
            observed_at,
            bootstraps=stability_bootstraps,
            seed=seed,
        ),
        "sindy_coefficient_decomposition": _oracle_support_coefficients(
            spec, values, observed_at, sindy.get("law_recovery")
        ),
        "basin_decomposition": _basin_decomposition(spec, values, observed_at, sindy),
    }


def _mean(values: Sequence[float]) -> float | None:
    return float(np.mean(values)) if values else None


def _cell_surfaces(
    cases: Sequence[Mapping[str, Any]], specs: Mapping[str, WorldSpec]
) -> list[dict[str, Any]]:
    grouped: dict[str, list[Mapping[str, Any]]] = {}
    for case in cases:
        grouped.setdefault(str(case["cell_id"]), []).append(case)
    rows: list[dict[str, Any]] = []
    for cell_id, members in grouped.items():
        spec = specs[cell_id]
        oracle_rows = [row["oracle"] for row in members if row["oracle"]]
        practical_successes = {
            estimator_id: sum(
                bool(row["practical_correct"][estimator_id]) for row in members
            )
            for estimator_id in ESTIMATOR_IDS
        }
        practical_power = {
            estimator_id: successes / len(members)
            for estimator_id, successes in practical_successes.items()
        }
        best_id = max(
            ESTIMATOR_IDS,
            key=lambda estimator_id: practical_power[estimator_id],
        )
        oracle_successes = sum(bool(row["correct"]) for row in oracle_rows)
        oracle_power = oracle_successes / len(oracle_rows) if oracle_rows else None
        best_power = practical_power[best_id]
        if spec.expected_model == "ABSTAIN":
            classification = "OUT_OF_FAMILY_CONTROL"
        elif spec.expected_model == "M1":
            classification = "NEGATIVE_CONTROL"
        elif oracle_power is not None and oracle_power < POWER_THRESHOLD:
            classification = "DATA_LIMITED"
        elif best_power < POWER_THRESHOLD:
            classification = "ESTIMATOR_LIMITED"
        else:
            classification = "IDENTIFIABLE"
        information = [row["information"] for row in members if row["information"]]
        term_rows = [
            row["sindy_term_stability"]
            for row in members
            if row["sindy_term_stability"]
        ]
        terms = ("1", "x", "x2", "x3", "x4")
        coefficient_rows = [
            row["sindy_coefficient_decomposition"]
            for row in members
            if row["sindy_coefficient_decomposition"]
        ]
        topology_rows = [
            row["basin_decomposition"] for row in members if row["basin_decomposition"]
        ]
        rows.append(
            {
                "cell_id": cell_id,
                "family": spec.family,
                "effect_band": spec.effect_band,
                "effect": (
                    spec.cubic if spec.family != "state_diffusion" else spec.gamma
                ),
                "observations": spec.observations,
                "runs": len(members),
                "oracle_successes": oracle_successes,
                "oracle_power": oracle_power,
                "practical_successes": practical_successes,
                "practical_power": practical_power,
                "best_practical_estimator": best_id,
                "best_practical_power": best_power,
                "identifiability_gap": (
                    oracle_power - best_power if oracle_power is not None else None
                ),
                "classification": classification,
                "information": {
                    "median_per_step_kl": (
                        median([float(row["per_step_kl"]) for row in information])
                        if information
                        else None
                    ),
                    "median_information_mass": (
                        median([float(row["information_mass"]) for row in information])
                        if information
                        else None
                    ),
                },
                "sindy_term_stability": (
                    {
                        "true_terms": list(term_rows[0]["true_terms"]),
                        "inclusion_frequency": {
                            term: _mean(
                                [
                                    float(row["term_inclusion_frequency"][term])
                                    for row in term_rows
                                ]
                            )
                            for term in terms
                        },
                    }
                    if term_rows
                    else None
                ),
                "sindy_support_separation_rate": (
                    _mean([float(bool(row["support_separable"])) for row in term_rows])
                    if term_rows
                    else None
                ),
                "coefficient_error": (
                    {
                        "median_full_library": median(
                            [
                                float(row["full_library_coefficient_error"])
                                for row in coefficient_rows
                                if row["full_library_coefficient_error"] is not None
                            ]
                        ),
                        "median_oracle_support": median(
                            [
                                float(row["oracle_support_coefficient_error"])
                                for row in coefficient_rows
                            ]
                        ),
                        "primary_failure_counts": {
                            label: sum(
                                row["primary_failure"] == label
                                for row in coefficient_rows
                            )
                            for label in (
                                "STRUCTURE_SELECTION",
                                "COEFFICIENT_ESTIMATION",
                                "MIXED",
                                "UNAVAILABLE",
                            )
                        },
                    }
                    if coefficient_rows
                    else None
                ),
                "topology_decomposition": (
                    {
                        "true_drift_accuracy": _mean(
                            [
                                float(row["true_drift_extraction"]["topology_match"])
                                for row in topology_rows
                            ]
                        ),
                        "oracle_support_accuracy": _mean(
                            [
                                float(row["oracle_support_fit"]["topology_match"])
                                for row in topology_rows
                            ]
                        ),
                        "full_sindy_field_accuracy": _mean(
                            [
                                float(row["full_sindy_field"]["topology_match"])
                                for row in topology_rows
                            ]
                        ),
                        "certified_sindy_accuracy": _mean(
                            [
                                float(row["certified_sindy"]["topology_match"])
                                for row in topology_rows
                            ]
                        ),
                        "primary_failure_counts": {
                            label: sum(
                                row["primary_failure"] == label for row in topology_rows
                            )
                            for label in (
                                "TOPOLOGY_EXTRACTION_OR_SUPPORT",
                                "COEFFICIENT_ESTIMATION",
                                "STRUCTURE_SELECTION",
                                "CERTIFICATION_GATE",
                                "NONE",
                            )
                        },
                    }
                    if topology_rows
                    else None
                ),
            }
        )
    return sorted(rows, key=lambda row: str(row["cell_id"]))


def _estimate_n80(
    points: Sequence[Mapping[str, Any]],
    successes_key: str,
) -> dict[str, Any]:
    ordered = sorted(points, key=lambda row: int(row["observations"]))
    observations = np.asarray([int(row["observations"]) for row in ordered])
    successes = np.asarray([int(row[successes_key]) for row in ordered])
    runs = np.asarray([int(row["runs"]) for row in ordered])
    raw_power = successes / runs
    monotone_power = np.maximum.accumulate(raw_power)
    qualifying = np.where(monotone_power >= POWER_THRESHOLD)[0]
    evidence = [
        {
            "observations": int(n),
            "successes": int(success),
            "runs": int(total),
            "power": float(power),
        }
        for n, success, total, power in zip(observations, successes, runs, raw_power)
    ]
    if len(qualifying):
        index = int(qualifying[0])
        return {
            "n80": int(observations[index]),
            "display": (
                f"≤{int(observations[index])}"
                if index == 0
                else str(int(observations[index]))
            ),
            "method": "observed monotone power envelope",
            "extrapolated": False,
            "evidence": evidence,
        }
    if len(ordered) < 2:
        return {
            "n80": None,
            "display": f">{int(np.max(observations))}",
            "method": "right-censored; at least two sample-size cells are required for extrapolation",
            "extrapolated": False,
            "evidence": evidence,
        }
    adjusted = (successes + 0.5) / (runs + 1.0)
    logits = np.log(adjusted / (1.0 - adjusted))
    slope, intercept = np.polyfit(np.log(observations), logits, 1)
    if not math.isfinite(float(slope)) or slope <= 0.05:
        return {
            "n80": None,
            "display": f">{int(np.max(observations))}",
            "method": "right-censored; non-positive fitted power slope",
            "extrapolated": False,
            "evidence": evidence,
        }
    target_logit = math.log(POWER_THRESHOLD / (1.0 - POWER_THRESHOLD))
    estimate = math.exp((target_logit - float(intercept)) / float(slope))
    estimate = max(estimate, float(np.max(observations)))
    if not math.isfinite(estimate) or estimate > 100_000:
        return {
            "n80": None,
            "display": f">{int(np.max(observations))}",
            "method": "right-censored beyond extrapolation ceiling",
            "extrapolated": False,
            "evidence": evidence,
        }
    rounded = int(math.ceil(estimate / 10.0) * 10)
    return {
        "n80": rounded,
        "display": f"≈{rounded}",
        "method": "Jeffreys-smoothed logit extrapolation over log sample size",
        "extrapolated": True,
        "evidence": evidence,
    }


def _sample_complexity(
    surfaces: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    target_rows = [
        row
        for row in surfaces
        if row["family"] in {"cubic", "state_diffusion"}
        and row["effect_band"] in {"weak", "medium", "strong"}
        and "noisy" not in str(row["cell_id"])
        and "missing" not in str(row["cell_id"])
    ]
    groups: dict[tuple[str, float, str], list[Mapping[str, Any]]] = {}
    for row in target_rows:
        key = (str(row["family"]), float(row["effect"]), str(row["effect_band"]))
        groups.setdefault(key, []).append(row)
    output: list[dict[str, Any]] = []
    for (family, effect, band), members in sorted(groups.items()):
        oracle = _estimate_n80(members, "oracle_successes")
        practical = {
            estimator_id: _estimate_n80(
                [
                    {
                        **row,
                        "selected_successes": row["practical_successes"][estimator_id],
                    }
                    for row in members
                ],
                "selected_successes",
            )
            for estimator_id in ESTIMATOR_IDS
        }
        efficiency: dict[str, float | None] = {}
        for estimator_id, estimate in practical.items():
            if oracle["n80"] and estimate["n80"]:
                efficiency[estimator_id] = float(estimate["n80"]) / float(oracle["n80"])
            else:
                efficiency[estimator_id] = None
        output.append(
            {
                "family": family,
                "effect": effect,
                "effect_band": band,
                "oracle": oracle,
                "practical": practical,
                "sample_efficiency_ratio_vs_oracle": efficiency,
            }
        )
    return output


def _summary(surfaces: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    nonlinear = [
        row
        for row in surfaces
        if row["classification"]
        in {"DATA_LIMITED", "ESTIMATOR_LIMITED", "IDENTIFIABLE"}
    ]
    counts = {
        label: sum(row["classification"] == label for row in surfaces)
        for label in (
            "DATA_LIMITED",
            "ESTIMATOR_LIMITED",
            "IDENTIFIABLE",
            "NEGATIVE_CONTROL",
            "OUT_OF_FAMILY_CONTROL",
        )
    }
    gaps = [
        float(row["identifiability_gap"])
        for row in nonlinear
        if row["identifiability_gap"] is not None
    ]
    return {
        "power_threshold": POWER_THRESHOLD,
        "classification_counts": counts,
        "median_identifiability_gap": median(gaps) if gaps else None,
        "maximum_identifiability_gap": max(gaps) if gaps else None,
        "estimator_limited_cells": [
            row["cell_id"]
            for row in surfaces
            if row["classification"] == "ESTIMATOR_LIMITED"
        ],
        "data_limited_cells": [
            row["cell_id"]
            for row in surfaces
            if row["classification"] == "DATA_LIMITED"
        ],
    }


def _load_parent() -> dict[str, Any]:
    raw = DEFAULT_D032_ARTIFACT.read_bytes()
    if hashlib.sha256(raw).hexdigest() != D032_FILE_SHA256:
        raise FailureDecompositionError("frozen D0.3.2 artifact bytes changed")
    parent = load_frozen_estimator_tournament()
    if parent.get("artifact_hash") != D032_ARTIFACT_HASH:
        raise FailureDecompositionError("frozen D0.3.2 content address changed")
    return parent


@lru_cache(maxsize=6)
def run_failure_decomposition(
    case_limit: int | None = None,
    stability_bootstraps: int = DEFAULT_STABILITY_BOOTSTRAPS,
) -> dict[str, Any]:
    """Measure the family-aware oracle ceiling and localize information loss."""

    if not 4 <= stability_bootstraps <= 200:
        raise FailureDecompositionError("stability_bootstraps must be in [4, 200]")
    parent = _load_parent()
    parent_cases = parent["cases"]
    if case_limit is not None:
        if not 1 <= case_limit <= len(parent_cases):
            raise FailureDecompositionError("case_limit is outside the frozen universe")
        parent_cases = parent_cases[:case_limit]
    specs = {spec.cell_id: spec for spec in _reference_specs()}
    cases = [
        _evaluate_case(
            case,
            specs[str(case["cell_id"])],
            stability_bootstraps=stability_bootstraps,
        )
        for case in parent_cases
    ]
    surfaces = _cell_surfaces(cases, specs)
    summary = _summary(surfaces)
    repair_warranted = bool(summary["estimator_limited_cells"])
    payload: dict[str, Any] = {
        "schema_version": "dynamics-failure-decomposition/0.3.2.1",
        "milestone": "D0.3.2.1",
        "frozen": case_limit is None
        and stability_bootstraps == DEFAULT_STABILITY_BOOTSTRAPS,
        "question": (
            "Are the nonlinear worlds intrinsically distinguishable from the "
            "observations, or are practical estimators failing to extract available information?"
        ),
        "parent": {
            "milestone": "D0.3.2",
            "artifact_hash": D032_ARTIFACT_HASH,
            "file_sha256": D032_FILE_SHA256,
            "worlds": int(parent["evaluation"]["worlds"]),
            "same_worlds_replayed": True,
        },
        "protocol": {
            "source_sha256": hashlib.sha256(
                FAILURE_DECOMPOSITION_SOURCE.read_bytes()
            ).hexdigest(),
            "oracle_advantage": "correct candidate family/support only",
            "true_parameters_supplied": False,
            "parameter_estimation": "pre-holdout observations only",
            "comparison": "sealed holdout twice-log-likelihood ratio",
            "oracle_alpha": ORACLE_ALPHA,
            "power_threshold": POWER_THRESHOLD,
            "stability_bootstraps": stability_bootstraps,
            "sample_complexity_caveat": (
                "N80 values are observed bounds or explicitly labeled logit extrapolations "
                "from three frozen sample-size cells; they are not universal guarantees."
            ),
            "information_caveat": (
                "Conditional KL is a local Gaussian transition diagnostic, not a universal bound."
            ),
        },
        "evaluation": {
            "worlds": len(cases),
            "cells": len(surfaces),
            "practical_estimators": list(ESTIMATOR_IDS),
            "aggregate_winner_score": None,
        },
        "summary": summary,
        "oracle_power_surface": surfaces,
        "sample_complexity": _sample_complexity(surfaces),
        "cases": cases,
        "routing": {
            "d0_3_3_targeted_repair_warranted": repair_warranted,
            "basis": (
                "at least one ESTIMATOR_LIMITED cell"
                if repair_warranted
                else "no cell reached the prespecified oracle ceiling with a practical power gap"
            ),
            "new_estimator_warranted": False,
            "hawkes_deferred": True,
        },
        "real_market_claim": {
            "selected_model": "M1",
            "market_claim": "ABSTAIN",
            "oracle_classification": "UNASSESSED",
            "reason": (
                "A synthetic-truth oracle ceiling cannot be transferred to the real case "
                "without a separately frozen observational mapping experiment."
            ),
            "interpretation": (
                "No nonlinear structure was certified by an estimator whose nonlinear "
                "identification power is currently insufficient."
            ),
            "rerun_performed": False,
        },
        "excluded_scope": [
            "new estimator family",
            "practical estimator retuning",
            "automatic estimator routing",
            "real-market rerun",
            "Hawkes dynamics",
            "universal information-theoretic bound",
        ],
    }
    payload["artifact_hash"] = canonical_sha256(payload)
    return payload


def verify_failure_decomposition(
    artifact: Mapping[str, Any], *, verify_local_sources: bool = True
) -> dict[str, Any]:
    """Verify D0.3.2.1 content addressing, parent bytes, and case lineage."""

    errors: list[str] = []
    body = dict(artifact)
    claimed_hash = body.pop("artifact_hash", None)
    calculated_hash = canonical_sha256(body)
    if claimed_hash != calculated_hash:
        errors.append("artifact_hash does not match canonical payload")
    if artifact.get("schema_version") != "dynamics-failure-decomposition/0.3.2.1":
        errors.append("schema_version is not dynamics-failure-decomposition/0.3.2.1")
    parent = artifact.get("parent", {})
    if not isinstance(parent, Mapping):
        errors.append("parent lineage is missing")
        parent = {}
    if parent.get("artifact_hash") != D032_ARTIFACT_HASH:
        errors.append("D0.3.2 parent content address changed")
    if parent.get("file_sha256") != D032_FILE_SHA256:
        errors.append("D0.3.2 parent byte hash changed")
    protocol = artifact.get("protocol", {})
    if not isinstance(protocol, Mapping):
        errors.append("oracle protocol is missing")
        protocol = {}
    if protocol.get("true_parameters_supplied") is not False:
        errors.append("oracle received forbidden true parameters")
    if artifact.get("evaluation", {}).get("aggregate_winner_score") is not None:
        errors.append("failure decomposition must not expose a winner score")
    cases = artifact.get("cases", [])
    if artifact.get("evaluation", {}).get("worlds") != len(cases):
        errors.append("world count does not reconcile to case ledger")
    claim = artifact.get("real_market_claim", {})
    if (
        claim.get("market_claim") != "ABSTAIN"
        or claim.get("rerun_performed") is not False
    ):
        errors.append("real-market claim boundary changed")
    if artifact.get("routing", {}).get("hawkes_deferred") is not True:
        errors.append("Hawkes deferral changed")
    if verify_local_sources:
        if hashlib.sha256(
            FAILURE_DECOMPOSITION_SOURCE.read_bytes()
        ).hexdigest() != protocol.get("source_sha256"):
            errors.append("local D0.3.2.1 source changed")
        raw = DEFAULT_D032_ARTIFACT.read_bytes()
        if hashlib.sha256(raw).hexdigest() != D032_FILE_SHA256:
            errors.append("local D0.3.2 artifact bytes changed")
        parent_artifact = json.loads(raw)
        if parent_artifact.get("artifact_hash") != D032_ARTIFACT_HASH:
            errors.append("local D0.3.2 artifact content address changed")
        parent_hashes = {
            (str(case["cell_id"]), int(case["repetition"])): case["world_hash"]
            for case in parent_artifact["cases"]
        }
        for case in cases:
            key = (str(case["cell_id"]), int(case["repetition"]))
            if parent_hashes.get(key) != case.get("world_hash"):
                errors.append(f"world lineage changed for {key[0]} repetition {key[1]}")
    return {
        "valid": not errors,
        "artifact_hash": claimed_hash,
        "calculated_hash": calculated_hash,
        "worlds": len(cases) if isinstance(cases, list) else 0,
        "errors": errors,
    }


def load_frozen_failure_decomposition(
    path: Path = DEFAULT_D0321_ARTIFACT,
) -> dict[str, Any]:
    if not path.exists():
        raise FailureDecompositionError(
            "the frozen D0.3.2.1 artifact is unavailable; run the freeze script"
        )
    artifact = json.loads(path.read_text(encoding="utf-8"))
    verification = verify_failure_decomposition(artifact)
    if not verification["valid"]:
        raise FailureDecompositionError("; ".join(verification["errors"]))
    return artifact
