"""Quote route: rich price + analytics payload powering the terminal Overview."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from src import config
from src.analytics import (
    calculate_drawdown,
    calculate_rolling_volatility,
    calculate_simple_returns,
    calculate_summary_statistics,
)
from src.data.market_data import MarketDataService
from src.data.providers import ProviderError

router = APIRouter(prefix="/quote", tags=["quote"])


def _f(value: Any) -> Optional[float]:
    try:
        x = float(value)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def _period_return(close: pd.Series, n: int) -> Optional[float]:
    if len(close) > n and close.iloc[-1 - n]:
        return _f(close.iloc[-1] / close.iloc[-1 - n] - 1.0)
    return None


def _rsi(close: pd.Series, period: int = 14) -> Optional[float]:
    delta = close.diff()
    up = delta.clip(lower=0).rolling(period).mean()
    down = (-delta.clip(upper=0)).rolling(period).mean()
    rs = up / down.replace(0, np.nan)
    rsi = 100 - 100 / (1 + rs)
    return _f(rsi.iloc[-1]) if len(rsi) else None


@router.get("/{ticker}")
def get_quote(
    ticker: str,
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Price series + overlays (SMA), drawdown, rolling vol, periods, RSI, 52w range."""
    start = start or config.DEFAULT_START_DATE
    end = end or config.DEFAULT_END_DATE

    # Cache the raw price frame on disk (6h) so repeat loads are instant and we
    # stop hammering yfinance (also helps avoid rate-limit collisions).
    from src.data import cache
    cache_key = f"quote_df:{ticker.upper()}:{start}:{end}"
    cached = cache.get_json(cache_key, ttl=21600)
    if cached is not None:
        df = pd.DataFrame(cached)
    else:
        try:
            df = MarketDataService("yfinance").get_data(ticker, start, end)
        except ProviderError as exc:
            raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}") from exc
        try:
            _store = df.copy()
            _store["Date"] = _store["Date"].astype(str)
            cache.put_json(cache_key, _store.to_dict(orient="records"))
        except Exception:
            pass
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{ticker}'.")

    df = df.sort_values("Date").reset_index(drop=True)
    close = df["Close"].astype(float).reset_index(drop=True)
    dates = pd.to_datetime(df["Date"])
    stats = calculate_summary_statistics(close)
    rets = calculate_simple_returns(close)

    # Series-aligned analytics.
    work = pd.DataFrame({
        "date": dates.dt.strftime("%Y-%m-%d"),
        "close": close,
        "sma50": close.rolling(50).mean(),
        "sma200": close.rolling(200).mean(),
        "drawdown": calculate_drawdown(close),
        "rolling_vol": calculate_rolling_volatility(rets),
    })
    # Downsample for a snappy payload while keeping the latest point.
    if len(work) > 480:
        step = len(work) // 480 + 1
        work = pd.concat([work.iloc[::step], work.iloc[[-1]]]).drop_duplicates("date")
    series = [
        {
            "date": r.date,
            "close": _f(r.close),
            "sma50": _f(r.sma50),
            "sma200": _f(r.sma200),
            "drawdown": _f(r.drawdown),
            "vol": _f(r.rolling_vol),
        }
        for r in work.itertuples()
    ]

    # Scalars.
    last = float(close.iloc[-1])
    prev = float(close.iloc[-2]) if len(close) > 1 else last
    win = close.iloc[-252:] if len(close) >= 252 else close
    hi, lo = float(win.max()), float(win.min())
    pos = (last - lo) / (hi - lo) if hi > lo else None

    cur_year = dates.iloc[-1].year
    ytd_mask = dates.dt.year == cur_year
    ytd_close = close[ytd_mask.values]
    ytd = _f(last / ytd_close.iloc[0] - 1.0) if len(ytd_close) > 1 else None

    keys = ["total_return", "cagr", "annualized_volatility",
            "sharpe_ratio", "sortino_ratio", "max_drawdown", "beta"]
    ret_clean = rets.replace([np.inf, -np.inf], np.nan).dropna()
    counts, edges = np.histogram(ret_clean.to_numpy(), bins=40) if len(ret_clean) else ([], [0, 1])

    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    macd_signal = macd.ewm(span=9, adjust=False).mean()
    stats_extra = {
        "avg_daily": _f(ret_clean.mean()),
        "pct_up": _f((ret_clean > 0).mean()),
        "best_day": _f(ret_clean.max()),
        "worst_day": _f(ret_clean.min()),
        "n_days": int(len(close)),
        "sma20": _f(close.rolling(20).mean().iloc[-1]),
        "sma50": _f(close.rolling(50).mean().iloc[-1]),
        "sma200": _f(close.rolling(200).mean().iloc[-1]),
        "macd": _f(macd.iloc[-1]),
        "macd_signal": _f(macd_signal.iloc[-1]),
        "macd_hist": _f((macd - macd_signal).iloc[-1]),
    }

    r = ret_clean.to_numpy()
    if len(r) > 3:
        mu_ = float(r.mean())
        sd = float(r.std()) or 1e-9
        p5 = float(np.percentile(r, 5))
        tail = r[r <= p5]
        dist = {
            "mean": _f(mu_), "std": _f(sd),
            "skew": _f(((r - mu_) ** 3).mean() / sd ** 3),
            "kurtosis": _f(((r - mu_) ** 4).mean() / sd ** 4 - 3.0),
            "var95": _f(-p5),
            "cvar95": _f(-tail.mean()) if len(tail) else None,
            "p1": _f(np.percentile(r, 1)),
            "p99": _f(np.percentile(r, 99)),
        }
    else:
        dist = {}

    return {
        "ticker": ticker.upper(),
        "name": config.get_display_name(ticker),
        "last": last,
        "prev": prev,
        "change_pct": (last / prev - 1.0) if prev else 0.0,
        "metrics": {k: _f(stats.get(k)) for k in keys},
        "series": series,
        "range52": {"high": hi, "low": lo, "pos": _f(pos)},
        "rsi": _rsi(close),
        "periods": {
            "1M": _period_return(close, 21),
            "3M": _period_return(close, 63),
            "6M": _period_return(close, 126),
            "YTD": ytd,
            "1Y": _period_return(close, 252),
        },
        "vol_last": _f(work["rolling_vol"].dropna().iloc[-1]) if work["rolling_vol"].notna().any() else None,
        "return_hist": {
            "centers": [float(0.5 * (edges[i] + edges[i + 1])) for i in range(len(counts))],
            "counts": [int(c) for c in counts],
        },
        "stats": stats_extra,
        "dist": dist,
    }
