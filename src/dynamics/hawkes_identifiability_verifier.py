"""Independent fail-closed verifier for frozen D0.4.1 Hawkes evidence."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = "dynamics-hawkes-identifiability/0.4.1"
PARENT_ARTIFACT = ROOT / "eval/dynamics/d0_4/hawkes_certification.json"
PARENT_COMMIT = "a625ab85bc407213a3e46c241394ba8a0f060d64"
PARENT_CANONICAL_HASH = (
    "020c2c0f8c875ef32915512db14427a5fa543a8a0169e907a6825a6f9f1c4039"
)
PARENT_FILE_SHA256 = "364a918006f4e02eadc024d206202e96ed8e3af5862baacd76bd8b0e87fca47f"
EDGE_THRESHOLD = 0.035
STABILITY_BARRIER = 0.995
ATTRIBUTION_REPETITIONS = 64
PARAMETRIC_REPETITIONS = 16
PROFILE_CUTOFF = 1.920729410347062
INFO_REGIMES = ("SPARSE", "LIMITED", "MODERATE", "RICH")
SOURCE_PATHS = (
    "src/dynamics/hawkes_identifiability.py",
    "src/dynamics/hawkes_identifiability_verifier.py",
    "scripts/freeze_dynamics_d0_4_1.py",
    "scripts/verify_dynamics_d0_4_1.py",
    "scripts/replay_dynamics_d0_4_1_hessian.py",
    "docs/dynamics-lab-d0-4-1-preregistration.md",
)


def _canonical(payload: Mapping[str, Any]) -> str:
    encoded = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _source_hash(path: Path) -> str:
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _close(left: Any, right: Any, tolerance: float = 5e-6) -> bool:
    try:
        return math.isclose(
            float(left), float(right), rel_tol=tolerance, abs_tol=tolerance
        )
    except (TypeError, ValueError):
        return False


def _array(value: Any) -> np.ndarray:
    return np.asarray(value, dtype=float)


def _same_array(left: Any, right: Any, tolerance: float = 5e-6) -> bool:
    try:
        a, b = _array(left), _array(right)
        return a.shape == b.shape and bool(
            np.allclose(a, b, rtol=tolerance, atol=tolerance, equal_nan=False)
        )
    except (TypeError, ValueError):
        return False


def _rho(matrix: np.ndarray) -> float:
    values = np.linalg.eigvals(matrix)
    return float(np.max(np.abs(values))) if values.size else 0.0


def _expected_registry() -> list[tuple[str, str, str, int, int, bool]]:
    rows: list[tuple[str, str, str, int, int, bool]] = []
    seed = 41001
    for eta in (0.05, 0.20, 0.40, 0.60, 0.80, 0.92):
        for info in INFO_REGIMES:
            for variant in range(5):
                rows.append(
                    (
                        f"univariate_eta_{eta:.2f}_{info.lower()}_v{variant}",
                        "UNIVARIATE_CALIBRATION",
                        info,
                        variant,
                        seed,
                        variant == 0,
                    )
                )
                seed += 1
    regimes = (
        "NO_EXCITATION",
        "A_TO_B_WEAK",
        "B_TO_A_WEAK",
        "A_TO_B_STRONG",
        "B_TO_A_STRONG",
        "BIDIRECTIONAL_SYMMETRIC",
        "BIDIRECTIONAL_ASYMMETRIC",
        "A_TO_B_PLUS_B_SELF",
    )
    for regime in regimes:
        for info in INFO_REGIMES:
            for variant in range(5):
                rows.append(
                    (
                        f"direction_{regime.lower()}_{info.lower()}_v{variant}",
                        "DIRECTIONAL_IDENTIFICATION",
                        info,
                        variant,
                        seed,
                        False,
                    )
                )
                seed += 1
    for info in INFO_REGIMES:
        for variant in range(5):
            rows.append(
                (
                    f"direction_observed_z_{info.lower()}_v{variant}",
                    "DIRECTIONAL_IDENTIFICATION",
                    info,
                    variant,
                    seed,
                    False,
                )
            )
            seed += 1
    for rho in (0.70, 0.85, 0.93, 0.97, 0.99):
        for info in INFO_REGIMES:
            for variant in range(4):
                rows.append(
                    (
                        f"critical_rho_{rho:.2f}_{info.lower()}_v{variant}",
                        "NEAR_CRITICAL_RECOVERY",
                        info,
                        variant,
                        seed,
                        variant == 0,
                    )
                )
                seed += 1
    controls = (
        "HOMOGENEOUS_POISSON",
        "SEASONAL_POISSON",
        "CLUSTERED_WEIBULL_RENEWAL",
        "REFRACTORY_RENEWAL",
        "EXOGENOUS_BURSTS",
        "INDEPENDENT_STREAMS",
        "LATENT_COMMON_SHOCK",
        "OBSERVED_COMMON_DRIVER",
    )
    for regime in controls:
        for variant in range(5):
            rows.append(
                (
                    f"control_{regime.lower()}_v{variant}",
                    "CONTROL",
                    "CONTROL",
                    variant,
                    seed,
                    False,
                )
            )
            seed += 1
    return rows


def _groups(
    events: Sequence[Sequence[float]], horizon: float
) -> list[tuple[float, np.ndarray]]:
    dimension = len(events)
    merged: dict[float, np.ndarray] = {}
    for channel, stream in enumerate(events):
        for event in stream:
            if not 0.0 <= event < horizon:
                continue
            merged.setdefault(event, np.zeros(dimension, dtype=int))[channel] += 1
    return [(time, merged[time]) for time in sorted(merged)]


def _expected_design(expected: tuple[str, str, str, int, int, bool]) -> dict[str, Any]:
    world_id, family, info, variant, seed, audit = expected
    beta = (0.8, 1.2, 1.8, 2.4, 3.2)[variant]
    target = {"SPARSE": 100, "LIMITED": 300, "MODERATE": 1000, "RICH": 3000}.get(
        info, 600 + 100 * variant
    )
    generator = "hawkes"
    if family == "UNIVARIATE_CALIBRATION":
        eta = float(world_id.split("_")[2])
        regime, baseline, matrix = f"ETA_{eta:.2f}", [0.55 + 0.12 * variant], [[eta]]
    elif family == "NEAR_CRITICAL_RECOVERY":
        rho = float(world_id.split("_")[2])
        regime = f"RHO_{rho:.2f}"
        beta = (0.9, 1.4, 2.0, 2.8)[variant]
        if variant == 0:
            baseline, matrix = [0.42], [[rho]]
        else:
            diagonal = rho * (0.45 + 0.05 * variant)
            baseline = [0.34 + 0.04 * variant, 0.31 + 0.035 * variant]
            matrix = [[diagonal, rho - diagonal], [rho - diagonal, diagonal]]
    elif family == "DIRECTIONAL_IDENTIFICATION":
        regime = (
            world_id[len("direction_") :]
            .removesuffix(f"_{info.lower()}_v{variant}")
            .upper()
        )
        if regime == "OBSERVED_Z":
            regime = "OBSERVED_Z_TO_A_AND_B"
            baseline, matrix = [
                0.60 + 0.06 * variant,
                0.56 + 0.05 * variant,
                0.38 + 0.04 * variant,
            ], [[0, 0, 0.28], [0, 0, 0.28], [0, 0, 0.10]]
        else:
            baseline = [0.70 + 0.08 * variant, 0.62 + 0.07 * variant]
            matrix = {
                "NO_EXCITATION": [[0, 0], [0, 0]],
                "A_TO_B_WEAK": [[0, 0], [0.12, 0]],
                "B_TO_A_WEAK": [[0, 0.12], [0, 0]],
                "A_TO_B_STRONG": [[0, 0], [0.35, 0]],
                "B_TO_A_STRONG": [[0, 0.35], [0, 0]],
                "BIDIRECTIONAL_SYMMETRIC": [[0, 0.22], [0.22, 0]],
                "BIDIRECTIONAL_ASYMMETRIC": [[0, 0.12], [0.32, 0]],
                "A_TO_B_PLUS_B_SELF": [[0, 0], [0.28, 0.22]],
            }[regime]
    else:
        regime = world_id[len("control_") :].removesuffix(f"_v{variant}").upper()
        generator, dimension = {
            "HOMOGENEOUS_POISSON": ("homogeneous_poisson", 1),
            "SEASONAL_POISSON": ("seasonal_poisson", 1),
            "CLUSTERED_WEIBULL_RENEWAL": ("clustered_renewal", 1),
            "REFRACTORY_RENEWAL": ("refractory", 1),
            "EXOGENOUS_BURSTS": ("exogenous_bursts", 1),
            "INDEPENDENT_STREAMS": ("independent_streams", 2),
            "LATENT_COMMON_SHOCK": ("latent_common_shock", 2),
            "OBSERVED_COMMON_DRIVER": ("observed_common_driver", 3),
        }[regime]
        baseline = [
            0.72 + 0.06 * variant - 0.05 * channel for channel in range(dimension)
        ]
        matrix = np.zeros((dimension, dimension)).tolist()
        if dimension == 3:
            matrix[0][2], matrix[1][2], matrix[2][2] = 0.26, 0.26, 0.08
    return {
        "world_id": world_id,
        "family": family,
        "regime": regime,
        "information_regime": info,
        "target_events": target,
        "variant": variant,
        "seed": seed,
        "generator": generator,
        "dimension": len(baseline),
        "baseline": baseline,
        "branching": matrix,
        "beta": beta,
        "audit": audit,
    }


def _likelihood(
    events: Sequence[Sequence[float]],
    baseline: np.ndarray,
    alpha: np.ndarray,
    beta: float,
    horizon: float,
) -> float:
    if len(events) == 1:
        # Independent scalar recurrence avoids allocating tiny arrays for
        # every event in each of the 49 profile checks.
        state, previous, result = 0.0, 0.0, 0.0
        mu, coefficient = float(baseline[0]), float(alpha[0, 0])
        for event in events[0]:
            state *= math.exp(-beta * (event - previous))
            result += math.log(mu + coefficient * state)
            state += 1.0
            previous = event
        integral = sum(-math.expm1(-beta * (horizon - event)) for event in events[0])
        return result - mu * horizon - coefficient * integral / beta
    state = np.zeros(len(events), dtype=float)
    previous = 0.0
    result = 0.0
    for time, marks in _groups(events, horizon):
        state *= math.exp(-beta * (time - previous))
        intensity = baseline + alpha @ state
        if np.any(intensity <= 0.0):
            return float("-inf")
        result += sum(
            int(count) * math.log(float(intensity[target]))
            for target, count in enumerate(marks)
            if count
        )
        state += marks
        previous = time
    result -= float(np.sum(baseline) * horizon)
    for source, stream in enumerate(events):
        integral = sum(
            1.0 - math.exp(-beta * (horizon - event))
            for event in stream
            if event < horizon
        )
        result -= float(np.sum(alpha[:, source])) * integral / beta
    return float(result)


def _attribution_expected(
    events: Sequence[Sequence[float]],
    baseline: np.ndarray,
    alpha: np.ndarray,
    beta: float,
    estimate: np.ndarray,
    horizon: float,
    seed: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[float], np.ndarray]:
    dimension = len(events)
    rows: list[list[np.ndarray]] = [[] for _ in range(dimension)]
    state = np.zeros(dimension, dtype=float)
    previous = 0.0
    for time, marks in _groups(events, horizon):
        state *= math.exp(-beta * (time - previous))
        intensity = baseline + alpha @ state
        for target, count in enumerate(marks):
            shares = alpha[target, :] * state / max(float(intensity[target]), 1e-12)
            rows[target].extend(shares.copy() for _ in range(int(count)))
        state += marks
        previous = time
    counts = np.asarray([max(1, len(stream)) for stream in events], dtype=float)
    rng = np.random.default_rng(seed)
    samples = np.zeros((ATTRIBUTION_REPETITIONS, dimension, dimension), dtype=float)
    row_arrays = [
        np.asarray(target_rows, dtype=float).reshape(-1, dimension)
        for target_rows in rows
    ]
    for repetition in range(ATTRIBUTION_REPETITIONS):
        for target in range(dimension):
            if not rows[target]:
                continue
            indices = rng.integers(0, len(rows[target]), size=len(rows[target]))
            sampled = np.sum(row_arrays[target][indices], axis=0)
            samples[repetition, target, :] = sampled / counts
    raw_lower = np.quantile(samples, 0.025, axis=0)
    raw_upper = np.quantile(samples, 0.975, axis=0)
    center = np.median(samples, axis=0)
    half_width = np.maximum(raw_upper - center, center - raw_lower)
    lower = np.maximum(0.0, estimate - half_width)
    upper = estimate + half_width
    spectral = np.asarray([_rho(sample) for sample in samples])
    spectral_center = float(np.median(spectral))
    spectral_half = max(
        float(np.quantile(spectral, 0.975) - spectral_center),
        float(spectral_center - np.quantile(spectral, 0.025)),
    )
    fit_rho = _rho(estimate)
    probability = np.mean(estimate + samples - center > EDGE_THRESHOLD, axis=0)
    return (
        lower,
        upper,
        (lower > EDGE_THRESHOLD).astype(int),
        [max(0.0, fit_rho - spectral_half), fit_rho + spectral_half],
        probability,
    )


def _verify_branch_interval(
    method: Mapping[str, Any],
    truth: np.ndarray,
    estimate: np.ndarray,
    errors: list[str],
    label: str,
) -> tuple[np.ndarray, np.ndarray] | None:
    branch = method.get("branching")
    if not isinstance(branch, Mapping):
        errors.append(f"missing branching interval: {label}")
        return None
    try:
        frozen_estimate = _array(branch["estimate"])
        lower = _array(branch["lower"])
        upper = _array(branch["upper"])
        covered = np.asarray(branch["covered"], dtype=int)
        width = _array(branch["width"])
    except (KeyError, TypeError, ValueError):
        errors.append(f"malformed branching interval: {label}")
        return None
    if (
        not _same_array(frozen_estimate, estimate)
        or lower.shape != estimate.shape
        or upper.shape != estimate.shape
    ):
        errors.append(f"branching interval dimensions changed: {label}")
        return None
    if np.any(lower < -1e-9) or np.any(upper < lower):
        errors.append(f"invalid branching interval bounds: {label}")
    if not _same_array(width, upper - lower):
        errors.append(f"interval width does not reconcile: {label}")
    expected_covered = np.logical_and(truth >= lower, truth <= upper).astype(int)
    if covered.shape != truth.shape or not np.array_equal(covered, expected_covered):
        errors.append(f"coverage flags do not reconcile: {label}")
    return lower, upper


def _verify_uncertainty(
    record: Mapping[str, Any],
    events: Sequence[Sequence[float]],
    truth: np.ndarray,
    baseline: np.ndarray,
    alpha: np.ndarray,
    beta: float,
    estimate: np.ndarray,
    covariance: Any,
    horizon: float,
    audit: bool,
    errors: list[str],
    world_id: str,
) -> np.ndarray:
    methods = record.get("uncertainty")
    if not isinstance(methods, Mapping):
        errors.append(f"uncertainty methods missing: {world_id}")
        return np.zeros_like(estimate, dtype=int)
    hessian = methods.get("inverse_hessian", {})
    if (
        not isinstance(hessian, Mapping)
        or hessian.get("method") != "INVERSE_HESSIAN_DELTA"
    ):
        errors.append(f"inverse-Hessian method changed: {world_id}")
    elif hessian.get("available"):
        interval = _verify_branch_interval(
            hessian, truth, estimate, errors, f"{world_id}:hessian"
        )
        try:
            cov = _array(covariance)
            dimension = len(events)
            beta_index = dimension + dimension * dimension
            variance = np.zeros_like(estimate)
            for target in range(dimension):
                for source in range(dimension):
                    index = dimension + target * dimension + source
                    variance[target, source] = max(
                        0.0,
                        cov[index, index]
                        + cov[beta_index, beta_index]
                        - 2.0 * cov[index, beta_index],
                    )
            standard_error = estimate * np.sqrt(variance)
            expected_lower = np.maximum(
                0.0, estimate - 1.959963984540054 * standard_error
            )
            expected_upper = estimate + 1.959963984540054 * standard_error
            if interval and (
                not _same_array(interval[0], expected_lower)
                or not _same_array(interval[1], expected_upper)
            ):
                errors.append(
                    f"inverse-Hessian interval does not reconcile: {world_id}"
                )
            eigenvalues, eigenvectors = np.linalg.eigh((cov + cov.T) / 2.0)
            root = (
                eigenvectors * np.sqrt(np.maximum(eigenvalues, 0.0))
            ) @ eigenvectors.T
            rng = np.random.default_rng(int(record["world"]["seed"]) + 10_000)
            draws = rng.standard_normal((256, len(cov))) @ root.T
            rhos = [
                _rho(
                    estimate
                    * np.exp(
                        np.clip(
                            draw[dimension:beta_index].reshape(dimension, dimension)
                            - draw[beta_index],
                            -12.0,
                            12.0,
                        )
                    )
                )
                for draw in draws
            ]
            if not _same_array(
                hessian.get("spectral_radius_ci95"),
                np.quantile(rhos, [0.025, 0.975]),
                tolerance=2e-4,
            ):
                errors.append(
                    f"inverse-Hessian rho interval does not reconcile: {world_id}"
                )
        except (TypeError, ValueError, IndexError):
            errors.append(f"inverse-Hessian covariance is malformed: {world_id}")

    attribution = methods.get("event_attribution", {})
    if (
        not isinstance(attribution, Mapping)
        or attribution.get("method") != "EVENT_ATTRIBUTION_BOOTSTRAP"
        or attribution.get("repetitions") != ATTRIBUTION_REPETITIONS
    ):
        errors.append(f"event-attribution contract changed: {world_id}")
        return np.zeros_like(estimate, dtype=int)
    interval = _verify_branch_interval(
        attribution, truth, estimate, errors, f"{world_id}:attribution"
    )
    expected_seed = int(record["world"]["seed"]) + 20_000
    if (
        attribution.get("seed") != expected_seed
        or attribution.get("available") is not True
    ):
        errors.append(f"attribution seed or availability changed: {world_id}")
    (
        expected_lower,
        expected_upper,
        expected_support,
        expected_spectral,
        expected_probability,
    ) = _attribution_expected(
        events, baseline, alpha, beta, estimate, horizon, expected_seed
    )
    if interval and (
        not _same_array(interval[0], expected_lower)
        or not _same_array(interval[1], expected_upper)
    ):
        errors.append(f"event-attribution interval does not reconcile: {world_id}")
    if not _same_array(
        attribution.get("edge_support"), expected_support, tolerance=0.0
    ):
        errors.append(f"edge support does not reconcile: {world_id}")
    if not _same_array(attribution.get("spectral_radius_ci95"), expected_spectral):
        errors.append(f"attribution spectral interval does not reconcile: {world_id}")
    if not _same_array(
        attribution.get("bootstrap_support_probability"), expected_probability
    ):
        errors.append(f"bootstrap support probability does not reconcile: {world_id}")

    parametric = methods.get("parametric_bootstrap", {})
    profile = methods.get("profile_likelihood", {})
    if audit:
        if (
            not isinstance(parametric, Mapping)
            or parametric.get("method") != "PARAMETRIC_REFIT_BOOTSTRAP"
            or parametric.get("repetitions") != PARAMETRIC_REPETITIONS
        ):
            errors.append(f"parametric audit method changed: {world_id}")
        elif parametric.get("available"):
            param_interval = _verify_branch_interval(
                parametric, truth, estimate, errors, f"{world_id}:parametric"
            )
            samples = _array(parametric.get("samples"))
            if samples.ndim != 3 or samples.shape[1:] != truth.shape:
                errors.append(f"parametric samples malformed: {world_id}")
            elif param_interval and (
                not _same_array(param_interval[0], np.quantile(samples, 0.025, axis=0))
                or not _same_array(
                    param_interval[1], np.quantile(samples, 0.975, axis=0)
                )
            ):
                errors.append(f"parametric interval does not reconcile: {world_id}")
            if (
                len(samples) + int(parametric.get("failures", -1))
                != PARAMETRIC_REPETITIONS
                or parametric.get("seed") != int(record["world"]["seed"]) + 30_000
            ):
                errors.append(f"parametric accounting changed: {world_id}")
            if (
                not np.all(np.isfinite(samples))
                or np.any(samples < 0.0)
                or any(_rho(sample) >= STABILITY_BARRIER + 5e-6 for sample in samples)
            ):
                errors.append(f"parametric sample domain changed: {world_id}")
            elif not _same_array(
                parametric.get("spectral_radius_ci95"),
                np.quantile([_rho(sample) for sample in samples], [0.025, 0.975]),
            ):
                errors.append(f"parametric rho interval does not reconcile: {world_id}")
        elif (
            parametric.get("failures") != PARAMETRIC_REPETITIONS
            or parametric.get("samples") != []
        ):
            errors.append(
                f"unavailable parametric method accounting changed: {world_id}"
            )
        if (
            not isinstance(profile, Mapping)
            or profile.get("method") != "PROFILE_LIKELIHOOD"
            or not profile.get("available")
        ):
            errors.append(f"profile audit method missing: {world_id}")
        else:
            profile_interval = _verify_branch_interval(
                profile, truth, estimate, errors, f"{world_id}:profile"
            )
            grid = profile.get("grid")
            if (
                not isinstance(grid, list)
                or len(grid) != 49
                or not _close(profile.get("cutoff"), PROFILE_CUTOFF)
            ):
                errors.append(f"profile grid changed: {world_id}")
            else:
                likelihoods = []
                for index, point in enumerate(grid):
                    eta = float(point["branching_ratio"])
                    if not _close(
                        eta, float(np.linspace(0.001, 0.99, 49)[index])
                    ) or not isinstance(point.get("optimizer_success"), bool):
                        errors.append(f"profile grid identity changed: {world_id}")
                    point_beta = float(point["beta"])
                    value = _likelihood(
                        events,
                        np.asarray([float(point["baseline"])]),
                        np.asarray([[eta * point_beta]]),
                        point_beta,
                        horizon,
                    )
                    likelihoods.append(value)
                    if not _close(point.get("log_likelihood"), value, 2e-5):
                        errors.append(
                            f"profile likelihood does not reconcile: {world_id}"
                        )
                        break
                maximum = max(likelihoods)
                admitted = [
                    float(point["branching_ratio"])
                    for point, value in zip(grid, likelihoods, strict=True)
                    if maximum - value <= PROFILE_CUTOFF + 2e-5
                ]
                if profile_interval and (
                    not _close(profile_interval[0][0, 0], min(admitted))
                    or not _close(profile_interval[1][0, 0], max(admitted))
                ):
                    errors.append(f"profile interval does not reconcile: {world_id}")
                if not _same_array(
                    profile.get("spectral_radius_ci95"), [min(admitted), max(admitted)]
                ):
                    errors.append(
                        f"profile rho interval does not reconcile: {world_id}"
                    )
    else:
        for key, method in (("parametric", parametric), ("profile", profile)):
            if (
                not isinstance(method, Mapping)
                or method.get("available") is not False
                or method.get("reason") != "OUTSIDE_PREREGISTERED_AUDIT_SUBSET"
            ):
                errors.append(f"{key} audit boundary changed: {world_id}")
    return expected_support


def _residual_expected(
    events: Sequence[Sequence[float]],
    baseline: np.ndarray,
    branching: np.ndarray,
    beta: float,
    horizon: float,
) -> dict[str, Any]:
    state = np.zeros(len(events), dtype=float)
    cumulative = np.zeros(len(events), dtype=float)
    last_target = np.zeros(len(events), dtype=float)
    residuals: list[float] = []
    previous = 0.0
    for time, marks in _groups(events, horizon):
        delta = time - previous
        decay = math.exp(-beta * delta)
        cumulative += baseline * delta + branching @ state * (1.0 - decay)
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
        return {
            "count": len(values),
            "mean": None,
            "variance": None,
            "ks_pvalue": None,
            "lag1_autocorrelation": None,
            "calibrated": False,
        }
    from scipy.stats import kstest

    ks = kstest(values, "expon")
    autocorrelation = (
        float(np.corrcoef(values[:-1], values[1:])[0, 1])
        if len(values) > 2 and np.std(values[:-1]) > 0 and np.std(values[1:]) > 0
        else 0.0
    )
    return {
        "count": len(values),
        "mean": float(np.mean(values)),
        "variance": float(np.var(values)),
        "ks_pvalue": float(ks.pvalue),
        "lag1_autocorrelation": autocorrelation,
        "calibrated": bool(float(ks.pvalue) >= 0.01 and abs(autocorrelation) <= 0.25),
    }


def _graph_expected(truth: np.ndarray, support: np.ndarray) -> dict[str, Any]:
    dimension = len(truth)
    true_edges = {
        (source, target)
        for target in range(dimension)
        for source in range(dimension)
        if source != target and truth[target, source] > EDGE_THRESHOLD
    }
    inferred = {
        (source, target)
        for target in range(dimension)
        for source in range(dimension)
        if source != target and support[target, source] == 1
    }
    tp, fp, fn = (
        len(true_edges & inferred),
        len(inferred - true_edges),
        len(true_edges - inferred),
    )
    reversed_edges = sum(
        (target, source) in inferred and (target, source) not in true_edges
        for source, target in true_edges
    )
    if inferred == true_edges:
        direction = "EXACT"
    elif not inferred:
        direction = "ABSTAIN" if true_edges else "EXACT"
    elif reversed_edges and tp == 0:
        direction = "REVERSED"
    elif tp:
        direction = "PARTIAL"
    elif true_edges:
        direction = "MISSED_WITH_FALSE_EDGE"
    else:
        direction = "FALSE_EDGE"
    return {
        "true_edges": [
            {"source": source, "target": target}
            for source, target in sorted(true_edges)
        ],
        "inferred_edges": [
            {"source": source, "target": target} for source, target in sorted(inferred)
        ],
        "true_positive": tp,
        "false_positive": fp,
        "false_negative": fn,
        "reversed_edges": reversed_edges,
        "exact_graph": inferred == true_edges,
        "abstained": not inferred and bool(true_edges),
        "direction_class": direction,
    }


def _verify_world(
    record: Any,
    expected: tuple[str, str, str, int, int, bool],
    registry: Mapping[str, Any],
    errors: list[str],
) -> Mapping[str, Any]:
    world_id, family, information, variant, seed, audit = expected
    design = _expected_design(expected)
    _compare_tree(registry, design, errors, f"registry.{world_id}")
    if not isinstance(record, Mapping):
        errors.append(f"world record is not an object: {world_id}")
        return {}
    world = record.get("world")
    if not isinstance(world, Mapping):
        errors.append(f"world payload missing: {world_id}")
        return record
    for key in ("regime", "generator", "dimension"):
        if world.get(key) != design[key]:
            errors.append(f"world design changed: {world_id}:{key}")
    world_fields = {
        "world_id": world_id,
        "family": family,
        "information_regime": information,
        "variant": variant,
        "seed": seed,
        "audit_subset": audit,
    }
    registry_fields = {
        "world_id": world_id,
        "family": family,
        "information_regime": information,
        "variant": variant,
        "seed": seed,
        "audit": audit,
    }
    for key, value in world_fields.items():
        if world.get(key) != value:
            errors.append(f"registry identity changed: {world_id}:{key}")
    for key, value in registry_fields.items():
        if registry.get(key) != value:
            errors.append(f"registry identity changed: {world_id}:{key}")
    world_payload = dict(world)
    claimed_world_hash = world_payload.pop("world_hash", None)
    if claimed_world_hash != _canonical(world_payload):
        errors.append(f"world hash does not reconcile: {world_id}")
    try:
        dimension = int(world["dimension"])
        window = world["observation_window"]
        horizon = float(window["end"])
        raw_streams = world["event_times"]
        counts = world["event_counts"]
    except (KeyError, TypeError, ValueError):
        errors.append(f"world observation contract incomplete: {world_id}")
        return record
    if (
        not isinstance(raw_streams, list)
        or len(raw_streams) != dimension
        or not isinstance(counts, list)
        or len(counts) != dimension
    ):
        errors.append(f"event dimensions changed: {world_id}")
        return record
    if (
        window.get("start") != 0.0
        or window.get("time_unit") != "synthetic_time"
        or window.get("left_boundary") != "BURN_IN_DISCARDED"
        or window.get("right_boundary") != "OBSERVATION_END_RECORDED"
    ):
        errors.append(f"observation boundary changed: {world_id}")
    events: list[list[float]] = []
    for channel, raw in enumerate(raw_streams):
        try:
            stream = [float(value) for value in raw]
        except (TypeError, ValueError):
            errors.append(f"nonnumeric events: {world_id}:{channel}")
            stream = []
        if (
            stream != sorted(stream)
            or len(stream) != len(set(stream))
            or any(value < 0.0 or value >= horizon for value in stream)
        ):
            errors.append(f"invalid event times: {world_id}:{channel}")
        if counts[channel] != len(stream):
            errors.append(f"event count mismatch: {world_id}:{channel}")
        events.append(stream)

    truth = record.get("truth")
    fit = record.get("fit")
    if not isinstance(truth, Mapping) or not isinstance(fit, Mapping):
        errors.append(f"truth or fit missing: {world_id}")
        return record
    try:
        truth_baseline = _array(truth["baseline"])
        truth_matrix = _array(truth["branching_matrix"])
        truth_alpha = _array(truth["alpha"])
        truth_beta = float(truth["beta"])
        baseline = _array(fit["baseline"])
        alpha = _array(fit["alpha"])
        beta = float(fit["beta"])
        estimate = _array(fit["branching_matrix"])
    except (KeyError, TypeError, ValueError):
        errors.append(f"parameter payload malformed: {world_id}")
        return record
    shape = (dimension, dimension)
    if (
        truth_baseline.shape != (dimension,)
        or truth_matrix.shape != shape
        or truth_alpha.shape != shape
        or baseline.shape != (dimension,)
        or alpha.shape != shape
        or estimate.shape != shape
    ):
        errors.append(f"parameter dimensions changed: {world_id}")
        return record
    if (
        not all(
            np.all(np.isfinite(value))
            for value in (
                truth_baseline,
                truth_matrix,
                truth_alpha,
                baseline,
                alpha,
                estimate,
            )
        )
        or not math.isfinite(beta)
        or not math.isfinite(truth_beta)
    ):
        errors.append(f"nonfinite parameter: {world_id}")
        return record
    if (
        not _same_array(truth_baseline, design["baseline"])
        or not _same_array(truth_matrix, design["branching"])
        or not _close(truth_beta, design["beta"])
    ):
        errors.append(f"preregistered parameter grid changed: {world_id}")
    if (
        np.any(truth_baseline <= 0.0)
        or np.any(truth_matrix < 0.0)
        or truth_beta <= 0.0
        or np.any(baseline <= 0.0)
        or np.any(alpha < 0.0)
        or beta <= 0.0
    ):
        errors.append(f"parameter domain violated: {world_id}")
    if (
        not _same_array(truth_alpha, truth_matrix * truth_beta)
        or not _close(truth.get("spectral_radius"), _rho(truth_matrix))
        or truth.get("stable") is not True
        or _rho(truth_matrix) >= 1.0
    ):
        errors.append(f"truth matrix or stability does not reconcile: {world_id}")
    regime = str(registry.get("regime", ""))
    expected_truth: np.ndarray | None = None
    if family == "UNIVARIATE_CALIBRATION":
        expected_truth = np.asarray([[float(world_id.split("_")[2])]])
    elif family == "NEAR_CRITICAL_RECOVERY":
        expected_rho = float(world_id.split("_")[2])
        if not _close(_rho(truth_matrix), expected_rho):
            errors.append(f"critical truth grid changed: {world_id}")
    elif family == "DIRECTIONAL_IDENTIFICATION":
        directed_truths = {
            "NO_EXCITATION": ((0.0, 0.0), (0.0, 0.0)),
            "A_TO_B_WEAK": ((0.0, 0.0), (0.12, 0.0)),
            "B_TO_A_WEAK": ((0.0, 0.12), (0.0, 0.0)),
            "A_TO_B_STRONG": ((0.0, 0.0), (0.35, 0.0)),
            "B_TO_A_STRONG": ((0.0, 0.35), (0.0, 0.0)),
            "BIDIRECTIONAL_SYMMETRIC": ((0.0, 0.22), (0.22, 0.0)),
            "BIDIRECTIONAL_ASYMMETRIC": ((0.0, 0.12), (0.32, 0.0)),
            "A_TO_B_PLUS_B_SELF": ((0.0, 0.0), (0.28, 0.22)),
            "OBSERVED_Z_TO_A_AND_B": (
                (0.0, 0.0, 0.28),
                (0.0, 0.0, 0.28),
                (0.0, 0.0, 0.10),
            ),
        }
        expected_truth = np.asarray(directed_truths.get(regime, ()), dtype=float)
    elif family == "CONTROL":
        expected_truth = np.zeros_like(truth_matrix)
        if regime == "OBSERVED_COMMON_DRIVER":
            expected_truth[0, 2], expected_truth[1, 2], expected_truth[2, 2] = (
                0.26,
                0.26,
                0.08,
            )
    if expected_truth is not None and not _same_array(truth_matrix, expected_truth):
        errors.append(f"preregistered truth changed: {world_id}")
    if (
        not _same_array(estimate, alpha / beta)
        or not _close(fit.get("spectral_radius"), _rho(estimate))
        or _rho(estimate) >= STABILITY_BARRIER + 5e-6
    ):
        errors.append(f"fit matrix or stability does not reconcile: {world_id}")
    likelihood = _likelihood(events, baseline, alpha, beta, horizon)
    if not _close(fit.get("log_likelihood"), likelihood, 2e-5):
        errors.append(f"fit likelihood does not reconcile: {world_id}")
    optimizer = fit.get("optimizer")
    if (
        not isinstance(optimizer, Mapping)
        or optimizer.get("method") != "L-BFGS-B deterministic multi-start"
        or optimizer.get("starts") != 3
    ):
        errors.append(f"optimizer contract changed: {world_id}")
    support = _verify_uncertainty(
        record,
        events,
        truth_matrix,
        baseline,
        alpha,
        beta,
        estimate,
        fit.get("log_parameter_covariance"),
        horizon,
        audit,
        errors,
        world_id,
    )
    expected_graph = _graph_expected(truth_matrix, support)
    graph = record.get("graph_evaluation")
    if not isinstance(graph, Mapping):
        errors.append(f"graph evaluation missing: {world_id}")
    else:
        for key, value in expected_graph.items():
            if graph.get(key) != value:
                errors.append(f"graph evaluation does not reconcile: {world_id}:{key}")
        truth_critical = _rho(truth_matrix) >= 0.93
        fit_critical = _rho(estimate) >= 0.90
        if (
            graph.get("near_critical_truth") is not truth_critical
            or graph.get("near_critical_inferred") is not fit_critical
            or graph.get("near_critical_correct")
            is not (truth_critical == fit_critical)
        ):
            errors.append(f"criticality decision does not reconcile: {world_id}")
        unsupported_ab = bool(
            dimension >= 2
            and (
                (support[0, 1] == 1 and truth_matrix[0, 1] <= EDGE_THRESHOLD)
                or (support[1, 0] == 1 and truth_matrix[1, 0] <= EDGE_THRESHOLD)
            )
        )
        if graph.get("unsupported_ab_edge") is not unsupported_ab:
            errors.append(f"unsupported A/B edge flag does not reconcile: {world_id}")
    residual = record.get("residual_diagnostics")
    expected_residual = _residual_expected(events, baseline, estimate, beta, horizon)
    if not isinstance(residual, Mapping):
        errors.append(f"residual diagnostics missing: {world_id}")
    else:
        for key, value in expected_residual.items():
            if isinstance(value, bool):
                valid = residual.get(key) is value
            elif value is None:
                valid = residual.get(key) is None
            else:
                valid = _close(residual.get(key), value, 2e-5)
            if not valid:
                errors.append(
                    f"residual diagnostic does not reconcile: {world_id}:{key}"
                )
    information_payload = record.get("information")
    if (
        not isinstance(information_payload, Mapping)
        or information_payload.get("realized_events")
        != sum(len(stream) for stream in events)
        or not _close(information_payload.get("horizon"), horizon)
        or not _close(
            information_payload.get("kernel_half_life"), math.log(2.0) / truth_beta
        )
    ):
        errors.append(f"information accounting does not reconcile: {world_id}")
    rate = (
        float(np.sum(np.linalg.solve(np.eye(dimension) - truth_matrix, truth_baseline)))
        if design["generator"] in {"hawkes", "observed_common_driver"}
        else float(np.sum(truth_baseline))
        + (0.44 if design["generator"] == "latent_common_shock" else 0.0)
    )
    if not _close(horizon, max(2.0, design["target_events"] / rate)):
        errors.append(f"preregistered observation horizon changed: {world_id}")
    total = (
        rate * horizon
        if design["generator"] in {"hawkes", "observed_common_driver"}
        else float(design["target_events"])
    )
    immigrants = (
        float(np.sum(truth_baseline)) * horizon
        if design["generator"] in {"hawkes", "observed_common_driver"}
        else total
    )
    expected_info = {
        "target_events": design["target_events"],
        "expected_total_events": total,
        "expected_immigrant_events": immigrants,
        "expected_offspring_events": max(0.0, total - immigrants),
        "realized_events": sum(len(stream) for stream in events),
        "horizon": horizon,
        "kernel_half_life": math.log(2.0) / truth_beta,
        "realized_events_per_half_life": sum(len(stream) for stream in events)
        * math.log(2.0)
        / truth_beta
        / horizon,
    }
    _compare_tree(information_payload, expected_info, errors, f"information.{world_id}")
    claims = record.get("claims")
    if (
        not isinstance(claims, Mapping)
        or claims.get("structural_identifiability_tested") is not True
        or any(
            claims.get(key) is not False
            for key in (
                "predictive_validity_tested",
                "economic_utility_tested",
                "causal_identification_tested",
                "causal_claim_eligible",
                "market_claim_eligible",
            )
        )
    ):
        errors.append(f"claim boundary changed: {world_id}")
    return record


def _ratio(successes: int, total: int) -> float | None:
    return successes / total if total else None


def _mean(values: Sequence[float]) -> float | None:
    return float(np.mean(values)) if values else None


def _expected_uncertainty_summary(
    worlds: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    output = []
    for key in (
        "inverse_hessian",
        "event_attribution",
        "parametric_bootstrap",
        "profile_likelihood",
    ):
        covered: list[int] = []
        widths: list[float] = []
        parameter_errors: list[float] = []
        rho_hits: list[int] = []
        rho_widths: list[float] = []
        attempts = failed = 0
        strata: dict[str, tuple[list[int], list[float]]] = {}
        available = 0
        for record in worlds:
            method = record["uncertainty"][key]
            if (
                key in {"inverse_hessian", "event_attribution"}
                or record["world"]["audit_subset"]
            ):
                attempts += 1
                failed += int(not method.get("available"))
            if not method.get("available"):
                continue
            available += 1
            truth = _array(record["truth"]["branching_matrix"])
            mask = truth > EDGE_THRESHOLD
            if np.any(mask):
                covered.extend(
                    np.asarray(method["branching"]["covered"], dtype=int)[mask].tolist()
                )
                widths.extend(_array(method["branching"]["width"])[mask].tolist())
                parameter_errors.extend(
                    (_array(method["branching"]["estimate"]) - truth)[mask].tolist()
                )
                name = (
                    record["world"]["family"]
                    + "/"
                    + record["world"]["information_regime"]
                )
                hits, lengths = strata.setdefault(name, ([], []))
                hits.extend(
                    np.asarray(method["branching"]["covered"], dtype=int)[mask].tolist()
                )
                lengths.extend(_array(method["branching"]["width"])[mask].tolist())
            ci = method.get("spectral_radius_ci95")
            if ci is not None:
                rho_hits.append(
                    int(ci[0] <= float(record["truth"]["spectral_radius"]) <= ci[1])
                )
                rho_widths.append(float(ci[1] - ci[0]))
        output.append(
            {
                "method": key,
                "available_worlds": available,
                "attempted_worlds": attempts,
                "failed_worlds": failed,
                "failure_rate": _ratio(failed, attempts),
                "parameter_count": len(covered),
                "coverage": _ratio(sum(covered), len(covered)),
                "mean_width": _mean(widths),
                "median_width": float(np.median(widths)) if widths else None,
                "bias": _mean(parameter_errors),
                "rmse": (
                    math.sqrt(float(np.mean(np.square(parameter_errors))))
                    if parameter_errors
                    else None
                ),
                "spectral_radius_parameter_count": len(rho_hits),
                "spectral_radius_coverage": _ratio(sum(rho_hits), len(rho_hits)),
                "spectral_radius_mean_width": _mean(rho_widths),
                "strata": [
                    {
                        "stratum": name,
                        "parameters": len(hits),
                        "coverage": _mean(hits),
                        "mean_width": _mean(lengths),
                    }
                    for name, (hits, lengths) in sorted(strata.items())
                ],
            }
        )
    return output


def _expected_metrics(worlds: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    directional = [
        row for row in worlds if row["world"]["family"] == "DIRECTIONAL_IDENTIFICATION"
    ]
    tp = sum(int(row["graph_evaluation"]["true_positive"]) for row in directional)
    fp = sum(int(row["graph_evaluation"]["false_positive"]) for row in directional)
    fn = sum(int(row["graph_evaluation"]["false_negative"]) for row in directional)
    precision, recall = _ratio(tp, tp + fp), _ratio(tp, tp + fn)
    f1 = (
        2.0 * precision * recall / (precision + recall)
        if precision is not None and recall is not None and precision + recall > 0
        else None
    )
    candidates = [
        row for row in directional if len(row["graph_evaluation"]["true_edges"]) == 1
    ]
    detected = [row for row in candidates if row["graph_evaluation"]["inferred_edges"]]
    nulls = [
        row
        for row in worlds
        if row["world"]["dimension"] >= 2 and not row["graph_evaluation"]["true_edges"]
    ]
    strong_total = 0
    strong_detected = 0
    for row in directional:
        truth = _array(row["truth"]["branching_matrix"])
        support = np.asarray(
            row["uncertainty"]["event_attribution"]["edge_support"], dtype=int
        )
        for target in range(len(truth)):
            for source in range(len(truth)):
                if target != source and truth[target, source] >= 0.20:
                    strong_total += 1
                    strong_detected += int(support[target, source] == 1)
    critical = [
        row for row in worlds if row["world"]["family"] == "NEAR_CRITICAL_RECOVERY"
    ]
    controls = [row for row in worlds if row["world"]["family"] == "CONTROL"]
    latent = [row for row in worlds if row["world"]["regime"] == "LATENT_COMMON_SHOCK"]
    rho_errors = [
        float(row["fit"]["spectral_radius"]) - float(row["truth"]["spectral_radius"])
        for row in worlds
        if row["world"]["generator"] in {"hawkes", "observed_common_driver"}
    ]
    uncertainty = _expected_uncertainty_summary(worlds)
    parametric = next(
        row for row in uncertainty if row["method"] == "parametric_bootstrap"
    )
    return {
        "world_count": len(worlds),
        "numerical_failures": sum(
            not bool(row["fit"]["optimizer"]["success"]) for row in worlds
        ),
        "spectral_radius_bias": _mean(rho_errors),
        "spectral_radius_rmse": (
            math.sqrt(float(np.mean(np.square(rho_errors)))) if rho_errors else None
        ),
        "uncertainty_methods": uncertainty,
        "graph": {
            "true_positive": tp,
            "false_positive": fp,
            "false_negative": fn,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "exact_graph_rate": _ratio(
                sum(
                    bool(row["graph_evaluation"]["exact_graph"]) for row in directional
                ),
                len(directional),
            ),
            "conditional_direction_accuracy": _ratio(
                sum(
                    row["graph_evaluation"]["direction_class"] == "EXACT"
                    for row in detected
                ),
                len(detected),
            ),
            "reversed_edges": sum(
                int(row["graph_evaluation"]["reversed_edges"]) for row in directional
            ),
            "missed_edge_rate": _ratio(fn, tp + fn),
            "false_edge_rate": _ratio(fp, tp + fp),
            "reversed_edge_rate": _ratio(
                sum(
                    int(row["graph_evaluation"]["reversed_edges"])
                    for row in directional
                ),
                tp + fn,
            ),
            "abstention_rate": _ratio(
                sum(bool(row["graph_evaluation"]["abstained"]) for row in directional),
                len(directional),
            ),
        },
        "false_edge_discovery_rate": _ratio(
            sum(bool(row["graph_evaluation"]["inferred_edges"]) for row in nulls),
            len(nulls),
        ),
        "control_false_excitation_rate": _ratio(
            sum(
                bool(
                    np.any(
                        np.asarray(
                            row["uncertainty"]["event_attribution"]["edge_support"]
                        )
                    )
                )
                for row in controls
                if row["world"]["regime"] != "OBSERVED_COMMON_DRIVER"
            ),
            sum(row["world"]["regime"] != "OBSERVED_COMMON_DRIVER" for row in controls),
        ),
        "parametric_refit_failures": sum(
            int(row["uncertainty"]["parametric_bootstrap"].get("failures", 0))
            for row in worlds
        ),
        "profile_nuisance_fit_failures": sum(
            not point["optimizer_success"]
            for row in worlds
            for point in row["uncertainty"]["profile_likelihood"].get("grid", [])
        ),
        "moderate_strong_edge_detection_rate": _ratio(strong_detected, strong_total),
        "parametric_branching_coverage": parametric["coverage"],
        "near_critical_accuracy": _ratio(
            sum(
                bool(row["graph_evaluation"]["near_critical_correct"])
                for row in critical
            ),
            len(critical),
        ),
        "false_near_critical_alarm_rate": _ratio(
            sum(
                bool(row["graph_evaluation"]["near_critical_inferred"])
                for row in controls
            ),
            len(controls),
        ),
        "latent_common_shock_false_ab_edge_rate": _ratio(
            sum(bool(row["graph_evaluation"]["unsupported_ab_edge"]) for row in latent),
            len(latent),
        ),
        "residual_calibration_rate": _ratio(
            sum(bool(row["residual_diagnostics"]["calibrated"]) for row in worlds),
            len(worlds),
        ),
    }


def _compare_tree(actual: Any, expected: Any, errors: list[str], label: str) -> None:
    if isinstance(expected, Mapping):
        if not isinstance(actual, Mapping) or set(actual) != set(expected):
            errors.append(f"metric shape changed: {label}")
            return
        for key, value in expected.items():
            _compare_tree(actual[key], value, errors, f"{label}.{key}")
    elif isinstance(expected, list):
        if not isinstance(actual, list) or len(actual) != len(expected):
            errors.append(f"metric list changed: {label}")
            return
        for index, value in enumerate(expected):
            _compare_tree(actual[index], value, errors, f"{label}[{index}]")
    elif isinstance(expected, bool) or expected is None or isinstance(expected, str):
        if actual != expected:
            errors.append(f"metric value changed: {label}")
    elif not _close(actual, expected, 2e-5):
        errors.append(f"metric value changed: {label}")


def _expected_frontier(worlds: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    order = {name: index for index, name in enumerate(INFO_REGIMES)}
    regimes = sorted(
        {
            row["world"]["regime"]
            for row in worlds
            if row["world"]["family"] == "DIRECTIONAL_IDENTIFICATION"
            and row["world"]["regime"] != "NO_EXCITATION"
        }
    )
    output = []
    for regime in regimes:
        cells = []
        for info in INFO_REGIMES:
            selected = [
                row
                for row in worlds
                if row["world"]["regime"] == regime
                and row["world"]["information_regime"] == info
            ]
            cells.append(
                {
                    "information_regime": info,
                    "worlds": len(selected),
                    "exact_graph_rate": _ratio(
                        sum(
                            bool(row["graph_evaluation"]["exact_graph"])
                            for row in selected
                        ),
                        len(selected),
                    ),
                }
            )
        eligible = [
            cell
            for cell in cells
            if cell["exact_graph_rate"] is not None and cell["exact_graph_rate"] >= 0.80
        ]
        frontier = (
            min(eligible, key=lambda row: order[row["information_regime"]])[
                "information_regime"
            ]
            if eligible
            else "UNRESOLVED"
        )
        reference = next(row for row in worlds if row["world"]["regime"] == regime)
        matrix = _array(reference["truth"]["branching_matrix"])
        output.append(
            {
                "regime": regime,
                "edge_asymmetry": abs(float(matrix[0, 1] - matrix[1, 0])),
                "frontier": frontier,
                "cells": cells,
            }
        )
    return output


def _verify_hawkes_identifiability(artifact: Mapping[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(artifact, Mapping):
        return {
            "valid": False,
            "errors": ["artifact must be an object"],
            "worlds_verified": 0,
        }
    claimed_hash = artifact.get("artifact_hash")
    payload = dict(artifact)
    payload.pop("artifact_hash", None)
    calculated_hash = _canonical(payload)
    if claimed_hash != calculated_hash:
        errors.append("artifact hash does not reconcile")
    if (
        artifact.get("schema_version") != SCHEMA_VERSION
        or artifact.get("milestone") != "D0.4.1"
        or artifact.get("program") != "HAWKES_UNCERTAINTY_AND_EDGE_IDENTIFIABILITY"
        or artifact.get("frozen") is not True
    ):
        errors.append("artifact identity changed")

    try:
        parent_raw = PARENT_ARTIFACT.read_bytes()
        parent_file_hash = hashlib.sha256(parent_raw).hexdigest()
        parent_payload = json.loads(parent_raw.decode("utf-8"))
        parent_claim = parent_payload.pop("artifact_hash", None)
        parent_canonical = _canonical(parent_payload)
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"unable to verify parent artifact: {exc}")
        parent_file_hash = ""
        parent_claim = ""
        parent_canonical = ""
        parent_payload = {}
    parent_seal = artifact.get("parent_seal")
    if not isinstance(parent_seal, Mapping):
        errors.append("parent seal missing")
    else:
        if (
            parent_seal.get("commit") != PARENT_COMMIT
            or parent_seal.get("canonical_hash") != PARENT_CANONICAL_HASH
            or parent_seal.get("file_sha256") != PARENT_FILE_SHA256
        ):
            errors.append("parent seal changed")
        if (
            parent_file_hash != PARENT_FILE_SHA256
            or parent_claim != PARENT_CANONICAL_HASH
            or parent_canonical != PARENT_CANONICAL_HASH
        ):
            errors.append("parent artifact is no longer byte-identical and canonical")

    sources = artifact.get("implementation_sources")
    if not isinstance(sources, Mapping) or set(sources) != set(SOURCE_PATHS):
        errors.append("implementation source manifest changed")
    else:
        for relative in SOURCE_PATHS:
            path = ROOT / relative
            if not path.exists() or sources.get(relative) != _source_hash(path):
                errors.append(f"implementation source seal changed: {relative}")

    expected_registry = _expected_registry()
    _compare_tree(
        artifact.get("thresholds"),
        {
            "edge_support_lower_bound": 0.035,
            "stability_barrier": 0.995,
            "near_critical_truth": 0.93,
            "near_critical_estimate": 0.90,
            "direction_frontier_exact_graph_rate": 0.80,
            "interval_nominal_coverage": 0.95,
        },
        errors,
        "thresholds",
    )
    prereg_path = "docs/dynamics-lab-d0-4-1-preregistration.md"
    _compare_tree(
        artifact.get("preregistration"),
        {
            "path": prereg_path,
            "source_sha256": _source_hash(ROOT / prereg_path),
            "worlds": 420,
            "seed_range": [41001, 41420],
            "d0_4_worlds_used_for_tuning": 0,
        },
        errors,
        "preregistration",
    )
    boundary = artifact.get("claim_boundary")
    if (
        not isinstance(boundary, Mapping)
        or boundary.get("structural_identifiability_tested") is not True
        or any(
            boundary.get(key) is not False
            for key in (
                "predictive_validity_tested",
                "economic_utility_tested",
                "causal_identification_tested",
                "causal_claim_eligible",
                "market_claim_eligible",
            )
        )
    ):
        errors.append("artifact claim boundary changed")
    registry = artifact.get("registry")
    worlds = artifact.get("worlds")
    if (
        not isinstance(registry, list)
        or len(registry) != 420
        or not isinstance(worlds, list)
        or len(worlds) != 420
    ):
        errors.append("D0.4.1 grid is incomplete")
        return {
            "valid": False,
            "errors": errors,
            "artifact_hash": calculated_hash,
            "worlds_verified": 0,
        }
    seeds = [
        int(row.get("seed", -1)) if isinstance(row, Mapping) else -1 for row in registry
    ]
    if seeds != list(range(41001, 41421)) or len(set(seeds)) != 420:
        errors.append("seed registry changed or contains duplicates")
    parent_seeds = {
        int(row["world"]["seed"]) for row in parent_payload.get("worlds", [])
    }
    if parent_seeds.intersection(seeds):
        errors.append("D0.4.1 seeds overlap D0.4")
    if isinstance(parent_seal, Mapping) and (
        parent_seal.get("parent_seeds") != sorted(parent_seeds)
        or parent_seal.get("seed_overlap") != []
        or parent_seal.get("artifact") != "eval/dynamics/d0_4/hawkes_certification.json"
    ):
        errors.append("parent seed or path seal changed")
    if errors:
        return {
            "valid": False,
            "errors": errors,
            "artifact_hash": calculated_hash,
            "worlds_verified": 0,
        }
    verified_worlds = []
    for index, expected in enumerate(expected_registry):
        registry_row = registry[index] if isinstance(registry[index], Mapping) else {}
        verified_worlds.append(
            _verify_world(worlds[index], expected, registry_row, errors)
        )
        if errors:
            break

    if errors:
        return {
            "valid": False,
            "errors": errors,
            "artifact_hash": calculated_hash,
            "worlds_verified": len(verified_worlds),
        }
    expected_metrics = _expected_metrics(verified_worlds)
    _compare_tree(artifact.get("metrics"), expected_metrics, errors, "metrics")
    graph = expected_metrics["graph"]
    gates = {
        "false_edge_discovery": float(
            expected_metrics["false_edge_discovery_rate"] or 0.0
        )
        <= 0.05,
        "moderate_strong_detection": float(
            expected_metrics["moderate_strong_edge_detection_rate"] or 0.0
        )
        >= 0.80,
        "parametric_branching_coverage": float(
            expected_metrics["parametric_branching_coverage"] or 0.0
        )
        >= 0.85,
        "directional_precision": float(graph["precision"] or 0.0) >= 0.90,
        "directional_recall": float(graph["recall"] or 0.0) >= 0.80,
        "near_critical_accuracy": float(
            expected_metrics["near_critical_accuracy"] or 0.0
        )
        >= 0.80,
        "false_near_critical_alarms": float(
            expected_metrics["false_near_critical_alarm_rate"] or 0.0
        )
        <= 0.05,
        "latent_common_shock_resistance": float(
            expected_metrics["latent_common_shock_false_ab_edge_rate"] or 0.0
        )
        <= 0.05,
        "residual_calibration": float(
            expected_metrics["residual_calibration_rate"] or 0.0
        )
        >= 0.75,
        "numerical_stability": int(expected_metrics["numerical_failures"]) <= 2,
    }
    structural_keys = (
        "false_edge_discovery",
        "moderate_strong_detection",
        "directional_precision",
        "directional_recall",
        "latent_common_shock_resistance",
    )
    structural_passes = sum(gates[key] for key in structural_keys)
    structural_status = (
        "SUPPORTED"
        if structural_passes == len(structural_keys)
        else "PARTIALLY_CHARACTERIZED" if structural_passes >= 2 else "UNRESOLVED"
    )
    expected_status = (
        "SYNTHETIC_CERTIFICATION_SUPPORTED"
        if all(gates.values())
        else (
            "PARTIALLY_CHARACTERIZED"
            if sum(gates.values()) >= 4
            else "INSTRUMENT_REJECTED"
        )
    )
    result = artifact.get("program_result")
    if (
        not isinstance(result, Mapping)
        or result.get("promotion_gates") != gates
        or result.get("status") != expected_status
        or result.get("scalar_score") is not None
    ):
        errors.append("program result does not reconcile")
    else:
        vector = result.get("capability_vector")
        if (
            not isinstance(vector, Mapping)
            or vector.get("STRUCTURAL_IDENTIFIABILITY")
            != {"tested": True, "status": structural_status}
            or vector.get("PREDICTIVE_VALIDITY")
            != {"tested": False, "status": "NOT_TESTED"}
            or vector.get("ECONOMIC_UTILITY")
            != {"tested": False, "status": "NOT_TESTED"}
            or vector.get("CAUSAL_IDENTIFICATION")
            != {"tested": False, "status": "NOT_ESTABLISHED"}
        ):
            errors.append("capability vector changed")
        if vector.get("PROCESS_CALIBRATION") != {
            "tested": True,
            "status": "SUPPORTED" if gates["residual_calibration"] else "UNRESOLVED",
        } or set(vector) != {
            "STRUCTURAL_IDENTIFIABILITY",
            "PROCESS_CALIBRATION",
            "PREDICTIVE_VALIDITY",
            "ECONOMIC_UTILITY",
            "CAUSAL_IDENTIFICATION",
        }:
            errors.append("process capability vector changed")

    boundary = artifact.get("claim_boundary")
    if (
        not isinstance(boundary, Mapping)
        or boundary.get("structural_identifiability_tested") is not True
        or any(
            boundary.get(key) is not False
            for key in (
                "predictive_validity_tested",
                "economic_utility_tested",
                "causal_identification_tested",
                "causal_claim_eligible",
                "market_claim_eligible",
            )
        )
    ):
        errors.append("artifact claim boundary changed")
    execution = artifact.get("execution")
    if (
        not isinstance(execution, Mapping)
        or execution.get("worlds_planned") != 420
        or execution.get("worlds_executed") != 420
        or execution.get("audit_worlds") != 44
        or execution.get("attribution_bootstrap_repetitions") != 64
        or execution.get("parametric_bootstrap_repetitions") != 16
        or execution.get("arbitrary_bar_discretization") is not False
    ):
        errors.append("execution contract changed")

    observatory = artifact.get("observatory")
    if not isinstance(observatory, Mapping):
        errors.append("observatory projection missing")
    else:
        _compare_tree(
            observatory.get("interval_coverage"),
            expected_metrics["uncertainty_methods"],
            errors,
            "observatory.interval_coverage",
        )
        _compare_tree(
            observatory.get("direction_frontier"),
            _expected_frontier(verified_worlds),
            errors,
            "observatory.direction_frontier",
        )
        calibration = []
        for rho in (0.70, 0.85, 0.93, 0.97, 0.99):
            selected = [
                row
                for row in verified_worlds
                if row["world"]["family"] == "NEAR_CRITICAL_RECOVERY"
                and _close(row["truth"]["spectral_radius"], rho)
            ]
            estimates = [float(row["fit"]["spectral_radius"]) for row in selected]
            calibration.append(
                {
                    "truth": rho,
                    "mean_estimate": _mean(estimates),
                    "rmse": math.sqrt(
                        float(np.mean([(value - rho) ** 2 for value in estimates]))
                    ),
                }
            )
        _compare_tree(
            observatory.get("spectral_radius_calibration"),
            calibration,
            errors,
            "observatory.spectral_radius_calibration",
        )
        by_id = {row["world"]["world_id"]: row for row in verified_worlds}
        representatives = observatory.get("representative_worlds")
        if not isinstance(representatives, list) or len(representatives) != 10:
            errors.append("observatory representative set changed")
        else:
            expected_ids = {
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
            if {
                row.get("world", {}).get("world_id") for row in representatives
            } != expected_ids:
                errors.append("observatory representative identities changed")
            for projection in representatives:
                source = (
                    by_id.get(projection.get("world", {}).get("world_id"))
                    if isinstance(projection, Mapping)
                    else None
                )
                if source is None:
                    errors.append("observatory contains an unknown representative")
                    continue
                expected_projection = {
                    "world": {
                        key: source["world"][key]
                        for key in (
                            "world_id",
                            "family",
                            "regime",
                            "information_regime",
                            "channels",
                            "event_counts",
                            "world_hash",
                        )
                    },
                    "truth": source["truth"],
                    "fit": {
                        key: source["fit"][key]
                        for key in (
                            "baseline",
                            "branching_matrix",
                            "beta",
                            "spectral_radius",
                            "optimizer",
                        )
                    },
                    "uncertainty": source["uncertainty"],
                    "graph_evaluation": source["graph_evaluation"],
                    "residual_diagnostics": source["residual_diagnostics"],
                }
                if projection != expected_projection:
                    errors.append(
                        f"observatory projection changed: {source['world']['world_id']}"
                    )
    return {
        "valid": not errors,
        "errors": errors,
        "artifact_hash": calculated_hash,
        "worlds_verified": len(verified_worlds),
    }


def verify_hawkes_identifiability(artifact: Mapping[str, Any]) -> dict[str, Any]:
    """Malformed evidence is a failed contract, never an uncaught server error."""
    try:
        return _verify_hawkes_identifiability(artifact)
    except (
        KeyError,
        TypeError,
        ValueError,
        IndexError,
        OverflowError,
        AttributeError,
        np.linalg.LinAlgError,
    ) as exc:
        return {
            "valid": False,
            "errors": [f"malformed evidence: {type(exc).__name__}: {exc}"],
            "worlds_verified": 0,
        }
