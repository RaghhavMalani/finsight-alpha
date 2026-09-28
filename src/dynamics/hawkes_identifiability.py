"""Frozen D0.4.1 Hawkes uncertainty and edge-identifiability laboratory."""

from __future__ import annotations

import hashlib
import json
import math
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from scipy.optimize import minimize
from scipy.stats import kstest

from src.dynamics.selection_freeze import canonical_sha256

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D041_ARTIFACT = ROOT / "eval/dynamics/d0_4_1/hawkes_identifiability.json"
PARENT_ARTIFACT = ROOT / "eval/dynamics/d0_4/hawkes_certification.json"
PARENT_COMMIT = "a625ab85bc407213a3e46c241394ba8a0f060d64"
PARENT_CANONICAL_HASH = "020c2c0f8c875ef32915512db14427a5fa543a8a0169e907a6825a6f9f1c4039"
PARENT_FILE_SHA256 = "364a918006f4e02eadc024d206202e96ed8e3af5862baacd76bd8b0e87fca47f"
SCHEMA_VERSION = "dynamics-hawkes-identifiability/0.4.1"
EDGE_THRESHOLD = 0.035
STABILITY_BARRIER = 0.995
ATTRIBUTION_REPETITIONS = 64
PARAMETRIC_REPETITIONS = 16
PROFILE_CUTOFF = 1.920729410347062
INFO_REGIMES = (("SPARSE", 100), ("LIMITED", 300), ("MODERATE", 1000), ("RICH", 3000))
IMPLEMENTATION_SOURCES = (
    ROOT / "src/dynamics/hawkes_identifiability.py",
    ROOT / "src/dynamics/hawkes_identifiability_verifier.py",
    ROOT / "scripts/freeze_dynamics_d0_4_1.py",
    ROOT / "scripts/verify_dynamics_d0_4_1.py",
    ROOT / "docs/dynamics-lab-d0-4-1-preregistration.md",
)


class HawkesIdentifiabilityError(RuntimeError):
    """Raised when the frozen D0.4.1 evidence contract fails closed."""


@dataclass(frozen=True)
class WorldSpec:
    world_id: str
    family: str
    regime: str
    information_regime: str
    target_events: int
    variant: int
    seed: int
    generator: str
    dimension: int
    baseline: tuple[float, ...]
    branching: tuple[tuple[float, ...], ...]
    beta: float
    audit: bool


def _round(value: Any, digits: int = 9) -> Any:
    if isinstance(value, (float, np.floating)):
        number = float(value)
        return round(number, digits) if math.isfinite(number) else None
    if isinstance(value, np.ndarray):
        return _round(value.tolist(), digits)
    if isinstance(value, Mapping):
        return {str(key): _round(item, digits) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_round(item, digits) for item in value]
    return value


def normalized_source_sha256(path: Path) -> str:
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def spectral_radius(matrix: Sequence[Sequence[float]]) -> float:
    values = np.linalg.eigvals(np.asarray(matrix, dtype=float))
    return float(np.max(np.abs(values))) if values.size else 0.0


def _matrix(values: Sequence[Sequence[float]]) -> tuple[tuple[float, ...], ...]:
    return tuple(tuple(float(item) for item in row) for row in values)


def build_world_registry() -> tuple[WorldSpec, ...]:
    """Build the exact preregistered 420-world grid in stable registry order."""

    rows: list[WorldSpec] = []
    seed = 41001
    betas = (0.8, 1.2, 1.8, 2.4, 3.2)
    for eta in (0.05, 0.20, 0.40, 0.60, 0.80, 0.92):
        for info, target in INFO_REGIMES:
            for variant in range(5):
                mu = (0.55 + 0.12 * variant,)
                world_id = f"univariate_eta_{eta:.2f}_{info.lower()}_v{variant}"
                rows.append(WorldSpec(world_id, "UNIVARIATE_CALIBRATION", f"ETA_{eta:.2f}", info, target, variant, seed, "hawkes", 1, mu, ((eta,),), betas[variant], variant == 0))
                seed += 1

    regimes: tuple[tuple[str, tuple[tuple[float, ...], ...]], ...] = (
        ("NO_EXCITATION", ((0.0, 0.0), (0.0, 0.0))),
        ("A_TO_B_WEAK", ((0.0, 0.0), (0.12, 0.0))),
        ("B_TO_A_WEAK", ((0.0, 0.12), (0.0, 0.0))),
        ("A_TO_B_STRONG", ((0.0, 0.0), (0.35, 0.0))),
        ("B_TO_A_STRONG", ((0.0, 0.35), (0.0, 0.0))),
        ("BIDIRECTIONAL_SYMMETRIC", ((0.0, 0.22), (0.22, 0.0))),
        ("BIDIRECTIONAL_ASYMMETRIC", ((0.0, 0.12), (0.32, 0.0))),
        ("A_TO_B_PLUS_B_SELF", ((0.0, 0.0), (0.28, 0.22))),
    )
    for regime, truth in regimes:
        for info, target in INFO_REGIMES:
            for variant in range(5):
                baseline = (0.70 + 0.08 * variant, 0.62 + 0.07 * variant)
                world_id = f"direction_{regime.lower()}_{info.lower()}_v{variant}"
                rows.append(WorldSpec(world_id, "DIRECTIONAL_IDENTIFICATION", regime, info, target, variant, seed, "hawkes", 2, baseline, truth, betas[variant], False))
                seed += 1
    observed_truth = ((0.0, 0.0, 0.28), (0.0, 0.0, 0.28), (0.0, 0.0, 0.10))
    for info, target in INFO_REGIMES:
        for variant in range(5):
            baseline = (0.60 + 0.06 * variant, 0.56 + 0.05 * variant, 0.38 + 0.04 * variant)
            rows.append(WorldSpec(f"direction_observed_z_{info.lower()}_v{variant}", "DIRECTIONAL_IDENTIFICATION", "OBSERVED_Z_TO_A_AND_B", info, target, variant, seed, "hawkes", 3, baseline, observed_truth, betas[variant], False))
            seed += 1

    for rho in (0.70, 0.85, 0.93, 0.97, 0.99):
        for info, target in INFO_REGIMES:
            for variant in range(4):
                if variant == 0:
                    truth, baseline = ((rho,),), (0.42,)
                else:
                    diagonal = rho * (0.45 + 0.05 * variant)
                    cross = rho - diagonal
                    truth = ((diagonal, cross), (cross, diagonal))
                    baseline = (0.34 + 0.04 * variant, 0.31 + 0.035 * variant)
                beta = (0.9, 1.4, 2.0, 2.8)[variant]
                rows.append(WorldSpec(f"critical_rho_{rho:.2f}_{info.lower()}_v{variant}", "NEAR_CRITICAL_RECOVERY", f"RHO_{rho:.2f}", info, target, variant, seed, "hawkes", len(baseline), baseline, _matrix(truth), beta, variant == 0))
                seed += 1

    controls = (
        ("HOMOGENEOUS_POISSON", "homogeneous_poisson", 1),
        ("SEASONAL_POISSON", "seasonal_poisson", 1),
        ("CLUSTERED_WEIBULL_RENEWAL", "clustered_renewal", 1),
        ("REFRACTORY_RENEWAL", "refractory", 1),
        ("EXOGENOUS_BURSTS", "exogenous_bursts", 1),
        ("INDEPENDENT_STREAMS", "independent_streams", 2),
        ("LATENT_COMMON_SHOCK", "latent_common_shock", 2),
        ("OBSERVED_COMMON_DRIVER", "observed_common_driver", 3),
    )
    for regime, generator, dimension in controls:
        for variant in range(5):
            target = 600 + 100 * variant
            baseline = tuple(0.72 + 0.06 * variant - 0.05 * channel for channel in range(dimension))
            truth = np.zeros((dimension, dimension), dtype=float)
            if generator == "observed_common_driver":
                truth[0, 2] = 0.26
                truth[1, 2] = 0.26
                truth[2, 2] = 0.08
            rows.append(WorldSpec(f"control_{regime.lower()}_v{variant}", "CONTROL", regime, "CONTROL", target, variant, seed, generator, dimension, baseline, _matrix(truth), betas[variant], False))
            seed += 1

    if len(rows) != 420 or seed != 41421:
        raise HawkesIdentifiabilityError("D0.4.1 registry cardinality changed")
    return tuple(rows)


