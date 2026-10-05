"""Deterministic D0.4 Hawkes event-process certification laboratory.

The module operates on continuous event timestamps. It never bins events into
price bars, never emits a market claim, and never interprets a fitted edge as
economic causation. The frozen suite asks whether conditional excitation can
be separated from ordinary arrival noise and known clustering confounders.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

import numpy as np
from scipy.integrate import quad
from scipy.optimize import minimize
from scipy.stats import kstest

from src.dynamics.selection_freeze import canonical_sha256

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D04_ARTIFACT = ROOT / "eval/dynamics/d0_4/hawkes_certification.json"
IMPLEMENTATION_SOURCES = (
    ROOT / "src/dynamics/hawkes_certification.py",
    ROOT / "src/dynamics/hawkes_verifier.py",
)
SCHEMA_VERSION = "dynamics-hawkes-certification/0.4"
TRAIN_FRACTION = 0.70
BOOTSTRAP_REPETITIONS = 64
MIN_EVENTS = 32
MAX_SPECTRAL_RADIUS = 0.98
DETECTION_GAIN_PER_EVENT = 0.010
EDGE_SUPPORT_THRESHOLD = 0.035
CALIBRATION_PVALUE = 0.01
RESIDUAL_AUTOCORRELATION_LIMIT = 0.25


class HawkesCertificationError(RuntimeError):
    """Raised when a frozen event-process artifact fails closed."""


def normalized_source_sha256(path: Path) -> str:
    """Hash source text independent of the checkout's configured line endings."""

    normalized = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class WorldSpec:
    world_id: str
    label: str
    role: str
    seed: int
    dimension: int
    horizon: float
    generator: str
    expected: str
    baseline: tuple[float, ...]
    alpha: tuple[tuple[float, ...], ...]
    beta: tuple[tuple[float, ...], ...]
    notes: str


WORLD_SPECS: tuple[WorldSpec, ...] = (
    WorldSpec(
        "homogeneous_poisson",
        "Homogeneous Poisson",
        "negative_control",
        401,
        1,
        80.0,
        "homogeneous_poisson",
        "REJECT",
        (1.8,),
        ((0.0,),),
        ((1.4,),),
        "Memoryless arrival noise must not be called self-excitation.",
    ),
    WorldSpec(
        "seasonal_poisson",
        "Intraday / seasonal Poisson",
        "seasonality_control",
        409,
        1,
        80.0,
        "seasonal_poisson",
        "REJECT",
        (1.8,),
        ((0.0,),),
        ((1.4,),),
        "A periodic baseline must explain periodic clustering before Hawkes is admitted.",
    ),
    WorldSpec(
        "weak_hawkes",
        "Weak Hawkes",
        "positive_control",
        419,
        1,
        100.0,
        "hawkes",
        "DETECT_OR_ABSTAIN",
        (1.45,),
        ((0.18,),),
        ((1.50,),),
        "Weak excitation may be detected or rejected as non-identifiable.",
    ),
    WorldSpec(
        "moderate_hawkes",
        "Moderate Hawkes",
        "positive_control",
        421,
        1,
        80.0,
        "hawkes",
        "DETECT",
        (1.30,),
        ((0.60,),),
        ((1.50,),),
        "Stationary excitation with branching ratio 0.40.",
    ),
    WorldSpec(
        "near_critical_hawkes",
        "Near-critical Hawkes",
        "near_critical_control",
        431,
        1,
        45.0,
        "hawkes",
        "DETECT",
        (0.52,),
        ((1.20,),),
        ((1.45,),),
        "Detect excitation and report proximity to instability.",
    ),
    WorldSpec(
        "clustered_renewal",
        "Clustered renewal process",
        "misspecification_control",
        433,
        1,
        80.0,
        "clustered_renewal",
        "REJECT_OR_ABSTAIN",
        (1.7,),
        ((0.0,),),
        ((1.4,),),
        "Renewal clustering is not automatically Hawkes excitation.",
    ),
    WorldSpec(
        "refractory_process",
        "Refractory process",
        "misspecification_control",
        439,
        1,
        80.0,
        "refractory",
        "REJECT",
        (2.0,),
        ((0.0,),),
        ((1.4,),),
        "A minimum waiting time contradicts a self-exciting kernel.",
    ),
    WorldSpec(
        "exogenous_bursts",
        "Exogenous burst process",
        "exogenous_control",
        443,
        1,
        80.0,
        "exogenous_bursts",
        "REJECT_OR_ABSTAIN",
        (1.2,),
        ((0.0,),),
        ((1.4,),),
        "Known external burst windows must remain baseline intensity.",
    ),
    WorldSpec(
        "independent_streams",
        "Two independent streams",
        "cross_negative_control",
        449,
        2,
        80.0,
        "multivariate_hawkes",
        "REJECT",
        (1.20, 1.05),
        ((0.0, 0.0), (0.0, 0.0)),
        ((1.60, 1.60), (1.60, 1.60)),
        "Independent streams must not produce a directed cross-edge.",
    ),
    WorldSpec(
        "directed_cross_excitation",
        "Directed A to B Hawkes",
        "cross_positive_control",
        457,
        2,
        80.0,
        "multivariate_hawkes",
        "DETECT",
        (1.00, 0.90),
        ((0.15, 0.0), (0.63, 0.12)),
        ((1.50, 1.50), (1.50, 1.50)),
        "Recover conditional temporal excitation from stream A into stream B.",
    ),
    WorldSpec(
        "bidirectional_excitation",
        "Bidirectional Hawkes",
        "cross_positive_control",
        461,
        2,
        80.0,
        "multivariate_hawkes",
        "DETECT",
        (0.95, 0.95),
        ((0.15, 0.42), (0.36, 0.15)),
        ((1.50, 1.50), (1.50, 1.50)),
        "Recover both conditional excitation directions without a causal claim.",
    ),
    WorldSpec(
        "common_shock",
        "Common-cause Z to A and B",
        "common_shock_control",
        463,
        2,
        80.0,
        "common_shock",
        "ABSTAIN",
        (0.85, 0.80),
        ((0.0, 0.0), (0.0, 0.0)),
        ((1.50, 1.50), (1.50, 1.50)),
        "Shared external shocks must not become an A-to-B causal statement.",
    ),
)


def _round(value: Any, digits: int = 10) -> Any:
    if isinstance(value, (float, np.floating)):
        number = float(value)
        if not math.isfinite(number):
            return None
        return round(number, digits)
    if isinstance(value, np.ndarray):
        return _round(value.tolist(), digits)
    if isinstance(value, Mapping):
        return {str(key): _round(item, digits) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_round(item, digits) for item in value]
    return value


def _poisson_times(
    rng: np.random.Generator, rate: float, start: float, end: float
) -> list[float]:
    events: list[float] = []
    current = start
    while True:
        current += float(rng.exponential(1.0 / rate))
        if current >= end:
            break
        events.append(current)
    return events


