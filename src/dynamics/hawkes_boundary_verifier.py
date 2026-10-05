"""Independent arithmetic and matched-evidence verifier; no instrument imports."""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
import copy
from pathlib import Path
from typing import Any, Mapping

import numpy as np
from scipy.stats import kstest

ROOT = Path(__file__).resolve().parents[2]
PROTOCOLS = (
    "ZERO",
    "KNOWN",
    "ORACLE",
    "STATIONARY_MEAN",
    "WARM_1",
    "WARM_2",
    "WARM_5",
    "WARM_10",
    "LEFT_CENSORED",
)
LABELS = ("NONE", "A_TO_B", "B_TO_A", "BIDIRECTIONAL")
TAGS = (
    "BOUNDARY_INDUCED_EDGE",
    "DIRECTION_REVERSAL",
    "COMMON_DRIVER_ALIASING",
    "SELF_TO_CROSS_LEAKAGE",
    "SPARSE_EVENT_FALSE_EDGE",
    "SYMMETRIC_EDGE_AMBIGUITY",
    "UNEXPLAINED",
)
SOURCES = (
    "src/dynamics/hawkes_boundary.py",
    "src/dynamics/hawkes_boundary_analysis.py",
    "src/dynamics/hawkes_boundary_verifier.py",
    "scripts/freeze_dynamics_d0_4_1_1.py",
    "scripts/verify_dynamics_d0_4_1_1.py",
    "docs/dynamics-lab-d0-4-1-1-preregistration.md",
)
PARENTS = {
    "D0.4": (
        "eval/dynamics/d0_4/hawkes_certification.json",
        "020c2c0f8c875ef32915512db14427a5fa543a8a0169e907a6825a6f9f1c4039",
        "364a918006f4e02eadc024d206202e96ed8e3af5862baacd76bd8b0e87fca47f",
    ),
    "D0.4.1": (
        "eval/dynamics/d0_4_1/hawkes_identifiability.json",
        "36544d42957205ec62982f289afb16cdf95d54a1cb6bd58b74871038f5c83c54",
        "3d80b5ec6e7f9a37f6cae58f4d2905a3032eb7e04e4733ee802d09994c156304",
    ),
}
CLAIMS = {
    "market_claim_eligible": False,
    "causal_claim_eligible": False,
    "predictive_validity_tested": False,
    "economic_utility_tested": False,
    "causal_identification_tested": False,
    "estimator_repair_implemented": False,
}
THRESHOLDS = {
    "edge_support": 0.035,
    "stability": 0.995,
    "minimum_boundary_pairs": 48,
    "oracle_rmse_reduction": 0.25,
    "known_rmse_reduction": 0.20,
    "oracle_improved_fraction": 0.60,
    "oracle_absolute_improvement": 0.02,
    "oracle_mean_improvement": 0.05,
    "condition_low": 1e4,
    "condition_high": 1e6,
    "condition_low_state": 1e8,
    "minimum_geometry_group": 15,
    "high_condition_graph_error": 0.50,
    "geometry_error_gap": 0.20,
}


def _hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


def _compare(
    actual: Any,
    expected: Any,
    errors: list[str],
    label: str,
    *,
    tolerance: tuple[float, float] = (5e-6, 5e-6),
) -> None:
    if isinstance(expected, Mapping):
        if not isinstance(actual, Mapping) or set(actual) != set(expected):
            errors.append(label + ": fields")
            return
        for key, value in expected.items():
            _compare(actual[key], value, errors, label + "." + key, tolerance=tolerance)
    elif isinstance(expected, (list, tuple, np.ndarray)):
        if not isinstance(actual, (list, tuple, np.ndarray)) or len(actual) != len(
            expected
        ):
            errors.append(label + ": length")
            return
        for i, value in enumerate(expected):
            _compare(actual[i], value, errors, label + f"[{i}]", tolerance=tolerance)
    elif isinstance(expected, (float, np.floating)):
        if (
            isinstance(actual, bool)
            or not isinstance(actual, (int, float))
            or not math.isfinite(actual)
            or not math.isclose(
                actual, float(expected), rel_tol=tolerance[0], abs_tol=tolerance[1]
            )
        ):
            errors.append(label + ": numeric")
    elif actual != expected or (
        isinstance(expected, bool) and type(actual) is not bool
    ):
        errors.append(label + ": value")


def _design() -> list[dict]:
    output = []
    for family in ("CRITICALITY", "GRAPH"):
        regimes = (
            (0.70, 0.85, 0.93, 0.97, 0.99)
            if family == "CRITICALITY"
            else (
                "NONE",
                "DIRECTED_WITH_SELF",
                "BIDIRECTIONAL",
                "OBSERVED_DRIVER",
                "LATENT_DRIVER",
            )
        )
        for regime in regimes:
            for info, target in zip(
                ("SPARSE", "LIMITED", "MODERATE", "RICH"), (100, 300, 1000, 3000)
            ):
                for v in range(5):
                    if family == "CRITICALITY":
                        baseline, matrix, observed = [0.55 + 0.1 * v], [[regime]], [0]
                    else:
                        dimension = (
                            3 if regime in ("OBSERVED_DRIVER", "LATENT_DRIVER") else 2
                        )
                        baseline = [0.6 + 0.08 * v - 0.05 * i for i in range(dimension)]
                        matrix = [[0.0] * dimension for _ in range(dimension)]
                        observed = (
                            [0, 1]
                            if regime == "LATENT_DRIVER"
                            else list(range(dimension))
                        )
                        if regime == "NONE" and v > 0:
                            matrix[0][0], matrix[1][1] = 0.2, 0.25
                        if regime == "DIRECTED_WITH_SELF":
                            origin, dest = (0, 1) if v % 2 == 0 else (1, 0)
                            matrix[dest][origin] = 0.22
                            matrix[origin][origin], matrix[dest][dest] = 0.1, 0.28
                        if regime == "BIDIRECTIONAL":
                            matrix[0][0] = matrix[1][1] = 0.1
                            matrix[1][0], matrix[0][1] = (
                                (0.22, 0.22) if v % 2 == 0 else (0.12, 0.32)
                            )
                        if dimension == 3:
                            for i in range(3):
                                matrix[i][i] = 0.1
                            matrix[0][2] = matrix[1][2] = 0.28
                    output.append(
                        {
                            "id": f"{family.lower()}_{regime}_{info.lower()}_v{v}",
                            "family": family,
                            "regime": str(regime),
                            "information": info,
                            "target": target,
                            "variant": v,
                            "seed": 511001 + len(output),
                            "mu": baseline,
                            "G": matrix,
                            "beta": (0.8, 1.2, 1.8, 2.4, 3.2)[v],
                            "observed": observed,
                            "audit": family == "CRITICALITY" and v == 0,
                        }
                    )
    return _rounded(output)