WORLD_SPECS = build_world_registry()


def _stationary_rates(baseline: np.ndarray, branching: np.ndarray) -> np.ndarray:
    return np.linalg.solve(np.eye(len(baseline)) - branching, baseline)


def _observation_horizon(spec: WorldSpec) -> float:
    baseline = np.asarray(spec.baseline, dtype=float)
    branching = np.asarray(spec.branching, dtype=float)
    if spec.generator == "latent_common_shock":
        rate = float(np.sum(baseline) + 0.44)
    elif spec.generator in {"hawkes", "observed_common_driver"}:
        rate = float(np.sum(_stationary_rates(baseline, branching)))
    else:
        rate = float(np.sum(baseline))
    return max(2.0, float(spec.target_events / max(rate, 1e-8)))


def _poisson_times(rng: np.random.Generator, rate: float, horizon: float) -> list[float]:
    values: list[float] = []
    current = 0.0
    while True:
        current += float(rng.exponential(1.0 / rate))
        if current >= horizon:
            return values
        values.append(current)


def _thinned_poisson(
    rng: np.random.Generator,
    intensity: Any,
    maximum: float,
    horizon: float,
) -> list[float]:
    values: list[float] = []
    current = 0.0
    while True:
        current += float(rng.exponential(1.0 / maximum))
        if current >= horizon:
            return values
        if rng.random() <= float(intensity(current)) / maximum:
            values.append(current)


def simulate_exponential_hawkes(
    *,
    baseline: Sequence[float],
    branching: Sequence[Sequence[float]],
    beta: float,
    horizon: float,
    seed: int,
    burn_in_half_lives: float = 10.0,
) -> list[list[float]]:
    """Ogata simulation with a shared exponential decay and stationary burn-in."""

    mu = np.asarray(baseline, dtype=float)
    matrix = np.asarray(branching, dtype=float)
    alpha = matrix * float(beta)
    dimension = len(mu)
    rng = np.random.default_rng(seed)
    burn_in = burn_in_half_lives * math.log(2.0) / beta
    end = horizon + burn_in
    # Seed the burn-in at the stationary mean excitation state. Near-critical
    # processes otherwise need hundreds of half-lives to approach the
    # preregistered information target from an empty history.
    state = _stationary_rates(mu, matrix) / beta
    events: list[list[float]] = [[] for _ in range(dimension)]
    current = 0.0
    while current < end:
        intensity = mu + alpha @ state
        upper = float(np.sum(intensity))
        if not math.isfinite(upper) or upper <= 0.0:
            break
        wait = float(rng.exponential(1.0 / upper))
        candidate = current + wait
        if candidate >= end:
            break
        state *= math.exp(-beta * wait)
        candidate_intensity = mu + alpha @ state
        total = float(np.sum(candidate_intensity))
        current = candidate
        if rng.random() * upper > total:
            continue
        mark = int(np.searchsorted(np.cumsum(candidate_intensity), rng.random() * total, side="right"))
        mark = min(mark, dimension - 1)
        if candidate >= burn_in:
            events[mark].append(candidate - burn_in)
        state[mark] += 1.0
    return events


def _generate_events(spec: WorldSpec) -> tuple[list[list[float]], float, dict[str, Any]]:
    horizon = _observation_horizon(spec)
    rng = np.random.default_rng(spec.seed)
    metadata: dict[str, Any] = {}
    if spec.generator in {"hawkes", "observed_common_driver"}:
        events = simulate_exponential_hawkes(
            baseline=spec.baseline,
            branching=spec.branching,
            beta=spec.beta,
            horizon=horizon,
            seed=spec.seed,
        )
    elif spec.generator == "homogeneous_poisson":
        events = [_poisson_times(rng, spec.baseline[0], horizon)]
    elif spec.generator == "seasonal_poisson":
        amplitude = 0.70
        period = max(8.0, horizon / 8.0)
        rate = spec.baseline[0]
        events = [_thinned_poisson(rng, lambda t: rate * (1.0 + amplitude * math.sin(2.0 * math.pi * t / period)), rate * (1.0 + amplitude), horizon)]
        metadata = {"amplitude": amplitude, "period": period}
    elif spec.generator == "clustered_renewal":
        shape = 0.58
        scale = (1.0 / spec.baseline[0]) / math.gamma(1.0 + 1.0 / shape)
        stream: list[float] = []
        current = 0.0
        while True:
            current += float(rng.weibull(shape) * scale)
            if current >= horizon:
                break
            stream.append(current)
        events = [stream]
        metadata = {"shape": shape, "scale": scale}
    elif spec.generator == "refractory":
        refractory = 0.22 / (1.0 + 0.08 * spec.variant)
        adjusted_rate = spec.baseline[0] / max(0.25, 1.0 - refractory * spec.baseline[0])
        stream = []
        current = 0.0
        while True:
            current += refractory + float(rng.exponential(1.0 / adjusted_rate))
            if current >= horizon:
                break
            stream.append(current)
        events = [stream]
        metadata = {"refractory_period": refractory}
    elif spec.generator == "exogenous_bursts":
        windows = [(horizon * left, horizon * (left + 0.04)) for left in (0.18, 0.48, 0.74)]
        outside, inside = spec.baseline[0] * 0.70, spec.baseline[0] * 3.2
        events = [_thinned_poisson(rng, lambda t: inside if any(a <= t < b for a, b in windows) else outside, inside, horizon)]
        metadata = {"windows": windows, "inside_rate": inside, "outside_rate": outside}
    elif spec.generator == "independent_streams":
        events = [_poisson_times(rng, rate, horizon) for rate in spec.baseline]
    elif spec.generator == "latent_common_shock":
        events = [_poisson_times(rng, rate, horizon) for rate in spec.baseline]
        shocks = _poisson_times(rng, 0.22, horizon)
        for shock in shocks:
            events[0].append(shock)
            events[1].append(shock)
        events = [sorted(stream) for stream in events]
        metadata = {"latent_shock_count": len(shocks), "driver_observed": False}
    else:
        raise HawkesIdentifiabilityError(f"unknown generator: {spec.generator}")
    return events, horizon, metadata


