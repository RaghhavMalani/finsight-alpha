"""Module 5: PARTIAL_FACTOR_DIAGNOSTIC with the frozen D0.4.2 HAC regression.

This is never the seven-factor neutrality model: QUAL/VOL/LIQ are not admitted,
so that view stays UNAVAILABLE. Intercepts are descriptive, never alpha.
"""

import numpy as np

from src.dynamics.market_regime import POLICY, hac_regression

NAME = "PARTIAL_FACTOR_DIAGNOSTIC"


def _classify(low, high, tolerance):
    if -tolerance <= low and high <= tolerance:
        return "NEUTRAL"
    if high < -tolerance or low > tolerance:
        return "EXPOSED"
    return "WATCH"


def regress(y, x, names, tolerance=POLICY["neutrality_tolerance"]):
    fit = hac_regression(np.asarray(y, float), np.asarray(x, float))
    if fit["status"] != "AVAILABLE":
        return {k: v for k, v in fit.items() if k != "covariance"}
    beta, se = fit["beta"], fit["se"]
    design = np.column_stack([np.ones(len(y)), x])
    residual = np.asarray(y) - design @ beta
    total = np.sum((np.asarray(y) - np.mean(y)) ** 2)
    rows = []
    for i, name in enumerate(["intercept", *names]):
        low, high = beta[i] - 1.96 * se[i], beta[i] + 1.96 * se[i]
        rows.append(
            {
                "term": name,
                "coefficient": float(beta[i]),
                "hac_se": float(se[i]),
                "t": float(beta[i] / se[i]) if se[i] > 0 else None,
                "interval_95": [float(low), float(high)],
                "neutrality": None if name == "intercept" else _classify(low, high, tolerance),
            }
        )
    return {
        "status": "AVAILABLE",
        "n": int(fit["n"]),
        "condition": float(fit["condition"]),
        "r_squared": float(1 - np.sum(residual**2) / total) if total > 0 else None,
        "terms": rows,
        "inference": "DIAGNOSTIC_ASYMPTOTIC: Bartlett Newey-West lag 3, approximate normal 95% intervals",
        "residual_mean": float(np.mean(residual)),
        "raw_mean": float(np.mean(y)),
    }


def diagnose(frame, target, controls, *, states=None, window=None, minimum=None):
    """Full-window fit, prior-only rolling exposures and the additive decomposition."""
    window = window or POLICY["factor_window"]
    minimum = minimum or POLICY["factor_minimum"]
    y = frame[target].to_numpy(float)
    x = frame[controls].to_numpy(float)
    full = regress(y, x, controls)
    rolling, explained, residual, stamps = [], [], [], []
    for t in range(len(frame)):
        start = max(0, t - window)
        if t - start < minimum:
            continue
        fit = hac_regression(y[start:t], x[start:t])
        if fit["status"] != "AVAILABLE":
            continue
        beta = fit["beta"]
        fitted = float(beta[0] + x[t] @ beta[1:])
        stamps.append(frame.observed_at.iloc[t].isoformat())
        rolling.append({c: float(b) for c, b in zip(controls, beta[1:])})
        explained.append(fitted)
        residual.append(float(y[t] - fitted))
    raw = [float(v) for v in y[len(y) - len(explained):]] if explained else []
    cumulative = {
        "raw": float(np.sum(raw)) if raw else None,
        "explained": float(np.sum(explained)) if explained else None,
        "residual": float(np.sum(residual)) if residual else None,
    }
    if raw and abs(cumulative["raw"] - cumulative["explained"] - cumulative["residual"]) > 1e-9:
        raise ValueError("Raw = explained + residual identity failed")
    prior = [r[controls[0]] for r in rolling[-121:-1]]
    stability = 1 / (1 + float(np.std(prior, ddof=1))) if len(prior) >= 10 else None
    by_state = {}
    if states is not None:
        for label in sorted({s for s in states if isinstance(s, str)}):
            mask = np.asarray([s == label for s in states])
            by_state[label] = regress(y[mask], x[mask], controls)
    return {
        "name": NAME,
        "target": target,
        "controls": controls,
        "full_window": full,
        "rolling": {
            "window": window,
            "minimum": minimum,
            "semantics": "Prior-only: coefficients for observation t use observations before t",
            "tail": [
                {"observed_at": s, **b} for s, b in list(zip(stamps, rolling))[-250:]
            ],
        },
        "decomposition": {
            "semantics": "Unit-notional arithmetic attribution: raw = factor-explained (incl. intercept) + residual; not compounded P&L or alpha",
            "observations": len(explained),
            "cumulative": cumulative,
            "tail": [
                {"observed_at": s, "raw": r, "explained": e, "residual": u}
                for s, r, e, u in list(zip(stamps, raw, explained, residual))[-250:]
            ],
        },
        "stability": stability,
        "by_state": by_state,
        "seven_factor": "UNAVAILABLE: QUAL, VOL and LIQ are not admitted",
    }
