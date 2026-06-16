"""Pricing routes: Black-Scholes options/Greeks and the implied-vol surface."""

from __future__ import annotations

import math
from typing import Any, Dict, Optional

import numpy as np
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(tags=["pricing"])


def _f(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


@router.get("/options/price")
def option_price(
    S: float = Query(..., description="Spot price"),
    K: float = Query(..., description="Strike"),
    T: float = Query(..., description="Years to maturity"),
    r: float = Query(0.05, description="Risk-free rate"),
    sigma: float = Query(0.20, description="Volatility"),
    q: float = Query(0.0, description="Dividend yield"),
    type: str = Query("call", description="call|put"),
) -> Dict[str, Any]:
    """Black-Scholes price + full Greeks, plus a price-vs-spot sensitivity curve."""
    from src.pricing import black_scholes

    try:
        summ = black_scholes.calculate_option_summary(S, K, T, r, sigma, q, type)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    spots = np.linspace(max(1e-6, S * 0.6), S * 1.4, 60)
    prices = [
        black_scholes.calculate_option_price(float(s), K, T, r, sigma, q, type) for s in spots
    ]
    deltas = [
        black_scholes.calculate_delta(float(s), K, T, r, sigma, q, type) for s in spots
    ]

    greeks = {
        k: _f(summ.get(k))
        for k in ["delta", "gamma", "vega", "vega_per_1pct", "theta",
                  "theta_per_day", "rho", "rho_per_1pct"]
    }
    return {
        "option_type": type,
        "price": _f(summ.get("option_price")),
        "greeks": greeks,
        "inputs": {"S": S, "K": K, "T": T, "r": r, "sigma": sigma, "q": q},
        "sensitivity": {
            "spot": [float(s) for s in spots],
            "price": [_f(p) for p in prices],
            "delta": [_f(d) for d in deltas],
        },
    }


@router.get("/vol/surface/{ticker}")
def vol_surface(
    ticker: str,
    r: float = Query(0.05),
    q: float = Query(0.0),
) -> Dict[str, Any]:
    """Implied volatility surface (strike x maturity -> IV%) for a 3D plot.

    Uses live option chains when available, else a realistic synthetic surface.
    """
    from src.pricing.vol_surface import build_surface_for_ticker

    try:
        surf = build_surface_for_ticker(ticker, r=r, q=q, prefer_live=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vol surface failed: {exc}") from exc

    return {
        "ticker": ticker.upper(),
        "source": surf.source,
        "spot": _f(surf.spot),
        "strikes": [float(x) for x in surf.strike_axis()],
        "maturities": [float(y) for y in surf.maturities],
        "iv": [[float(v * 100) for v in row] for row in surf.iv_grid],
    }