def _event_groups(
    events: Sequence[Sequence[float]], *, start: float = 0.0, end: float | None = None
) -> list[tuple[float, np.ndarray]]:
    merged: dict[float, np.ndarray] = {}
    dimension = len(events)
    for channel, stream in enumerate(events):
        for raw in stream:
            event = float(raw)
            if event < start or (end is not None and event >= end):
                continue
            if event not in merged:
                merged[event] = np.zeros(dimension, dtype=int)
            merged[event][channel] += 1
    return [(time, merged[time]) for time in sorted(merged)]


def hawkes_log_likelihood_gradient(
    events: Sequence[Sequence[float]],
    baseline: Sequence[float],
    alpha: Sequence[Sequence[float]],
    beta: float,
    horizon: float,
    *,
    groups_cache: Sequence[tuple[float, np.ndarray]] | None = None,
) -> tuple[float, np.ndarray, np.ndarray, float]:
    """Exact shared-decay exponential Hawkes likelihood and analytic gradient."""

    mu = np.asarray(baseline, dtype=float)
    excitation = np.asarray(alpha, dtype=float)
    dimension = len(mu)
    if excitation.shape != (dimension, dimension) or np.any(mu <= 0.0) or np.any(excitation < 0.0) or beta <= 0.0:
        return float("-inf"), np.zeros_like(mu), np.zeros_like(excitation), 0.0
    state = np.zeros(dimension, dtype=float)
    derivative_state = np.zeros(dimension, dtype=float)
    previous = 0.0
    log_likelihood = 0.0
    grad_mu = np.zeros(dimension, dtype=float)
    grad_alpha = np.zeros_like(excitation)
    grad_beta = 0.0
    groups = groups_cache if groups_cache is not None else _event_groups(events, end=horizon)
    for time, marks in groups:
        delta = time - previous
        decay = math.exp(-beta * delta)
        old_state = state.copy()
        state *= decay
        derivative_state = decay * (derivative_state - delta * old_state)
        intensity = mu + excitation @ state
        if np.any(intensity <= 0.0) or not np.all(np.isfinite(intensity)):
            return float("-inf"), grad_mu, grad_alpha, grad_beta
        for target, count in enumerate(marks):
            if count <= 0:
                continue
            weight = float(count) / float(intensity[target])
            log_likelihood += float(count) * math.log(float(intensity[target]))
            grad_mu[target] += weight
            grad_alpha[target, :] += weight * state
            grad_beta += weight * float(excitation[target, :] @ derivative_state)
        state += marks
        previous = time
    log_likelihood -= float(np.sum(mu) * horizon)
    grad_mu -= horizon
    for source, stream in enumerate(events):
        deltas = horizon - np.asarray([event for event in stream if event < horizon], dtype=float)
        if not deltas.size:
            continue
        exponentials = np.exp(-beta * deltas)
        integral = float(np.sum(1.0 - exponentials))
        integral_derivative = float(np.sum(deltas * exponentials))
        log_likelihood -= float(np.sum(excitation[:, source])) * integral / beta
        grad_alpha[:, source] -= integral / beta
        grad_beta -= float(np.sum(excitation[:, source])) * (integral_derivative * beta - integral) / (beta * beta)
    return float(log_likelihood), grad_mu, grad_alpha, float(grad_beta)


def _decode(vector: np.ndarray, dimension: int) -> tuple[np.ndarray, np.ndarray, float]:
    mu = np.exp(vector[:dimension])
    count = dimension * dimension
    alpha = np.exp(vector[dimension : dimension + count]).reshape(dimension, dimension)
    beta = math.exp(float(vector[-1]))
    return mu, alpha, beta


def fit_exponential_hawkes(
    events: Sequence[Sequence[float]], *, horizon: float
) -> dict[str, Any]:
    """Frozen three-start D0.4 estimator with an exact recursive objective."""

    dimension = len(events)
    if dimension not in {1, 2, 3}:
        raise HawkesIdentifiabilityError("D0.4.1 supports one to three channels")
    counts = np.asarray([max(1, len(stream)) for stream in events], dtype=float)
    empirical = counts / horizon
    groups = _event_groups(events, end=horizon)
    bounds = [(-7.0, 4.0)] * dimension + [(-8.0, 1.4)] * (dimension * dimension) + [(-2.3, 2.3)]

    def objective(vector: np.ndarray) -> tuple[float, np.ndarray]:
        mu, alpha, beta = _decode(vector, dimension)
        branching = alpha / beta
        rho = float(branching[0, 0]) if dimension == 1 else spectral_radius(branching)
        if rho >= STABILITY_BARRIER:
            penalty = 1_000_000.0 + 1_000_000.0 * (rho - STABILITY_BARRIER) ** 2
            return penalty, np.zeros_like(vector)
        likelihood, grad_mu, grad_alpha, grad_beta = hawkes_log_likelihood_gradient(events, mu, alpha, beta, horizon, groups_cache=groups)
        if not math.isfinite(likelihood):
            return 1_000_000.0, np.zeros_like(vector)
        transformed = np.concatenate((grad_mu * mu, (grad_alpha * alpha).ravel(), [grad_beta * beta]))
        return -likelihood, -transformed

    starts: list[np.ndarray] = []
    for eta, beta_value in ((0.08, 0.8), (0.24, 1.5), (0.55, 2.4)):
        mu = np.maximum(empirical * (1.0 - eta), 1e-3)
        alpha = np.full((dimension, dimension), eta * beta_value / dimension)
        if dimension >= 2:
            alpha[0, 1] *= 0.75
            alpha[1, 0] *= 1.25
        starts.append(np.concatenate((np.log(mu), np.log(np.maximum(alpha, 1e-6)).ravel(), [math.log(beta_value)])))
    results = [
        minimize(objective, start, jac=True, method="L-BFGS-B", bounds=bounds, options={"maxiter": 260, "ftol": 1e-11, "gtol": 1e-7, "maxls": 30})
        for start in starts
    ]
    result = min(results, key=lambda row: float(row.fun))
    mu, alpha, beta = _decode(np.asarray(result.x, dtype=float), dimension)
    branching = alpha / beta
    rho = spectral_radius(branching)
    covariance: np.ndarray | None = None
    condition: float | None = None
    try:
        inverse = result.hess_inv.todense() if hasattr(result.hess_inv, "todense") else result.hess_inv
        candidate = np.asarray(inverse, dtype=float).reshape(len(result.x), len(result.x))
        if np.all(np.isfinite(candidate)):
            covariance = candidate
            condition = float(np.linalg.cond(candidate))
    except (AttributeError, TypeError, ValueError, np.linalg.LinAlgError):
        pass
    return {
        "baseline": mu,
        "alpha": alpha,
        "beta": beta,
        "branching_matrix": branching,
        "spectral_radius": rho,
        "log_likelihood": -float(result.fun),
        "log_parameter_covariance": covariance,
        "optimizer": {
            "method": "L-BFGS-B deterministic multi-start",
            "success": bool(result.success),
            "status": int(result.status),
            "message": str(result.message),
            "iterations": int(getattr(result, "nit", 0)),
            "function_evaluations": int(getattr(result, "nfev", 0)),
            "starts": 3,
        },
        "identifiability": {
            "event_count": int(np.sum(counts)),
            "parameter_count": int(len(result.x)),
            "events_per_parameter": float(np.sum(counts) / len(result.x)),
            "inverse_hessian_condition": condition,
            "locally_identifiable": bool(result.success and condition is not None and condition < 1e12 and rho < STABILITY_BARRIER),
        },
    }


