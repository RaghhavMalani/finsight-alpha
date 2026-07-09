"""Risk route: Monte Carlo simulation with VaR/CVaR and a percentile fan."""

from __future__ import annotations

import math
from typing import Any, Dict, Optional

import numpy as np
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/risk", tags=["risk"])


def _f(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


# =============================================================================
# /risk/dashboard/{ticker} — everything the Risk Workstation needs in one call.
# =============================================================================

_Z = {0.95: 1.6448536269514722, 0.99: 2.3263478740408408}

_STRESS_SCENARIOS = [
    # (name, market shock, window description)
    ("Black Monday 1987",   -0.205, "1 day"),
    ("GFC 2008 drawdown",   -0.568, "17 months"),
    ("COVID crash 2020",    -0.339, "23 days"),
    ("2022 rate shock",     -0.254, "9 months"),
    ("Flash correction",    -0.10,  "5 days"),
    ("Vol spike +3 sigma",  None,   "1 day"),  # computed from the asset's own sigma
]


def _cornish_fisher_z(z: float, skew: float, kurt: float) -> float:
    """Cornish-Fisher expansion: adjust the Gaussian quantile for skew/kurtosis."""
    return (
        z
        + (z**2 - 1) * skew / 6
        + (z**3 - 3 * z) * kurt / 24
        - (2 * z**3 - 5 * z) * (skew**2) / 36
    )


def _drawdown_episodes(dates, close, top_n: int = 5):
    """Top-N peak-to-trough drawdown episodes with recovery info."""
    import pandas as pd

    c = close.reset_index(drop=True)
    peak_idx = 0
    episodes = []
    cur = None  # [peak_i, trough_i, trough_dd]
    running_peak = c.iloc[0]
    for i in range(1, len(c)):
        if c.iloc[i] >= running_peak:
            if cur is not None:
                episodes.append({**cur, "recovery_i": i})
                cur = None
            running_peak = c.iloc[i]
            peak_idx = i
        else:
            dd = c.iloc[i] / running_peak - 1.0
            if cur is None or dd < cur["depth"]:
                cur = {"peak_i": peak_idx, "trough_i": i, "depth": float(dd),
                       **({"recovery_i": None} if cur is None else {})}
                cur.setdefault("recovery_i", None)
    if cur is not None:
        episodes.append(cur)

    episodes.sort(key=lambda e: e["depth"])
    out = []
    for e in episodes[:top_n]:
        rec = e.get("recovery_i")
        out.append({
            "peak": str(dates.iloc[e["peak_i"]])[:10],
            "trough": str(dates.iloc[e["trough_i"]])[:10],
            "depth": _f(e["depth"]),
            "length_days": int(e["trough_i"] - e["peak_i"]),
            "recovery_days": int(rec - e["trough_i"]) if rec is not None else None,
            "recovered": rec is not None,
        })
    return out


@router.get("/dashboard/{ticker}")
def risk_dashboard(
    ticker: str,
    benchmark: str = Query("SPY"),
    notional: float = Query(100_000.0, description="Position size for $ figures"),
) -> Dict[str, Any]:
    """Deep risk profile: VaR by method, rolling risk, drawdowns, stress tests."""
    import pandas as pd
    from src.analytics import calculate_summary_statistics
    from src.data.market_data import MarketDataService
    from src.data.providers import ProviderError

    svc = MarketDataService("yfinance")
    try:
        df = svc.get_data(ticker)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}") from exc
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{ticker}'.")

    df = df.sort_values("Date").reset_index(drop=True)
    dates = pd.to_datetime(df["Date"]).dt.strftime("%Y-%m-%d")
    close = pd.to_numeric(df["Close"], errors="coerce").astype(float)
    r = close.pct_change().replace([np.inf, -np.inf], np.nan).dropna()
    if len(r) < 100:
        raise HTTPException(status_code=422, detail="Not enough history for risk analysis.")

    arr = r.to_numpy()
    mu_d, sd_d = float(arr.mean()), float(arr.std(ddof=1))
    skew = float(((arr - mu_d) ** 3).mean() / sd_d**3)
    kurt = float(((arr - mu_d) ** 4).mean() / sd_d**4 - 3.0)
    ann_vol = sd_d * math.sqrt(252)

    stats = calculate_summary_statistics(close)

    # ---------------- VaR / CVaR by method, 95 & 99, 1d & 10d -----------------
    rng = np.random.default_rng(7)
    sim = rng.normal(mu_d, sd_d, 200_000)
    var_table = []
    for conf in (0.95, 0.99):
        q = float(np.quantile(arr, 1 - conf))
        tail = arr[arr <= q]
        z = _Z[conf]
        zcf = _cornish_fisher_z(z, skew, kurt)
        mc_q = float(np.quantile(sim, 1 - conf))
        mc_tail = sim[sim <= mc_q]
        row = {
            "confidence": conf,
            "historical": {"var": _f(-q), "cvar": _f(-float(tail.mean())) if len(tail) else None},
            "parametric": {"var": _f(-(mu_d - z * sd_d)), "cvar": None},
            "cornish_fisher": {"var": _f(-(mu_d - zcf * sd_d)), "cvar": None},
            "monte_carlo": {"var": _f(-mc_q), "cvar": _f(-float(mc_tail.mean())) if len(mc_tail) else None},
        }
        row["var_10d"] = _f(-(mu_d * 10 - z * sd_d * math.sqrt(10)))
        row["dollar_var_1d"] = _f(notional * (row["historical"]["var"] or 0))
        var_table.append(row)

    # ---------------- rolling series (downsampled) -----------------------------
    roll20 = r.rolling(20).std() * math.sqrt(252)
    roll60 = r.rolling(60).std() * math.sqrt(252)
    ewma = r.ewm(alpha=0.06, adjust=False).std() * math.sqrt(252)  # RiskMetrics lambda=.94
    rvar95 = -r.rolling(252).quantile(0.05)

    dd = close / close.cummax() - 1.0

    # rolling beta vs benchmark (120d)
    beta_series, bench_ok = None, False
    beta_now = None
    corr_now = None
    try:
        bdf = svc.get_data(benchmark)
        bdf = bdf.sort_values("Date").reset_index(drop=True)
        b = pd.DataFrame({
            "Date": pd.to_datetime(bdf["Date"]).dt.strftime("%Y-%m-%d"),
            "bret": pd.to_numeric(bdf["Close"], errors="coerce").astype(float).pct_change(),
        })
        a = pd.DataFrame({"Date": dates, "aret": close.pct_change()})
        m = a.merge(b, on="Date").dropna()
        if len(m) > 130:
            cov = m["aret"].rolling(120).cov(m["bret"])
            var = m["bret"].rolling(120).var()
            beta_roll = (cov / var).replace([np.inf, -np.inf], np.nan)
            beta_series = {"dates": m["Date"].tolist(), "beta": [_f(x) for x in beta_roll]}
            beta_now = _f(beta_roll.dropna().iloc[-1]) if beta_roll.notna().any() else None
            corr_now = _f(m["aret"].corr(m["bret"]))
            bench_ok = True
    except Exception:
        pass

    def _ds(s_dates, s_vals, cap=500):
        n = len(s_vals)
        if n <= cap:
            idx = range(n)
        else:
            step = n // cap + 1
            idx = list(range(0, n, step)) + [n - 1]
        return {"dates": [s_dates[i] for i in idx], "values": [_f(s_vals[i]) for i in idx]}

    d_list = dates.tolist()
    rd_list = dates.iloc[1:].tolist()  # dates aligned to returns

    if beta_series is not None:
        _b = _ds(beta_series["dates"], beta_series["beta"])
        beta_series = {"dates": _b["dates"], "beta": _b["values"]}

    # ---------------- worst windows & stress tests -----------------------------
    logc = np.log(close.to_numpy())
    worst_windows = []
    for k, label in [(1, "1 day"), (5, "1 week"), (21, "1 month"), (63, "3 months")]:
        if len(logc) > k:
            w = float(np.exp(np.min(logc[k:] - logc[:-k])) - 1.0)
            worst_windows.append({"window": label, "worst_return": _f(w),
                                  "dollar": _f(notional * w)})

    beta_for_stress = beta_now if beta_now is not None else _f(stats.get("beta")) or 1.0
    stress = []
    for name, shock, window in _STRESS_SCENARIOS:
        if shock is None:  # vol-based scenario
            est = -3.0 * sd_d
            label = "-3 sigma daily move"
        else:
            est = beta_for_stress * shock
            label = f"market {shock:+.1%}"
        stress.append({
            "scenario": name, "window": window, "shock": label,
            "est_return": _f(est), "est_dollar": _f(notional * est),
        })

    hist_counts, hist_edges = np.histogram(arr, bins=60)

    return {
        "ticker": ticker.upper(),
        "benchmark": benchmark.upper(),
        "benchmark_available": bench_ok,
        "notional": notional,
        "as_of": d_list[-1],
        "n_days": int(len(r)),
        "headline": {
            "last": _f(close.iloc[-1]),
            "ann_vol": _f(ann_vol),
            "ewma_vol": _f(ewma.iloc[-1]),
            "sharpe": _f(stats.get("sharpe_ratio")),
            "sortino": _f(stats.get("sortino_ratio")),
            "max_drawdown": _f(stats.get("max_drawdown")),
            "calmar": _f((stats.get("cagr") or 0) / abs(stats.get("max_drawdown") or 1))
                      if stats.get("max_drawdown") else None,
            "beta": beta_now if beta_now is not None else _f(stats.get("beta")),
            "corr_benchmark": corr_now,
            "skew": _f(skew),
            "kurtosis": _f(kurt),
            "hit_rate": _f(float((arr > 0).mean())),
            "worst_day": _f(float(arr.min())),
            "best_day": _f(float(arr.max())),
            "downside_dev": _f(float(arr[arr < 0].std(ddof=1) * math.sqrt(252))) if (arr < 0).any() else None,
        },
        "var_table": var_table,
        "price": _ds(d_list, close.tolist()),
        "drawdown": _ds(d_list, dd.tolist()),
        "rolling_vol": {
            "dates": _ds(rd_list, roll20.tolist())["dates"],
            "v20": _ds(rd_list, roll20.tolist())["values"],
            "v60": _ds(rd_list, roll60.tolist())["values"],
            "ewma": _ds(rd_list, ewma.tolist())["values"],
        },
        "rolling_var95": _ds(rd_list, rvar95.tolist()),
        "rolling_beta": beta_series,
        "return_hist": {
            "centers": [_f(0.5 * (hist_edges[i] + hist_edges[i + 1])) for i in range(len(hist_counts))],
            "counts": [int(c) for c in hist_counts],
        },
        "drawdown_episodes": _drawdown_episodes(dates, close),
        "worst_windows": worst_windows,
        "stress_tests": stress,
    }