def _groups(events: list[list[float]]) -> list[tuple[float, np.ndarray]]:
    points = {}
    for channel, stream in enumerate(events):
        for t in stream:
            points.setdefault(t, np.zeros(len(events), dtype=int))[channel] += 1
    return sorted(points.items())


def _rho(matrix: Any) -> float:
    g = np.asarray(matrix)
    return float(g[0, 0]) if len(g) == 1 else float(max(abs(np.linalg.eigvals(g))))


def _initial(fit: Mapping[str, Any], exposure: Mapping[str, Any]) -> np.ndarray:
    mu, alpha, beta = np.asarray(fit["baseline"]), np.asarray(fit["alpha"]), fit["beta"]
    if exposure["name"] == "ORACLE":
        return np.asarray(exposure["initial_excitation"])
    if exposure["name"] == "STATIONARY_MEAN":
        return np.linalg.solve(np.eye(len(mu)) - alpha / beta, mu) - mu
    return alpha @ np.array(
        [sum(math.exp(beta * t) for t in stream) for stream in exposure["history"]]
    )


def _likelihood(
    events: list, horizon: float, fit: Mapping[str, Any], exposure: Mapping[str, Any]
) -> float:
    mu, alpha, beta = (
        np.asarray(fit["baseline"]),
        np.asarray(fit["alpha"]),
        float(fit["beta"]),
    )
    excitation = _initial(fit, exposure)
    previous, log_part, integral = 0.0, 0.0, 0.0
    for time, marks in _groups(events):
        delta = time - previous
        decay = math.exp(-beta * delta)
        integral += float(
            np.sum(mu) * delta + np.sum(excitation) * (1.0 - decay) / beta
        )
        excitation *= decay
        log_part += float(np.sum(marks * np.log(mu + excitation)))
        excitation += alpha @ marks
        previous = time
    delta = horizon - previous
    integral += float(
        np.sum(mu) * delta + np.sum(excitation) * (1.0 - math.exp(-beta * delta)) / beta
    )
    return log_part - integral


def _residuals(
    events: list, fit: Mapping[str, Any], horizon: float, exposure: Mapping[str, Any]
) -> dict:
    mu, alpha, beta = np.asarray(fit["baseline"]), np.asarray(fit["alpha"]), fit["beta"]
    excitation = _initial(fit, exposure)
    clocks, last = np.zeros(len(mu)), np.zeros(len(mu))
    values, previous = [], 0.0
    for time, marks in _groups(events):
        dt = time - previous
        decay = math.exp(-beta * dt)
        clocks += mu * dt + excitation * (1.0 - decay) / beta
        excitation *= decay
        for target, count in enumerate(marks):
            for _ in range(int(count)):
                z = float(clocks[target] - last[target])
                last[target] = clocks[target]
                if z > 0.0:
                    values.append(z)
        excitation += alpha @ marks
        previous = time
    if len(values) < 8:
        return {
            "count": len(values),
            "mean": None,
            "variance": None,
            "ks_pvalue": None,
            "lag1_autocorrelation": None,
            "calibrated": False,
        }
    values = np.asarray(values)
    corr = (
        float(np.corrcoef(values[:-1], values[1:])[0, 1])
        if np.std(values[:-1]) > 0 and np.std(values[1:]) > 0
        else 0.0
    )
    p = float(kstest(values, "expon").pvalue)
    return {
        "count": len(values),
        "mean": float(np.mean(values)),
        "variance": float(np.var(values)),
        "ks_pvalue": p,
        "lag1_autocorrelation": corr,
        "calibrated": p >= 0.01 and abs(corr) <= 0.25,
    }


def _interval(
    g: np.ndarray, lower: np.ndarray, upper: np.ndarray, truth: np.ndarray
) -> dict:
    return {
        "estimate": g,
        "lower": lower,
        "upper": upper,
        "width": upper - lower,
        "covered": ((truth >= lower) & (truth <= upper)).astype(int),
    }


def _hessian(fit: dict, truth: np.ndarray, seed: int) -> dict:
    g, c = np.asarray(fit["branching_matrix"]), fit["log_parameter_covariance"]
    if c is None:
        empty = [[None] * len(g) for _ in g]
        return {
            "method": "INVERSE_HESSIAN_DELTA",
            "available": False,
            "branching": {
                "estimate": g,
                "lower": empty,
                "upper": empty,
                "width": empty,
                "covered": np.zeros_like(g, dtype=int),
            },
            "spectral_radius_ci95": None,
        }
    c = np.asarray(c)
    n, last = len(g), len(c) - 1
    se = np.empty_like(g)
    for target in range(n):
        for source in range(n):
            i = n + target * n + source
            se[target, source] = g[target, source] * math.sqrt(
                max(0.0, c[i, i] + c[last, last] - 2.0 * c[i, last])
            )
    lower, upper = (
        np.maximum(0.0, g - 1.959963984540054 * se),
        g + 1.959963984540054 * se,
    )
    w, v = np.linalg.eigh((c + c.T) / 2.0)
    root = (v * np.sqrt(np.maximum(w, 0.0))) @ v.T
    draws = np.random.default_rng(seed).standard_normal((256, len(c))) @ root.T
    rhos = [
        _rho(g * np.exp(np.clip(d[n:last].reshape(n, n) - d[last], -12.0, 12.0)))
        for d in draws
    ]
    return {
        "method": "INVERSE_HESSIAN_DELTA",
        "available": True,
        "branching": _interval(g, lower, upper, truth),
        "spectral_radius_ci95": np.quantile(rhos, [0.025, 0.975]),
    }


def _attribution(
    events: list, fit: dict, truth: np.ndarray, horizon: float, seed: int
) -> dict:
    n, beta = len(events), fit["beta"]
    mu, alpha, g = (
        np.asarray(fit["baseline"]),
        np.asarray(fit["alpha"]),
        np.asarray(fit["branching_matrix"]),
    )
    # Intentionally reconstruct the historical zero-history responsibility rule.
    q, previous = np.zeros(n), 0.0
    responsibilities = [[] for _ in range(n)]
    for t, marks in _groups(events):
        q *= math.exp(-beta * (t - previous))
        intensity = mu + alpha @ q
        for i, count in enumerate(marks):
            responsibilities[i].extend(
                [alpha[i] * q / max(float(intensity[i]), 1e-12)] * int(count)
            )
        q += marks
        previous = t
    arrays = [np.asarray(r).reshape(-1, n) for r in responsibilities]
    draws = np.zeros((64, n, n))
    rng = np.random.default_rng(seed)
    counts = np.array([max(1, len(s)) for s in events])
    for k in range(64):
        for i, array in enumerate(arrays):
            if len(array):
                indices = rng.integers(0, len(array), size=len(array))
                draws[k, i] = array[indices].sum(axis=0) / counts
    center = np.median(draws, axis=0)
    half = np.maximum(
        np.quantile(draws, 0.975, axis=0) - center,
        center - np.quantile(draws, 0.025, axis=0),
    )
    lower, upper = np.maximum(0.0, g - half), g + half
    rhos = np.array([_rho(sample) for sample in draws])
    middle = float(np.median(rhos))
    half_rho = max(
        float(np.quantile(rhos, 0.975) - middle),
        float(middle - np.quantile(rhos, 0.025)),
    )
    rho = fit["spectral_radius"]
    return {
        "method": "EVENT_ATTRIBUTION_BOOTSTRAP",
        "available": True,
        "repetitions": 64,
        "seed": seed,
        "branching": _interval(g, lower, upper, truth),
        "edge_support": (lower > 0.035).astype(int),
        "bootstrap_support_probability": np.mean(g + draws - center > 0.035, axis=0),
        "spectral_radius_ci95": [max(0.0, rho - half_rho), rho + half_rho],
    }