def _thinned_poisson(
    rng: np.random.Generator,
    intensity: Callable[[float], float],
    maximum: float,
    start: float,
    end: float,
) -> list[float]:
    events: list[float] = []
    current = start
    while True:
        current += float(rng.exponential(1.0 / maximum))
        if current >= end:
            break
        if rng.random() <= intensity(current) / maximum:
            events.append(current)
    return events


def simulate_exponential_hawkes(
    *,
    baseline: Sequence[float],
    alpha: Sequence[Sequence[float]],
    beta: Sequence[Sequence[float]],
    horizon: float,
    seed: int,
) -> list[list[float]]:
    """Simulate a small multivariate exponential Hawkes process with Ogata thinning."""

    mu = np.asarray(baseline, dtype=float)
    a = np.asarray(alpha, dtype=float)
    b = np.asarray(beta, dtype=float)
    dimension = len(mu)
    events: list[list[float]] = [[] for _ in range(dimension)]
    rng = np.random.default_rng(seed)
    current = 0.0
    while current < horizon:
        intensity_now = mu.copy()
        for target in range(dimension):
            for source in range(dimension):
                if not events[source] or a[target, source] <= 0.0:
                    continue
                source_events = np.asarray(events[source], dtype=float)
                intensity_now[target] += float(
                    np.sum(
                        a[target, source]
                        * np.exp(-b[target, source] * (current - source_events))
                    )
                )
        upper = float(np.sum(intensity_now))
        if upper <= 0.0 or not math.isfinite(upper):
            break
        candidate = current + float(rng.exponential(1.0 / upper))
        if candidate >= horizon:
            break
        candidate_intensity = mu.copy()
        for target in range(dimension):
            for source in range(dimension):
                if not events[source] or a[target, source] <= 0.0:
                    continue
                source_events = np.asarray(events[source], dtype=float)
                candidate_intensity[target] += float(
                    np.sum(
                        a[target, source]
                        * np.exp(-b[target, source] * (candidate - source_events))
                    )
                )
        total = float(np.sum(candidate_intensity))
        current = candidate
        if rng.random() * upper > total:
            continue
        draw = rng.random() * total
        cumulative = 0.0
        for channel, value in enumerate(candidate_intensity):
            cumulative += float(value)
            if draw <= cumulative:
                events[channel].append(candidate)
                break
    return events


def _world_events(spec: WorldSpec) -> tuple[list[list[float]], dict[str, Any]]:
    rng = np.random.default_rng(spec.seed)
    metadata: dict[str, Any] = {}
    if spec.generator == "homogeneous_poisson":
        return [_poisson_times(rng, spec.baseline[0], 0.0, spec.horizon)], metadata
    if spec.generator == "seasonal_poisson":
        period = 10.0
        amplitude = 0.72
        intensity = lambda time: spec.baseline[0] * (
            1.0 + amplitude * math.sin(2.0 * math.pi * time / period)
        )
        metadata.update({"seasonal_period": period, "seasonal_amplitude": amplitude})
        return [
            _thinned_poisson(
                rng,
                intensity,
                spec.baseline[0] * (1.0 + amplitude),
                0.0,
                spec.horizon,
            )
        ], metadata
    if spec.generator in {"hawkes", "multivariate_hawkes"}:
        return (
            simulate_exponential_hawkes(
                baseline=spec.baseline,
                alpha=spec.alpha,
                beta=spec.beta,
                horizon=spec.horizon,
                seed=spec.seed,
            ),
            metadata,
        )
    if spec.generator == "clustered_renewal":
        events: list[float] = []
        current = 0.0
        shape = 0.58
        scale = (1.0 / spec.baseline[0]) / math.gamma(1.0 + 1.0 / shape)
        while True:
            current += float(rng.weibull(shape) * scale)
            if current >= spec.horizon:
                break
            events.append(current)
        metadata.update({"renewal_family": "weibull", "shape": shape, "scale": scale})
        return [events], metadata
    if spec.generator == "refractory":
        events: list[float] = []
        current = 0.0
        refractory = 0.24
        while True:
            current += refractory + float(rng.exponential(1.0 / spec.baseline[0]))
            if current >= spec.horizon:
                break
            events.append(current)
        metadata["refractory_period"] = refractory
        return [events], metadata
    if spec.generator == "exogenous_bursts":
        windows = [(18.0, 21.0), (48.0, 51.0), (68.0, 71.0)]
        intensity = lambda time: (
            5.4 if any(left <= time < right for left, right in windows) else 1.0
        )
        metadata["exogenous_windows"] = windows
        return [_thinned_poisson(rng, intensity, 5.4, 0.0, spec.horizon)], metadata
    if spec.generator == "common_shock":
        streams = [
            _poisson_times(rng, spec.baseline[channel], 0.0, spec.horizon)
            for channel in range(2)
        ]
        shocks = _poisson_times(rng, 0.34, 0.0, spec.horizon)
        for shock in shocks:
            streams[0].append(shock)
            streams[1].append(shock)
        streams = [sorted(stream) for stream in streams]
        metadata.update({"common_shock_events": shocks, "common_shock_observed": True})
        return streams, metadata
    raise HawkesCertificationError(f"unknown D0.4 generator: {spec.generator}")


def branching_matrix(
    alpha: Sequence[Sequence[float]], beta: Sequence[Sequence[float]]
) -> np.ndarray:
    a = np.asarray(alpha, dtype=float)
    b = np.asarray(beta, dtype=float)
    if a.shape != b.shape or np.any(b <= 0.0):
        raise HawkesCertificationError(
            "alpha and beta must be aligned positive matrices"
        )
    return a / b


def spectral_radius(matrix: Sequence[Sequence[float]]) -> float:
    values = np.linalg.eigvals(np.asarray(matrix, dtype=float))
    return float(np.max(np.abs(values))) if values.size else 0.0


