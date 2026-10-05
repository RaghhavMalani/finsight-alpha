"""Diagnostic-only matched Hawkes boundary experiment; no incumbent repair."""

from __future__ import annotations

import hashlib
import json
import math
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from scipy.optimize import minimize
from scipy.stats import kstest

from src.dynamics import hawkes_identifiability as incumbent

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "eval/dynamics/d0_4_1_1/hawkes_boundary_decomposition.json"
PREREG = ROOT / "docs/dynamics-lab-d0-4-1-1-preregistration.md"
SCHEMA = "dynamics-hawkes-boundary/0.4.1.1"
PARENT_HEAD = "3befb6d316af44313ce04fb0e5dbee75f2f41055"
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
INFOS = (("SPARSE", 100), ("LIMITED", 300), ("MODERATE", 1000), ("RICH", 3000))
SOURCES = (
    "src/dynamics/hawkes_boundary.py",
    "src/dynamics/hawkes_boundary_analysis.py",
    "src/dynamics/hawkes_boundary_verifier.py",
    "scripts/freeze_dynamics_d0_4_1_1.py",
    "scripts/verify_dynamics_d0_4_1_1.py",
    "docs/dynamics-lab-d0-4-1-1-preregistration.md",
)
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


class BoundaryEvidenceError(RuntimeError):
    """A diagnostic evidence or release seal is invalid."""


