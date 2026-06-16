"""Pricing routes: Black-Scholes options/Greeks and the implied-vol surface."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

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


def _spot_and_vol(ticker: str) -> tuple[float, float]:
    """Latest close + annualized vol for a ticker (for theoretical chains)."""
    from src.analytics import calculate_summary_statistics
    from src.data.market_data import MarketDataService
    from src.data.providers import ProviderError

    try:
        df = MarketDataService("yfinance").get_data(ticker)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}") from exc
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{ticker}'.")
    close = df.sort_values("Date")["Close"].astype(float)
    sigma = _f(calculate_summary_statistics(close).get("annualized_volatility")) or 0.25
    return float(close.iloc[-1]), float(sigma)


@router.get("/options/chain/{ticker}")
def option_chain(
    ticker: str,
    r: float = Query(0.05),
    q: float = Query(0.0),
    n_strikes: int = Query(13, ge=5, le=31),
    band: float = Query(0.18),
) -> Dict[str, Any]:
    """A theoretical option chain (calls/puts + Greeks) across strikes & expiries."""
    from src.pricing import black_scholes

    spot, sigma = _spot_and_vol(ticker)
    strikes = np.round(np.linspace(spot * (1 - band), spot * (1 + band), n_strikes), 2)
    atm = float(min(strikes, key=lambda k: abs(k - spot)))

    def leg(K: float, kind: str) -> Dict[str, Any]:
        s = black_scholes.calculate_option_summary(spot, float(K), T, r, sigma, q, kind)
        return {
            "price": _f(s["option_price"]), "delta": _f(s["delta"]), "gamma": _f(s["gamma"]),
            "vega": _f(s["vega_per_1pct"]), "theta": _f(s["theta_per_day"]),
            "rho": _f(s["rho_per_1pct"]), "iv": _f(sigma),
        }

    expiries = []
    for days in (30, 60, 90, 180):
        T = days / 365.0
        rows = [{"strike": float(K), "call": leg(K, "call"), "put": leg(K, "put")} for K in strikes]
        expiries.append({"days": days, "T": T, "rows": rows})

    return {"ticker": ticker.upper(), "spot": spot, "sigma": _f(sigma),
            "r": r, "q": q, "atm": atm, "expiries": expiries}


class StrategyLeg(BaseModel):
    type: str            # call | put | stock
    side: str            # long | short
    strike: float = 0.0
    qty: float = 1.0


class StrategyRequest(BaseModel):
    S: float
    sigma: float
    T: float
    r: float = 0.05
    q: float = 0.0
    legs: List[StrategyLeg]


@router.post("/options/strategy")
def option_strategy(req: StrategyRequest) -> Dict[str, Any]:
    """Net Greeks, expiry payoff curve, breakevens, and suggested hedges for a strategy."""
    from src.pricing import black_scholes

    S, sigma, T, r, q = req.S, req.sigma, req.T, req.r, req.q
    net_prem = 0.0
    g = {"delta": 0.0, "gamma": 0.0, "vega": 0.0, "theta": 0.0, "rho": 0.0}
    for lg in req.legs:
        sign = 1.0 if lg.side == "long" else -1.0
        if lg.type == "stock":
            net_prem += sign * lg.qty * S
            g["delta"] += sign * lg.qty
            continue
        s = black_scholes.calculate_option_summary(S, lg.strike, T, r, sigma, q, lg.type)
        net_prem += sign * lg.qty * s["option_price"]
        g["delta"] += sign * lg.qty * s["delta"]
        g["gamma"] += sign * lg.qty * s["gamma"]
        g["vega"] += sign * lg.qty * s["vega_per_1pct"]
        g["theta"] += sign * lg.qty * s["theta_per_day"]
        g["rho"] += sign * lg.qty * s["rho_per_1pct"]

    grid = np.linspace(max(1e-6, S * 0.6), S * 1.4, 90)
    payoff = []
    for ST in grid:
        v = 0.0
        for lg in req.legs:
            sign = 1.0 if lg.side == "long" else -1.0
            intr = ST if lg.type == "stock" else (
                max(ST - lg.strike, 0.0) if lg.type == "call" else max(lg.strike - ST, 0.0))
            v += sign * lg.qty * intr
        payoff.append(v - net_prem)
    payoff = np.array(payoff)

    breakevens = []
    for i in range(1, len(grid)):
        if (payoff[i - 1] <= 0 < payoff[i]) or (payoff[i - 1] >= 0 > payoff[i]):
            x0, x1, y0, y1 = grid[i - 1], grid[i], payoff[i - 1], payoff[i]
            breakevens.append(round(float(x0 - y0 * (x1 - x0) / (y1 - y0)), 2))

    nd = g["delta"]
    hedges = []
    if abs(nd) > 0.05:
        hedges.append(f"Delta-neutral: {'short' if nd > 0 else 'long'} ~{abs(round(nd))} share(s) of the underlying to flatten directional risk.")
    if nd > 0.05:
        hedges.append("Tail protection: buy an OTM put (protective put) to cap downside.")
    elif nd < -0.05:
        hedges.append("Upside cap: buy an OTM call to limit short-side losses.")
    if g["vega"] > 0.05:
        hedges.append("Long vega: sell a further-OTM option to reduce volatility exposure (spread/collar).")
    hedges.append("Finance the hedge by selling a wing option to offset premium.")

    return {
        "net_premium": _f(net_prem),
        "net_greeks": {k: _f(v) for k, v in g.items()},
        "spot_grid": [float(x) for x in grid],
        "payoff": [float(x) for x in payoff],
        "max_profit": _f(float(payoff.max())),
        "max_loss": _f(float(payoff.min())),
        "breakevens": breakevens,
        "hedges": hedges,
    }