def exact_hawkes_log_likelihood(
    events: Sequence[Sequence[float]],
    baseline: Sequence[float],
    alpha: Sequence[Sequence[float]],
    beta: Sequence[Sequence[float]],
    *,
    start: float,
    end: float,
) -> float:
    """Evaluate the continuous-time multivariate exponential Hawkes likelihood."""

    mu = np.asarray(baseline, dtype=float)
    a = np.asarray(alpha, dtype=float)
    b = np.asarray(beta, dtype=float)
    dimension = len(mu)
    if a.shape != (dimension, dimension) or b.shape != (dimension, dimension):
        raise HawkesCertificationError("Hawkes parameter dimensions do not reconcile")
    if np.any(mu <= 0.0) or np.any(a < 0.0) or np.any(b <= 0.0):
        return float("-inf")
    log_intensity = 0.0
    for target in range(dimension):
        for event in events[target]:
            if event < start or event >= end:
                continue
            intensity = float(mu[target])
            for source in range(dimension):
                history = np.asarray(
                    [time for time in events[source] if time < event], dtype=float
                )
                if history.size:
                    intensity += float(
                        np.sum(
                            a[target, source]
                            * np.exp(-b[target, source] * (event - history))
                        )
                    )
            if intensity <= 0.0 or not math.isfinite(intensity):
                return float("-inf")
            log_intensity += math.log(intensity)
    compensator = float(np.sum(mu) * (end - start))
    for target in range(dimension):
        for source in range(dimension):
            if a[target, source] <= 0.0:
                continue
            for event in events[source]:
                if event >= end:
                    break
                lower = max(start, event)
                compensator += (a[target, source] / b[target, source]) * (
                    math.exp(-b[target, source] * (lower - event))
                    - math.exp(-b[target, source] * (end - event))
                )
    return float(log_intensity - compensator)


def homogeneous_poisson_log_likelihood(
    events: Sequence[Sequence[float]],
    rates: Sequence[float],
    *,
    start: float,
    end: float,
) -> float:
    duration = end - start
    result = 0.0
    for channel, rate in enumerate(rates):
        if rate <= 0.0:
            return float("-inf")
        count = sum(start <= event < end for event in events[channel])
        result += count * math.log(rate) - rate * duration
    return float(result)


def weibull_renewal_log_likelihood(
    events: Sequence[float],
    shape: float,
    scale: float,
    *,
    start: float,
    end: float,
) -> float:
    """Evaluate a continuous-time Weibull renewal likelihood with censoring."""

    if shape <= 0.0 or scale <= 0.0 or end <= start:
        return float("-inf")
    history = [float(event) for event in events if event < start]
    previous = history[-1] if history else 0.0
    age_at_start = max(0.0, start - previous)
    result = (age_at_start / scale) ** shape
    observed = [float(event) for event in events if start <= event < end]
    for event in observed:
        gap = event - previous
        if gap <= 0.0:
            return float("-inf")
        result += (
            math.log(shape)
            - math.log(scale)
            + (shape - 1.0) * math.log(gap / scale)
            - (gap / scale) ** shape
        )
        previous = event
    result -= ((end - previous) / scale) ** shape
    return float(result)


