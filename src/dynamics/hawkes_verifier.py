"""Independent fail-closed verifier for the frozen D0.4 Hawkes artifact.

This module does not import the D0.4 simulator, optimizer, suite builder, or
numerical helpers. It separately reconciles the frozen continuous-time evidence.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from scipy.integrate import quad
from scipy.stats import kstest

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = "dynamics-hawkes-certification/0.4"
MIN_EVENTS = 32
MAX_SPECTRAL_RADIUS = 0.98
DETECTION_GAIN_PER_EVENT = 0.01
EDGE_SUPPORT_THRESHOLD = 0.035
CALIBRATION_PVALUE = 0.01
RESIDUAL_AUTOCORRELATION_LIMIT = 0.25
BOOTSTRAP_REPETITIONS = 64

EXPECTED_WORLD_CONTRACTS: dict[str, dict[str, str]] = {
    "homogeneous_poisson": {
        "role": "negative_control",
        "decision": "REJECT",
        "world_hash": "a48dc1a37e29bee48358c1865e9789288d65e641d740cd16c98e212591d5e50a",
        "truth_hash": "a4e17443c518b07acb9e41afa026204a0111cc9d8b6e6f476a90ef5d5859748a",
    },
    "seasonal_poisson": {
        "role": "seasonality_control",
        "decision": "REJECT",
        "world_hash": "d4971fda52a29120c339dffb6bfbdba39a179f79f710e430cf142c0c86ff182f",
        "truth_hash": "5a8de849f4313e4e2ce665c7d66dae22023974e040af20ed4289f22f7795a48b",
    },
    "weak_hawkes": {
        "role": "positive_control",
        "decision": "REJECT",
        "world_hash": "0968763a995baefa64a52da6a8de4271866913fb57a228124f2327ece07b2eb9",
        "truth_hash": "dc864e653dbb6a05cec394a5b668758e503bc2c2a94aa0be8d9c7b98affba81f",
    },
    "moderate_hawkes": {
        "role": "positive_control",
        "decision": "DETECT",
        "world_hash": "5597586b01f3bc723a3f246394d39983ef2122a5f01d51d1b28b821db5ec82e4",
        "truth_hash": "acc182947eee86e1b74d5252f7a77ebf5002d4f5c52268b7a6171734a97beb3f",
    },
    "near_critical_hawkes": {
        "role": "near_critical_control",
        "decision": "DETECT",
        "world_hash": "a1f111e221dd615ec24cee42725784370e32173c4056187013c4c20d18f3d5c1",
        "truth_hash": "6e37f91f5634db8071d3d255bc8ab6f7020e77d8640ccf5a2dd43a7f65cc9822",
    },
    "clustered_renewal": {
        "role": "misspecification_control",
        "decision": "REJECT",
        "world_hash": "10967aaef59b9437a7ea71f52600f0c1653a1301622e570aff3b152b51eeffec",
        "truth_hash": "5cd9590d44606ac54175dcf2ed2b5031939b1da65df72fd6c3d0eb17625d1387",
    },
    "refractory_process": {
        "role": "misspecification_control",
        "decision": "REJECT",
        "world_hash": "2c130a7d7d9ad2d81ec5a1eface52ba47a56b5e44e76544b31fb0b4214df60dc",
        "truth_hash": "8a6f5377142b828f696222ffb7ef209d416d4be3064f7543283419e421933a09",
    },
    "exogenous_bursts": {
        "role": "exogenous_control",
        "decision": "REJECT",
        "world_hash": "d6e3b209effa1bedbf079f734a467216133e1979b8e0afd099b0d60274f7bfa0",
        "truth_hash": "55daa31f3a32c921d2a62864dbd24847842561713835073ac8a1462f8a8bd66f",
    },
    "independent_streams": {
        "role": "cross_negative_control",
        "decision": "REJECT",
        "world_hash": "9c9a33d5805939e81468e304416dedeed70a82493141211eb2a25c7b98adf462",
        "truth_hash": "3daad50761d1ea53c91fcf4921ceaecfb5a2837bda8cc8ef583eac58c9f72916",
    },
    "directed_cross_excitation": {
        "role": "cross_positive_control",
        "decision": "DETECT",
        "world_hash": "7924ad19fc052b912b4285da49a7a3b069f639bd7dd23769cef96bd71d8845fc",
        "truth_hash": "28ad91ae7e4531f704972afa16ea9c695e8c6760683f52c052222a81be7a9783",
    },
    "bidirectional_excitation": {
        "role": "cross_positive_control",
        "decision": "DETECT",
        "world_hash": "3dfb345cf5fa72b46222760da4dcf03d416d2d329071c5644e3e6ae966eaf8fc",
        "truth_hash": "0f97ecac68870988511b4d2019048b2323785481c998393e904ff52acefcc5c0",
    },
    "common_shock": {
        "role": "common_shock_control",
        "decision": "ABSTAIN",
        "world_hash": "6be4b19d229c68c7d4b55e9447e9303b953352d9e40c27d8cb77400a8d96250e",
        "truth_hash": "be14a757b189a06984fd665f94ad4ba053b857d98240193d1fbd1972fbf7681e",
    },
}

METRIC_DEFINITIONS = {
    "false_excitation_discovery_rate": "Negative-control worlds classified DETECT.",
    "true_excitation_detection_rate": (
        "Positive Hawkes worlds classified DETECT; weak worlds may abstain."
    ),
    "cross_excitation_precision": (
        "Supported directed cross-edges that exist in synthetic truth."
    ),
    "cross_excitation_recall": (
        "Synthetic directed cross-edges recovered with bootstrap support."
    ),
    "branching_ratio_error": "Mean absolute spectral-radius error on Hawkes worlds.",
    "branching_ratio_ci_coverage": (
        "True directed branching contributions covered by bootstrap intervals."
    ),
    "direction_recovery_accuracy": (
        "Cross-excitation worlds with the exact directed edge set."
    ),
    "near_critical_detection": (
        "Near-critical world detected with fitted spectral radius at least 0.65."
    ),
    "seasonality_confounding_rate": (
        "Seasonal Poisson controls incorrectly classified as excitation."
    ),
    "common_shock_confounding_rate": (
        "Common-shock controls incorrectly classified as directed excitation."
    ),
    "oos_log_likelihood_gain": (
        "Mean Hawkes OOS log-likelihood gain over the best registered baseline on positive worlds."
    ),
    "time_rescaling_calibration_rate": (
        "Worlds whose transformed intervals pass exponential calibration and "
        "residual-dependence gates."
    ),
    "numerical_failure_rate": "Worlds whose deterministic optimizer did not converge.",
    "abstention_rate": "Worlds where the instrument refused an excitation decision.",
}


def _canonical_sha256(payload: Mapping[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _normalized_source_sha256(path: Path) -> str:
    normalized = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _mapping(value: Any, label: str, errors: list[str]) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        errors.append(f"{label} must be an object")
        return {}
    return value


def _sequence(value: Any, label: str, errors: list[str]) -> Sequence[Any]:
    if not isinstance(value, list):
        errors.append(f"{label} must be an array")
        return []
    return value


def _close(left: Any, right: Any, *, tolerance: float = 5e-6) -> bool:
    try:
        return math.isclose(
            float(left), float(right), rel_tol=tolerance, abs_tol=tolerance
        )
    except (TypeError, ValueError):
        return False


def _branching_matrix(alpha: np.ndarray, beta: np.ndarray) -> np.ndarray:
    return np.divide(
        alpha,
        beta,
        out=np.zeros_like(alpha, dtype=float),
        where=beta > 0.0,
    )


def _spectral_radius(matrix: np.ndarray) -> float:
    values = np.linalg.eigvals(np.asarray(matrix, dtype=float))
    return float(np.max(np.abs(values))) if values.size else 0.0


def _hawkes_log_likelihood(
    events: Sequence[Sequence[float]],
    baseline: np.ndarray,
    alpha: np.ndarray,
    beta: np.ndarray,
    *,
    start: float,
    end: float,
) -> float:
    dimension = len(baseline)
    if alpha.shape != (dimension, dimension) or beta.shape != (dimension, dimension):
        return float("-inf")
    if np.any(baseline <= 0.0) or np.any(alpha < 0.0) or np.any(beta <= 0.0):
        return float("-inf")
    log_intensity = 0.0
    for target in range(dimension):
        for event in events[target]:
            if not start <= event < end:
                continue
            intensity = float(baseline[target])
            for source in range(dimension):
                history = np.asarray(
                    [time for time in events[source] if time < event], dtype=float
                )
                if history.size:
                    intensity += float(
                        np.sum(
                            alpha[target, source]
                            * np.exp(-beta[target, source] * (event - history))
                        )
                    )
            if intensity <= 0.0 or not math.isfinite(intensity):
                return float("-inf")
            log_intensity += math.log(intensity)
    compensator = float(np.sum(baseline) * (end - start))
    for target in range(dimension):
        for source in range(dimension):
            if alpha[target, source] <= 0.0:
                continue
            for event in events[source]:
                if event >= end:
                    break
                lower = max(start, event)
                compensator += (alpha[target, source] / beta[target, source]) * (
                    math.exp(-beta[target, source] * (lower - event))
                    - math.exp(-beta[target, source] * (end - event))
                )
    return float(log_intensity - compensator)


def _homogeneous_log_likelihood(
    events: Sequence[Sequence[float]],
    rates: Sequence[float],
    *,
    start: float,
    end: float,
) -> float:
    result = 0.0
    for channel, rate in enumerate(rates):
        if rate <= 0.0:
            return float("-inf")
        count = sum(start <= event < end for event in events[channel])
        result += count * math.log(rate) - rate * (end - start)
    return float(result)


def _seasonal_log_likelihood(
    events: Sequence[Sequence[float]],
    coefficients: Sequence[Sequence[float]],
    period: float,
    *,
    start: float,
    end: float,
) -> float:
    result = 0.0
    for channel, stream in enumerate(events):
        intercept, sine, cosine = [float(value) for value in coefficients[channel]]

        def rate(time: float) -> float:
            phase = 2.0 * math.pi * time / period
            return math.exp(
                intercept + sine * math.sin(phase) + cosine * math.cos(phase)
            )

        result += sum(math.log(rate(event)) for event in stream if start <= event < end)
        result -= float(quad(rate, start, end, epsabs=1e-9, epsrel=1e-9, limit=100)[0])
    return float(result)


def _weibull_log_likelihood(
    events: Sequence[float],
    shape: float,
    scale: float,
    *,
    start: float,
    end: float,
) -> float:
    if shape <= 0.0 or scale <= 0.0 or end <= start:
        return float("-inf")
    history = [float(event) for event in events if event < start]
    previous = history[-1] if history else 0.0
    result = (max(0.0, start - previous) / scale) ** shape
    for event in (float(item) for item in events if start <= item < end):
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


def _exogenous_log_likelihood(
    events: Sequence[float],
    inside_rate: float,
    outside_rate: float,
    windows: Sequence[Sequence[float]],
    *,
    start: float,
    end: float,
) -> float:
    clipped = [
        (max(start, float(left)), min(end, float(right)))
        for left, right in windows
        if float(left) < end and float(right) > start
    ]
    inside_exposure = sum(max(0.0, right - left) for left, right in clipped)
    inside_count = sum(
        start <= event < end and any(left <= event < right for left, right in clipped)
        for event in events
    )
    total = sum(start <= event < end for event in events)
    return float(
        inside_count * math.log(inside_rate)
        + (total - inside_count) * math.log(outside_rate)
        - inside_rate * inside_exposure
        - outside_rate * ((end - start) - inside_exposure)
    )


def _baseline_likelihood(
    model: str,
    parameters: Mapping[str, Any],
    events: Sequence[Sequence[float]],
    *,
    start: float,
    end: float,
) -> float:
    if model == "homogeneous_poisson":
        return _homogeneous_log_likelihood(
            events,
            [float(value) for value in parameters["rates"]],
            start=start,
            end=end,
        )
    if model == "seasonal_poisson_fourier":
        return _seasonal_log_likelihood(
            events,
            parameters["coefficients"],
            float(parameters["period"]),
            start=start,
            end=end,
        )
    if model == "weibull_renewal":
        if len(events) != 1:
            return float("-inf")
        return _weibull_log_likelihood(
            events[0],
            float(parameters["shape"]),
            float(parameters["scale"]),
            start=start,
            end=end,
        )
    if model == "exogenous_window_poisson":
        if len(events) != 1:
            return float("-inf")
        return _exogenous_log_likelihood(
            events[0],
            float(parameters["inside_rate"]),
            float(parameters["outside_rate"]),
            parameters["windows"],
            start=start,
            end=end,
        )
    return float("-inf")


def _time_rescaling(
    events: Sequence[Sequence[float]],
    baseline: np.ndarray,
    alpha: np.ndarray,
    beta: np.ndarray,
    *,
    start: float,
    end: float,
) -> list[float]:
    residuals: list[float] = []
    for target, stream in enumerate(events):
        previous = start
        for event in stream:
            if event < start:
                continue
            if event >= end:
                break
            integrated = float(baseline[target] * (event - previous))
            for source, history in enumerate(events):
                for parent in history:
                    if parent >= event:
                        break
                    lower = max(previous, parent)
                    integrated += (alpha[target, source] / beta[target, source]) * (
                        math.exp(-beta[target, source] * (lower - parent))
                        - math.exp(-beta[target, source] * (event - parent))
                    )
            if integrated > 0.0 and math.isfinite(integrated):
                residuals.append(integrated)
            previous = event
    return residuals


def _residual_summary(residuals: Sequence[float]) -> dict[str, Any]:
    values = np.asarray(residuals, dtype=float)
    if values.size < 8:
        return {
            "count": int(values.size),
            "mean": None,
            "variance": None,
            "ks_statistic": None,
            "ks_pvalue": None,
            "lag1_autocorrelation": None,
            "calibrated": False,
        }
    ks = kstest(values, "expon")
    autocorrelation = (
        float(np.corrcoef(values[:-1], values[1:])[0, 1])
        if values.size > 2
        and float(np.std(values[:-1])) > 0.0
        and float(np.std(values[1:])) > 0.0
        else 0.0
    )
    return {
        "count": int(values.size),
        "mean": float(np.mean(values)),
        "variance": float(np.var(values)),
        "ks_statistic": float(ks.statistic),
        "ks_pvalue": float(ks.pvalue),
        "lag1_autocorrelation": autocorrelation,
        "calibrated": bool(
            float(ks.pvalue) >= CALIBRATION_PVALUE
            and abs(autocorrelation) <= RESIDUAL_AUTOCORRELATION_LIMIT
        ),
    }


def _coincidence_rate(events: Sequence[Sequence[float]]) -> float:
    if len(events) != 2 or not events[0] or not events[1]:
        return 0.0
    right = np.asarray(events[1], dtype=float)
    coincidences = 0
    for event in events[0]:
        index = int(np.searchsorted(right, event))
        candidates = right[max(0, index - 1) : min(len(right), index + 2)]
        if candidates.size and float(np.min(np.abs(candidates - event))) <= 1e-10:
            coincidences += 1
    return float(coincidences / min(len(events[0]), len(events[1])))


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


def _verify_baselines(
    record: Mapping[str, Any],
    events: Sequence[Sequence[float]],
    start: float,
    train_end: float,
    end: float,
    fit_oos: float,
    errors: list[str],
    world_id: str,
) -> tuple[str, float, float, int]:
    rows = _sequence(record.get("baselines"), f"baselines {world_id}", errors)
    verified: list[tuple[str, float]] = []
    allowed = {
        "homogeneous_poisson",
        "seasonal_poisson_fourier",
        "weibull_renewal",
        "exogenous_window_poisson",
    }
    for index, item in enumerate(rows):
        baseline = _mapping(item, f"baseline {world_id}:{index}", errors)
        model = baseline.get("model")
        if model not in allowed:
            errors.append(f"baseline vocabulary changed: {world_id}:{index}")
            continue
        parameters = _mapping(
            baseline.get("parameters"),
            f"baseline parameters {world_id}:{model}",
            errors,
        )
        try:
            train_likelihood = _baseline_likelihood(
                str(model), parameters, events, start=start, end=train_end
            )
            oos_likelihood = _baseline_likelihood(
                str(model), parameters, events, start=train_end, end=end
            )
        except (KeyError, IndexError, TypeError, ValueError, OverflowError) as exc:
            errors.append(f"baseline parameters are invalid: {world_id}:{model}: {exc}")
            continue
        if not _close(baseline.get("train_log_likelihood"), train_likelihood):
            errors.append(
                f"baseline train likelihood does not reconcile: {world_id}:{model}"
            )
        if not _close(baseline.get("oos_log_likelihood"), oos_likelihood):
            errors.append(
                f"baseline OOS likelihood does not reconcile: {world_id}:{model}"
            )
        verified.append((str(model), oos_likelihood))
    if not verified:
        errors.append(f"no valid baseline competitors: {world_id}")
        return "", float("nan"), float("nan"), 0
    best_model, best_oos = max(verified, key=lambda item: item[1])
    test_events = sum(
        sum(train_end <= event < end for event in stream) for stream in events
    )
    gain = fit_oos - best_oos
    return best_model, gain, gain / max(test_events, 1), test_events


def _verify_falsification_register(
    diagnostics: Mapping[str, Any],
    *,
    event_count: int,
    identifiable: bool,
    spectral_radius: float,
    gain_per_event: float,
    best_baseline: str,
    residual: Mapping[str, Any],
    supported_edges: int,
    coincidence_rate: float,
    errors: list[str],
    world_id: str,
) -> str:
    stable = spectral_radius < MAX_SPECTRAL_RADIUS
    calibrated = bool(residual.get("calibrated"))
    common_shock = coincidence_rate >= 0.08
    expected = [
        ("EVENT_COUNT", event_count >= MIN_EVENTS, event_count, MIN_EVENTS, None),
        ("PARAMETER_IDENTIFIABILITY", identifiable, None, 1e10, None),
        ("SPECTRAL_STABILITY", stable, spectral_radius, MAX_SPECTRAL_RADIUS, None),
        (
            "REGISTERED_BASELINE_DOMINANCE",
            gain_per_event >= DETECTION_GAIN_PER_EVENT,
            gain_per_event,
            DETECTION_GAIN_PER_EVENT,
            best_baseline,
        ),
        (
            "TIME_RESCALING_CALIBRATION",
            calibrated,
            residual.get("ks_pvalue"),
            CALIBRATION_PVALUE,
            None,
        ),
        (
            "RESIDUAL_DEPENDENCE",
            residual.get("lag1_autocorrelation") is not None
            and abs(float(residual["lag1_autocorrelation"]))
            <= RESIDUAL_AUTOCORRELATION_LIMIT,
            residual.get("lag1_autocorrelation"),
            RESIDUAL_AUTOCORRELATION_LIMIT,
            None,
        ),
        ("BOOTSTRAP_EDGE_SUPPORT", supported_edges > 0, supported_edges, 1, None),
        (
            "COMMON_SHOCK_CONFOUNDING",
            not common_shock,
            coincidence_rate,
            0.08,
            None,
        ),
    ]
    frozen = _sequence(
        diagnostics.get("falsification_register"),
        f"falsification register {world_id}",
        errors,
    )
    if len(frozen) != len(expected):
        errors.append(f"falsification register length changed: {world_id}")
    for index, (code, passed, value, threshold, baseline) in enumerate(expected):
        if index >= len(frozen):
            break
        row = _mapping(frozen[index], f"falsification {world_id}:{code}", errors)
        if row.get("code") != code or row.get("critical") is not True:
            errors.append(f"falsification identity changed: {world_id}:{code}")
        if row.get("status") != ("PASS" if passed else "FAIL"):
            errors.append(f"falsification status does not reconcile: {world_id}:{code}")
        if value is not None and not _close(row.get("value"), value):
            errors.append(f"falsification value does not reconcile: {world_id}:{code}")
        if not _close(row.get("threshold"), threshold):
            errors.append(f"falsification threshold changed: {world_id}:{code}")
        if baseline is not None and row.get("baseline") != baseline:
            errors.append(
                f"falsification baseline does not reconcile: {world_id}:{code}"
            )
    if common_shock:
        return "ABSTAIN"
    if not stable or not identifiable or event_count < MIN_EVENTS:
        return "ABSTAIN"
    if gain_per_event < DETECTION_GAIN_PER_EVENT or supported_edges == 0:
        return "REJECT"
    if not calibrated:
        return "ABSTAIN"
    return "DETECT"


def _verify_world(row: Any, expected_id: str, errors: list[str]) -> Mapping[str, Any]:
    record = _mapping(row, f"world record {expected_id}", errors)
    contract = EXPECTED_WORLD_CONTRACTS[expected_id]
    world = _mapping(record.get("world"), f"world {expected_id}", errors)
    if world.get("world_id") != expected_id:
        errors.append(f"world order or identity changed: {expected_id}")
    if world.get("role") != contract["role"]:
        errors.append(f"world role changed: {expected_id}")
    world_payload = dict(world)
    claimed_world_hash = world_payload.pop("world_hash", None)
    if claimed_world_hash != _canonical_sha256(world_payload):
        errors.append(f"world hash does not reconcile: {expected_id}")
    if claimed_world_hash != contract["world_hash"]:
        errors.append(f"frozen world was substituted: {expected_id}")
    truth = _mapping(record.get("truth"), f"truth {expected_id}", errors)
    if _canonical_sha256(truth) != contract["truth_hash"]:
        errors.append(f"frozen truth contract changed: {expected_id}")

    window = _mapping(world.get("observation_window"), f"window {expected_id}", errors)
    try:
        start = float(window["start"])
        end = float(window["end"])
        train_end = float(window["train_end"])
    except (KeyError, TypeError, ValueError):
        errors.append(f"observation window is incomplete: {expected_id}")
        return record
    if not (start == 0.0 < train_end < end):
        errors.append(f"observation window is invalid: {expected_id}")
    if window.get("left_censoring") != "OBSERVATION_START_RECORDED":
        errors.append(f"left censoring boundary missing: {expected_id}")
    if window.get("right_censoring") != "OBSERVATION_END_RECORDED":
        errors.append(f"right censoring boundary missing: {expected_id}")
    if window.get("time_unit") != "synthetic_time":
        errors.append(f"event-time unit changed: {expected_id}")

    streams = _sequence(world.get("event_times"), f"event_times {expected_id}", errors)
    counts = _sequence(world.get("event_counts"), f"event_counts {expected_id}", errors)
    dimension = world.get("dimension")
    if len(streams) != dimension or len(counts) != len(streams):
        errors.append(f"event stream dimensions changed: {expected_id}")
    events: list[list[float]] = []
    for channel, stream in enumerate(streams):
        try:
            values = [
                float(value)
                for value in _sequence(
                    stream, f"stream {expected_id}:{channel}", errors
                )
            ]
        except (TypeError, ValueError):
            errors.append(f"event timestamps are not numeric: {expected_id}:{channel}")
            values = []
        if values != sorted(values) or len(values) != len(set(values)):
            errors.append(
                f"event timestamps are not strictly ordered: {expected_id}:{channel}"
            )
        if any(value < start or value >= end for value in values):
            errors.append(
                f"event timestamp escaped its observation window: {expected_id}:{channel}"
            )
        if channel >= len(counts) or counts[channel] != len(values):
            errors.append(f"event count does not reconcile: {expected_id}:{channel}")
        events.append(values)

    if record.get("causal_claim_eligible") is not False:
        errors.append(f"causal claim boundary changed: {expected_id}")
    if record.get("market_claim_eligible") is not False:
        errors.append(f"market claim boundary changed: {expected_id}")
    verdicts = _mapping(record.get("verdicts"), f"verdicts {expected_id}", errors)
    if verdicts.get("economic_value") != "NOT_TESTED":
        errors.append(f"economic verdict changed: {expected_id}")
    if verdicts.get("causal_interpretation") != "NOT_ESTABLISHED":
        errors.append(f"causal interpretation changed: {expected_id}")

    fit = _mapping(record.get("fit"), f"fit {expected_id}", errors)
    try:
        baseline = np.asarray(fit["baseline"], dtype=float)
        alpha = np.asarray(fit["alpha"], dtype=float)
        beta = np.asarray(fit["beta"], dtype=float)
        claimed_branching = np.asarray(fit["branching_matrix"], dtype=float)
    except (KeyError, TypeError, ValueError):
        errors.append(f"Hawkes parameters are incomplete: {expected_id}")
        return record
    if baseline.shape != (len(events),):
        errors.append(f"Hawkes baseline dimensions changed: {expected_id}")
    if alpha.shape != (len(events), len(events)) or beta.shape != alpha.shape:
        errors.append(f"Hawkes kernel dimensions changed: {expected_id}")
        return record
    if np.any(baseline <= 0.0) or np.any(alpha < 0.0) or np.any(beta <= 0.0):
        errors.append(f"Hawkes parameters violate their domains: {expected_id}")
        return record

    calculated_branching = _branching_matrix(alpha, beta)
    if claimed_branching.shape != calculated_branching.shape or not np.allclose(
        claimed_branching, calculated_branching, rtol=5e-6, atol=5e-6
    ):
        errors.append(f"branching matrix does not reconcile: {expected_id}")
    rho = _spectral_radius(calculated_branching)
    if not _close(fit.get("spectral_radius"), rho):
        errors.append(f"spectral radius does not reconcile: {expected_id}")
    if rho >= 1.0:
        errors.append(f"unstable Hawkes fit was admitted: {expected_id}")
    train_likelihood = _hawkes_log_likelihood(
        events, baseline, alpha, beta, start=start, end=train_end
    )
    oos_likelihood = _hawkes_log_likelihood(
        events, baseline, alpha, beta, start=train_end, end=end
    )
    if not _close(fit.get("train_log_likelihood"), train_likelihood):
        errors.append(f"train likelihood does not reconcile: {expected_id}")
    if not _close(fit.get("oos_log_likelihood"), oos_likelihood):
        errors.append(f"OOS likelihood does not reconcile: {expected_id}")

    optimizer = _mapping(fit.get("optimizer"), f"optimizer {expected_id}", errors)
    if optimizer.get("method") != "L-BFGS-B deterministic multi-start":
        errors.append(f"optimizer contract changed: {expected_id}")
    if optimizer.get("starts") != 3:
        errors.append(f"optimizer start count changed: {expected_id}")
    if optimizer.get("success") is True and not _close(
        optimizer.get("objective"), -train_likelihood
    ):
        errors.append(f"optimizer objective does not reconcile: {expected_id}")
    identification = _mapping(
        fit.get("identifiability"), f"identifiability {expected_id}", errors
    )
    event_count = sum(sum(event < train_end for event in stream) for stream in events)
    parameter_count = len(events) + len(events) ** 2 + 1
    condition = identification.get("inverse_hessian_condition")
    condition_valid = condition is not None and float(condition) < 1e10
    identifiable = bool(
        optimizer.get("success") is True
        and condition_valid
        and event_count >= MIN_EVENTS * len(events)
        and rho < MAX_SPECTRAL_RADIUS
    )
    if identification.get("event_count") != event_count:
        errors.append(f"identifiability event count does not reconcile: {expected_id}")
    if identification.get("parameters") != parameter_count:
        errors.append(f"identifiability parameter count changed: {expected_id}")
    if not _close(
        identification.get("events_per_parameter"), event_count / parameter_count
    ):
        errors.append(f"events-per-parameter does not reconcile: {expected_id}")
    if identification.get("identifiable") is not identifiable:
        errors.append(f"identifiability verdict does not reconcile: {expected_id}")

    uncertainty = _mapping(
        fit.get("parameter_uncertainty"), f"uncertainty {expected_id}", errors
    )
    interval = _mapping(
        uncertainty.get("branching_matrix_ci95"),
        f"branching interval {expected_id}",
        errors,
    )
    try:
        lower = np.asarray(interval["lower"], dtype=float)
        upper = np.asarray(interval["upper"], dtype=float)
        support = np.asarray(uncertainty["edge_support"], dtype=int)
        spectral_interval = np.asarray(uncertainty["spectral_radius_ci95"], dtype=float)
    except (KeyError, TypeError, ValueError):
        errors.append(f"branching uncertainty is incomplete: {expected_id}")
        return record
    if uncertainty.get("method") != "fixed-fit event-attribution bootstrap":
        errors.append(f"branching uncertainty method changed: {expected_id}")
    if uncertainty.get("repetitions") != BOOTSTRAP_REPETITIONS:
        errors.append(f"branching bootstrap count changed: {expected_id}")
    if (
        lower.shape != alpha.shape
        or upper.shape != alpha.shape
        or support.shape != alpha.shape
    ):
        errors.append(f"branching uncertainty dimensions changed: {expected_id}")
    else:
        if np.any(lower < 0.0) or np.any(upper < lower):
            errors.append(f"branching uncertainty interval is invalid: {expected_id}")
        if np.any(calculated_branching < lower) or np.any(calculated_branching > upper):
            errors.append(f"branching estimate escaped its interval: {expected_id}")
        if not np.array_equal(support, (lower > EDGE_SUPPORT_THRESHOLD).astype(int)):
            errors.append(f"edge-support decisions do not reconcile: {expected_id}")
    if (
        spectral_interval.shape != (2,)
        or spectral_interval[0] < 0.0
        or spectral_interval[0] > rho
        or spectral_interval[1] < rho
    ):
        errors.append(f"spectral-radius interval is invalid: {expected_id}")

    diagnostics = _mapping(
        record.get("diagnostics"), f"diagnostics {expected_id}", errors
    )
    frozen_residuals = _sequence(
        diagnostics.get("transformed_intervals"),
        f"transformed residuals {expected_id}",
        errors,
    )
    recalculated = _time_rescaling(
        events, baseline, alpha, beta, start=train_end, end=end
    )
    if len(frozen_residuals) != len(recalculated) or not np.allclose(
        np.asarray(frozen_residuals, dtype=float),
        np.asarray(recalculated, dtype=float),
        rtol=5e-6,
        atol=5e-6,
    ):
        errors.append(f"time-rescaling intervals do not reconcile: {expected_id}")
    residual = _residual_summary(recalculated)
    frozen_summary = _mapping(
        diagnostics.get("time_rescaling"),
        f"time-rescaling summary {expected_id}",
        errors,
    )
    for name in (
        "count",
        "mean",
        "variance",
        "ks_statistic",
        "ks_pvalue",
        "lag1_autocorrelation",
    ):
        expected_value = residual[name]
        if expected_value is None:
            if frozen_summary.get(name) is not None:
                errors.append(f"time-rescaling {name} changed: {expected_id}")
        elif not _close(frozen_summary.get(name), expected_value):
            errors.append(f"time-rescaling {name} does not reconcile: {expected_id}")
    if frozen_summary.get("calibrated") is not residual["calibrated"]:
        errors.append(f"time-rescaling verdict does not reconcile: {expected_id}")

    best_baseline, gain, gain_per_event, test_events = _verify_baselines(
        record, events, start, train_end, end, oos_likelihood, errors, expected_id
    )
    if diagnostics.get("best_baseline") != best_baseline:
        errors.append(f"best baseline does not reconcile: {expected_id}")
    if not _close(diagnostics.get("oos_log_likelihood_gain"), gain):
        errors.append(f"OOS gain does not reconcile: {expected_id}")
    if not _close(diagnostics.get("oos_gain_per_event"), gain_per_event):
        errors.append(f"OOS gain per event does not reconcile: {expected_id}")
    if diagnostics.get("test_events") != test_events:
        errors.append(f"test event count does not reconcile: {expected_id}")
    coincidence = _coincidence_rate(events)
    if not _close(diagnostics.get("coincidence_rate"), coincidence):
        errors.append(f"coincidence rate does not reconcile: {expected_id}")

    calculated_decision = _verify_falsification_register(
        diagnostics,
        event_count=event_count,
        identifiable=identifiable,
        spectral_radius=rho,
        gain_per_event=gain_per_event,
        best_baseline=best_baseline,
        residual=residual,
        supported_edges=int(np.sum(support)),
        coincidence_rate=coincidence,
        errors=errors,
        world_id=expected_id,
    )
    if record.get("decision") != calculated_decision:
        errors.append(f"world decision does not reconcile: {expected_id}")
    if record.get("decision") != contract["decision"]:
        errors.append(f"frozen world outcome changed: {expected_id}")
    process_verdict = (
        "ACCEPT" if calculated_decision == "DETECT" else calculated_decision
    )
    predictive_verdict = (
        "ACCEPT"
        if calculated_decision == "DETECT" and gain > 0.0
        else "REJECT" if calculated_decision == "REJECT" else "ABSTAIN"
    )
    if verdicts.get("process_fit") != process_verdict:
        errors.append(f"process verdict does not reconcile: {expected_id}")
    if verdicts.get("predictive_value") != predictive_verdict:
        errors.append(f"predictive verdict does not reconcile: {expected_id}")
    return record


def _metric_map(
    artifact: Mapping[str, Any], errors: list[str]
) -> dict[str, Mapping[str, Any]]:
    rows = _sequence(artifact.get("metrics"), "metrics", errors)
    result: dict[str, Mapping[str, Any]] = {}
    for item in rows:
        row = _mapping(item, "metric", errors)
        name = row.get("metric")
        if not isinstance(name, str) or name in result:
            errors.append("metric names must be unique strings")
            continue
        result[name] = row
    if set(result) != set(METRIC_DEFINITIONS):
        errors.append("metric vector changed")
    for name, definition in METRIC_DEFINITIONS.items():
        if name in result and result[name].get("definition") != definition:
            errors.append(f"metric definition changed: {name}")
    return result


def _expected_metrics(
    worlds: Sequence[Mapping[str, Any]], errors: list[str]
) -> dict[str, tuple[float, int, float | None, list[float] | None]]:
    negatives = [
        row
        for row in worlds
        if _mapping(row.get("world"), "metric world", errors).get("role")
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
        if _mapping(row.get("world"), "metric world", errors).get("role")
        in {"positive_control", "near_critical_control", "cross_positive_control"}
    ]
    false_discoveries = sum(row.get("decision") == "DETECT" for row in negatives)
    true_detections = sum(row.get("decision") == "DETECT" for row in positives)
    numerical_failures = 0
    calibrated = 0
    abstentions = sum(row.get("decision") == "ABSTAIN" for row in worlds)
    true_edges: set[tuple[str, int, int]] = set()
    fitted_edges: set[tuple[str, int, int]] = set()
    covered_edges = 0
    branching_errors: list[float] = []
    direction_worlds = 0
    direction_correct = 0
    by_id: dict[str, Mapping[str, Any]] = {}
    for row in worlds:
        world = _mapping(row.get("world"), "metric world", errors)
        world_id = str(world.get("world_id"))
        by_id[world_id] = row
        fit = _mapping(row.get("fit"), f"metric fit {world_id}", errors)
        optimizer = _mapping(
            fit.get("optimizer"), f"metric optimizer {world_id}", errors
        )
        numerical_failures += int(optimizer.get("success") is not True)
        diagnostics = _mapping(
            row.get("diagnostics"), f"metric diagnostics {world_id}", errors
        )
        residual = _mapping(
            diagnostics.get("time_rescaling"), f"metric residual {world_id}", errors
        )
        calibrated += int(residual.get("calibrated") is True)
        truth = _mapping(row.get("truth"), f"metric truth {world_id}", errors)
        truth_matrix = np.asarray(truth.get("branching_matrix"), dtype=float)
        uncertainty = _mapping(
            fit.get("parameter_uncertainty"), f"metric uncertainty {world_id}", errors
        )
        interval = _mapping(
            uncertainty.get("branching_matrix_ci95"),
            f"metric branching interval {world_id}",
            errors,
        )
        lower = np.asarray(interval.get("lower"), dtype=float)
        upper = np.asarray(interval.get("upper"), dtype=float)
        support = np.asarray(uncertainty.get("edge_support"), dtype=int)
        if float(truth.get("spectral_radius", 0.0)) > 0.0:
            branching_errors.append(
                abs(
                    float(fit.get("spectral_radius"))
                    - float(truth.get("spectral_radius"))
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
                if support[target, source] == 1 and row.get("decision") == "DETECT":
                    fitted_edges.add(key)
        if world.get("role") == "cross_positive_control":
            direction_worlds += 1
            expected = {
                (source, target)
                for candidate_id, source, target in true_edges
                if candidate_id == world_id
            }
            observed = {
                (source, target)
                for candidate_id, source, target in fitted_edges
                if candidate_id == world_id
            }
            direction_correct += int(expected == observed)

    edge_true_positives = len(true_edges & fitted_edges)
    precision_denominator = len(fitted_edges)
    recall_denominator = len(true_edges)
    near = by_id["near_critical_hawkes"]
    seasonal = by_id["seasonal_poisson"]
    common = by_id["common_shock"]
    positive_gains = [
        float(
            _mapping(row.get("diagnostics"), "positive diagnostics", errors).get(
                "oos_log_likelihood_gain"
            )
        )
        for row in positives
    ]

    def ratio(
        numerator: float, denominator: int
    ) -> tuple[float, int, float | None, list[float] | None]:
        estimate = numerator / denominator if denominator else None
        interval = (
            _ratio_interval(int(round(numerator)), denominator)
            if float(numerator).is_integer()
            else None
        )
        return numerator, denominator, estimate, interval

    branching_sum = float(sum(branching_errors))
    gain_sum = float(sum(positive_gains))
    near_fit = _mapping(near.get("fit"), "near-critical fit", errors)
    return {
        "false_excitation_discovery_rate": ratio(false_discoveries, len(negatives)),
        "true_excitation_detection_rate": ratio(true_detections, len(positives)),
        "cross_excitation_precision": ratio(edge_true_positives, precision_denominator),
        "cross_excitation_recall": ratio(edge_true_positives, recall_denominator),
        "branching_ratio_error": (
            branching_sum,
            len(branching_errors),
            branching_sum / len(branching_errors) if branching_errors else None,
            None,
        ),
        "branching_ratio_ci_coverage": ratio(covered_edges, recall_denominator),
        "direction_recovery_accuracy": ratio(direction_correct, direction_worlds),
        "near_critical_detection": ratio(
            int(
                near.get("decision") == "DETECT"
                and float(near_fit.get("spectral_radius")) >= 0.65
            ),
            1,
        ),
        "seasonality_confounding_rate": ratio(
            int(seasonal.get("decision") == "DETECT"), 1
        ),
        "common_shock_confounding_rate": ratio(
            int(common.get("decision") == "DETECT"), 1
        ),
        "oos_log_likelihood_gain": (
            gain_sum,
            len(positive_gains),
            gain_sum / len(positive_gains),
            None,
        ),
        "time_rescaling_calibration_rate": ratio(calibrated, len(worlds)),
        "numerical_failure_rate": ratio(numerical_failures, len(worlds)),
        "abstention_rate": ratio(abstentions, len(worlds)),
    }


def _verify_metrics(
    artifact: Mapping[str, Any],
    worlds: Sequence[Mapping[str, Any]],
    errors: list[str],
) -> dict[str, Mapping[str, Any]]:
    metrics = _metric_map(artifact, errors)
    expected = _expected_metrics(worlds, errors)
    for name, (numerator, denominator, estimate, wilson) in expected.items():
        row = metrics.get(name)
        if row is None:
            continue
        if not _close(row.get("numerator"), numerator):
            errors.append(f"metric numerator does not reconcile: {name}")
        if row.get("denominator") != denominator:
            errors.append(f"metric denominator does not reconcile: {name}")
        if estimate is None:
            if row.get("estimate") is not None:
                errors.append(f"metric estimate does not reconcile: {name}")
        elif not _close(row.get("estimate"), estimate):
            errors.append(f"metric estimate does not reconcile: {name}")
        frozen_wilson = row.get("wilson95")
        if wilson is None:
            if frozen_wilson is not None:
                errors.append(f"metric interval does not reconcile: {name}")
        elif (
            not isinstance(frozen_wilson, list)
            or len(frozen_wilson) != 2
            or not np.allclose(
                np.asarray(frozen_wilson, dtype=float),
                np.asarray(wilson, dtype=float),
                rtol=5e-6,
                atol=5e-6,
            )
        ):
            errors.append(f"metric interval does not reconcile: {name}")
    return metrics


def _verify_program_result(
    artifact: Mapping[str, Any],
    metrics: Mapping[str, Mapping[str, Any]],
    errors: list[str],
) -> Mapping[str, Any]:
    def estimate(name: str) -> float:
        value = metrics.get(name, {}).get("estimate")
        return float(value) if value is not None else 0.0

    checks = {
        "false_excitation_control": estimate("false_excitation_discovery_rate") <= 0.15,
        "true_excitation_detection": estimate("true_excitation_detection_rate") >= 0.60,
        "cross_excitation_precision": estimate("cross_excitation_precision") >= 0.75,
        "cross_excitation_recall": estimate("cross_excitation_recall") >= 0.60,
        "branching_interval_coverage": estimate("branching_ratio_ci_coverage") >= 0.60,
        "direction_recovery": estimate("direction_recovery_accuracy") >= 0.75,
        "near_critical_detection": estimate("near_critical_detection") == 1.0,
        "seasonality_resistance": estimate("seasonality_confounding_rate") == 0.0,
        "common_shock_resistance": estimate("common_shock_confounding_rate") == 0.0,
        "time_rescaling_calibration": estimate("time_rescaling_calibration_rate")
        >= 0.75,
        "numerical_stability": estimate("numerical_failure_rate") == 0.0,
    }
    passed = sum(checks.values())
    if passed == len(checks):
        status = "SYNTHETIC_CERTIFICATION_SUPPORTED"
    elif passed >= math.ceil(len(checks) * 0.55):
        status = "PARTIALLY_CHARACTERIZED"
    else:
        status = "INSTRUMENT_REJECTED"
    result = _mapping(artifact.get("program_result"), "program_result", errors)
    if result.get("capability_checks") != checks:
        errors.append("program capability checks do not reconcile")
    if result.get("status") != status:
        errors.append("program result does not reconcile")
    if result.get("scalar_score") is not None:
        errors.append("D0.4 capability vector must not collapse into one score")
    expected_interpretation = (
        "This verdict applies only to frozen synthetic event processes. It does not establish "
        "market usefulness or economic causation."
    )
    if result.get("interpretation") != expected_interpretation:
        errors.append("program interpretation changed")
    return result


def _verify_source_seals(artifact: Mapping[str, Any], errors: list[str]) -> None:
    seals = _mapping(
        artifact.get("implementation_sources"), "implementation_sources", errors
    )
    expected_paths = {
        "src/dynamics/hawkes_certification.py",
        "src/dynamics/hawkes_verifier.py",
    }
    if set(seals) != expected_paths:
        errors.append("implementation source manifest changed")
        return
    for relative in sorted(expected_paths):
        path = ROOT / relative
        try:
            calculated = _normalized_source_sha256(path)
        except OSError as exc:
            errors.append(f"implementation source cannot be read: {relative}: {exc}")
            continue
        if seals.get(relative) != calculated:
            errors.append(f"implementation source seal changed: {relative}")


def verify_hawkes_certification(artifact: Mapping[str, Any]) -> dict[str, Any]:
    """Verify D0.4 independently from frozen timestamps and fitted evidence."""

    errors: list[str] = []
    payload = dict(artifact)
    claimed_hash = payload.pop("artifact_hash", None)
    payload.pop("file_sha256", None)
    calculated_hash = _canonical_sha256(payload)
    if claimed_hash != calculated_hash:
        errors.append("artifact_hash does not match the canonical D0.4 payload")
    if artifact.get("schema_version") != SCHEMA_VERSION:
        errors.append("schema_version is not dynamics-hawkes-certification/0.4")
    if artifact.get("milestone") != "D0.4" or artifact.get("frozen") is not True:
        errors.append("D0.4 freeze identity changed")
    if artifact.get("program") != "HAWKES_EVENT_PROCESS_CERTIFICATION":
        errors.append("D0.4 program identity changed")
    if artifact.get("causal_claim_eligible") is not False:
        errors.append("causal_claim_eligible must remain false")
    if artifact.get("market_claim_eligible") is not False:
        errors.append("market_claim_eligible must remain false")

    boundary = _mapping(
        artifact.get("nonlinear_program_boundary"), "nonlinear boundary", errors
    )
    if boundary.get("tag") != "dynamics-v0.3.4":
        errors.append("nonlinear freeze tag changed")
    if boundary.get("commit") != "fef3d212c86716d33d9041cb014b757cd5574e19":
        errors.append("nonlinear freeze commit changed")
    if boundary.get("status") != "PARTIALLY_CHARACTERIZED":
        errors.append("nonlinear program result changed")
    if boundary.get("artifacts_regenerated") is not False:
        errors.append("D0.3.x artifact regeneration is forbidden")

    execution = _mapping(artifact.get("execution"), "execution", errors)
    if execution.get("worlds_planned") != len(EXPECTED_WORLD_CONTRACTS):
        errors.append("planned world count changed")
    if execution.get("worlds_executed") != len(EXPECTED_WORLD_CONTRACTS):
        errors.append("executed world count changed")
    if execution.get("development_worlds") != 0:
        errors.append("frozen certification cannot contain development worlds")
    if execution.get("train_fraction") != 0.70:
        errors.append("train fraction changed")
    if execution.get("event_time_representation") != "continuous timestamps":
        errors.append("continuous event-time representation changed")
    if execution.get("arbitrary_bar_discretization") is not False:
        errors.append("D0.4 must retain continuous event times")
    if execution.get("bootstrap_repetitions") != BOOTSTRAP_REPETITIONS:
        errors.append("bootstrap repetition count changed")

    thresholds = _mapping(artifact.get("thresholds"), "thresholds", errors)
    expected_thresholds = {
        "minimum_events": MIN_EVENTS,
        "maximum_spectral_radius": MAX_SPECTRAL_RADIUS,
        "minimum_oos_gain_per_event": DETECTION_GAIN_PER_EVENT,
        "minimum_edge_support": EDGE_SUPPORT_THRESHOLD,
        "time_rescaling_ks_pvalue": CALIBRATION_PVALUE,
        "maximum_residual_autocorrelation": RESIDUAL_AUTOCORRELATION_LIMIT,
    }
    if thresholds != expected_thresholds:
        errors.append("frozen decision thresholds changed")

    worlds = _sequence(artifact.get("worlds"), "worlds", errors)
    expected_ids = list(EXPECTED_WORLD_CONTRACTS)
    if len(worlds) != len(expected_ids):
        errors.append("frozen world count changed")
    verified_worlds: list[Mapping[str, Any]] = []
    for index, expected_id in enumerate(expected_ids):
        if index >= len(worlds):
            break
        try:
            verified_worlds.append(_verify_world(worlds[index], expected_id, errors))
        except Exception as exc:  # fail closed on malformed evidence, never admit it
            errors.append(f"world verification crashed closed: {expected_id}: {exc}")

    metrics: dict[str, Mapping[str, Any]] = {}
    try:
        metrics = _verify_metrics(artifact, verified_worlds, errors)
    except Exception as exc:  # fail closed on malformed aggregate evidence
        errors.append(f"aggregate metric verification crashed closed: {exc}")
    result = _verify_program_result(artifact, metrics, errors)
    _verify_source_seals(artifact, errors)

    return {
        "valid": not errors,
        "errors": errors,
        "artifact_hash": claimed_hash,
        "calculated_hash": calculated_hash,
        "worlds": len(worlds),
        "program_result": result.get("status"),
        "causal_claim_eligible": artifact.get("causal_claim_eligible"),
        "market_claim_eligible": artifact.get("market_claim_eligible"),
    }