def _interval_payload(
    estimate: np.ndarray, lower: np.ndarray, upper: np.ndarray, truth: np.ndarray
) -> dict[str, Any]:
    return {
        "estimate": estimate,
        "lower": lower,
        "upper": upper,
        "covered": np.logical_and(truth >= lower, truth <= upper).astype(int),
        "width": upper - lower,
    }


def _hessian_uncertainty(
    fit: Mapping[str, Any], truth: np.ndarray, *, seed: int
) -> dict[str, Any]:
    estimate = np.asarray(fit["branching_matrix"], dtype=float)
    covariance_value = fit.get("log_parameter_covariance")
    if covariance_value is None:
        blank = np.full_like(estimate, np.nan)
        return {"method": "INVERSE_HESSIAN_DELTA", "available": False, "branching": _interval_payload(estimate, blank, blank, truth), "spectral_radius_ci95": None}
    covariance = np.asarray(covariance_value, dtype=float)
    dimension = estimate.shape[0]
    beta_index = dimension + dimension * dimension
    variance = np.zeros_like(estimate)
    for target in range(dimension):
        for source in range(dimension):
            alpha_index = dimension + target * dimension + source
            variance[target, source] = max(0.0, covariance[alpha_index, alpha_index] + covariance[beta_index, beta_index] - 2.0 * covariance[alpha_index, beta_index])
    standard_error = estimate * np.sqrt(variance)
    lower = np.maximum(0.0, estimate - 1.959963984540054 * standard_error)
    upper = estimate + 1.959963984540054 * standard_error
    eigenvalues, eigenvectors = np.linalg.eigh((covariance + covariance.T) / 2.0)
    safe_covariance = (eigenvectors * np.maximum(eigenvalues, 0.0)) @ eigenvectors.T
    rng = np.random.default_rng(seed)
    center = np.zeros(covariance.shape[0], dtype=float)
    draws = rng.multivariate_normal(center, safe_covariance, size=256, check_valid="ignore")
    spectral_draws = []
    for draw in draws:
        log_g_delta = draw[dimension:beta_index].reshape(dimension, dimension) - draw[beta_index]
        spectral_draws.append(spectral_radius(estimate * np.exp(np.clip(log_g_delta, -12.0, 12.0))))
    return {
        "method": "INVERSE_HESSIAN_DELTA",
        "available": True,
        "branching": _interval_payload(estimate, lower, upper, truth),
        "spectral_radius_ci95": np.quantile(spectral_draws, [0.025, 0.975]),
    }


def _attribution_rows(
    events: Sequence[Sequence[float]], fit: Mapping[str, Any], horizon: float
) -> list[list[np.ndarray]]:
    mu = np.asarray(fit["baseline"], dtype=float)
    alpha = np.asarray(fit["alpha"], dtype=float)
    beta = float(fit["beta"])
    dimension = len(events)
    rows: list[list[np.ndarray]] = [[] for _ in range(dimension)]
    state = np.zeros(dimension, dtype=float)
    previous = 0.0
    for time, marks in _event_groups(events, end=horizon):
        state *= math.exp(-beta * (time - previous))
        intensity = mu + alpha @ state
        for target, count in enumerate(marks):
            if count <= 0:
                continue
            shares = alpha[target, :] * state / max(float(intensity[target]), 1e-12)
            rows[target].extend(shares.copy() for _ in range(int(count)))
        state += marks
        previous = time
    return rows


def attribution_uncertainty(
    events: Sequence[Sequence[float]],
    fit: Mapping[str, Any],
    truth: np.ndarray,
    *,
    horizon: float,
    seed: int,
) -> dict[str, Any]:
    dimension = len(events)
    rows = _attribution_rows(events, fit, horizon)
    source_counts = np.asarray([max(1, len(stream)) for stream in events], dtype=float)
    rng = np.random.default_rng(seed)
    samples = np.zeros((ATTRIBUTION_REPETITIONS, dimension, dimension), dtype=float)
    for repetition in range(ATTRIBUTION_REPETITIONS):
        for target in range(dimension):
            if not rows[target]:
                continue
            indices = rng.integers(0, len(rows[target]), size=len(rows[target]))
            sampled = np.sum([rows[target][int(index)] for index in indices], axis=0)
            samples[repetition, target, :] = sampled / source_counts
    raw_lower = np.quantile(samples, 0.025, axis=0)
    raw_upper = np.quantile(samples, 0.975, axis=0)
    raw_center = np.median(samples, axis=0)
    half_width = np.maximum(raw_upper - raw_center, raw_center - raw_lower)
    estimate = np.asarray(fit["branching_matrix"], dtype=float)
    lower = np.maximum(0.0, estimate - half_width)
    upper = estimate + half_width
    spectral_samples = np.asarray([spectral_radius(sample) for sample in samples])
    spectral_center = float(np.median(spectral_samples))
    spectral_half_width = max(float(np.quantile(spectral_samples, 0.975) - spectral_center), float(spectral_center - np.quantile(spectral_samples, 0.025)))
    rho = float(fit["spectral_radius"])
    return {
        "method": "EVENT_ATTRIBUTION_BOOTSTRAP",
        "available": True,
        "repetitions": ATTRIBUTION_REPETITIONS,
        "seed": seed,
        "branching": _interval_payload(estimate, lower, upper, truth),
        "edge_support": (lower > EDGE_THRESHOLD).astype(int),
        "spectral_radius_ci95": [max(0.0, rho - spectral_half_width), rho + spectral_half_width],
    }