def _decode_parameters(
    vector: np.ndarray, dimension: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    cursor = dimension
    mu = np.exp(vector[:cursor])
    alpha_count = dimension * dimension
    alpha = np.exp(vector[cursor : cursor + alpha_count]).reshape(dimension, dimension)
    beta_value = math.exp(float(vector[-1]))
    beta = np.full((dimension, dimension), beta_value, dtype=float)
    return mu, alpha, beta


def _optimizer_covariance(
    result: Any, size: int
) -> tuple[np.ndarray | None, float | None]:
    try:
        inverse = (
            result.hess_inv.todense()
            if hasattr(result.hess_inv, "todense")
            else result.hess_inv
        )
        covariance = np.asarray(inverse, dtype=float).reshape(size, size)
        condition = float(np.linalg.cond(covariance))
        if not np.all(np.isfinite(covariance)):
            return None, None
        return covariance, condition
    except (AttributeError, TypeError, ValueError, np.linalg.LinAlgError):
        return None, None


def fit_exponential_hawkes(
    events: Sequence[Sequence[float]], *, train_end: float, seed: int
) -> dict[str, Any]:
    """Fit a one- or two-dimensional exponential Hawkes model deterministically."""

    dimension = len(events)
    if dimension not in {1, 2}:
        raise HawkesCertificationError("D0.4 supports one- or two-dimensional systems")
    counts = np.asarray(
        [
            max(1, sum(0.0 <= event < train_end for event in stream))
            for stream in events
        ],
        dtype=float,
    )
    empirical_rates = counts / train_end
    bounds = [(-7.0, 4.0)] * dimension
    bounds += [(-8.0, 1.4)] * (dimension * dimension)
    bounds += [(-2.3, 2.3)]

    def objective(vector: np.ndarray) -> float:
        mu, alpha, beta = _decode_parameters(vector, dimension)
        rho = spectral_radius(branching_matrix(alpha, beta))
        if rho >= 0.995:
            return 1_000_000.0 + 1_000_000.0 * (rho - 0.995) ** 2
        likelihood = exact_hawkes_log_likelihood(
            events,
            mu,
            alpha,
            beta,
            start=0.0,
            end=train_end,
        )
        if not math.isfinite(likelihood):
            return 1_000_000.0
        return -likelihood

    starts: list[np.ndarray] = []
    for eta, beta_value in ((0.08, 0.8), (0.24, 1.5), (0.55, 2.4)):
        mu = np.maximum(empirical_rates * (1.0 - eta), 1e-3)
        alpha = np.full((dimension, dimension), eta * beta_value / max(dimension, 1))
        if dimension == 2:
            alpha[0, 1] *= 0.75
            alpha[1, 0] *= 1.25
        starts.append(
            np.concatenate(
                [
                    np.log(mu),
                    np.log(np.maximum(alpha, 1e-6)).ravel(),
                    [math.log(beta_value)],
                ]
            )
        )

    results = [
        minimize(
            objective,
            start,
            method="L-BFGS-B",
            bounds=bounds,
            options={"maxiter": 260, "ftol": 1e-11, "gtol": 1e-7, "maxls": 30},
        )
        for start in starts
    ]
    result = min(results, key=lambda item: float(item.fun))
    mu, alpha, beta = _decode_parameters(np.asarray(result.x, dtype=float), dimension)
    matrix = branching_matrix(alpha, beta)
    rho = spectral_radius(matrix)
    covariance, covariance_condition = _optimizer_covariance(result, len(result.x))
    transformed_se = (
        np.sqrt(np.maximum(np.diag(covariance), 0.0))
        if covariance is not None
        else None
    )
    beta_se = (
        float(transformed_se[-1] * beta[0, 0]) if transformed_se is not None else None
    )
    identifiable = bool(
        result.success
        and covariance_condition is not None
        and covariance_condition < 1e10
        and int(np.sum(counts)) >= MIN_EVENTS * dimension
        and rho < MAX_SPECTRAL_RADIUS
    )
    return {
        "baseline": mu,
        "alpha": alpha,
        "beta": beta,
        "branching_matrix": matrix,
        "spectral_radius": rho,
        "optimizer": {
            "method": "L-BFGS-B deterministic multi-start",
            "success": bool(result.success),
            "status": int(result.status),
            "message": str(result.message),
            "iterations": int(getattr(result, "nit", 0)),
            "function_evaluations": int(getattr(result, "nfev", 0)),
            "objective": float(result.fun),
            "starts": len(starts),
        },
        "identifiability": {
            "identifiable": identifiable,
            "event_count": int(np.sum(counts)),
            "parameters": int(len(result.x)),
            "events_per_parameter": float(np.sum(counts) / len(result.x)),
            "inverse_hessian_condition": covariance_condition,
        },
        "transformed_standard_errors": transformed_se,
        "beta_standard_error": beta_se,
    }


def _seasonal_rate(
    parameters: Sequence[float], time: float, period: float = 10.0
) -> float:
    intercept, sine, cosine = parameters
    phase = 2.0 * math.pi * time / period
    return math.exp(intercept + sine * math.sin(phase) + cosine * math.cos(phase))


def seasonal_poisson_log_likelihood(
    events: Sequence[Sequence[float]],
    parameters: Sequence[Sequence[float]],
    *,
    start: float,
    end: float,
    period: float = 10.0,
) -> float:
    result = 0.0
    for channel, stream in enumerate(events):
        vector = parameters[channel]
        result += sum(
            math.log(_seasonal_rate(vector, event, period))
            for event in stream
            if start <= event < end
        )
        integral = quad(
            lambda time: _seasonal_rate(vector, time, period),
            start,
            end,
            epsabs=1e-9,
            epsrel=1e-9,
            limit=100,
        )[0]
        result -= float(integral)
    return float(result)


def _fit_baselines(
    events: Sequence[Sequence[float]],
    *,
    train_end: float,
    horizon: float,
    metadata: Mapping[str, Any],
) -> list[dict[str, Any]]:
    rates = [
        max(sum(event < train_end for event in stream) / train_end, 1e-6)
        for stream in events
    ]
    candidates: list[dict[str, Any]] = [
        {
            "model": "homogeneous_poisson",
            "parameters": {"rates": rates},
            "train_log_likelihood": homogeneous_poisson_log_likelihood(
                events, rates, start=0.0, end=train_end
            ),
            "oos_log_likelihood": homogeneous_poisson_log_likelihood(
                events, rates, start=train_end, end=horizon
            ),
        }
    ]
    seasonal_parameters: list[list[float]] = []
    for channel, stream in enumerate(events):
        channel_events = [stream]

        def objective(vector: np.ndarray) -> float:
            return -seasonal_poisson_log_likelihood(
                channel_events, [vector], start=0.0, end=train_end
            )

        fit = minimize(
            objective,
            np.asarray([math.log(rates[channel]), 0.1, 0.0]),
            method="L-BFGS-B",
            bounds=[(-7.0, 4.0), (-2.0, 2.0), (-2.0, 2.0)],
            options={"maxiter": 180, "ftol": 1e-12},
        )
        seasonal_parameters.append([float(value) for value in fit.x])
    candidates.append(
        {
            "model": "seasonal_poisson_fourier",
            "parameters": {"period": 10.0, "coefficients": seasonal_parameters},
            "train_log_likelihood": seasonal_poisson_log_likelihood(
                events, seasonal_parameters, start=0.0, end=train_end
            ),
            "oos_log_likelihood": seasonal_poisson_log_likelihood(
                events, seasonal_parameters, start=train_end, end=horizon
            ),
        }
    )
    if len(events) == 1:

        def renewal_objective(vector: np.ndarray) -> float:
            return -weibull_renewal_log_likelihood(
                events[0],
                math.exp(float(vector[0])),
                math.exp(float(vector[1])),
                start=0.0,
                end=train_end,
            )

        gaps = np.diff(
            np.asarray([0.0, *[event for event in events[0] if event < train_end]])
        )
        initial_scale = max(float(np.mean(gaps)) if gaps.size else 1.0 / rates[0], 1e-4)
        renewal_fit = minimize(
            renewal_objective,
            np.asarray([0.0, math.log(initial_scale)]),
            method="L-BFGS-B",
            bounds=[(-2.3, 2.3), (-6.0, 4.0)],
            options={"maxiter": 180, "ftol": 1e-12},
        )
        renewal_shape = math.exp(float(renewal_fit.x[0]))
        renewal_scale = math.exp(float(renewal_fit.x[1]))
        candidates.append(
            {
                "model": "weibull_renewal",
                "parameters": {"shape": renewal_shape, "scale": renewal_scale},
                "train_log_likelihood": weibull_renewal_log_likelihood(
                    events[0], renewal_shape, renewal_scale, start=0.0, end=train_end
                ),
                "oos_log_likelihood": weibull_renewal_log_likelihood(
                    events[0],
                    renewal_shape,
                    renewal_scale,
                    start=train_end,
                    end=horizon,
                ),
            }
        )
    windows = metadata.get("exogenous_windows")
    if isinstance(windows, list) and len(events) == 1:
        train_windows = [
            (max(0.0, float(left)), min(train_end, float(right)))
            for left, right in windows
            if float(left) < train_end and float(right) > 0.0
        ]
        exposure = sum(max(0.0, right - left) for left, right in train_windows)
        inside = sum(
            any(left <= event < right for left, right in train_windows)
            for event in events[0]
            if event < train_end
        )
        outside = sum(event < train_end for event in events[0]) - inside
        inside_rate = max(inside / max(exposure, 1e-9), 1e-6)
        outside_rate = max(outside / max(train_end - exposure, 1e-9), 1e-6)

        def log_likelihood(start: float, end: float) -> float:
            clipped = [
                (max(start, float(left)), min(end, float(right)))
                for left, right in windows
                if float(left) < end and float(right) > start
            ]
            inside_exposure = sum(max(0.0, right - left) for left, right in clipped)
            inside_count = sum(
                start <= event < end
                and any(left <= event < right for left, right in clipped)
                for event in events[0]
            )
            total = sum(start <= event < end for event in events[0])
            return float(
                inside_count * math.log(inside_rate)
                + (total - inside_count) * math.log(outside_rate)
                - inside_rate * inside_exposure
                - outside_rate * ((end - start) - inside_exposure)
            )

        candidates.append(
            {
                "model": "exogenous_window_poisson",
                "parameters": {
                    "inside_rate": inside_rate,
                    "outside_rate": outside_rate,
                    "windows": windows,
                },
                "train_log_likelihood": log_likelihood(0.0, train_end),
                "oos_log_likelihood": log_likelihood(train_end, horizon),
            }
        )
    return candidates


def time_rescaling_residuals(
    events: Sequence[Sequence[float]],
    baseline: Sequence[float],
    alpha: Sequence[Sequence[float]],
    beta: Sequence[Sequence[float]],
    *,
    start: float,
    end: float,
) -> list[float]:
    """Return exact integrated-intensity intervals for events inside a window."""

    mu = np.asarray(baseline, dtype=float)
    a = np.asarray(alpha, dtype=float)
    b = np.asarray(beta, dtype=float)
    residuals: list[float] = []
    for target, stream in enumerate(events):
        previous = start
        for event in stream:
            if event < start:
                continue
            if event >= end:
                break
            integrated = float(mu[target] * (event - previous))
            for source, history in enumerate(events):
                for parent in history:
                    if parent >= event:
                        break
                    lower = max(previous, parent)
                    integrated += (a[target, source] / b[target, source]) * (
                        math.exp(-b[target, source] * (lower - parent))
                        - math.exp(-b[target, source] * (event - parent))
                    )
            if integrated > 0.0 and math.isfinite(integrated):
                residuals.append(integrated)
            previous = event
    return residuals


def _residual_diagnostics(residuals: Sequence[float]) -> dict[str, Any]:
    values = np.asarray(residuals, dtype=float)
    if values.size < 8:
        return {
            "count": int(values.size),
            "ks_statistic": None,
            "ks_pvalue": None,
            "lag1_autocorrelation": None,
            "calibrated": False,
        }
    ks = kstest(values, "expon")
    if (
        values.size > 2
        and float(np.std(values[:-1])) > 0.0
        and float(np.std(values[1:])) > 0.0
    ):
        autocorrelation = float(np.corrcoef(values[:-1], values[1:])[0, 1])
    else:
        autocorrelation = 0.0
    calibrated = bool(
        float(ks.pvalue) >= CALIBRATION_PVALUE
        and abs(autocorrelation) <= RESIDUAL_AUTOCORRELATION_LIMIT
    )
    return {
        "count": int(values.size),
        "mean": float(np.mean(values)),
        "variance": float(np.var(values)),
        "ks_statistic": float(ks.statistic),
        "ks_pvalue": float(ks.pvalue),
        "lag1_autocorrelation": autocorrelation,
        "calibrated": calibrated,
    }


def _coincidence_rate(
    events: Sequence[Sequence[float]], tolerance: float = 1e-10
) -> float:
    if len(events) != 2 or not events[0] or not events[1]:
        return 0.0
    right = np.asarray(events[1], dtype=float)
    coincidences = 0
    for event in events[0]:
        index = int(np.searchsorted(right, event))
        candidates = right[max(0, index - 1) : min(len(right), index + 2)]
        if candidates.size and float(np.min(np.abs(candidates - event))) <= tolerance:
            coincidences += 1
    return float(coincidences / min(len(events[0]), len(events[1])))


def _branching_uncertainty(
    events: Sequence[Sequence[float]],
    fit: Mapping[str, Any],
    *,
    train_end: float,
    seed: int,
) -> dict[str, Any]:
    mu = np.asarray(fit["baseline"], dtype=float)
    alpha = np.asarray(fit["alpha"], dtype=float)
    beta = np.asarray(fit["beta"], dtype=float)
    dimension = len(events)
    contributions: list[list[np.ndarray]] = [[] for _ in range(dimension)]
    for target, stream in enumerate(events):
        for event in stream:
            if event >= train_end:
                break
            by_source = np.zeros(dimension, dtype=float)
            for source, history in enumerate(events):
                parents = np.asarray(
                    [parent for parent in history if parent < event], dtype=float
                )
                if parents.size:
                    by_source[source] = float(
                        np.sum(
                            alpha[target, source]
                            * np.exp(-beta[target, source] * (event - parents))
                        )
                    )
            intensity = float(mu[target] + np.sum(by_source))
            if intensity > 0.0:
                contributions[target].append(by_source / intensity)
    source_counts = np.asarray(
        [max(1, sum(event < train_end for event in stream)) for stream in events],
        dtype=float,
    )
    rng = np.random.default_rng(seed)
    samples = np.zeros((BOOTSTRAP_REPETITIONS, dimension, dimension), dtype=float)
    for repetition in range(BOOTSTRAP_REPETITIONS):
        for target in range(dimension):
            rows = contributions[target]
            if not rows:
                continue
            indices = rng.integers(0, len(rows), size=len(rows))
            sampled = np.sum([rows[int(index)] for index in indices], axis=0)
            samples[repetition, target, :] = sampled / source_counts
    lower = np.quantile(samples, 0.025, axis=0)
    upper = np.quantile(samples, 0.975, axis=0)
    estimate = np.asarray(fit["branching_matrix"], dtype=float)
    # Center the attribution interval on the MLE while retaining bootstrap width.
    raw_center = np.median(samples, axis=0)
    half_width = np.maximum(upper - raw_center, raw_center - lower)
    lower = np.maximum(0.0, estimate - half_width)
    upper = estimate + half_width
    edge_support = (lower > EDGE_SUPPORT_THRESHOLD).astype(int)
    spectral_samples = np.asarray([spectral_radius(sample) for sample in samples])
    spectral_half_width = max(
        float(np.quantile(spectral_samples, 0.975) - np.median(spectral_samples)),
        float(np.median(spectral_samples) - np.quantile(spectral_samples, 0.025)),
    )
    return {
        "method": "fixed-fit event-attribution bootstrap",
        "repetitions": BOOTSTRAP_REPETITIONS,
        "branching_matrix_ci95": {"lower": lower, "upper": upper},
        "edge_support": edge_support,
        "spectral_radius_ci95": [
            max(0.0, float(fit["spectral_radius"]) - spectral_half_width),
            float(fit["spectral_radius"]) + spectral_half_width,
        ],
    }


def _truth_payload(spec: WorldSpec) -> dict[str, Any]:
    matrix = branching_matrix(spec.alpha, spec.beta)
    edges = []
    for target in range(spec.dimension):
        for source in range(spec.dimension):
            if matrix[target, source] > EDGE_SUPPORT_THRESHOLD:
                edges.append(
                    {
                        "source": source,
                        "target": target,
                        "branching_contribution": float(matrix[target, source]),
                    }
                )
    process = (
        "EXPONENTIAL_HAWKES"
        if spec.generator in {"hawkes", "multivariate_hawkes"}
        else spec.generator.upper()
    )
    return {
        "process_class": process,
        "expected_decision": spec.expected,
        "baseline": spec.baseline,
        "alpha": spec.alpha,
        "beta": spec.beta,
        "branching_matrix": matrix,
        "spectral_radius": spectral_radius(matrix),
        "excitation_edges": edges,
    }


def _classify_world(
    *,
    fit: Mapping[str, Any],
    baselines: Sequence[Mapping[str, Any]],
    residuals: Mapping[str, Any],
    uncertainty: Mapping[str, Any],
    test_events: int,
    coincidence_rate: float,
) -> tuple[str, list[dict[str, Any]], float, str]:
    best_baseline = max(baselines, key=lambda item: float(item["oos_log_likelihood"]))
    hawkes_oos = float(fit["oos_log_likelihood"])
    gain = hawkes_oos - float(best_baseline["oos_log_likelihood"])
    gain_per_event = gain / max(test_events, 1)
    stable = float(fit["spectral_radius"]) < MAX_SPECTRAL_RADIUS
    identifiable = bool(fit["identifiability"]["identifiable"])
    calibrated = bool(residuals["calibrated"])
    supported_edges = int(np.sum(np.asarray(uncertainty["edge_support"], dtype=int)))
    common_shock_confounded = coincidence_rate >= 0.08
    checks = [
        {
            "code": "EVENT_COUNT",
            "status": (
                "PASS"
                if int(fit["identifiability"]["event_count"]) >= MIN_EVENTS
                else "FAIL"
            ),
            "critical": True,
            "value": int(fit["identifiability"]["event_count"]),
            "threshold": MIN_EVENTS,
        },
        {
            "code": "PARAMETER_IDENTIFIABILITY",
            "status": "PASS" if identifiable else "FAIL",
            "critical": True,
            "value": fit["identifiability"]["inverse_hessian_condition"],
            "threshold": 1e10,
        },
        {
            "code": "SPECTRAL_STABILITY",
            "status": "PASS" if stable else "FAIL",
            "critical": True,
            "value": fit["spectral_radius"],
            "threshold": MAX_SPECTRAL_RADIUS,
        },
        {
            "code": "REGISTERED_BASELINE_DOMINANCE",
            "status": "PASS" if gain_per_event >= DETECTION_GAIN_PER_EVENT else "FAIL",
            "critical": True,
            "value": gain_per_event,
            "threshold": DETECTION_GAIN_PER_EVENT,
            "baseline": best_baseline["model"],
        },
        {
            "code": "TIME_RESCALING_CALIBRATION",
            "status": "PASS" if calibrated else "FAIL",
            "critical": True,
            "value": residuals["ks_pvalue"],
            "threshold": CALIBRATION_PVALUE,
        },
        {
            "code": "RESIDUAL_DEPENDENCE",
            "status": (
                "PASS"
                if residuals["lag1_autocorrelation"] is not None
                and abs(float(residuals["lag1_autocorrelation"]))
                <= RESIDUAL_AUTOCORRELATION_LIMIT
                else "FAIL"
            ),
            "critical": True,
            "value": residuals["lag1_autocorrelation"],
            "threshold": RESIDUAL_AUTOCORRELATION_LIMIT,
        },
        {
            "code": "BOOTSTRAP_EDGE_SUPPORT",
            "status": "PASS" if supported_edges > 0 else "FAIL",
            "critical": True,
            "value": supported_edges,
            "threshold": 1,
        },
        {
            "code": "COMMON_SHOCK_CONFOUNDING",
            "status": "FAIL" if common_shock_confounded else "PASS",
            "critical": True,
            "value": coincidence_rate,
            "threshold": 0.08,
        },
    ]
    if common_shock_confounded:
        return "ABSTAIN", checks, gain, str(best_baseline["model"])
    if (
        not stable
        or not identifiable
        or int(fit["identifiability"]["event_count"]) < MIN_EVENTS
    ):
        return "ABSTAIN", checks, gain, str(best_baseline["model"])
    if gain_per_event < DETECTION_GAIN_PER_EVENT or supported_edges == 0:
        return "REJECT", checks, gain, str(best_baseline["model"])
    if not calibrated:
        return "ABSTAIN", checks, gain, str(best_baseline["model"])
    return "DETECT", checks, gain, str(best_baseline["model"])


def _world_record(spec: WorldSpec) -> dict[str, Any]:
    events, metadata = _world_events(spec)
    train_end = spec.horizon * TRAIN_FRACTION
    fit = fit_exponential_hawkes(events, train_end=train_end, seed=spec.seed + 10_000)
    fit["train_log_likelihood"] = exact_hawkes_log_likelihood(
        events,
        fit["baseline"],
        fit["alpha"],
        fit["beta"],
        start=0.0,
        end=train_end,
    )
    fit["oos_log_likelihood"] = exact_hawkes_log_likelihood(
        events,
        fit["baseline"],
        fit["alpha"],
        fit["beta"],
        start=train_end,
        end=spec.horizon,
    )
    baselines = _fit_baselines(
        events, train_end=train_end, horizon=spec.horizon, metadata=metadata
    )
    transformed = time_rescaling_residuals(
        events,
        fit["baseline"],
        fit["alpha"],
        fit["beta"],
        start=train_end,
        end=spec.horizon,
    )
    residuals = _residual_diagnostics(transformed)
    uncertainty = _branching_uncertainty(
        events, fit, train_end=train_end, seed=spec.seed + 20_000
    )
    test_events = sum(
        sum(train_end <= event < spec.horizon for event in stream) for stream in events
    )
    coincidence = _coincidence_rate(events)
    decision, checks, gain, best_baseline = _classify_world(
        fit=fit,
        baselines=baselines,
        residuals=residuals,
        uncertainty=uncertainty,
        test_events=test_events,
        coincidence_rate=coincidence,
    )
    process_verdict = "ACCEPT" if decision == "DETECT" else decision
    predictive_verdict = (
        "ACCEPT"
        if decision == "DETECT" and gain > 0.0
        else "REJECT" if decision == "REJECT" else "ABSTAIN"
    )
    rounded_events = _round(events, 10)
    world_payload = _round(
        {
            "world_id": spec.world_id,
            "label": spec.label,
            "role": spec.role,
            "seed": spec.seed,
            "dimension": spec.dimension,
            "channels": [chr(ord("A") + index) for index in range(spec.dimension)],
            "observation_window": {
                "start": 0.0,
                "end": spec.horizon,
                "train_end": train_end,
                "left_censoring": "OBSERVATION_START_RECORDED",
                "right_censoring": "OBSERVATION_END_RECORDED",
                "time_unit": "synthetic_time",
            },
            "event_times": rounded_events,
            "event_counts": [len(stream) for stream in events],
            "generator": spec.generator,
            "metadata": _round(metadata, 10),
            "notes": spec.notes,
        },
        10,
    )
    world_payload["world_hash"] = canonical_sha256(world_payload)
    return _round(
        {
            "world": world_payload,
            "truth": _truth_payload(spec),
            "fit": {
                "model": "multivariate_exponential_hawkes",
                "baseline": fit["baseline"],
                "alpha": fit["alpha"],
                "beta": fit["beta"],
                "branching_matrix": fit["branching_matrix"],
                "spectral_radius": fit["spectral_radius"],
                "train_log_likelihood": fit["train_log_likelihood"],
                "oos_log_likelihood": fit["oos_log_likelihood"],
                "optimizer": fit["optimizer"],
                "identifiability": fit["identifiability"],
                "parameter_uncertainty": {
                    "beta_standard_error": fit["beta_standard_error"],
                    **uncertainty,
                },
            },
            "baselines": baselines,
            "diagnostics": {
                "best_baseline": best_baseline,
                "oos_log_likelihood_gain": gain,
                "oos_gain_per_event": gain / max(test_events, 1),
                "test_events": test_events,
                "time_rescaling": residuals,
                "transformed_intervals": transformed,
                "coincidence_rate": coincidence,
                "falsification_register": checks,
            },
            "decision": decision,
            "verdicts": {
                "process_fit": process_verdict,
                "predictive_value": predictive_verdict,
                "economic_value": "NOT_TESTED",
                "causal_interpretation": "NOT_ESTABLISHED",
            },
            "causal_claim_eligible": False,
            "market_claim_eligible": False,
        },
        10,
    )


def _ratio_interval(successes: int, total: int) -> list[float] | None:
    if total <= 0:
        return None
    estimate = successes / total
    z = 1.959963984540054
    denominator = 1.0 + z * z / total
    center = (estimate + z * z / (2.0 * total)) / denominator
    spread = (
        z
        * math.sqrt(estimate * (1.0 - estimate) / total + z * z / (4.0 * total * total))
        / denominator
    )
    return [max(0.0, center - spread), min(1.0, center + spread)]


def _metric(
    name: str, numerator: float, denominator: int, definition: str
) -> dict[str, Any]:
    estimate = numerator / denominator if denominator else None
    integer_count = int(round(numerator))
    interval = (
        _ratio_interval(integer_count, denominator)
        if float(numerator).is_integer()
        else None
    )
    return {
        "metric": name,
        "numerator": numerator,
        "denominator": denominator,
        "estimate": estimate,
        "wilson95": interval,
        "definition": definition,
    }


def _suite_metrics(worlds: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    negatives = [
        row
        for row in worlds
        if row["world"]["role"]
        in {
            "negative_control",
            "seasonality_control",
            "misspecification_control",
            "exogenous_control",
            "cross_negative_control",
            "common_shock_control",
        }
    ]
    positives = [
        row
        for row in worlds
        if row["world"]["role"]
        in {"positive_control", "near_critical_control", "cross_positive_control"}
    ]
    false_discoveries = sum(row["decision"] == "DETECT" for row in negatives)
    true_detections = sum(row["decision"] == "DETECT" for row in positives)
    numerical_failures = sum(not row["fit"]["optimizer"]["success"] for row in worlds)
    abstentions = sum(row["decision"] == "ABSTAIN" for row in worlds)
    calibrated = sum(
        row["diagnostics"]["time_rescaling"]["calibrated"] for row in worlds
    )

    true_edges: set[tuple[str, int, int]] = set()
    fitted_edges: set[tuple[str, int, int]] = set()
    covered_edges = 0
    branching_errors: list[float] = []
    direction_worlds = 0
    direction_correct = 0
    for row in worlds:
        world_id = str(row["world"]["world_id"])
        truth_matrix = np.asarray(row["truth"]["branching_matrix"], dtype=float)
        fit_matrix = np.asarray(row["fit"]["branching_matrix"], dtype=float)
        lower = np.asarray(
            row["fit"]["parameter_uncertainty"]["branching_matrix_ci95"]["lower"],
            dtype=float,
        )
        upper = np.asarray(
            row["fit"]["parameter_uncertainty"]["branching_matrix_ci95"]["upper"],
            dtype=float,
        )
        support = np.asarray(
            row["fit"]["parameter_uncertainty"]["edge_support"], dtype=int
        )
        if float(row["truth"]["spectral_radius"]) > 0.0:
            branching_errors.append(
                abs(
                    float(row["fit"]["spectral_radius"])
                    - float(row["truth"]["spectral_radius"])
                )
            )
        for target in range(truth_matrix.shape[0]):
            for source in range(truth_matrix.shape[1]):
                if target == source:
                    continue
                key = (world_id, source, target)
                if truth_matrix[target, source] > EDGE_SUPPORT_THRESHOLD:
                    true_edges.add(key)
                    covered_edges += int(
                        lower[target, source]
                        <= truth_matrix[target, source]
                        <= upper[target, source]
                    )
                if support[target, source] == 1 and row["decision"] == "DETECT":
                    fitted_edges.add(key)
        if row["world"]["role"] == "cross_positive_control":
            direction_worlds += 1
            expected = {
                (source, target) for _, source, target in true_edges if _ == world_id
            }
            observed = {
                (source, target) for _, source, target in fitted_edges if _ == world_id
            }
            direction_correct += int(expected == observed)
    edge_true_positives = len(true_edges & fitted_edges)
    precision_denominator = len(fitted_edges)
    recall_denominator = len(true_edges)
    seasonal = next(
        row for row in worlds if row["world"]["world_id"] == "seasonal_poisson"
    )
    common = next(row for row in worlds if row["world"]["world_id"] == "common_shock")
    near = next(
        row for row in worlds if row["world"]["world_id"] == "near_critical_hawkes"
    )
    positive_gains = [
        float(row["diagnostics"]["oos_log_likelihood_gain"]) for row in positives
    ]
    metrics = [
        _metric(
            "false_excitation_discovery_rate",
            false_discoveries,
            len(negatives),
            "Negative-control worlds classified DETECT.",
        ),
        _metric(
            "true_excitation_detection_rate",
            true_detections,
            len(positives),
            "Positive Hawkes worlds classified DETECT; weak worlds may abstain.",
        ),
        _metric(
            "cross_excitation_precision",
            edge_true_positives,
            precision_denominator,
            "Supported directed cross-edges that exist in synthetic truth.",
        ),
        _metric(
            "cross_excitation_recall",
            edge_true_positives,
            recall_denominator,
            "Synthetic directed cross-edges recovered with bootstrap support.",
        ),
        {
            "metric": "branching_ratio_error",
            "numerator": sum(branching_errors),
            "denominator": len(branching_errors),
            "estimate": float(np.mean(branching_errors)) if branching_errors else None,
            "wilson95": None,
            "definition": "Mean absolute spectral-radius error on Hawkes worlds.",
        },
        _metric(
            "branching_ratio_ci_coverage",
            covered_edges,
            recall_denominator,
            "True directed branching contributions covered by bootstrap intervals.",
        ),
        _metric(
            "direction_recovery_accuracy",
            direction_correct,
            direction_worlds,
            "Cross-excitation worlds with the exact directed edge set.",
        ),
        _metric(
            "near_critical_detection",
            int(
                near["decision"] == "DETECT" and near["fit"]["spectral_radius"] >= 0.65
            ),
            1,
            "Near-critical world detected with fitted spectral radius at least 0.65.",
        ),
        _metric(
            "seasonality_confounding_rate",
            int(seasonal["decision"] == "DETECT"),
            1,
            "Seasonal Poisson controls incorrectly classified as excitation.",
        ),
        _metric(
            "common_shock_confounding_rate",
            int(common["decision"] == "DETECT"),
            1,
            "Common-shock controls incorrectly classified as directed excitation.",
        ),
        {
            "metric": "oos_log_likelihood_gain",
            "numerator": sum(positive_gains),
            "denominator": len(positive_gains),
            "estimate": float(np.mean(positive_gains)),
            "wilson95": None,
            "definition": "Mean Hawkes OOS log-likelihood gain over the best registered baseline on positive worlds.",
        },
        _metric(
            "time_rescaling_calibration_rate",
            calibrated,
            len(worlds),
            "Worlds whose transformed intervals pass exponential calibration and residual-dependence gates.",
        ),
        _metric(
            "numerical_failure_rate",
            numerical_failures,
            len(worlds),
            "Worlds whose deterministic optimizer did not converge.",
        ),
        _metric(
            "abstention_rate",
            abstentions,
            len(worlds),
            "Worlds where the instrument refused an excitation decision.",
        ),
    ]
    return _round(metrics, 10)


def _program_result(metrics: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    by_name = {str(row["metric"]): row for row in metrics}
    checks = {
        "false_excitation_control": by_name["false_excitation_discovery_rate"][
            "estimate"
        ]
        <= 0.15,
        "true_excitation_detection": by_name["true_excitation_detection_rate"][
            "estimate"
        ]
        >= 0.60,
        "cross_excitation_precision": (
            by_name["cross_excitation_precision"]["estimate"] or 0.0
        )
        >= 0.75,
        "cross_excitation_recall": (
            by_name["cross_excitation_recall"]["estimate"] or 0.0
        )
        >= 0.60,
        "branching_interval_coverage": (
            by_name["branching_ratio_ci_coverage"]["estimate"] or 0.0
        )
        >= 0.60,
        "direction_recovery": (
            by_name["direction_recovery_accuracy"]["estimate"] or 0.0
        )
        >= 0.75,
        "near_critical_detection": by_name["near_critical_detection"]["estimate"]
        == 1.0,
        "seasonality_resistance": by_name["seasonality_confounding_rate"]["estimate"]
        == 0.0,
        "common_shock_resistance": by_name["common_shock_confounding_rate"]["estimate"]
        == 0.0,
        "time_rescaling_calibration": by_name["time_rescaling_calibration_rate"][
            "estimate"
        ]
        >= 0.75,
        "numerical_stability": by_name["numerical_failure_rate"]["estimate"] == 0.0,
    }
    passed = sum(checks.values())
    if passed == len(checks):
        status = "SYNTHETIC_CERTIFICATION_SUPPORTED"
    elif passed >= math.ceil(len(checks) * 0.55):
        status = "PARTIALLY_CHARACTERIZED"
    else:
        status = "INSTRUMENT_REJECTED"
    return {
        "status": status,
        "capability_checks": checks,
        "scalar_score": None,
        "interpretation": (
            "This verdict applies only to frozen synthetic event processes. It does not establish "
            "market usefulness or economic causation."
        ),
    }


def run_hawkes_certification() -> dict[str, Any]:
    """Execute the frozen D0.4 synthetic suite without touching D0.3.x evidence."""

    worlds = [_world_record(spec) for spec in WORLD_SPECS]
    metrics = _suite_metrics(worlds)
    artifact: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "milestone": "D0.4",
        "program": "HAWKES_EVENT_PROCESS_CERTIFICATION",
        "scientific_question": (
            "Can FinSight distinguish genuine self- and cross-excitation from ordinary arrival "
            "noise, changing baseline intensity, common shocks, and clustered non-Hawkes processes?"
        ),
        "frozen": True,
        "execution": {
            "worlds_planned": len(WORLD_SPECS),
            "worlds_executed": len(worlds),
            "development_worlds": 0,
            "train_fraction": TRAIN_FRACTION,
            "event_time_representation": "continuous timestamps",
            "arbitrary_bar_discretization": False,
            "bootstrap_repetitions": BOOTSTRAP_REPETITIONS,
        },
        "theory_contract": {
            "univariate_intensity": "lambda(t)=mu+sum(alpha*exp(-beta*(t-ti)))",
            "multivariate_intensity": "lambda_i(t)=mu_i+sum_j sum(alpha_ij*exp(-beta_ij*(t-tk_j)))",
            "branching_matrix": "G_ij=alpha_ij/beta_ij",
            "stability": "spectral_radius(G)<1",
            "likelihood": "exact continuous event-time point-process likelihood",
            "baseline_competition": [
                "homogeneous_poisson",
                "seasonal_poisson_fourier",
                "exogenous_window_poisson_when_observed",
                "weibull_renewal",
            ],
            "edge_semantics": "conditional temporal excitation under the fitted process",
        },
        "thresholds": {
            "minimum_events": MIN_EVENTS,
            "maximum_spectral_radius": MAX_SPECTRAL_RADIUS,
            "minimum_oos_gain_per_event": DETECTION_GAIN_PER_EVENT,
            "minimum_edge_support": EDGE_SUPPORT_THRESHOLD,
            "time_rescaling_ks_pvalue": CALIBRATION_PVALUE,
            "maximum_residual_autocorrelation": RESIDUAL_AUTOCORRELATION_LIMIT,
        },
        "worlds": worlds,
        "metrics": metrics,
        "program_result": _program_result(metrics),
        "verdict_schema": {
            "process_fit": ["ACCEPT", "REJECT", "ABSTAIN"],
            "predictive_value": ["ACCEPT", "REJECT", "ABSTAIN"],
            "economic_value": "NOT_TESTED",
            "causal_interpretation": "NOT_ESTABLISHED",
        },
        "causal_claim_eligible": False,
        "market_claim_eligible": False,
        "nonlinear_program_boundary": {
            "tag": "dynamics-v0.3.4",
            "commit": "fef3d212c86716d33d9041cb014b757cd5574e19",
            "status": "PARTIALLY_CHARACTERIZED",
            "artifacts_regenerated": False,
        },
        "implementation_sources": {
            path.relative_to(ROOT).as_posix(): normalized_source_sha256(path)
            for path in IMPLEMENTATION_SOURCES
        },
    }
    artifact = _round(artifact, 10)
    artifact["artifact_hash"] = canonical_sha256(artifact)
    return artifact


def load_frozen_hawkes_certification(
    path: str | Path = DEFAULT_D04_ARTIFACT,
) -> dict[str, Any]:
    target = Path(path)
    if not target.exists():
        raise HawkesCertificationError(f"frozen D0.4 artifact is missing: {target}")
    try:
        artifact = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HawkesCertificationError(
            f"unable to read frozen D0.4 artifact: {exc}"
        ) from exc
    from src.dynamics.hawkes_verifier import verify_hawkes_certification

    report = verify_hawkes_certification(artifact)
    if not report["valid"]:
        raise HawkesCertificationError("; ".join(report["errors"]))
    artifact["file_sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
    return artifact
