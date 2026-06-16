"""Option-chain data layer for the volatility surface.

Two sources, one normalized schema:

* :func:`fetch_option_chain` - live chains from Yahoo Finance (``yfinance``).
* :func:`generate_synthetic_chain` - a realistic, parametric chain with skew and
  term structure, used for tests and for demoing the surface when no live option
  data is available (e.g. most Indian single names on Yahoo, or offline).

Both return a tidy :class:`pandas.DataFrame` with exactly these columns::

    expiry        (datetime64)  option expiry date
    T             (float)       time to maturity in years (ACT/365)
    strike        (float)       strike price
    option_type   (str)         "call" or "put"
    market_price  (float)       mid price if bid/ask available, else last price
    moneyness     (float)       strike / spot

Keeping the schema identical means :mod:`src.pricing.vol_surface` never has to
care where the chain came from.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

import numpy as np
import pandas as pd

CHAIN_COLUMNS = ["expiry", "T", "strike", "option_type", "market_price", "moneyness"]


@dataclass
class OptionChain:
    """A normalized option chain plus the spot used to compute moneyness."""

    ticker: str
    spot: float
    data: pd.DataFrame
    source: str  # "yfinance" or "synthetic"


# ---------------------------------------------------------------------------
# Live data (yfinance)
# ---------------------------------------------------------------------------
def fetch_option_chain(
    ticker: str,
    max_expiries: int = 8,
    moneyness_band: float = 0.30,
) -> Optional[OptionChain]:
    """Fetch and normalize a live option chain from Yahoo Finance.

    Parameters
    ----------
    ticker:
        Yahoo symbol (e.g. ``"AAPL"``). Most liquid US names have option data;
        many non-US single names do not - in that case this returns ``None`` and
        the caller should fall back to :func:`generate_synthetic_chain`.
    max_expiries:
        Cap on the number of expiries pulled (nearest first) to keep it fast.
    moneyness_band:
        Keep only strikes within +/- this fraction of spot (e.g. 0.30 = +/-30%),
        where the surface is liquid and IVs are well-behaved.

    Returns
    -------
    OptionChain or None
        ``None`` on any failure (no network, no options, bad data). Never raises.
    """
    try:
        import yfinance as yf
    except Exception:
        return None

    try:
        tk = yf.Ticker(ticker)
        spot = _infer_spot(tk)
        if not spot or spot <= 0:
            return None

        expiries = list(getattr(tk, "options", []) or [])
        if not expiries:
            return None
        expiries = expiries[:max_expiries]

        today = date.today()
        rows = []
        for exp in expiries:
            try:
                chain = tk.option_chain(exp)
            except Exception:
                continue
            exp_dt = pd.to_datetime(exp).date()
            T = max((exp_dt - today).days, 0) / 365.0
            if T <= 0:
                continue
            for opt_type, frame in (("call", chain.calls), ("put", chain.puts)):
                if frame is None or frame.empty:
                    continue
                rows.extend(_rows_from_yf_frame(frame, opt_type, exp_dt, T, spot))

        if not rows:
            return None

        df = pd.DataFrame(rows, columns=CHAIN_COLUMNS)
        df = df[(df["moneyness"] >= 1 - moneyness_band) & (df["moneyness"] <= 1 + moneyness_band)]
        df = df[df["market_price"] > 0].reset_index(drop=True)
        if df.empty:
            return None
        return OptionChain(ticker=ticker, spot=float(spot), data=df, source="yfinance")
    except Exception:
        return None


def _infer_spot(tk) -> Optional[float]:
    """Best-effort current price from yfinance (fast_info, then history)."""
    try:
        fi = getattr(tk, "fast_info", None)
        if fi:
            px = fi.get("last_price") if hasattr(fi, "get") else getattr(fi, "last_price", None)
            if px:
                return float(px)
    except Exception:
        pass
    try:
        hist = tk.history(period="1d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception:
        pass
    return None


def _rows_from_yf_frame(frame: pd.DataFrame, opt_type: str, exp_dt, T: float, spot: float) -> list[dict]:
    rows = []
    for _, r in frame.iterrows():
        strike = float(r.get("strike", np.nan))
        if not np.isfinite(strike) or strike <= 0:
            continue
        bid = float(r.get("bid", 0) or 0)
        ask = float(r.get("ask", 0) or 0)
        last = float(r.get("lastPrice", 0) or 0)
        # Prefer a tight mid; fall back to last trade.
        if bid > 0 and ask > 0 and ask >= bid:
            price = 0.5 * (bid + ask)
        else:
            price = last
        if price <= 0:
            continue
        rows.append(
            {
                "expiry": pd.Timestamp(exp_dt),
                "T": T,
                "strike": strike,
                "option_type": opt_type,
                "market_price": price,
                "moneyness": strike / spot,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Synthetic data (offline / demo / tests)
# ---------------------------------------------------------------------------
def synthetic_iv(log_moneyness: float, T: float,
                 atm_vol: float = 0.22, skew: float = -0.12,
                 smile: float = 0.40, term: float = 0.05) -> float:
    """A parametric implied-vol model with the stylized facts of real surfaces.

    ``sigma(m, T) = atm_vol + skew*m + smile*m^2 + term*sqrt(T)``

    where ``m = ln(K/S)``. Negative ``skew`` reproduces the equity volatility
    *skew* (downside puts richer), the positive ``smile`` term gives the convex
    smile, and ``term`` adds a gently upward-sloping term structure. Clipped to a
    sane positive range.
    """
    sigma = atm_vol + skew * log_moneyness + smile * log_moneyness ** 2 + term * np.sqrt(T)
    return float(np.clip(sigma, 0.02, 3.0))


def generate_synthetic_chain(
    ticker: str = "DEMO",
    spot: float = 100.0,
    r: float = 0.05,
    q: float = 0.0,
    maturities: tuple[float, ...] = (0.08, 0.25, 0.5, 1.0, 1.5, 2.0),
    n_strikes: int = 15,
    moneyness_band: float = 0.30,
    seed: Optional[int] = 7,
) -> OptionChain:
    """Build a realistic synthetic chain by pricing a known IV surface.

    For each (strike, maturity) we evaluate :func:`synthetic_iv`, price the option
    with Black-Scholes, and add light noise. The IV solver should then *recover*
    a surface close to the input - which is exactly what the round-trip test
    checks, and what makes the demo surface look like a real one.
    """
    from src.pricing import black_scholes

    rng = np.random.default_rng(seed)
    strikes = np.linspace(spot * (1 - moneyness_band), spot * (1 + moneyness_band), n_strikes)
    today = pd.Timestamp(datetime.today().date())

    rows = []
    for T in maturities:
        exp = today + pd.Timedelta(days=int(round(T * 365)))
        for K in strikes:
            m = np.log(K / spot)
            sigma = synthetic_iv(m, T)
            # Out-of-the-money side per Yahoo convention: calls above spot, puts below.
            opt_type = "call" if K >= spot else "put"
            price = black_scholes.calculate_option_price(spot, float(K), float(T), r, sigma, q, opt_type)
            price *= 1.0 + rng.normal(0, 0.005)  # ~0.5% quote noise
            if price <= 0:
                continue
            rows.append(
                {
                    "expiry": exp,
                    "T": float(T),
                    "strike": float(K),
                    "option_type": opt_type,
                    "market_price": float(price),
                    "moneyness": float(K / spot),
                }
            )

    df = pd.DataFrame(rows, columns=CHAIN_COLUMNS)
    return OptionChain(ticker=ticker, spot=float(spot), data=df, source="synthetic")


def get_option_chain(
    ticker: str,
    prefer_live: bool = True,
    spot_hint: Optional[float] = None,
) -> OptionChain:
    """Convenience: try live data, fall back to a synthetic chain.

    The synthetic fallback is centered on ``spot_hint`` (or 100) so the surface is
    always renderable even for tickers Yahoo has no options for.
    """
    if prefer_live:
        live = fetch_option_chain(ticker)
        if live is not None and not live.data.empty:
            return live
    return generate_synthetic_chain(ticker=ticker, spot=spot_hint or 100.0)
