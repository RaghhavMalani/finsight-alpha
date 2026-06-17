"""Factor-exposure route: regress a stock's returns on factor-ETF returns.

A pragmatic, transparent factor model: multivariate OLS of the stock's daily
returns on a basket of liquid factor ETFs (market, size, value, momentum,
quality, low-vol). The coefficients are the stock's exposures (betas) to each
style; the intercept (annualized) is alpha unexplained by the factors; R² says
how much of the stock's variance the factors capture.
"""

from __future__ import annotations

import datetime
import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from src.data.market_data import MarketDataService
from src.data.providers import ProviderError

router = APIRouter(prefix="/factors", tags=["factors"])

# Factor proxy ETFs (liquid, long history).
FACTOR_ETFS = [
    ("Market", "SPY"),
    ("Size", "IWM"),
    ("Value", "IWD"),
    ("Momentum", "MTUM"),
    ("Quality", "QUAL"),
    ("Low Vol", "USMV"),
]


def _f(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


@router.get("/{ticker}")
def factor_exposures(ticker: str, lookback_days: int = Query(540, ge=120, le=2000)) -> Dict[str, Any]:
    start = (datetime.date.today() - datetime.timedelta(days=lookback_days)).isoformat()
    svc = MarketDataService("yfinance")

    def returns(tk: str):
        try:
            df = svc.get_data(tk, start)
        except (ProviderError, Exception):
            return None
        if df is None or df.empty:
            return None
        s = df.sort_values("Date").set_index("Date")["Close"].astype(float)
        return s.pct_change().dropna()

    y = returns(ticker)
    if y is None:
        raise HTTPException(status_code=404, detail=f"No data for '{ticker}'.")

    cols = {}
    for name, tk in FACTOR_ETFS:
        r = returns(tk)
        if r is not None:
            cols[name] = r
    if not cols:
        raise HTTPException(status_code=502, detail="Could not fetch factor ETF data.")

    data = pd.concat([y.rename("y")] + [v.rename(k) for k, v in cols.items()], axis=1).dropna()
    if len(data) < 60:
        raise HTTPException(status_code=422, detail="Insufficient overlapping history.")

    names = list(cols.keys())
    Y = data["y"].to_numpy()
    X = data[names].to_numpy()
    Xc = np.column_stack([np.ones(len(X)), X])
    beta, *_ = np.linalg.lstsq(Xc, Y, rcond=None)

    pred = Xc @ beta
    ss_res = float(((Y - pred) ** 2).sum())
    ss_tot = float(((Y - Y.mean()) ** 2).sum())
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else None

    exposures = [{"factor": names[i], "beta": _f(beta[i + 1])} for i in range(len(names))]
    return {
        "ticker": ticker.upper(),
        "alpha_annual": _f(beta[0] * 252),
        "r2": _f(r2),
        "n_days": int(len(data)),
        "exposures": exposures,
    }