def _parametric_uncertainty(
    fit: Mapping[str, Any], truth: np.ndarray, *, horizon: float, seed: int
) -> dict[str, Any]:
    samples: list[np.ndarray] = []
    spectral_samples: list[float] = []
    failures = 0
    for repetition in range(PARAMETRIC_REPETITIONS):
        events = simulate_exponential_hawkes(
            baseline=fit["baseline"],
            branching=fit["branching_matrix"],
            beta=float(fit["beta"]),
            horizon=horizon,
            seed=seed + repetition,
        )
        refit = fit_exponential_hawkes(events, horizon=horizon)
        if not refit["optimizer"]["success"]:
            failures += 1
            continue
        samples.append(np.asarray(refit["branching_matrix"], dtype=float))
        spectral_samples.append(float(refit["spectral_radius"]))
    estimate = np.asarray(fit["branching_matrix"], dtype=float)
    if not samples:
        blank = np.full_like(estimate, np.nan)
        return {"method": "PARAMETRIC_REFIT_BOOTSTRAP", "available": False, "repetitions": PARAMETRIC_REPETITIONS, "failures": failures, "samples": [], "branching": _interval_payload(estimate, blank, blank, truth), "spectral_radius_ci95": None}
    array = np.asarray(samples)
    lower = np.quantile(array, 0.025, axis=0)
    upper = np.quantile(array, 0.975, axis=0)
    return {
        "method": "PARAMETRIC_REFIT_BOOTSTRAP",
        "available": True,
        "repetitions": PARAMETRIC_REPETITIONS,
        "failures": failures,
        "seed": seed,
        "samples": samples,
        "branching": _interval_payload(estimate, lower, upper, truth),
        "spectral_radius_ci95": np.quantile(spectral_samples, [0.025, 0.975]),
    }


def _profile_uncertainty(
    events: Sequence[Sequence[float]], fit: Mapping[str, Any], truth: np.ndarray, *, horizon: float
) -> dict[str, Any]:
    if len(events) != 1:
        return {"method": "PROFILE_LIKELIHOOD", "available": False, "reason": "UNIVARIATE_ONLY"}
    fitted_mu = float(np.asarray(fit["baseline"])[0])
    fitted_beta = float(fit["beta"])
    groups = _event_groups(events, end=horizon)
    grid = np.linspace(0.001, 0.99, 49)
    rows: list[dict[str, float]] = []
    start = np.log([fitted_mu, fitted_beta])
    for eta in grid:
        def objective(vector: np.ndarray) -> tuple[float, np.ndarray]:
            mu, beta = np.exp(vector)
            alpha = np.asarray([[eta * beta]], dtype=float)
            likelihood, grad_mu, grad_alpha, grad_beta = hawkes_log_likelihood_gradient(events, [mu], alpha, beta, horizon, groups_cache=groups)
            total_beta_gradient = grad_beta + eta * float(grad_alpha[0, 0])
            return -likelihood, -np.asarray([float(grad_mu[0]) * mu, total_beta_gradient * beta])

        result = minimize(objective, start, jac=True, method="L-BFGS-B", bounds=[(-7.0, 4.0), (-2.3, 2.3)], options={"maxiter": 160, "ftol": 1e-10, "gtol": 1e-7})
        start = np.asarray(result.x, dtype=float)
        mu, beta = np.exp(start)
        rows.append({"branching_ratio": float(eta), "baseline": float(mu), "beta": float(beta), "log_likelihood": -float(result.fun)})
    maximum = max(row["log_likelihood"] for row in rows)
    admitted = [row["branching_ratio"] for row in rows if maximum - row["log_likelihood"] <= PROFILE_CUTOFF]
    lower, upper = min(admitted), max(admitted)
    estimate = np.asarray(fit["branching_matrix"], dtype=float)
    return {
        "method": "PROFILE_LIKELIHOOD",
        "available": True,
        "cutoff": PROFILE_CUTOFF,
        "grid": rows,
        "branching": _interval_payload(estimate, np.asarray([[lower]]), np.asarray([[upper]]), truth),
        "spectral_radius_ci95": [lower, upper],
    }


def _residual_diagnostics(
    events: Sequence[Sequence[float]], fit: Mapping[str, Any], horizon: float
) -> dict[str, Any]:
    mu = np.asarray(fit["baseline"], dtype=float)
    branching = np.asarray(fit["branching_matrix"], dtype=float)
    beta = float(fit["beta"])
    dimension = len(events)
    state = np.zeros(dimension, dtype=float)
    cumulative = np.zeros(dimension, dtype=float)
    last_target = np.zeros(dimension, dtype=float)
    residuals: list[float] = []
    previous = 0.0
    for time, marks in _event_groups(events, end=horizon):
        delta = time - previous
        decay = math.exp(-beta * delta)
        cumulative += mu * delta + branching @ state * (1.0 - decay)
        state *= decay
        for target, count in enumerate(marks):
            for _ in range(int(count)):
                value = float(cumulative[target] - last_target[target])
                if value > 0.0 and math.isfinite(value):
                    residuals.append(value)
                last_target[target] = cumulative[target]
        state += marks
        previous = time
    values = np.asarray(residuals, dtype=float)
    if len(values) < 8:
        return {"count": len(values), "mean": None, "variance": None, "ks_pvalue": None, "lag1_autocorrelation": None, "calibrated": False}
    ks = kstest(values, "expon")
    autocorrelation = float(np.corrcoef(values[:-1], values[1:])[0, 1]) if len(values) > 2 and np.std(values[:-1]) > 0 and np.std(values[1:]) > 0 else 0.0
    return {
        "count": int(len(values)),
        "mean": float(np.mean(values)),
        "variance": float(np.var(values)),
        "ks_pvalue": float(ks.pvalue),
        "lag1_autocorrelation": autocorrelation,
        "calibrated": bool(float(ks.pvalue) >= 0.01 and abs(autocorrelation) <= 0.25),
    }


def _graph_evaluation(truth: np.ndarray, support: np.ndarray) -> dict[str, Any]:
    dimension = truth.shape[0]
    true_edges = {(source, target) for target in range(dimension) for source in range(dimension) if source != target and truth[target, source] > EDGE_THRESHOLD}
    inferred_edges = {(source, target) for target in range(dimension) for source in range(dimension) if source != target and support[target, source] == 1}
    true_positive = len(true_edges & inferred_edges)
    false_positive = len(inferred_edges - true_edges)
    false_negative = len(true_edges - inferred_edges)
    reversed_edges = sum((target, source) in inferred_edges and (target, source) not in true_edges for source, target in true_edges)
    if inferred_edges == true_edges:
        direction = "EXACT"
    elif not inferred_edges:
        direction = "ABSTAIN" if true_edges else "EXACT"
    elif reversed_edges and true_positive == 0:
        direction = "REVERSED"
    elif true_positive:
        direction = "PARTIAL"
    elif true_edges:
        direction = "MISSED_WITH_FALSE_EDGE"
    else:
        direction = "FALSE_EDGE"
    return {
        "true_edges": [{"source": source, "target": target} for source, target in sorted(true_edges)],
        "inferred_edges": [{"source": source, "target": target} for source, target in sorted(inferred_edges)],
        "true_positive": true_positive,
        "false_positive": false_positive,
        "false_negative": false_negative,
        "reversed_edges": reversed_edges,
        "exact_graph": inferred_edges == true_edges,
        "abstained": not inferred_edges and bool(true_edges),
        "direction_class": direction,
    }