@router.get("/montecarlo/{ticker}")
def montecarlo(
    ticker: str,
    horizon: float = Query(1.0, description="Horizon in years"),
    n: int = Query(4000, ge=200, le=50000, description="Simulations"),
    conf: float = Query(0.95, description="VaR confidence"),
) -> Dict[str, Any]:
    """GBM Monte Carlo calibrated to the ticker's own drift/vol, with risk metrics."""
    from src.analytics import calculate_simple_returns, calculate_summary_statistics
    from src.data.market_data import MarketDataService
    from src.data.providers import ProviderError
    from src.risk import var_cvar
    from src.simulation import monte_carlo

    try:
        df = MarketDataService("yfinance").get_data(ticker)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}") from exc
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{ticker}'.")

    close = df.sort_values("Date")["Close"].astype(float).reset_index(drop=True)
    stats = calculate_summary_statistics(close)
    S0 = float(close.iloc[-1])
    mu = _f(stats.get("cagr")) or 0.08
    sigma = _f(stats.get("annualized_volatility")) or 0.20
    hist_returns = calculate_simple_returns(close)

    paths = monte_carlo.simulate_gbm_paths(
        S0=S0, mu=mu, sigma=sigma, T=horizon, steps=252, n_simulations=n, random_seed=42
    )
    final = monte_carlo.calculate_final_prices(paths)
    sim_ret = monte_carlo.calculate_simulated_returns(final, S0)
    summary = monte_carlo.calculate_simulation_summary(paths, S0)
    risk = var_cvar.calculate_var_cvar_summary(hist_returns, sim_ret, conf)

    # Percentile fan over the horizon.
    arr = paths.to_numpy()
    n_steps = arr.shape[0] - 1
    t_idx = np.unique(np.linspace(0, n_steps, 40).astype(int))
    times = [float(i / n_steps * horizon) for i in t_idx]
    fan = {f"p{p}": [float(np.percentile(arr[i, :], p)) for i in t_idx] for p in (5, 25, 50, 75, 95)}

    # Histogram of simulated returns.
    counts, edges = np.histogram(sim_ret.to_numpy(), bins=40)
    hist = {
        "centers": [float(0.5 * (edges[i] + edges[i + 1])) for i in range(len(counts))],
        "counts": [int(c) for c in counts],
    }

    return {
        "ticker": ticker.upper(),
        "S0": S0, "mu": mu, "sigma": sigma, "horizon": horizon,
        "summary": {k: _f(v) for k, v in summary.items()},
        "risk": {k: _f(v) for k, v in risk.items()},
        "fan": {"times": times, **fan},
        "return_hist": hist,
    }
