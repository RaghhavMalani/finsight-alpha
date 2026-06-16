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