def _information_payload(spec: WorldSpec, events: Sequence[Sequence[float]], horizon: float) -> dict[str, Any]:
    baseline = np.asarray(spec.baseline, dtype=float)
    branching = np.asarray(spec.branching, dtype=float)
    if spec.generator in {"hawkes", "observed_common_driver"}:
        expected_total = float(np.sum(_stationary_rates(baseline, branching)) * horizon)
        expected_immigrants = float(np.sum(baseline) * horizon)
    else:
        expected_total = float(spec.target_events)
        expected_immigrants = float(spec.target_events)
    realized = sum(len(stream) for stream in events)
    half_life = math.log(2.0) / spec.beta
    return {
        "target_events": spec.target_events,
        "expected_total_events": expected_total,
        "expected_immigrant_events": expected_immigrants,
        "expected_offspring_events": max(0.0, expected_total - expected_immigrants),
        "realized_events": realized,
        "horizon": horizon,
        "kernel_half_life": half_life,
        "realized_events_per_half_life": realized * half_life / horizon,
    }


def _world_record(spec: WorldSpec) -> dict[str, Any]:
    events, horizon, metadata = _generate_events(spec)
    truth = np.asarray(spec.branching, dtype=float)
    truth_rho = spectral_radius(truth)
    if truth_rho >= 1.0:
        raise HawkesIdentifiabilityError(f"unstable truth: {spec.world_id}")
    fit = fit_exponential_hawkes(events, horizon=horizon)
    hessian = _hessian_uncertainty(fit, truth, seed=spec.seed + 10_000)
    attribution = attribution_uncertainty(events, fit, truth, horizon=horizon, seed=spec.seed + 20_000)
    methods: dict[str, Any] = {
        "inverse_hessian": hessian,
        "event_attribution": attribution,
    }
    if spec.audit:
        methods["parametric_bootstrap"] = _parametric_uncertainty(fit, truth, horizon=horizon, seed=spec.seed + 30_000)
        methods["profile_likelihood"] = _profile_uncertainty(events, fit, truth, horizon=horizon)
    else:
        methods["parametric_bootstrap"] = {"method": "PARAMETRIC_REFIT_BOOTSTRAP", "available": False, "reason": "OUTSIDE_PREREGISTERED_AUDIT_SUBSET"}
        methods["profile_likelihood"] = {"method": "PROFILE_LIKELIHOOD", "available": False, "reason": "OUTSIDE_PREREGISTERED_AUDIT_SUBSET"}
    support = np.asarray(attribution["edge_support"], dtype=int)
    graph = _graph_evaluation(truth, support)
    fit_rho = float(fit["spectral_radius"])
    graph["near_critical_truth"] = truth_rho >= 0.93
    graph["near_critical_inferred"] = fit_rho >= 0.90
    graph["near_critical_correct"] = graph["near_critical_truth"] == graph["near_critical_inferred"]
    graph["unsupported_ab_edge"] = bool(
        spec.dimension >= 2
        and ((support[0, 1] == 1 and truth[0, 1] <= EDGE_THRESHOLD) or (support[1, 0] == 1 and truth[1, 0] <= EDGE_THRESHOLD))
    )
    residuals = _residual_diagnostics(events, fit, horizon)
    world = {
        "world_id": spec.world_id,
        "family": spec.family,
        "regime": spec.regime,
        "information_regime": spec.information_regime,
        "variant": spec.variant,
        "seed": spec.seed,
        "audit_subset": spec.audit,
        "generator": spec.generator,
        "dimension": spec.dimension,
        "channels": [chr(ord("A") + index) for index in range(spec.dimension)],
        "observation_window": {"start": 0.0, "end": horizon, "time_unit": "synthetic_time", "left_boundary": "BURN_IN_DISCARDED", "right_boundary": "OBSERVATION_END_RECORDED"},
        "event_times": events,
        "event_counts": [len(stream) for stream in events],
        "metadata": metadata,
    }
    world = _round(world)
    world["world_hash"] = canonical_sha256(world)
    record = {
        "world": world,
        "truth": {
            "baseline": spec.baseline,
            "branching_matrix": truth,
            "alpha": truth * spec.beta,
            "beta": spec.beta,
            "spectral_radius": truth_rho,
            "stable": truth_rho < 1.0,
        },
        "information": _information_payload(spec, events, horizon),
        "fit": fit,
        "uncertainty": methods,
        "graph_evaluation": graph,
        "residual_diagnostics": residuals,
        "claims": {
            "structural_identifiability_tested": True,
            "predictive_validity_tested": False,
            "economic_utility_tested": False,
            "causal_identification_tested": False,
            "causal_claim_eligible": False,
            "market_claim_eligible": False,
        },
    }
    return _round(record)


def _ratio(successes: int, total: int) -> float | None:
    return successes / total if total else None


def _mean(values: Sequence[float]) -> float | None:
    return float(np.mean(values)) if values else None


