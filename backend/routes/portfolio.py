"""Portfolio route: aggregate risk for a set of holdings.

Given weighted holdings it builds the portfolio return series, then computes
annualized return/vol/Sharpe, historical & parametric VaR/CVaR, max drawdown,
each asset's contribution to portfolio risk, and the correlation matrix.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.data.market_data import MarketDataService
from src.data.providers import ProviderError
from src.risk import var_cvar

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


class Holding(BaseModel):
    ticker: str
    weight: float


class PortfolioRequest(BaseModel):
    holdings: List[Holding]
    confidence: float = 0.95


def _f(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


@router.post("/risk")
def portfolio_risk(req: PortfolioRequest) -> Dict[str, Any]:
    holds = [h for h in req.holdings if h.ticker and h.weight]
    if not holds:
        raise HTTPException(status_code=400, detail="No holdings provided.")

    tickers = [h.ticker.upper() for h in holds]
    raw_w = np.array([float(h.weight) for h in holds])
    if raw_w.sum() <= 0:
        raise HTTPException(status_code=400, detail="Weights must sum to a positive number.")

    svc = MarketDataService("yfinance")
    closes: Dict[str, pd.Series] = {}
    for t in tickers:
        try:
            df = svc.get_data(t)
            closes[t] = df.sort_values("Date").set_index("Date")["Close"].astype(float)
        except ProviderError:
            continue
    valid = [t for t in tickers if t in closes]
    if not valid:
        raise HTTPException(status_code=404, detail="No price data for any holding.")

    px = pd.DataFrame({t: closes[t] for t in valid}).dropna()
    if px.empty or len(px) < 30:
        raise HTTPException(status_code=422, detail="Insufficient overlapping price history.")

    w = np.array([raw_w[tickers.index(t)] for t in valid])
    w = w / w.sum()

    rets = px.pct_change().dropna()
    port_ret = pd.Series(rets.values @ w, index=rets.index)

    ann = 252
    cov = rets.cov().values * ann
    port_var = float(w @ cov @ w)
    port_vol = math.sqrt(port_var) if port_var > 0 else 0.0
    mctr = (cov @ w) / port_vol if port_vol > 0 else np.zeros(len(w))  # marginal contribution
    ctr = w * mctr                                                     # component contribution
    pct_ctr = ctr / port_vol if port_vol > 0 else ctr

    mu = float(port_ret.mean() * ann)
    sharpe = mu / port_vol if port_vol else None
    cum = float((1 + port_ret).prod() - 1)
    curve = (1 + port_ret).cumprod()
    maxdd = float((curve / curve.cummax() - 1).min())
    risk = var_cvar.calculate_var_cvar_summary(port_ret, None, req.confidence)

    contributions = [
        {
            "ticker": t,
            "weight": _f(w[i]),
            "vol_contribution": _f(ctr[i]),
            "pct_contribution": _f(pct_ctr[i]),
        }
        for i, t in enumerate(valid)
    ]
    corr = rets.corr().round(3)

    return {
        "tickers": valid,
        "n_days": int(len(rets)),
        "weights": {t: _f(w[i]) for i, t in enumerate(valid)},
        "metrics": {
            "annual_return": _f(mu),
            "annual_vol": _f(port_vol),
            "sharpe": _f(sharpe),
            "cumulative_return": _f(cum),
            "max_drawdown": _f(maxdd),
            "var95": _f(risk["historical_var"]),
            "cvar95": _f(risk["historical_cvar"]),
            "parametric_var": _f(risk["parametric_var"]),
        },
        "contributions": sorted(contributions, key=lambda x: (x["pct_contribution"] or 0), reverse=True),
        "correlation": {"tickers": valid, "matrix": corr.values.tolist()},
    }