def canonical(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


def source_hash(path: Path) -> str:
    return hashlib.sha256(
        path.read_text(encoding="utf-8").replace("\r\n", "\n").encode()
    ).hexdigest()


def parent_seals() -> dict:
    seals = {}
    for name, (relative, content, byte_hash) in PARENTS.items():
        raw = (ROOT / relative).read_bytes()
        payload = json.loads(raw)
        claimed = payload.pop("artifact_hash")
        if (
            hashlib.sha256(raw).hexdigest() != byte_hash
            or claimed != content
            or canonical(payload) != content
        ):
            raise BoundaryEvidenceError(f"immutable {name} parent changed")
        seals[name] = {
            "path": relative,
            "canonical_hash": content,
            "file_sha256": byte_hash,
            "seeds": sorted(r["world"]["seed"] for r in payload["worlds"]),
        }
        # The incumbent instrument is sealed by D0.4.1 as well as its artifact.
        if name == "D0.4.1":
            for path, digest in payload["implementation_sources"].items():
                if source_hash(ROOT / path) != digest:
                    raise BoundaryEvidenceError(f"historical source changed: {path}")
    return seals


def registry() -> list[dict]:
    rows = []
    seed = 511001
    for family, regimes in (
        ("CRITICALITY", (0.70, 0.85, 0.93, 0.97, 0.99)),
        (
            "GRAPH",
            (
                "NONE",
                "DIRECTED_WITH_SELF",
                "BIDIRECTIONAL",
                "OBSERVED_DRIVER",
                "LATENT_DRIVER",
            ),
        ),
    ):
        for regime in regimes:
            for info, target in INFOS:
                for variant, beta in enumerate((0.8, 1.2, 1.8, 2.4, 3.2)):
                    if family == "CRITICALITY":
                        mu, g, observed = (
                            [0.55 + 0.10 * variant],
                            [[float(regime)]],
                            [0],
                        )
                    else:
                        n = 3 if regime in {"OBSERVED_DRIVER", "LATENT_DRIVER"} else 2
                        mu = [0.60 + 0.08 * variant - 0.05 * i for i in range(n)]
                        g = np.zeros((n, n))
                        observed = (
                            list(range(n)) if regime != "LATENT_DRIVER" else [0, 1]
                        )
                        if regime == "NONE" and variant:
                            g[0, 0], g[1, 1] = 0.20, 0.25
                        elif regime == "DIRECTED_WITH_SELF":
                            source, dest = (0, 1) if variant % 2 == 0 else (1, 0)
                            g[dest, source], g[source, source], g[dest, dest] = (
                                0.22,
                                0.10,
                                0.28,
                            )
                        elif regime == "BIDIRECTIONAL":
                            g[0, 0] = g[1, 1] = 0.10
                            g[1, 0], g[0, 1] = (
                                (0.22, 0.22) if variant % 2 == 0 else (0.12, 0.32)
                            )
                        elif n == 3:
                            g[0, 0] = g[1, 1] = g[2, 2] = 0.10
                            g[0, 2] = g[1, 2] = 0.28
                        g = g.tolist()
                    rows.append(
                        incumbent._round(
                            {
                                "id": f"{family.lower()}_{regime}_{info.lower()}_v{variant}",
                                "family": family,
                                "regime": str(regime),
                                "information": info,
                                "target": target,
                                "variant": variant,
                                "seed": seed,
                                "mu": mu,
                                "G": g,
                                "beta": beta,
                                "observed": observed,
                                "audit": family == "CRITICALITY" and variant == 0,
                            }
                        )
                    )
                    seed += 1
    return rows


def generate_latent(spec: Mapping[str, Any]) -> dict:
    mu, g, beta = np.asarray(spec["mu"]), np.asarray(spec["G"]), float(spec["beta"])
    rates = np.linalg.solve(np.eye(len(mu)) - g, mu)
    horizon = max(2.0, spec["target"] / sum(rates[spec["observed"]]))
    half_life = math.log(2.0) / beta
    prefix = 128 * half_life
    initial = rates / beta
    state, current = initial.copy(), 0.0
    streams = [[] for _ in mu]
    rng = np.random.default_rng(spec["seed"])
    alpha = g * beta
    while current < prefix + horizon:
        upper = float(np.sum(mu + alpha @ state))
        delta = float(rng.exponential(1.0 / upper))
        candidate = current + delta
        if candidate >= prefix + horizon:
            break
        state *= math.exp(-beta * delta)
        current = candidate
        intensity = mu + alpha @ state
        total = float(np.sum(intensity))
        if rng.random() * upper > total:
            continue
        mark = min(
            len(mu) - 1,
            int(
                np.searchsorted(
                    np.cumsum(intensity), rng.random() * total, side="right"
                )
            ),
        )
        streams[mark].append(current - prefix)
        state[mark] += 1.0
    latent = incumbent._round(
        {
            "spec": spec,
            "horizon": horizon,
            "half_life": half_life,
            "prefix_duration": prefix,
            "initial_kernel_state": initial,
            "full_events": streams,
        }
    )
    latent["retained_events"] = [
        [t for t in latent["full_events"][i] if t >= 0.0] for i in spec["observed"]
    ]
    latent["counts"] = [len(s) for s in latent["retained_events"]]
    latent["hash"] = canonical(latent)
    return latent


def protocol_inputs(latent: Mapping[str, Any], name: str) -> dict:
    spec = latent["spec"]
    history = [
        [t for t in latent["full_events"][i] if t < 0.0] for i in spec["observed"]
    ]
    exposure: dict[str, Any] = {
        "name": name,
        "history": [[] for _ in history],
        "initial_excitation": None,
    }
    if name == "KNOWN":
        exposure["history"] = history
    elif name.startswith("WARM_"):
        cutoff = -int(name.split("_")[1]) * latent["half_life"]
        exposure["history"] = [[t for t in s if t >= cutoff] for s in history]
    elif name == "LEFT_CENSORED":
        exposure["history"] = [[]] + history[1:]
    elif name == "ORACLE":
        beta = float(spec["beta"])
        q = np.asarray(latent["initial_kernel_state"]) * math.exp(
            -beta * latent["prefix_duration"]
        )
        for i, stream in enumerate(latent["full_events"]):
            q[i] += sum(math.exp(beta * t) for t in stream if t < 0.0)
        exposure["initial_excitation"] = ((np.asarray(spec["G"]) * beta) @ q)[
            spec["observed"]
        ].tolist()
    exposure = incumbent._round(exposure)
    exposure["hash"] = canonical(exposure)
    return exposure


def initial_terms(
    mu: np.ndarray, alpha: np.ndarray, beta: float, exposure: Mapping[str, Any]
) -> tuple:
    """Excitation and its derivatives; never consumes a truth/spec object."""
    n = len(mu)
    dmu, da, db = np.zeros((n, n)), np.zeros((n, n, n)), np.zeros(n)
    name = exposure["name"]
    if name == "ORACLE":
        return np.asarray(exposure["initial_excitation"]), dmu, da, db
    if name == "STATIONARY_MEAN":
        inverse = np.linalg.inv(np.eye(n) - alpha / beta)
        rates = inverse @ mu
        dmu = inverse - np.eye(n)
        for target in range(n):
            for source in range(n):
                da[:, target, source] = inverse[:, target] * rates[source] / beta
        db = -inverse @ ((alpha / beta) @ rates) / beta
        return rates - mu, dmu, da, db
    q, dq = np.zeros(n), np.zeros(n)
    for source, stream in enumerate(exposure["history"]):
        times = np.asarray(stream)
        weights = np.exp(beta * times)
        q[source], dq[source] = float(np.sum(weights)), float(np.sum(times * weights))
    for target in range(n):
        da[target, target, :] = q
    return alpha @ q, dmu, da, alpha @ dq


def conditional_likelihood_gradient(
    events: Sequence[Sequence[float]],
    mu: Sequence[float],
    alpha: Sequence[Sequence[float]],
    beta: float,
    horizon: float,
    exposure: Mapping[str, Any],
    *,
    groups_cache: tuple | None = None,
) -> tuple:
    if exposure["name"] == "ZERO":
        return incumbent.hawkes_log_likelihood_gradient(
            events, mu, alpha, beta, horizon, groups_cache=groups_cache
        )
    mu, alpha = np.asarray(mu), np.asarray(alpha)
    n = len(mu)
    initial, dmu, da, db = initial_terms(mu, alpha, beta, exposure)
    times, all_marks = (
        groups_cache
        if groups_cache is not None
        else incumbent._group_arrays(events, horizon)
    )
    state, derivative = np.zeros(n), np.zeros(n)
    previous, likelihood, gb = 0.0, 0.0, 0.0
    gm, ga, initial_weight = np.zeros(n), np.zeros((n, n)), np.zeros(n)
    start = 0
    while start < len(times):
        anchor = float(times[start])
        delta = anchor - previous
        decay = math.exp(-beta * delta)
        derivative = decay * (derivative - delta * state)
        state *= decay
        stop = max(
            start + 1,
            min(
                start + 256,
                int(np.searchsorted(times, anchor + 32.0 / beta, side="right")),
            ),
        )
        relative, marks = times[start:stop] - anchor, all_marks[start:stop]
        weighted = marks * np.exp(beta * relative)[:, None]
        prefix = np.vstack((np.zeros((1, n)), np.cumsum(weighted, axis=0)[:-1]))
        moment = np.vstack(
            (np.zeros((1, n)), np.cumsum(relative[:, None] * weighted, axis=0)[:-1])
        )
        exponentials = np.exp(-beta * relative)[:, None]
        states = exponentials * (state + prefix)
        derivatives = exponentials * (
            derivative - relative[:, None] * state + moment - relative[:, None] * prefix
        )
        boundary_decay = np.exp(-beta * times[start:stop])[:, None]
        intensity = mu + states @ alpha.T + boundary_decay * initial
        weights = marks / intensity
        likelihood += float(np.sum(marks * np.log(intensity)))
        gm += np.sum(weights, axis=0)
        ga += weights.T @ states
        gb += float(
            np.sum(
                weights
                * (
                    derivatives @ alpha.T
                    - times[start:stop, None] * boundary_decay * initial
                )
            )
        )
        initial_weight += np.sum(weights * boundary_decay, axis=0)
        state, derivative = states[-1] + marks[-1], derivatives[-1]
        previous, start = float(times[stop - 1]), stop
    likelihood -= float(np.sum(mu) * horizon)
    gm -= horizon
    for source, stream in enumerate(events):
        deltas = horizon - np.asarray(stream)
        decay = np.exp(-beta * deltas)
        integral, derivative_integral = float(np.sum(1.0 - decay)), float(
            np.sum(deltas * decay)
        )
        likelihood -= float(np.sum(alpha[:, source])) * integral / beta
        ga[:, source] -= integral / beta
        gb -= (
            float(np.sum(alpha[:, source]))
            * (derivative_integral * beta - integral)
            / beta**2
        )
    tail = math.exp(-beta * horizon)
    factor = (1.0 - tail) / beta
    factor_derivative = (horizon * tail * beta - (1.0 - tail)) / beta**2
    likelihood -= float(np.sum(initial)) * factor
    initial_weight -= factor
    gm += initial_weight @ dmu
    ga += np.einsum("i,ijk->jk", initial_weight, da)
    gb += float(initial_weight @ db - np.sum(initial) * factor_derivative)
    return likelihood, gm, ga, gb


def fit_protocol(
    events: Sequence[Sequence[float]], horizon: float, exposure: Mapping[str, Any]
) -> dict:
    if exposure["name"] == "ZERO":
        return incumbent.fit_exponential_hawkes(events, horizon=horizon)
    n = len(events)
    counts = np.asarray([max(1, len(s)) for s in events], dtype=float)
    empirical = counts / horizon
    groups = incumbent._group_arrays(events, horizon)
    bounds = [(-7.0, 4.0)] * n + [(-8.0, 1.4)] * (n * n) + [(-2.3, 2.3)]

    def objective(vector: np.ndarray) -> tuple:
        mu, alpha, beta = incumbent._decode(vector, n)
        rho = incumbent.spectral_radius(alpha / beta)
        if rho >= 0.995:
            gradient = np.zeros_like(vector)
            for i in range(n, len(vector)):
                shifted = vector.copy()
                shifted[i] += 1e-7
                _, a, b = incumbent._decode(shifted, n)
                gradient[i] = (incumbent.spectral_radius(a / b) - rho) / 1e-7
            return 1e6 + 1e6 * (rho - 0.995) ** 2, 2e6 * (rho - 0.995) * gradient
        ll, gm, ga, gb = conditional_likelihood_gradient(
            events, mu, alpha, beta, horizon, exposure, groups_cache=groups
        )
        if not math.isfinite(ll):
            return 1e6, np.zeros_like(vector)
        return -ll, -np.r_[gm * mu, (ga * alpha).ravel(), gb * beta]

    starts = []
    for eta, beta in ((0.08, 0.8), (0.24, 1.5), (0.55, 2.4)):
        mu = np.maximum(empirical * (1.0 - eta), 1e-3)
        alpha = np.full((n, n), eta * beta / n)
        if n >= 2:
            alpha[0, 1] *= 0.75
            alpha[1, 0] *= 1.25
        starts.append(
            np.r_[np.log(mu), np.log(np.maximum(alpha, 1e-6)).ravel(), math.log(beta)]
        )
    results = [
        minimize(
            objective,
            v,
            jac=True,
            method="L-BFGS-B",
            bounds=bounds,
            options={"maxiter": 260, "ftol": 1e-11, "gtol": 1e-7, "maxls": 30},
        )
        for v in starts
    ]
    result = min(results, key=lambda r: float(r.fun))
    mu, alpha, beta = incumbent._decode(result.x, n)
    covariance, condition = None, None
    try:
        candidate = np.asarray(result.hess_inv.todense())
        if np.all(np.isfinite(candidate)):
            covariance, condition = candidate, float(np.linalg.cond(candidate))
    except (AttributeError, TypeError, ValueError, np.linalg.LinAlgError):
        pass
    return {
        "baseline": mu,
        "alpha": alpha,
        "beta": beta,
        "branching_matrix": alpha / beta,
        "spectral_radius": incumbent.spectral_radius(alpha / beta),
        "log_likelihood": -float(result.fun),
        "log_parameter_covariance": covariance,
        "optimizer": {
            "method": "L-BFGS-B deterministic multi-start",
            "success": bool(result.success),
            "status": int(result.status),
            "message": str(result.message),
            "iterations": int(result.nit),
            "function_evaluations": int(result.nfev),
            "starts": 3,
        },
        "identifiability": {
            "event_count": int(np.sum(counts)),
            "parameter_count": len(result.x),
            "events_per_parameter": float(np.sum(counts) / len(result.x)),
            "inverse_hessian_condition": condition,
            "locally_identifiable": bool(
                result.success and condition is not None and condition < 1e12
            ),
        },
    }


def residuals(
    events: Sequence[Sequence[float]],
    fit: Mapping[str, Any],
    horizon: float,
    exposure: Mapping[str, Any],
) -> dict:
    mu, alpha, beta = (
        np.asarray(fit["baseline"]),
        np.asarray(fit["alpha"]),
        float(fit["beta"]),
    )
    e, _, _, _ = initial_terms(mu, alpha, beta, exposure)
    state, cumulative, last = np.zeros(len(mu)), np.zeros(len(mu)), np.zeros(len(mu))
    previous, values = 0.0, []
    for time, marks in incumbent._event_groups(events, end=horizon):
        delta = time - previous
        decay = math.exp(-beta * delta)
        cumulative += mu * delta + (alpha @ state + e) * (1.0 - decay) / beta
        state *= decay
        e *= decay
        for target, count in enumerate(marks):
            for _ in range(int(count)):
                value = float(cumulative[target] - last[target])
                if value > 0.0:
                    values.append(value)
                last[target] = cumulative[target]
        state += marks
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
    correlation = (
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
        "lag1_autocorrelation": correlation,
        "calibrated": p >= 0.01 and abs(correlation) <= 0.25,
    }


def topology(matrix: Sequence[Sequence[float]], *, support: bool = False) -> str:
    g = np.asarray(matrix)
    if len(g) < 2:
        return "NONE"
    ab, ba = (
        (g[1, 0] == 1, g[0, 1] == 1) if support else (g[1, 0] > 0.035, g[0, 1] > 0.035)
    )
    return (
        "BIDIRECTIONAL" if ab and ba else "A_TO_B" if ab else "B_TO_A" if ba else "NONE"
    )


def geometry(fit: Mapping[str, Any]) -> dict:
    c = fit["log_parameter_covariance"]
    if c is None:
        return {
            "condition": None,
            "eigen_min": None,
            "eigen_max": None,
            "kind": "L_BFGS_INVERSE_CURVATURE_NOT_FISHER",
        }
    c = np.asarray(c)
    eigen = np.linalg.eigvalsh((c + c.T) / 2.0)
    return {
        "condition": float(np.linalg.cond(c)),
        "eigen_min": float(min(eigen)),
        "eigen_max": float(max(eigen)),
        "kind": "L_BFGS_INVERSE_CURVATURE_NOT_FISHER",
    }


def epistemic(row: Mapping[str, Any], truth: np.ndarray, count: int) -> str:
    condition = row["geometry"]["condition"]
    if not row["fit"]["optimizer"]["success"] or count < 50 or condition is None:
        return "UNRESOLVED"
    mask = truth > 0.035
    methods = [
        row["uncertainty"][k]
        for k in ("inverse_hessian", "event_attribution")
        if row["uncertainty"][k]["available"]
    ]
    covered = all(np.all(np.asarray(m["branching"]["covered"])[mask]) for m in methods)
    graph = row["graph"]
    if (
        graph["false_positive"]
        or graph["reversed_edges"]
        or condition >= 1e8
        or not covered
    ):
        return "LOW"
    widths = np.asarray(row["uncertainty"]["event_attribution"]["branching"]["width"])[
        mask
    ]
    if (
        graph["exact_graph"]
        and count >= 300
        and condition < 1e4
        and len(methods) == 2
        and (float(np.median(widths)) if widths.size else 0.0) <= 0.5
    ):
        return "HIGH"
    return "PARTIAL"


def record_latent(spec: Mapping[str, Any]) -> dict:
    latent = generate_latent(spec)
    events, horizon = latent["retained_events"], latent["horizon"]
    obs = spec["observed"]
    truth = np.asarray(spec["G"])[np.ix_(obs, obs)]
    mu = np.asarray(spec["mu"])[obs]
    rho = incumbent.spectral_radius(truth)
    rows = []
    for name in PROTOCOLS:
        exposure = protocol_inputs(latent, name)
        fit = incumbent._round(fit_protocol(events, horizon, exposure))
        methods = {
            "inverse_hessian": incumbent._hessian_uncertainty(
                fit, truth, seed=spec["seed"] + 10000
            ),
            "event_attribution": incumbent.attribution_uncertainty(
                events, fit, truth, horizon=horizon, seed=spec["seed"] + 20000
            ),
        }
        for key in ("parametric_bootstrap", "profile_likelihood"):
            methods[key] = {"available": False, "reason": "OUTSIDE_ZERO_AUDIT"}
        if name == "ZERO" and spec["audit"]:
            methods["parametric_bootstrap"] = incumbent._parametric_uncertainty(
                fit, truth, horizon=horizon, seed=spec["seed"] + 30000
            )
            methods["profile_likelihood"] = incumbent._profile_uncertainty(
                events, fit, truth, horizon=horizon
            )
        methods = incumbent._round(methods)
        graph = incumbent._graph_evaluation(
            truth, np.asarray(methods["event_attribution"]["edge_support"])
        )
        row = {
            "protocol": exposure,
            "latent_hash": latent["hash"],
            "retained_hash": canonical(events),
            "fit": fit,
            "geometry": geometry(fit),
            "uncertainty": methods,
            "graph": graph,
            "true_topology": topology(truth),
            "fitted_topology": topology(
                methods["event_attribution"]["edge_support"], support=True
            ),
            "errors": {
                "mu": np.asarray(fit["baseline"]) - mu,
                "alpha": np.asarray(fit["alpha"]) - truth * spec["beta"],
                "beta": fit["beta"] - spec["beta"],
                "branching": np.asarray(fit["branching_matrix"]) - truth,
                "rho": fit["spectral_radius"] - rho,
            },
            "residuals": residuals(events, fit, horizon, exposure),
        }
        row["structural_identifiability"] = epistemic(row, truth, sum(latent["counts"]))
        rows.append(incumbent._round(row))
        print(f"{spec['id']}: {name} complete", flush=True)
    record = {
        "latent": latent,
        "truth": {
            "mu": mu,
            "G": truth,
            "alpha": truth * spec["beta"],
            "beta": spec["beta"],
            "rho": rho,
            "driver_observed": spec["regime"] == "OBSERVED_DRIVER",
            "driver_latent": spec["regime"] == "LATENT_DRIVER",
        },
        "protocols": rows,
        "claims": CLAIMS,
    }
    return incumbent._round(record)


def run_boundary_experiment(*, workers: int = 6) -> dict:
    from src.dynamics.hawkes_boundary_analysis import derive_details, summarize

    parents = parent_seals()
    specs = registry()
    if {r["seed"] for r in specs} & {
        seed for p in parents.values() for seed in p["seeds"]
    }:
        raise BoundaryEvidenceError("diagnostic seeds overlap frozen evidence")
    key = canonical(
        {
            "instrument": source_hash(Path(__file__)),
            "preregistration": source_hash(PREREG),
            "parents": parents,
        }
    )
    cache = ROOT / "data/.cache/dynamics-d0-4-1-1" / key
    cache.mkdir(parents=True, exist_ok=True)
    completed, pending = {}, []
    for spec in specs:
        path = cache / (spec["id"] + ".json")
        if not path.exists():
            pending.append(spec)
            continue
        envelope = json.loads(path.read_text(encoding="utf-8"))
        if (
            envelope["key"] != key
            or canonical(envelope["record"]) != envelope["hash"]
            or envelope["record"]["latent"]["spec"] != spec
        ):
            raise BoundaryEvidenceError(f"invalid checkpoint: {path.name}")
        completed[spec["id"]] = envelope["record"]
    print(f"Checkpoint hits {len(completed)}/200; pending {len(pending)}", flush=True)
    with ProcessPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(record_latent, spec): spec for spec in pending}
        for future in as_completed(futures):
            spec = futures[future]
            record = future.result()
            path = cache / (spec["id"] + ".json")
            temporary = path.with_suffix(".json.tmp")
            temporary.write_text(
                json.dumps(
                    {"key": key, "hash": canonical(record), "record": record},
                    sort_keys=True,
                    allow_nan=False,
                ),
                encoding="utf-8",
            )
            temporary.replace(path)
            completed[spec["id"]] = record
            print(f"SEALED {len(completed)}/200 {spec['id']}", flush=True)
    records = [derive_details(completed[spec["id"]]) for spec in specs]
    summary = summarize(records)
    payload = incumbent._round(
        {
            "schema_version": SCHEMA,
            "milestone": "D0.4.1.1",
            "parent_head": PARENT_HEAD,
            "parent_seals": parents,
            "preregistration": {
                "path": PREREG.relative_to(ROOT).as_posix(),
                "source_sha256": source_hash(PREREG),
                "locked_before_execution": True,
            },
            "implementation_sources": {p: source_hash(ROOT / p) for p in SOURCES},
            "registry": specs,
            "protocol_names": PROTOCOLS,
            "thresholds": THRESHOLDS,
            "execution": {
                "latent_worlds": 200,
                "protocol_fits": 1800,
                "zero_audit_worlds": 20,
                "independent_replicates": 200,
                "paired_retained_events": True,
            },
            "uncertainty_policy": {
                "fixed_attribution_history": "HISTORICAL_ZERO_HISTORY_UNMODIFIED",
                "refit_profile_scope": "TWENTY_NEW_ZERO_CRITICALITY_WORLDS_ONLY",
                "new_interval_methods": 0,
            },
            "claims": CLAIMS,
            "records": records,
            "summary": summary,
            "observatory": {
                "representatives": [
                    records[i] for i in (0, 19, 40, 79, 99, 100, 124, 149, 179, 199)
                ],
                "curves": summary["rho_curves"],
                "confusion": summary["confusion"],
                "false_edges": summary["false_edge_categories"],
                "coverage": summary["coverage"],
                "geometry": summary["geometry"],
                "decision": summary["decision"],
            },
        }
    )
    payload["artifact_hash"] = canonical(payload)
    return payload