def _graph(truth: np.ndarray, supported: np.ndarray) -> dict:
    actual = {
        (j, i)
        for i in range(len(truth))
        for j in range(len(truth))
        if i != j and truth[i, j] > 0.035
    }
    inferred = {
        (j, i)
        for i in range(len(truth))
        for j in range(len(truth))
        if i != j and supported[i, j] == 1
    }
    tp, fp, fn = len(actual & inferred), len(inferred - actual), len(actual - inferred)
    reversed_count = sum(
        (target, source) in inferred and (target, source) not in actual
        for source, target in actual
    )
    status = (
        "EXACT"
        if actual == inferred
        else (
            "ABSTAIN"
            if not inferred
            else (
                "REVERSED"
                if reversed_count and tp == 0
                else (
                    "PARTIAL"
                    if tp
                    else "MISSED_WITH_FALSE_EDGE" if actual else "FALSE_EDGE"
                )
            )
        )
    )
    return {
        "true_edges": [{"source": s, "target": t} for s, t in sorted(actual)],
        "inferred_edges": [{"source": s, "target": t} for s, t in sorted(inferred)],
        "true_positive": tp,
        "false_positive": fp,
        "false_negative": fn,
        "reversed_edges": reversed_count,
        "exact_graph": actual == inferred,
        "abstained": not inferred and bool(actual),
        "direction_class": status,
    }


def _topology(g: np.ndarray, supported: bool = False) -> str:
    if len(g) < 2:
        return "NONE"
    a, b = (
        (bool(g[1, 0]), bool(g[0, 1]))
        if supported
        else (g[1, 0] > 0.035, g[0, 1] > 0.035)
    )
    return "BIDIRECTIONAL" if a and b else "A_TO_B" if a else "B_TO_A" if b else "NONE"


def _geometry(fit: dict) -> dict:
    if fit["log_parameter_covariance"] is None:
        return {
            "condition": None,
            "eigen_min": None,
            "eigen_max": None,
            "kind": "L_BFGS_INVERSE_CURVATURE_NOT_FISHER",
        }
    covariance = np.asarray(fit["log_parameter_covariance"])
    eigen = np.linalg.eigvalsh((covariance + covariance.T) / 2.0)
    return {
        "condition": float(np.linalg.cond(covariance)),
        "eigen_min": float(min(eigen)),
        "eigen_max": float(max(eigen)),
        "kind": "L_BFGS_INVERSE_CURVATURE_NOT_FISHER",
    }


def _state(row: dict, truth: np.ndarray, count: int) -> str:
    c = row["geometry"]["condition"]
    if not row["fit"]["optimizer"]["success"] or count < 50 or c is None:
        return "UNRESOLVED"
    mask = truth > 0.035
    eligible = [
        row["uncertainty"][m]
        for m in ("inverse_hessian", "event_attribution")
        if row["uncertainty"][m]["available"]
    ]
    covered = all(np.all(np.asarray(m["branching"]["covered"])[mask]) for m in eligible)
    if (
        row["graph"]["false_positive"]
        or row["graph"]["reversed_edges"]
        or c >= 1e8
        or not covered
    ):
        return "LOW"
    widths = np.asarray(row["uncertainty"]["event_attribution"]["branching"]["width"])[
        mask
    ]
    return (
        "HIGH"
        if row["graph"]["exact_graph"]
        and count >= 300
        and c < 1e4
        and len(eligible) == 2
        and (float(np.median(widths)) if len(widths) else 0.0) <= 0.5
        else "PARTIAL"
    )