def _uncertainty_summary(worlds: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    keys = ("inverse_hessian", "event_attribution", "parametric_bootstrap", "profile_likelihood")
    for key in keys:
        covered: list[int] = []
        widths: list[float] = []
        available_worlds = 0
        for record in worlds:
            method = record["uncertainty"][key]
            if not method.get("available"):
                continue
            available_worlds += 1
            truth = np.asarray(record["truth"]["branching_matrix"], dtype=float)
            branch = method["branching"]
            method_covered = np.asarray(branch["covered"], dtype=int)
            method_width = np.asarray(branch["width"], dtype=float)
            mask = truth > EDGE_THRESHOLD
            if np.any(mask):
                covered.extend(method_covered[mask].tolist())
                widths.extend(method_width[mask].tolist())
        output.append({"method": key, "available_worlds": available_worlds, "parameter_count": len(covered), "coverage": _ratio(sum(covered), len(covered)), "mean_width": _mean(widths), "median_width": float(np.median(widths)) if widths else None})
    return output


def _direction_frontier(worlds: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    order = {name: index for index, (name, _) in enumerate(INFO_REGIMES)}
    regimes = sorted({record["world"]["regime"] for record in worlds if record["world"]["family"] == "DIRECTIONAL_IDENTIFICATION" and record["world"]["regime"] != "NO_EXCITATION"})
    rows = []
    for regime in regimes:
        cells = []
        for info, _ in INFO_REGIMES:
            selected = [record for record in worlds if record["world"]["regime"] == regime and record["world"]["information_regime"] == info]
            rate = _ratio(sum(bool(record["graph_evaluation"]["exact_graph"]) for record in selected), len(selected))
            cells.append({"information_regime": info, "worlds": len(selected), "exact_graph_rate": rate})
        eligible = [cell for cell in cells if cell["exact_graph_rate"] is not None and cell["exact_graph_rate"] >= 0.80]
        frontier = min(eligible, key=lambda row: order[row["information_regime"]])["information_regime"] if eligible else "UNRESOLVED"
        rows.append({"regime": regime, "frontier": frontier, "cells": cells})
    return rows


def _suite_metrics(worlds: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    directional = [row for row in worlds if row["world"]["family"] == "DIRECTIONAL_IDENTIFICATION"]
    true_positive = sum(int(row["graph_evaluation"]["true_positive"]) for row in directional)
    false_positive = sum(int(row["graph_evaluation"]["false_positive"]) for row in directional)
    false_negative = sum(int(row["graph_evaluation"]["false_negative"]) for row in directional)
    precision = _ratio(true_positive, true_positive + false_positive)
    recall = _ratio(true_positive, true_positive + false_negative)
    f1 = (2.0 * precision * recall / (precision + recall)) if precision is not None and recall is not None and precision + recall > 0 else None
    exact_graph = _ratio(sum(bool(row["graph_evaluation"]["exact_graph"]) for row in directional), len(directional))
    direction_candidates = [row for row in directional if len(row["graph_evaluation"]["true_edges"]) == 1]
    direction_detected = [row for row in direction_candidates if row["graph_evaluation"]["inferred_edges"]]
    conditional_direction = _ratio(sum(row["graph_evaluation"]["direction_class"] == "EXACT" for row in direction_detected), len(direction_detected))
    null_worlds = [row for row in worlds if row["world"]["dimension"] >= 2 and not row["graph_evaluation"]["true_edges"]]
    false_discovery = _ratio(sum(bool(row["graph_evaluation"]["inferred_edges"]) for row in null_worlds), len(null_worlds))
    strong_total = 0
    strong_detected = 0
    for row in directional:
        truth = np.asarray(row["truth"]["branching_matrix"], dtype=float)
        support = np.asarray(row["uncertainty"]["event_attribution"]["edge_support"], dtype=int)
        for target in range(truth.shape[0]):
            for source in range(truth.shape[1]):
                if target != source and truth[target, source] >= 0.20:
                    strong_total += 1
                    strong_detected += int(support[target, source] == 1)
    critical = [row for row in worlds if row["world"]["family"] == "NEAR_CRITICAL_RECOVERY"]
    near_critical_accuracy = _ratio(sum(bool(row["graph_evaluation"]["near_critical_correct"]) for row in critical), len(critical))
    control_rows = [row for row in worlds if row["world"]["family"] == "CONTROL"]
    false_critical = _ratio(sum(bool(row["graph_evaluation"]["near_critical_inferred"]) for row in control_rows), len(control_rows))
    latent = [row for row in worlds if row["world"]["regime"] == "LATENT_COMMON_SHOCK"]
    latent_false_ab = _ratio(sum(bool(row["graph_evaluation"]["unsupported_ab_edge"]) for row in latent), len(latent))
    numerical_failures = sum(not bool(row["fit"]["optimizer"]["success"]) for row in worlds)
    residual_rate = _ratio(sum(bool(row["residual_diagnostics"]["calibrated"]) for row in worlds), len(worlds))
    rho_errors = [float(row["fit"]["spectral_radius"]) - float(row["truth"]["spectral_radius"]) for row in worlds if row["world"]["generator"] in {"hawkes", "observed_common_driver"}]
    uncertainty = _uncertainty_summary(worlds)
    parametric = next(row for row in uncertainty if row["method"] == "parametric_bootstrap")
    return _round({
        "world_count": len(worlds),
        "numerical_failures": numerical_failures,
        "spectral_radius_bias": _mean(rho_errors),
        "spectral_radius_rmse": math.sqrt(float(np.mean(np.square(rho_errors)))) if rho_errors else None,
        "uncertainty_methods": uncertainty,
        "graph": {
            "true_positive": true_positive,
            "false_positive": false_positive,
            "false_negative": false_negative,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "exact_graph_rate": exact_graph,
            "conditional_direction_accuracy": conditional_direction,
            "reversed_edges": sum(int(row["graph_evaluation"]["reversed_edges"]) for row in directional),
            "abstention_rate": _ratio(sum(bool(row["graph_evaluation"]["abstained"]) for row in directional), len(directional)),
        },
        "false_edge_discovery_rate": false_discovery,
        "moderate_strong_edge_detection_rate": _ratio(strong_detected, strong_total),
        "parametric_branching_coverage": parametric["coverage"],
        "near_critical_accuracy": near_critical_accuracy,
        "false_near_critical_alarm_rate": false_critical,
        "latent_common_shock_false_ab_edge_rate": latent_false_ab,
        "residual_calibration_rate": residual_rate,
    })


def _capability_result(metrics: Mapping[str, Any]) -> dict[str, Any]:
    graph = metrics["graph"]
    gates = {
        "false_edge_discovery": float(metrics["false_edge_discovery_rate"] or 0.0) <= 0.05,
        "moderate_strong_detection": float(metrics["moderate_strong_edge_detection_rate"] or 0.0) >= 0.80,
        "parametric_branching_coverage": float(metrics["parametric_branching_coverage"] or 0.0) >= 0.85,
        "directional_precision": float(graph["precision"] or 0.0) >= 0.90,
        "directional_recall": float(graph["recall"] or 0.0) >= 0.80,
        "near_critical_accuracy": float(metrics["near_critical_accuracy"] or 0.0) >= 0.80,
        "false_near_critical_alarms": float(metrics["false_near_critical_alarm_rate"] or 0.0) <= 0.05,
        "latent_common_shock_resistance": float(metrics["latent_common_shock_false_ab_edge_rate"] or 0.0) <= 0.05,
        "residual_calibration": float(metrics["residual_calibration_rate"] or 0.0) >= 0.75,
        "numerical_stability": int(metrics["numerical_failures"]) <= 2,
    }
    structural_keys = ("false_edge_discovery", "moderate_strong_detection", "directional_precision", "directional_recall", "latent_common_shock_resistance")
    structural_passes = sum(bool(gates[key]) for key in structural_keys)
    structural_status = "SUPPORTED" if structural_passes == len(structural_keys) else "PARTIALLY_CHARACTERIZED" if structural_passes >= 2 else "UNRESOLVED"
    status = "SYNTHETIC_CERTIFICATION_SUPPORTED" if all(gates.values()) else "PARTIALLY_CHARACTERIZED" if sum(gates.values()) >= 4 else "INSTRUMENT_REJECTED"
    return {
        "status": status,
        "promotion_gates": gates,
        "capability_vector": {
            "STRUCTURAL_IDENTIFIABILITY": {"tested": True, "status": structural_status},
            "PROCESS_CALIBRATION": {"tested": True, "status": "SUPPORTED" if gates["residual_calibration"] else "UNRESOLVED"},
            "PREDICTIVE_VALIDITY": {"tested": False, "status": "NOT_TESTED"},
            "ECONOMIC_UTILITY": {"tested": False, "status": "NOT_TESTED"},
            "CAUSAL_IDENTIFICATION": {"tested": False, "status": "NOT_ESTABLISHED"},
        },
        "scalar_score": None,
    }


def _observatory(worlds: Sequence[Mapping[str, Any]], metrics: Mapping[str, Any]) -> dict[str, Any]:
    representative_ids = {
        "univariate_eta_0.40_moderate_v0",
        "univariate_eta_0.92_rich_v0",
        "direction_a_to_b_weak_limited_v0",
        "direction_a_to_b_strong_moderate_v0",
        "direction_bidirectional_asymmetric_rich_v0",
        "direction_observed_z_moderate_v0",
        "critical_rho_0.93_moderate_v0",
        "critical_rho_0.99_rich_v0",
        "control_latent_common_shock_v0",
        "control_seasonal_poisson_v0",
    }
    representatives = []
    for row in worlds:
        if row["world"]["world_id"] not in representative_ids:
            continue
        representatives.append({
            "world": {key: row["world"][key] for key in ("world_id", "family", "regime", "information_regime", "channels", "event_counts", "world_hash")},
            "truth": row["truth"],
            "fit": {key: row["fit"][key] for key in ("baseline", "branching_matrix", "beta", "spectral_radius", "optimizer")},
            "uncertainty": row["uncertainty"],
            "graph_evaluation": row["graph_evaluation"],
            "residual_diagnostics": row["residual_diagnostics"],
        })
    calibration = []
    for rho in (0.70, 0.85, 0.93, 0.97, 0.99):
        selected = [row for row in worlds if row["world"]["family"] == "NEAR_CRITICAL_RECOVERY" and math.isclose(float(row["truth"]["spectral_radius"]), rho, abs_tol=1e-6)]
        calibration.append({"truth": rho, "mean_estimate": _mean([float(row["fit"]["spectral_radius"]) for row in selected]), "rmse": math.sqrt(float(np.mean([(float(row["fit"]["spectral_radius"]) - rho) ** 2 for row in selected])))})
    return {"representative_worlds": representatives, "spectral_radius_calibration": _round(calibration), "interval_coverage": metrics["uncertainty_methods"], "direction_frontier": _direction_frontier(worlds)}


def _parent_seal() -> dict[str, Any]:
    raw = PARENT_ARTIFACT.read_bytes()
    file_hash = hashlib.sha256(raw).hexdigest()
    if file_hash != PARENT_FILE_SHA256:
        raise HawkesIdentifiabilityError("frozen D0.4 parent bytes changed")
    parent = json.loads(raw.decode("utf-8"))
    claimed = parent.get("artifact_hash")
    payload = dict(parent)
    payload.pop("artifact_hash", None)
    calculated = canonical_sha256(payload)
    if claimed != PARENT_CANONICAL_HASH or calculated != PARENT_CANONICAL_HASH:
        raise HawkesIdentifiabilityError("frozen D0.4 canonical hash changed")
    parent_seeds = sorted(int(row["world"]["seed"]) for row in parent["worlds"])
    child_seeds = {spec.seed for spec in WORLD_SPECS}
    if child_seeds.intersection(parent_seeds):
        raise HawkesIdentifiabilityError("D0.4.1 seed registry overlaps D0.4")
    return {
        "commit": PARENT_COMMIT,
        "artifact": PARENT_ARTIFACT.relative_to(ROOT).as_posix(),
        "canonical_hash": calculated,
        "file_sha256": file_hash,
        "parent_seeds": parent_seeds,
        "seed_overlap": [],
    }


def run_hawkes_identifiability(*, workers: int = 8) -> dict[str, Any]:
    """Execute the preregistered suite once without reading D0.4 results for tuning."""

    parent = _parent_seal()
    if workers <= 1:
        worlds = [_world_record(spec) for spec in WORLD_SPECS]
    else:
        with ProcessPoolExecutor(max_workers=workers) as executor:
            worlds = list(executor.map(_world_record, WORLD_SPECS, chunksize=1))
    metrics = _suite_metrics(worlds)
    result = _capability_result(metrics)
    artifact: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "milestone": "D0.4.1",
        "program": "HAWKES_UNCERTAINTY_AND_EDGE_IDENTIFIABILITY",
        "frozen": True,
        "scientific_question": "When are Hawkes branching strength and edge direction structurally identifiable, and are their uncertainty statements calibrated?",
        "parent_seal": parent,
        "preregistration": {
            "path": "docs/dynamics-lab-d0-4-1-preregistration.md",
            "source_sha256": normalized_source_sha256(ROOT / "docs/dynamics-lab-d0-4-1-preregistration.md"),
            "worlds": 420,
            "seed_range": [41001, 41420],
            "d0_4_worlds_used_for_tuning": 0,
        },
        "execution": {
            "worlds_planned": 420,
            "worlds_executed": len(worlds),
            "audit_worlds": sum(spec.audit for spec in WORLD_SPECS),
            "information_regimes": [{"name": name, "target_events": target} for name, target in INFO_REGIMES],
            "attribution_bootstrap_repetitions": ATTRIBUTION_REPETITIONS,
            "parametric_bootstrap_repetitions": PARAMETRIC_REPETITIONS,
            "profile_likelihood_cutoff": PROFILE_CUTOFF,
            "continuous_event_time": True,
            "arbitrary_bar_discretization": False,
        },
        "thresholds": {
            "edge_support_lower_bound": EDGE_THRESHOLD,
            "stability_barrier": STABILITY_BARRIER,
            "near_critical_truth": 0.93,
            "near_critical_estimate": 0.90,
            "direction_frontier_exact_graph_rate": 0.80,
            "interval_nominal_coverage": 0.95,
        },
        "registry": [_round(asdict(spec)) for spec in WORLD_SPECS],
        "worlds": worlds,
        "metrics": metrics,
        "program_result": result,
        "observatory": _observatory(worlds, metrics),
        "claim_boundary": {
            "structural_identifiability_tested": True,
            "predictive_validity_tested": False,
            "economic_utility_tested": False,
            "causal_identification_tested": False,
            "causal_claim_eligible": False,
            "market_claim_eligible": False,
            "edge_semantics": "conditional temporal excitation in a frozen synthetic observation system",
        },
        "implementation_sources": {
            path.relative_to(ROOT).as_posix(): normalized_source_sha256(path)
            for path in IMPLEMENTATION_SOURCES
        },
    }
    artifact = _round(artifact)
    artifact["artifact_hash"] = canonical_sha256(artifact)
    return artifact


def load_frozen_hawkes_identifiability(
    path: str | Path = DEFAULT_D041_ARTIFACT,
) -> dict[str, Any]:
    target = Path(path)
    if not target.exists():
        raise HawkesIdentifiabilityError(f"frozen D0.4.1 artifact is missing: {target}")
    try:
        artifact = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HawkesIdentifiabilityError(f"unable to read frozen D0.4.1 artifact: {exc}") from exc
    from src.dynamics.hawkes_identifiability_verifier import verify_hawkes_identifiability

    report = verify_hawkes_identifiability(artifact)
    if not report["valid"]:
        raise HawkesIdentifiabilityError("; ".join(report["errors"]))
    artifact["file_sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
    return artifact
