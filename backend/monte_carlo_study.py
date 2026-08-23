"""Calibrated, reproducible Monte Carlo research contract."""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd
from fastapi import HTTPException

from src.analytics import calculate_simple_returns
from src.data.market_data import MarketDataService
from src.data.providers import ProviderError
from src.risk import var_cvar
from src.simulation import monte_carlo


def _finite(value: Any) -> Optional[float]:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def build_monte_carlo_study(
    ticker: str,
    *,
    horizon_days: int,
    n: int,
    conf: float,
    seed: int,
    include_paths: bool,
) -> Dict[str, Any]:
    """Return a GBM study calibrated from observed close-to-close history."""
    try:
        frame = MarketDataService("yfinance").get_data(ticker)
    except ProviderError as exc:
        raise HTTPException(
            status_code=502, detail=f"Data fetch failed: {exc}"
        ) from exc
    if frame is None or frame.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{ticker}'.")

    ordered = frame.sort_values("Date").copy()
    close = pd.to_numeric(ordered["Close"], errors="coerce")
    valid = close.notna() & (close > 0)
    close = close.loc[valid].reset_index(drop=True)
    observed_dates = pd.to_datetime(ordered.loc[valid, "Date"], errors="coerce")
    if len(close) < 61:
        raise HTTPException(
            status_code=422,
            detail="At least 60 historical returns are required for calibration.",
        )

    log_returns = np.log(close / close.shift(1)).replace([np.inf, -np.inf], np.nan).dropna()
    calibration = log_returns.tail(756)
    sigma = float(calibration.std(ddof=1) * math.sqrt(252))
    log_drift = float(calibration.mean() * 252)
    mu = float(log_drift + 0.5 * sigma**2)
    spot = float(close.iloc[-1])
    horizon_years = horizon_days / 252.0
    historical_returns = calculate_simple_returns(close)

    paths = monte_carlo.simulate_gbm_paths(
        S0=spot,
        mu=mu,
        sigma=sigma,
        T=horizon_years,
        steps=horizon_days,
        n_simulations=n,
        random_seed=seed,
    )
    matrix = paths.to_numpy()
    terminal = matrix[-1, :]
    final = monte_carlo.calculate_final_prices(paths)
    simulated_returns = monte_carlo.calculate_simulated_returns(final, spot)
    risk = var_cvar.calculate_var_cvar_summary(
        historical_returns, simulated_returns, conf
    )

    time_indices = np.unique(
        np.linspace(0, horizon_days, min(60, horizon_days + 1)).astype(int)
    )
    fan = {
        f"p{percentile}": [
            float(np.percentile(matrix[step, :], percentile))
            for step in time_indices
        ]
        for percentile in (5, 25, 50, 75, 95)
    }
    fan["days"] = [int(step) for step in time_indices]

    tail_cutoff = float(np.quantile(terminal, 1.0 - conf))
    tail = terminal[terminal <= tail_cutoff]
    terminal_quantiles = {
        f"p{percentile}": float(np.percentile(terminal, percentile))
        for percentile in (5, 25, 50, 75, 95)
    }
    summary = {
        "expected_final_price": float(terminal.mean()),
        "median_final_price": terminal_quantiles["p50"],
        "expected_shortfall_price": float(tail.mean()),
        "probability_of_loss": float(np.mean(terminal < spot)),
        "expected_return": float(np.mean(terminal / spot - 1.0)),
        "num_simulations": n,
        "num_steps": horizon_days,
        **terminal_quantiles,
    }

    mean_stderr = float(terminal.std(ddof=1) / math.sqrt(n))
    half = n // 2
    first_half = terminal[:half]
    second_half = terminal[half : half * 2]
    quantile_half_deltas = {
        f"p{percentile}": float(
            abs(
                np.percentile(first_half, percentile)
                - np.percentile(second_half, percentile)
            )
        )
        for percentile in (5, 50, 95)
    }
    batches = [
        chunk
        for chunk in np.array_split(terminal, min(10, max(2, n // 200)))
        if len(chunk)
    ]
    convergence = {
        "terminal_mean_stderr": mean_stderr,
        "relative_terminal_mean_stderr": mean_stderr / spot,
        "batch_mean_stddev": float(
            np.std([float(chunk.mean()) for chunk in batches], ddof=1)
        ),
        "half_sample_quantile_deltas": quantile_half_deltas,
    }

    sampled_paths = None
    if include_paths:
        sample_size = min(400, n)
        sample_rng = np.random.default_rng(seed ^ 0x5F3759DF)
        sample_indices = np.sort(
            sample_rng.choice(n, size=sample_size, replace=False)
        )
        sampled_paths = matrix[:, sample_indices].T.tolist()

    source = (
        str(ordered.loc[valid, "Provider"].iloc[-1])
        if "Provider" in ordered.columns
        else "yfinance"
    )
    observed_at = (
        observed_dates.iloc[-1].isoformat()
        if not observed_dates.empty and pd.notna(observed_dates.iloc[-1])
        else None
    )
    quality_flags = [
        "AVAILABILITY_TIMESTAMP_UNAVAILABLE",
        "NO_IMPLIED_VOLATILITY",
    ]
    if len(calibration) < 252:
        quality_flags.append("LIMITED_CALIBRATION_HISTORY")
    if abs(mu) > 0.50:
        quality_flags.append("UNSTABLE_DRIFT_ESTIMATE")

    snapshot_material = {
        "ticker": ticker.upper(),
        "observed_at": observed_at,
        "source": source,
        "horizon_days": horizon_days,
        "n": n,
        "seed": seed,
        "mu": round(mu, 12),
        "sigma": round(sigma, 12),
    }
    snapshot_id = hashlib.sha256(
        json.dumps(snapshot_material, sort_keys=True).encode("utf-8")
    ).hexdigest()

    return {
        "snapshot_id": snapshot_id,
        "ticker": ticker.upper(),
        "source": source,
        "observed_at": observed_at,
        "available_at": None,
        "license": "provider-terms-apply",
        "model_version": "gbm-historical-v2",
        "quality": {"status": "DEGRADED", "flags": quality_flags},
        "assumptions": [
            "Geometric Brownian motion with constant drift and volatility.",
            "Historical close-to-close returns calibrate drift and volatility.",
            "No jumps, stochastic volatility, liquidity effects, or implied-volatility input.",
            "252 trading days per year.",
        ],
        "calibration": {
            "method": "trailing-log-returns",
            "observations": int(len(calibration)),
            "lookback_max_days": 756,
            "mu_annual": mu,
            "sigma_annual": sigma,
        },
        "S0": spot,
        "horizon_days": horizon_days,
        "horizon_years": horizon_years,
        "seed": seed,
        "summary": summary,
        "risk": {key: _finite(value) for key, value in risk.items()},
        "fan": fan,
        "sampled_paths": sampled_paths,
        "convergence": convergence,
    }
