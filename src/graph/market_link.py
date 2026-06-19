"""Quantify the market relationship between a company and a dependency.

Pure functions over pandas return/price series (no FastAPI, no network) so they
are unit-testable in isolation. Used by the dependency-graph sensitivity and
shock-propagation endpoints.

Conventions: ``focal_ret`` / ``dep_ret`` are daily simple-return Series indexed by
date. ``beta`` is the historical move in the focal stock per +1 unit move in the
dependency (regression of focal on dependency).
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd


def _f(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def perf(close: pd.Series) -> Dict[str, Any]:
    """Recent performance + bullish/bearish trend for a price series."""
    close = close.dropna()
    if len(close) < 2:
        return {"last": None, "change_pct": None, "ret_1m": None, "ret_3m": None, "trend": "n/a"}
    last = float(close.iloc[-1]); prev = float(close.iloc[-2])

    def pr(n: int) -> Optional[float]:
        return _f(close.iloc[-1] / close.iloc[-1 - n] - 1) if len(close) > n else None

    sma50 = float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else None
    r1 = pr(21)
    if sma50 is None:
        trend = "n/a"
    elif last >= sma50 and (r1 or 0) >= 0:
        trend = "bullish"
    elif last < sma50 and (r1 or 0) < 0:
        trend = "bearish"
    else:
        trend = "mixed"
    return {"last": _f(last), "change_pct": _f(last / prev - 1 if prev else 0),
            "ret_1m": r1, "ret_3m": pr(63), "trend": trend}


def link(focal_ret: pd.Series, dep_ret: pd.Series) -> Dict[str, Any]:
    """Regression linkage: beta, correlation, r2, alpha, residual std."""
    j = pd.concat([focal_ret.rename("f"), dep_ret.rename("d")], axis=1).dropna()
    if len(j) < 30:
        return {"beta": None, "corr": None, "r2": None, "alpha": None, "resid_std": None, "n": len(j)}
    var = float(j["d"].var())
    beta = float(j["f"].cov(j["d"]) / var) if var > 0 else None
    corr = float(j["f"].corr(j["d"]))
    alpha = float(j["f"].mean() - beta * j["d"].mean()) if beta is not None else None
    resid_std = None
    if beta is not None:
        resid = j["f"] - (alpha + beta * j["d"])
        resid_std = float(resid.std())
    return {"beta": _f(beta), "corr": _f(corr), "r2": _f(corr * corr) if corr == corr else None,
            "alpha": _f(alpha), "resid_std": _f(resid_std), "n": len(j)}


def lead_lag(focal_ret: pd.Series, dep_ret: pd.Series, max_lag: int = 5) -> Dict[str, Any]:
    """Cross-correlation across lags. best_lag > 0 => the dependency LEADS the stock."""
    j = pd.concat([focal_ret.rename("f"), dep_ret.rename("d")], axis=1).dropna()
    if len(j) < 40:
        return {"best_lag": 0, "best_corr": None}
    best_lag, best_corr = 0, 0.0
    for L in range(-max_lag, max_lag + 1):
        c = j["f"].corr(j["d"].shift(L))  # corr(f_t, d_{t-L}); L>0 => dep leads
        if c == c and abs(c) > abs(best_corr):
            best_lag, best_corr = L, float(c)
    return {"best_lag": best_lag, "best_corr": _f(best_corr)}


def rolling_corr(focal_ret: pd.Series, dep_ret: pd.Series, window: int = 60, points: int = 40) -> List[Dict[str, Any]]:
    """Downsampled rolling correlation history (how the relationship evolved)."""
    j = pd.concat([focal_ret.rename("f"), dep_ret.rename("d")], axis=1).dropna()
    rc = j["f"].rolling(window).corr(j["d"]).dropna()
    if rc.empty:
        return []
    if len(rc) > points:
        rc = rc.iloc[:: len(rc) // points + 1]
    return [{"date": str(i)[:10], "corr": _f(v)} for i, v in rc.items()]


def shock_montecarlo(
    focal_ret: pd.Series, dep_ret: pd.Series,
    shock: float, horizon_days: int = 21, n: int = 4000, seed: int = 42,
) -> Optional[Dict[str, Any]]:
    """Monte Carlo of the stock's horizon return, baseline vs a dependency shock.

    Regresses focal on dependency (alpha, beta, residual vol). The *shocked*
    scenario spreads ``shock`` (a cumulative move in the dependency over the
    horizon) across the days and propagates it through beta + residual noise; the
    *baseline* draws from the focal's own daily return distribution.
    """
    j = pd.concat([focal_ret.rename("f"), dep_ret.rename("d")], axis=1).dropna()
    if len(j) < 30:
        return None
    var = float(j["d"].var())
    beta = float(j["f"].cov(j["d"]) / var) if var > 0 else 0.0
    alpha = float(j["f"].mean() - beta * j["d"].mean())
    resid_std = float((j["f"] - (alpha + beta * j["d"])).std())
    mu_f, sd_f = float(j["f"].mean()), float(j["f"].std())

    rng = np.random.default_rng(seed)
    base = np.prod(1 + rng.normal(mu_f, sd_f, (n, horizon_days)), axis=1) - 1
    dep_daily = (1 + shock) ** (1 / horizon_days) - 1
    shocked = np.prod(1 + (alpha + beta * dep_daily + rng.normal(0, resid_std, (n, horizon_days))), axis=1) - 1

    def summ(a: np.ndarray) -> Dict[str, Any]:
        return {"mean": _f(a.mean()), "median": _f(np.median(a)),
                "p5": _f(np.percentile(a, 5)), "p95": _f(np.percentile(a, 95)),
                "prob_loss": _f((a < 0).mean())}

    def hist(a: np.ndarray) -> Dict[str, Any]:
        c, e = np.histogram(a, bins=40)
        return {"centers": [_f(0.5 * (e[i] + e[i + 1])) for i in range(len(c))],
                "counts": [int(x) for x in c]}

    return {"beta": _f(beta), "expected_move": _f(beta * shock), "horizon_days": horizon_days,
            "baseline": summ(base), "shocked": summ(shocked),
            "baseline_hist": hist(base), "shocked_hist": hist(shocked)}