def _rounded(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        return _rounded(value.tolist())
    if isinstance(value, Mapping):
        return {k: _rounded(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_rounded(v) for v in value]
    if isinstance(value, (float, np.floating)):
        return round(float(value), 9) if math.isfinite(value) else None
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def _latent(spec: dict) -> dict:
    # Independent scalar Ogata replay authenticates the seed and realized stream.
    mu, g, beta = np.asarray(spec["mu"]), np.asarray(spec["G"]), spec["beta"]
    rates = np.linalg.solve(np.eye(len(mu)) - g, mu)
    horizon = max(2.0, spec["target"] / sum(rates[spec["observed"]]))
    half = math.log(2.0) / beta
    prefix = 128 * half
    initial = rates / beta
    state, now = initial.copy(), 0.0
    streams = [[] for _ in mu]
    rng = np.random.default_rng(spec["seed"])
    alpha = g * beta
    while now < prefix + horizon:
        bound = float(np.sum(mu + alpha @ state))
        step = float(rng.exponential(1.0 / bound))
        if now + step >= prefix + horizon:
            break
        now += step
        state *= math.exp(-beta * step)
        intensity = mu + alpha @ state
        total = float(np.sum(intensity))
        if rng.random() * bound > total:
            continue
        choice = rng.random() * total
        channel = min(
            len(mu) - 1,
            int(np.searchsorted(np.cumsum(intensity), choice, side="right")),
        )
        streams[channel].append(now - prefix)
        state[channel] += 1.0
    latent = _rounded(
        {
            "spec": spec,
            "horizon": horizon,
            "half_life": half,
            "prefix_duration": prefix,
            "initial_kernel_state": initial,
            "full_events": streams,
        }
    )
    latent["retained_events"] = [
        [t for t in latent["full_events"][i] if t >= 0.0] for i in spec["observed"]
    ]
    latent["counts"] = [len(s) for s in latent["retained_events"]]
    latent["hash"] = _hash(latent)
    return latent


def _exposure(latent: dict, name: str) -> dict:
    spec = latent["spec"]
    past = [[t for t in latent["full_events"][i] if t < 0.0] for i in spec["observed"]]
    result = {"name": name, "history": [[] for _ in past], "initial_excitation": None}
    if name == "KNOWN":
        result["history"] = past
    elif name.startswith("WARM_"):
        cutoff = -int(name.split("_")[1]) * latent["half_life"]
        result["history"] = [[t for t in s if t >= cutoff] for s in past]
    elif name == "LEFT_CENSORED":
        result["history"] = [[]] + past[1:]
    elif name == "ORACLE":
        state = np.asarray(latent["initial_kernel_state"]) * math.exp(
            -spec["beta"] * latent["prefix_duration"]
        )
        for i, s in enumerate(latent["full_events"]):
            state[i] += sum(math.exp(spec["beta"] * t) for t in s if t < 0.0)
        result["initial_excitation"] = ((np.asarray(spec["G"]) * spec["beta"]) @ state)[
            spec["observed"]
        ]
    result = _rounded(result)
    result["hash"] = _hash(result)
    return result


def _parametric(
    evidence: dict, fit: dict, truth: np.ndarray, seed: int, errors: list, label: str
) -> dict:
    samples = np.asarray(evidence["samples"])
    failures = evidence["failures"]
    if (
        type(failures) is not int
        or not 0 <= failures <= 16
        or len(samples) + failures != 16
    ):
        errors.append(label + ": bootstrap accounting")
    g = np.asarray(fit["branching_matrix"])
    if len(samples):
        if (
            samples.shape[1:] != g.shape
            or not np.all(np.isfinite(samples))
            or np.min(samples) < 0
            or any(_rho(s) >= 0.99500001 for s in samples)
        ):
            errors.append(label + ": bootstrap sample domain")
        lower, upper = np.quantile(samples, [0.025, 0.975], axis=0)
        return {
            "method": "PARAMETRIC_REFIT_BOOTSTRAP",
            "available": True,
            "repetitions": 16,
            "failures": failures,
            "seed": seed,
            "samples": samples,
            "branching": _interval(g, lower, upper, truth),
            "spectral_radius_ci95": np.quantile(
                [_rho(s) for s in samples], [0.025, 0.975]
            ),
        }
    empty = [[None] * len(g) for _ in g]
    return {
        "method": "PARAMETRIC_REFIT_BOOTSTRAP",
        "available": False,
        "repetitions": 16,
        "failures": 16,
        "samples": [],
        "branching": {
            "estimate": g,
            "lower": empty,
            "upper": empty,
            "width": empty,
            "covered": np.zeros_like(g, dtype=int),
        },
        "spectral_radius_ci95": None,
    }


def _profile(
    evidence: dict,
    fit: dict,
    truth: np.ndarray,
    events: list,
    horizon: float,
    errors: list,
    label: str,
) -> dict:
    grid = evidence["grid"]
    if len(grid) != 49:
        raise ValueError("profile grid length")
    for point, eta in zip(grid, np.linspace(0.001, 0.99, 49)):
        _compare(point["branching_ratio"], float(eta), errors, label + ".eta")
        if (
            type(point["optimizer_success"]) is not bool
            or not math.exp(-7.0) - 1e-9 <= point["baseline"] <= math.exp(4.0) + 1e-9
            or not math.exp(-2.3) - 1e-9 <= point["beta"] <= math.exp(2.3) + 1e-9
        ):
            errors.append(label + ": profile optimizer domain")
        trial = {
            "baseline": [point["baseline"]],
            "alpha": [[point["branching_ratio"] * point["beta"]]],
            "beta": point["beta"],
        }
        _compare(
            point["log_likelihood"],
            _likelihood(events, horizon, trial, {"name": "ZERO", "history": [[]]}),
            errors,
            label + ".likelihood",
        )
    maximum = max(p["log_likelihood"] for p in grid)
    admitted = [
        p["branching_ratio"]
        for p in grid
        if maximum - p["log_likelihood"] <= 1.920729410347062
    ]
    lower, upper = min(admitted), max(admitted)
    return {
        "method": "PROFILE_LIKELIHOOD",
        "available": True,
        "cutoff": 1.920729410347062,
        "grid": grid,
        "branching": _interval(
            np.asarray(fit["branching_matrix"]),
            np.array([[lower]]),
            np.array([[upper]]),
            truth,
        ),
        "spectral_radius_ci95": [lower, upper],
    }


def _tags(record: dict, source: int, target: int) -> list:
    g = np.asarray(record["truth"]["G"])
    named = {r["protocol"]["name"]: r for r in record["protocols"]}
    support = (
        lambda name: named[name]["uncertainty"]["event_attribution"]["edge_support"][
            target
        ][source]
        == 1
    )
    tags = []
    if support("ZERO") and all(
        named[p]["fit"]["optimizer"]["success"] and not support(p)
        for p in ("KNOWN", "ORACLE")
    ):
        tags.append(TAGS[0])
    if g[source, target] > 0.035:
        tags.append(TAGS[1])
    if {source, target} == {0, 1} and (
        record["truth"]["driver_observed"] or record["truth"]["driver_latent"]
    ):
        tags.append(TAGS[2])
    if TAGS[2] not in tags and max(g[source, source], g[target, target]) > 0.035:
        tags.append(TAGS[3])
    if sum(record["latent"]["counts"]) < 300:
        tags.append(TAGS[4])
    if (
        max(g[target, source], g[source, target]) > 0.035
        and abs(g[target, source] - g[source, target]) <= 0.05
    ):
        tags.append(TAGS[5])
    return tags or [TAGS[6]]


def _edges(record: dict, row: dict) -> list:
    g, fit, latent = np.asarray(record["truth"]["G"]), row["fit"], record["latent"]
    evidence = row["uncertainty"]["event_attribution"]
    full = _likelihood(
        latent["retained_events"], latent["horizon"], fit, row["protocol"]
    )
    result = []
    for target in range(len(g)):
        for source in range(len(g)):
            present = evidence["edge_support"][target][source] == 1
            if source == target or present == (g[target, source] > 0.035):
                continue
            false = present
            ablated = copy.deepcopy(fit)
            ablated["alpha"][target][source] = 0.0
            tags = _tags(record, source, target) if false else []
            result.append(
                {
                    "kind": "FALSE" if false else "MISSED",
                    "source": source,
                    "target": target,
                    "true_contribution": g[target, source],
                    "estimated_contribution": fit["branching_matrix"][target][source],
                    "lower": evidence["branching"]["lower"][target][source],
                    "upper": evidence["branching"]["upper"][target][source],
                    "support_fraction": evidence["bootstrap_support_probability"][
                        target
                    ][source],
                    "likelihood_ablation_delta": full
                    - _likelihood(
                        latent["retained_events"],
                        latent["horizon"],
                        ablated,
                        row["protocol"],
                    ),
                    "likelihood_scope": "IN_SAMPLE_FIXED_OTHER_PARAMETERS",
                    "event_count": sum(latent["counts"]),
                    "source_count": latent["counts"][source],
                    "target_count": latent["counts"][target],
                    "source_true_base_rate": record["truth"]["mu"][source],
                    "target_true_base_rate": record["truth"]["mu"][target],
                    "source_fitted_base_rate": fit["baseline"][source],
                    "target_fitted_base_rate": fit["baseline"][target],
                    "source_self": g[source, source],
                    "target_self": g[target, target],
                    "true_common_driver": record["truth"]["driver_latent"]
                    or record["truth"]["driver_observed"],
                    "observed_common_driver": record["truth"]["driver_observed"],
                    "edge_asymmetry": abs(g[target, source] - g[source, target]),
                    "shared_decay_kernel_overlap": 1.0,
                    "tags": tags,
                    "primary_category": tags[0] if tags else None,
                    "reversed": false and g[source, target] > 0.035,
                }
            )
    return result


def _world(record: dict, spec: dict, errors: list, *, replay: bool = True) -> None:
    label = spec["id"]
    latent = record["latent"]
    expected = _latent(spec) if replay else latent
    # Stored event identities remain exact content addresses. A replay made on
    # another libm/BLAS platform can round one timestamp to an adjacent 1e-9
    # unit after a long near-critical prefix; its independently generated hash
    # is not the identity of the stored evidence. Replay uses no relative
    # tolerance and at most two serialization units, with counts/marks exact.
    _compare(
        {k: v for k, v in latent.items() if k != "hash"},
        {k: v for k, v in expected.items() if k != "hash"},
        errors,
        label + ".latent",
        tolerance=(0.0, 2e-9),
    )
    _compare(
        latent["hash"],
        _hash({k: v for k, v in latent.items() if k != "hash"}),
        errors,
        label + ".latent_hash",
    )
    if errors:
        return
    indices, beta = spec["observed"], spec["beta"]
    truth = np.asarray(spec["G"])[np.ix_(indices, indices)]
    mu = np.asarray(spec["mu"])[indices]
    expected_truth = {
        "mu": mu,
        "G": truth,
        "alpha": truth * beta,
        "beta": beta,
        "rho": _rho(truth),
        "driver_observed": spec["regime"] == "OBSERVED_DRIVER",
        "driver_latent": spec["regime"] == "LATENT_DRIVER",
    }
    _compare(record["truth"], expected_truth, errors, label + ".truth")
    _compare(record["claims"], CLAIMS, errors, label + ".claims")
    if [r["protocol"]["name"] for r in record["protocols"]] != list(PROTOCOLS):
        errors.append(label + ": protocol registry")
        return
    events, horizon, n = latent["retained_events"], latent["horizon"], len(indices)
    for row in record["protocols"]:
        name = row["protocol"]["name"]
        rlabel = label + "." + name
        _compare(row["protocol"], _exposure(latent, name), errors, rlabel + ".exposure")
        _compare(row["latent_hash"], latent["hash"], errors, rlabel + ".identity")
        _compare(row["retained_hash"], _hash(events), errors, rlabel + ".retained")
        fit = row["fit"]
        a, m, b = np.asarray(fit["alpha"]), np.asarray(fit["baseline"]), fit["beta"]
        if (
            a.shape != (n, n)
            or m.shape != (n,)
            or np.min(a) < math.exp(-8.0) - 1e-9
            or np.max(a) > math.exp(1.4) + 1e-8
            or np.min(m) < math.exp(-7.0) - 1e-9
            or np.max(m) > math.exp(4.0) + 1e-8
            or not math.exp(-2.3) - 1e-9 <= b <= math.exp(2.3) + 1e-8
        ):
            errors.append(rlabel + ": fit domain")
            return
        _compare(fit["branching_matrix"], a / b, errors, rlabel + ".G")
        _compare(fit["spectral_radius"], _rho(a / b), errors, rlabel + ".rho")
        if fit["spectral_radius"] >= 0.99500001:
            errors.append(rlabel + ": stability barrier")
        optimizer = fit["optimizer"]
        if (
            optimizer["starts"] != 3
            or optimizer["method"] != "L-BFGS-B deterministic multi-start"
            or type(optimizer["success"]) is not bool
            or (optimizer["success"] and optimizer["status"] != 0)
            or optimizer["iterations"] < 0
            or optimizer["iterations"] > 260
            or optimizer["function_evaluations"] < 1
        ):
            errors.append(rlabel + ": optimizer evidence")
        c = fit["log_parameter_covariance"]
        if c is not None and (
            np.asarray(c).shape != (n + n * n + 1, n + n * n + 1)
            or not np.all(np.isfinite(c))
        ):
            errors.append(rlabel + ": covariance domain")
            return
        geometric = _geometry(fit)
        _compare(row["geometry"], geometric, errors, rlabel + ".geometry")
        # The optimizer's original condition is a primitive diagnostic taken
        # before nine-decimal serialization. Weyl bounds, not an arbitrary
        # relative tolerance, account for quantization of its covariance.
        original_condition = fit["identifiability"]["inverse_hessian_condition"]
        if c is None:
            if original_condition is not None:
                errors.append(rlabel + ": missing covariance for condition")
        else:
            singular = np.linalg.svd(np.asarray(c), compute_uv=False)
            perturbation = (
                len(c) * 0.5e-9 + 8 * np.finfo(float).eps * len(c) * singular[0]
            )
            lower = max(0.0, singular[0] - perturbation) / (singular[-1] + perturbation)
            upper = (
                (singular[0] + perturbation) / (singular[-1] - perturbation)
                if singular[-1] > perturbation
                else math.inf
            )
            if (
                original_condition is None
                or not math.isfinite(original_condition)
                or not lower <= original_condition <= upper
            ):
                errors.append(
                    rlabel + ": original condition outside covariance rounding bounds"
                )
        count = sum(max(1, len(s)) for s in events)
        _compare(
            fit["identifiability"],
            {
                "event_count": count,
                "parameter_count": n + n * n + 1,
                "events_per_parameter": count / (n + n * n + 1),
                "inverse_hessian_condition": original_condition,
                "locally_identifiable": bool(
                    optimizer["success"]
                    and original_condition is not None
                    and original_condition < 1e12
                    and fit["spectral_radius"] < 0.995
                ),
            },
            errors,
            rlabel + ".identifiability",
        )
        _compare(
            fit["log_likelihood"],
            _likelihood(events, horizon, fit, row["protocol"]),
            errors,
            rlabel + ".likelihood",
        )
        methods = {
            "inverse_hessian": _hessian(fit, truth, spec["seed"] + 10000),
            "event_attribution": _attribution(
                events, fit, truth, horizon, spec["seed"] + 20000
            ),
        }
        for key in ("parametric_bootstrap", "profile_likelihood"):
            methods[key] = {"available": False, "reason": "OUTSIDE_ZERO_AUDIT"}
        if name == "ZERO" and spec["audit"]:
            methods["parametric_bootstrap"] = _parametric(
                row["uncertainty"]["parametric_bootstrap"],
                fit,
                truth,
                spec["seed"] + 30000,
                errors,
                rlabel,
            )
            methods["profile_likelihood"] = _profile(
                row["uncertainty"]["profile_likelihood"],
                fit,
                truth,
                events,
                horizon,
                errors,
                rlabel,
            )
        _compare(row["uncertainty"], methods, errors, rlabel + ".uncertainty")
        supported = np.asarray(methods["event_attribution"]["edge_support"])
        _compare(row["graph"], _graph(truth, supported), errors, rlabel + ".graph")
        _compare(
            row["true_topology"], _topology(truth), errors, rlabel + ".true_topology"
        )
        _compare(
            row["fitted_topology"],
            _topology(supported, True),
            errors,
            rlabel + ".fitted_topology",
        )
        _compare(
            row["errors"],
            {
                "mu": m - mu,
                "alpha": a - truth * beta,
                "beta": b - beta,
                "branching": np.asarray(fit["branching_matrix"]) - truth,
                "rho": fit["spectral_radius"] - _rho(truth),
            },
            errors,
            rlabel + ".errors",
        )
        _compare(
            row["residuals"],
            _residuals(events, fit, horizon, row["protocol"]),
            errors,
            rlabel + ".residuals",
        )
        _compare(
            row["structural_identifiability"],
            _state(row, truth, sum(latent["counts"])),
            errors,
            rlabel + ".state",
        )
        if errors:
            return
    zero, known = record["protocols"][0], record["protocols"][1]["protocol"]
    ordinary_ll = _likelihood(events, horizon, zero["fit"], known)
    for row in record["protocols"]:
        rlabel = label + "." + row["protocol"]["name"]
        _compare(row["edge_failures"], _edges(record, row), errors, rlabel + ".edges")
        current, original = row["fit"], zero["fit"]
        delta = {
            "mu_delta": np.asarray(original["baseline"]) - current["baseline"],
            "alpha_delta": np.asarray(original["alpha"]) - current["alpha"],
            "beta_delta": original["beta"] - current["beta"],
            "branching_delta": np.asarray(original["branching_matrix"])
            - current["branching_matrix"],
            "rho_delta": original["spectral_radius"] - current["spectral_radius"],
            "rho_absolute_error_improvement": abs(zero["errors"]["rho"])
            - abs(row["errors"]["rho"]),
            "supported_entries_changed": int(
                np.sum(
                    np.asarray(row["uncertainty"]["event_attribution"]["edge_support"])
                    != np.asarray(
                        zero["uncertainty"]["event_attribution"]["edge_support"]
                    )
                )
            ),
            "full_cross_graph_changed": row["graph"]["inferred_edges"]
            != zero["graph"]["inferred_edges"],
            "conditional_objective_delta": current["log_likelihood"]
            - original["log_likelihood"],
            "known_history_common_model_delta": _likelihood(
                events, horizon, current, known
            )
            - ordinary_ll,
        }
        _compare(row["comparison_to_zero"], delta, errors, rlabel + ".contrast")


def _mean(values: list) -> float | None:
    return float(np.mean(values)) if values else None


def _bin(value: float | None, cuts: tuple, labels: tuple) -> str:
    return "UNAVAILABLE" if value is None else labels[sum(value >= cut for cut in cuts)]


def _coverage(records: list) -> list:
    groups = defaultdict(
        lambda: {"covered": [], "width": [], "rho": [], "worlds": set()}
    )
    for record in records:
        latent, g = record["latent"], np.asarray(record["truth"]["G"])
        count, rho = sum(latent["counts"]), record["truth"]["rho"]
        for row in record["protocols"]:
            name = row["protocol"]["name"]
            axes = {
                "all": "ALL",
                "information": latent["spec"]["information"],
                "rho_eta": _bin(
                    rho,
                    (0.7, 0.9, 0.97),
                    ("LT_0.70", "0.70_TO_0.90", "0.90_TO_0.97", "GE_0.97"),
                ),
                "event_count": _bin(
                    count,
                    (100, 300, 1000, 3000),
                    ("LT_100", "100_TO_299", "300_TO_999", "1000_TO_2999", "GE_3000"),
                ),
                "events_per_half_life": _bin(
                    count * latent["half_life"] / latent["horizon"],
                    (1, 5, 20),
                    ("LT_1", "1_TO_5", "5_TO_20", "GE_20"),
                ),
                "half_life": _bin(
                    latent["half_life"], (0.3, 0.7), ("LT_0.3", "0.3_TO_0.7", "GE_0.7")
                ),
                "condition": _bin(
                    row["geometry"]["condition"], (1e4, 1e6), ("LOW", "MID", "HIGH")
                ),
            }
            for method, evidence in row["uncertainty"].items():
                if not evidence["available"]:
                    continue
                for axis, stratum in axes.items():
                    bucket = groups[(name, method, axis, stratum)]
                    for target, source in np.argwhere(g > 0.035):
                        bucket["covered"].append(
                            evidence["branching"]["covered"][target][source]
                        )
                        bucket["width"].append(
                            evidence["branching"]["width"][target][source]
                        )
                    bucket["worlds"].add(latent["spec"]["id"])
                    ci = evidence["spectral_radius_ci95"]
                    if ci is not None:
                        bucket["rho"].append(int(ci[0] <= rho <= ci[1]))
                for target, source in np.argwhere(g > 0.035):
                    magnitude = _bin(
                        g[target, source], (0.15, 0.30), ("SMALL", "MEDIUM", "LARGE")
                    )
                    bucket = groups[(name, method, "edge_magnitude", magnitude)]
                    bucket["covered"].append(
                        evidence["branching"]["covered"][target][source]
                    )
                    bucket["width"].append(
                        evidence["branching"]["width"][target][source]
                    )
                    bucket["worlds"].add(latent["spec"]["id"])
    return [
        {
            "protocol": p,
            "method": m,
            "axis": a,
            "stratum": s,
            "worlds": len(b["worlds"]),
            "parameters": len(b["covered"]),
            "covered": int(sum(b["covered"])),
            "coverage": _mean(b["covered"]),
            "mean_width": _mean(b["width"]),
            "median_width": float(np.median(b["width"])) if b["width"] else None,
            "rho_parameters": len(b["rho"]),
            "rho_coverage": _mean(b["rho"]),
        }
        for (p, m, a, s), b in sorted(groups.items())
    ]


def _geometry_summary(records: list) -> list:
    result = []
    for name in PROTOCOLS:
        selected = [
            (record, record["protocols"][PROTOCOLS.index(name)]) for record in records
        ]
        correlations = {}
        for metric in (
            "graph_error",
            "absolute_rho_error",
            "coverage_failure",
            "optimizer_failure",
        ):
            pairs = []
            for record, row in selected:
                c = row["geometry"]["condition"]
                if c is None or c <= 0:
                    continue
                mask = np.asarray(record["truth"]["G"]) > 0.035
                coverage = np.asarray(
                    row["uncertainty"]["event_attribution"]["branching"]["covered"]
                )[mask]
                values = {
                    "graph_error": float(not row["graph"]["exact_graph"]),
                    "absolute_rho_error": abs(row["errors"]["rho"]),
                    "coverage_failure": (
                        1.0 - float(np.mean(coverage)) if len(coverage) else None
                    ),
                    "optimizer_failure": float(not row["fit"]["optimizer"]["success"]),
                }
                if values[metric] is not None:
                    pairs.append((math.log10(c), values[metric]))
            x, y = [p[0] for p in pairs], [p[1] for p in pairs]
            correlations[metric] = {
                "n": len(pairs),
                "pearson": (
                    float(np.corrcoef(x, y)[0, 1])
                    if len(pairs) >= 3 and np.std(x) > 0 and np.std(y) > 0
                    else None
                ),
            }
        groups = []
        for label in ("LOW", "MID", "HIGH", "UNAVAILABLE"):
            rows = [
                r
                for _, r in selected
                if _bin(r["geometry"]["condition"], (1e4, 1e6), ("LOW", "MID", "HIGH"))
                == label
            ]
            groups.append(
                {
                    "group": label,
                    "fits": len(rows),
                    "graph_error_rate": _mean(
                        [int(not r["graph"]["exact_graph"]) for r in rows]
                    ),
                    "rho_absolute_error": _mean(
                        [abs(r["errors"]["rho"]) for r in rows]
                    ),
                    "optimizer_failure_rate": _mean(
                        [int(not r["fit"]["optimizer"]["success"]) for r in rows]
                    ),
                }
            )
        result.append(
            {
                "protocol": name,
                "correlations": correlations,
                "groups": groups,
                "interpretation": "DESCRIPTIVE_ASSOCIATION_NOT_FISHER_OR_CAUSAL",
            }
        )
    return result


def _decision(records: list) -> dict:
    paired = []
    for record in records:
        if (
            record["latent"]["spec"]["family"] == "CRITICALITY"
            and record["truth"]["rho"] >= 0.93
        ):
            named = {r["protocol"]["name"]: r for r in record["protocols"]}
            if all(
                named[p]["fit"]["optimizer"]["success"]
                for p in ("ZERO", "KNOWN", "ORACLE")
            ):
                paired.append(named)
    rmses = {
        p: (
            math.sqrt(float(np.mean([r[p]["errors"]["rho"] ** 2 for r in paired])))
            if paired
            else None
        )
        for p in ("ZERO", "KNOWN", "ORACLE")
    }
    ordinary = rmses["ZERO"]
    reductions = {
        p: 1.0 - rmses[p] / ordinary if ordinary and paired else None
        for p in ("KNOWN", "ORACLE")
    }
    gains = [
        abs(r["ZERO"]["errors"]["rho"]) - abs(r["ORACLE"]["errors"]["rho"])
        for r in paired
    ]
    fraction = _mean([int(g >= 0.02) for g in gains])
    boundary = (
        len(paired) >= 48
        and reductions["ORACLE"] >= 0.25
        and reductions["KNOWN"] >= 0.20
        and fraction >= 0.6
        and _mean(gains) >= 0.05
    )
    groups = {}
    for label in ("LOW", "HIGH"):
        rows = []
        for record in records:
            row = record["protocols"][1]
            c = row["geometry"]["condition"]
            if (
                record["latent"]["spec"]["family"] == "GRAPH"
                and row["fit"]["optimizer"]["success"]
                and c is not None
                and (c < 1e4 if label == "LOW" else c >= 1e6)
            ):
                rows.append(row)
        groups[label] = {
            "n": len(rows),
            "error_rate": _mean([int(not r["graph"]["exact_graph"]) for r in rows]),
        }
    abstention = (
        all(g["n"] >= 15 for g in groups.values())
        and groups["HIGH"]["error_rate"] >= 0.5
        and groups["HIGH"]["error_rate"] - groups["LOW"]["error_rate"] >= 0.2
    )
    return {
        "decision": (
            "BOUNDARY_REPAIR_WARRANTED"
            if boundary
            else (
                "IDENTIFIABILITY_AWARE_ABSTENTION_WARRANTED"
                if abstention
                else "EVIDENCE_INSUFFICIENT"
            )
        ),
        "boundary_predicate": bool(boundary),
        "abstention_predicate": bool(abstention),
        "paired_critical_worlds": len(paired),
        "rho_rmse": rmses,
        "rmse_reduction": reductions,
        "oracle_improved_fraction": fraction,
        "oracle_mean_absolute_error_improvement": _mean(gains),
        "known_graph_condition_groups": groups,
        "repair_implemented": False,
        "intrinsic_nonidentifiability_established": False,
    }


def _summary(records: list) -> dict:
    curves, confusions, categories, states, metrics = [], [], [], [], []
    for name in PROTOCOLS:
        pairs = [(r, r["protocols"][PROTOCOLS.index(name)]) for r in records]
        for rho in (0.70, 0.85, 0.93, 0.97, 0.99):
            selected = [
                p
                for r, p in pairs
                if r["latent"]["spec"]["family"] == "CRITICALITY"
                and r["truth"]["rho"] == rho
            ]
            curves.append(
                {
                    "protocol": name,
                    "true_rho": rho,
                    "n": len(selected),
                    "mean_fitted_rho": _mean(
                        [p["fit"]["spectral_radius"] for p in selected]
                    ),
                    "rho_bias": _mean([p["errors"]["rho"] for p in selected]),
                    "rmse": math.sqrt(
                        float(np.mean([p["errors"]["rho"] ** 2 for p in selected]))
                    ),
                }
            )
        graph = [p for r, p in pairs if r["latent"]["spec"]["family"] == "GRAPH"]
        matrix, counts = [[0] * 4 for _ in LABELS], Counter()
        for row in graph:
            matrix[LABELS.index(row["true_topology"])][
                LABELS.index(row["fitted_topology"])
            ] += 1
            counts.update(
                e["primary_category"]
                for e in row["edge_failures"]
                if e["kind"] == "FALSE"
            )
        confusions.append(
            {
                "protocol": name,
                "labels": LABELS,
                "matrix": matrix,
                "latent_worlds": 100,
                "scope": "A_B_SUBGRAPH",
            }
        )
        categories.append(
            {
                "protocol": name,
                "counts": {tag: counts[tag] for tag in TAGS},
                "false_edges": sum(counts.values()),
            }
        )
        states.append(
            {
                "protocol": name,
                "counts": dict(
                    sorted(
                        Counter(
                            p["structural_identifiability"] for _, p in pairs
                        ).items()
                    )
                ),
            }
        )
        metrics.append(
            {
                "protocol": name,
                "fits": 200,
                "optimizer_failures": sum(
                    not p["fit"]["optimizer"]["success"] for _, p in pairs
                ),
                "process_calibration_rate": _mean(
                    [int(p["residuals"]["calibrated"]) for _, p in pairs]
                ),
                "exact_graph_rate": _mean(
                    [int(p["graph"]["exact_graph"]) for p in graph]
                ),
                "true_positive": sum(p["graph"]["true_positive"] for p in graph),
                "false_positive": sum(p["graph"]["false_positive"] for p in graph),
                "false_negative": sum(p["graph"]["false_negative"] for p in graph),
                "reversed_edges": sum(p["graph"]["reversed_edges"] for p in graph),
                "mu_bias": _mean([v for _, p in pairs for v in p["errors"]["mu"]]),
                "alpha_bias": _mean(
                    [v for _, p in pairs for a in p["errors"]["alpha"] for v in a]
                ),
                "beta_bias": _mean([p["errors"]["beta"] for _, p in pairs]),
                "branching_bias": _mean(
                    [v for _, p in pairs for a in p["errors"]["branching"] for v in a]
                ),
                "rho_bias": _mean([p["errors"]["rho"] for _, p in pairs]),
            }
        )
    return _rounded(
        {
            "rho_curves": curves,
            "confusion": confusions,
            "false_edge_categories": categories,
            "epistemic_states": states,
            "protocol_metrics": metrics,
            "coverage": _coverage(records),
            "geometry": _geometry_summary(records),
            "decision": _decision(records),
            "predictive_value": "NOT_TESTED",
            "economic_value": "NOT_TESTED",
            "causal_interpretation": "NOT_ESTABLISHED",
            "failure_categories_are_causal": False,
        }
    )


def _verify(payload: dict) -> dict:
    errors = []
    _compare(
        payload["artifact_hash"],
        _hash({k: v for k, v in payload.items() if k != "artifact_hash"}),
        errors,
        "artifact_hash",
    )
    _compare(
        payload["schema_version"], "dynamics-hawkes-boundary/0.4.1.1", errors, "schema"
    )
    _compare(payload["milestone"], "D0.4.1.1", errors, "milestone")
    _compare(
        payload["parent_head"],
        "3befb6d316af44313ce04fb0e5dbee75f2f41055",
        errors,
        "parent_head",
    )
    _compare(payload["claims"], CLAIMS, errors, "claims")
    _compare(payload["thresholds"], THRESHOLDS, errors, "thresholds")
    _compare(payload["protocol_names"], PROTOCOLS, errors, "protocols")
    _compare(
        payload["execution"],
        {
            "latent_worlds": 200,
            "protocol_fits": 1800,
            "zero_audit_worlds": 20,
            "independent_replicates": 200,
            "paired_retained_events": True,
        },
        errors,
        "execution",
    )
    _compare(
        payload["uncertainty_policy"],
        {
            "fixed_attribution_history": "HISTORICAL_ZERO_HISTORY_UNMODIFIED",
            "refit_profile_scope": "TWENTY_NEW_ZERO_CRITICALITY_WORLDS_ONLY",
            "new_interval_methods": 0,
        },
        errors,
        "uncertainty_policy",
    )
    seals = {}
    for name, (path, canonical, bytehash) in PARENTS.items():
        raw = (ROOT / path).read_bytes()
        parent = json.loads(raw)
        claimed = parent.pop("artifact_hash")
        if (
            claimed != canonical
            or _hash(parent) != canonical
            or hashlib.sha256(raw).hexdigest() != bytehash
        ):
            errors.append("immutable parent changed: " + name)
        seeds = sorted(r["world"]["seed"] for r in parent["worlds"])
        seals[name] = {
            "path": path,
            "canonical_hash": canonical,
            "file_sha256": bytehash,
            "seeds": seeds,
        }
        if name == "D0.4.1":
            for source, digest in parent["implementation_sources"].items():
                if (
                    hashlib.sha256(
                        (ROOT / source).read_text(encoding="utf-8").encode()
                    ).hexdigest()
                    != digest
                ):
                    errors.append("historical source changed: " + source)
    _compare(payload["parent_seals"], seals, errors, "parent_seals")
    sources = {
        p: hashlib.sha256((ROOT / p).read_text(encoding="utf-8").encode()).hexdigest()
        for p in SOURCES
    }
    _compare(payload["implementation_sources"], sources, errors, "source_seals")
    prereg = "docs/dynamics-lab-d0-4-1-1-preregistration.md"
    _compare(
        payload["preregistration"],
        {
            "path": prereg,
            "source_sha256": sources[prereg],
            "locked_before_execution": True,
        },
        errors,
        "preregistration",
    )
    specs = _design()
    _compare(payload["registry"], specs, errors, "registry")
    if any(s["seed"] in p["seeds"] for s in specs for p in seals.values()):
        errors.append("historical seed reused")
    if len(payload["records"]) != 200:
        errors.append("incomplete latent registry")
    if errors:
        return {"valid": False, "errors": errors, "worlds_verified": 0}
    verified = 0
    for record, spec in zip(payload["records"], specs):
        _world(record, spec, errors)
        if errors:
            return {"valid": False, "errors": errors[:30], "worlds_verified": verified}
        verified += 1
    summary = _summary(payload["records"])
    _compare(payload["summary"], summary, errors, "summary")
    observatory = {
        "representatives": [
            payload["records"][i] for i in (0, 19, 40, 79, 99, 100, 124, 149, 179, 199)
        ],
        "curves": summary["rho_curves"],
        "confusion": summary["confusion"],
        "false_edges": summary["false_edge_categories"],
        "coverage": summary["coverage"],
        "geometry": summary["geometry"],
        "decision": summary["decision"],
    }
    _compare(payload["observatory"], observatory, errors, "observatory")
    return {
        "valid": not errors,
        "errors": errors[:30],
        "worlds_verified": verified,
        "protocol_fits_verified": verified * 9,
        "decision": summary["decision"]["decision"],
        "artifact_hash": payload["artifact_hash"],
    }


def verify_hawkes_boundary(payload: Mapping[str, Any]) -> dict:
    """Fail closed for missing, malformed, fabricated or inconsistent evidence."""
    try:
        return _verify(dict(payload))
    except (
        KeyError,
        TypeError,
        ValueError,
        IndexError,
        AttributeError,
        OverflowError,
        OSError,
        np.linalg.LinAlgError,
    ) as exc:
        return {
            "valid": False,
            "errors": [f"malformed evidence: {type(exc).__name__}: {exc}"],
            "worlds_verified": 0,
        }
