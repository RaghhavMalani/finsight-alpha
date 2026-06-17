"""Backtest route: simple indicator strategies with equity curve, trades, stats.

Strategies (long/flat):
* ``sma_cross``  — long when fast SMA > slow SMA.
* ``macd``       — long when MACD line > signal line.
* ``rsi``        — mean-reversion: go long when RSI < low, exit when RSI > high.

Positions are applied with a one-bar lag (signal today, traded next bar) to avoid
look-ahead bias. Compared against buy & hold.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from src.data.market_data import MarketDataService
from src.data.providers import ProviderError

router = APIRouter(prefix="/backtest", tags=["backtest"])


def _f(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def _stats(rets: pd.Series, ann: int = 252) -> Dict[str, Any]:
    rets = rets.dropna()
    if len(rets) == 0:
        return {}
    cum = float((1 + rets).prod() - 1)
    yrs = len(rets) / ann
    cagr = (1 + cum) ** (1 / yrs) - 1 if yrs > 0 and (1 + cum) > 0 else None
    sd = float(rets.std())
    vol = sd * math.sqrt(ann)
    sharpe = float(rets.mean() / sd * math.sqrt(ann)) if sd > 0 else None
    curve = (1 + rets).cumprod()
    maxdd = float((curve / curve.cummax() - 1).min())
    active = rets[rets != 0]
    win = float((active > 0).mean()) if len(active) else None
    return {"total_return": _f(cum), "cagr": _f(cagr), "vol": _f(vol),
            "sharpe": _f(sharpe), "max_drawdown": _f(maxdd), "win_rate": _f(win)}


def _rsi(close: pd.Series, period: int) -> pd.Series:
    delta = close.diff()
    up = delta.clip(lower=0).rolling(period).mean()
    down = (-delta.clip(upper=0)).rolling(period).mean()
    rs = up / down.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def _pivots(high: pd.Series, low: pd.Series, close: pd.Series, window: int = 10, n: int = 3):
    """Swing-pivot support/resistance: the nearest pivot lows below / highs above spot."""
    spot = float(close.iloc[-1])
    hv, lv = high.to_numpy(), low.to_numpy()
    res, sup = [], []
    for i in range(window, len(close) - window):
        seg_h = hv[i - window:i + window + 1]
        seg_l = lv[i - window:i + window + 1]
        if hv[i] == seg_h.max():
            res.append(float(hv[i]))
        if lv[i] == seg_l.min():
            sup.append(float(lv[i]))
    resistance = sorted({round(x, 2) for x in res if x > spot})[:n]
    support = sorted({round(x, 2) for x in sup if x < spot}, reverse=True)[:n]
    return support, resistance


@router.get("/{ticker}")
def backtest(
    ticker: str,
    strategy: str = Query("sma_cross"),
    fast: int = Query(50, ge=2, le=200),
    slow: int = Query(200, ge=3, le=400),
    rsi_period: int = Query(14, ge=2, le=50),
    rsi_low: float = Query(30.0),
    rsi_high: float = Query(70.0),
) -> Dict[str, Any]:
    try:
        df = MarketDataService("yfinance").get_data(ticker)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}") from exc
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{ticker}'.")

    df = df.sort_values("Date").reset_index(drop=True)
    close = df["Close"].astype(float)
    close.index = pd.to_datetime(df["Date"])
    ret = close.pct_change()

    if strategy == "sma_cross":
        pos = (close.rolling(fast).mean() > close.rolling(slow).mean()).astype(float)
    elif strategy == "macd":
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        macd = ema12 - ema26
        pos = (macd > macd.ewm(span=9, adjust=False).mean()).astype(float)
    elif strategy == "rsi":
        rsi = _rsi(close, rsi_period)
        vals, cur = [], 0
        for v in rsi:
            if not np.isnan(v):
                if cur == 0 and v < rsi_low:
                    cur = 1
                elif cur == 1 and v > rsi_high:
                    cur = 0
            vals.append(cur)
        pos = pd.Series(vals, index=close.index, dtype=float)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown strategy '{strategy}'.")

    pos = pos.fillna(0.0)
    strat_ret = pos.shift(1).fillna(0.0) * ret

    changes = pos.diff().fillna(0.0)
    trades: List[Dict[str, Any]] = []
    for dt, ch in changes.items():
        if ch > 0:
            trades.append({"date": str(dt)[:10], "type": "buy", "price": _f(close.loc[dt])})
        elif ch < 0:
            trades.append({"date": str(dt)[:10], "type": "sell", "price": _f(close.loc[dt])})

    eq = (1 + strat_ret.fillna(0.0)).cumprod()
    bh = (1 + ret.fillna(0.0)).cumprod()

    # OHLCV + overlays + pivot levels for the candlestick chart.
    o = df["Open"].astype(float); h = df["High"].astype(float)
    lo = df["Low"].astype(float); vv = df["Volume"].astype(float)
    o.index = h.index = lo.index = vv.index = close.index
    smaf = close.rolling(fast).mean(); smas = close.rolling(slow).mean()
    ohlc = [{"time": str(dt)[:10], "open": _f(o.loc[dt]), "high": _f(h.loc[dt]),
             "low": _f(lo.loc[dt]), "close": _f(close.loc[dt])} for dt in close.index]
    volume = [{"time": str(dt)[:10], "value": _f(vv.loc[dt]),
               "color": ("rgba(38,194,129,0.45)" if close.loc[dt] >= o.loc[dt] else "rgba(239,83,80,0.45)")}
              for dt in close.index]
    sma_fast = [{"time": str(dt)[:10], "value": _f(smaf.loc[dt])} for dt in close.index]
    sma_slow = [{"time": str(dt)[:10], "value": _f(smas.loc[dt])} for dt in close.index]
    markers = [{"time": t["date"], "side": t["type"], "price": t["price"]} for t in trades]
    support, resistance = _pivots(h, lo, close)

    dates = [str(d)[:10] for d in close.index]
    eq_l, bh_l, px_l = eq.tolist(), bh.tolist(), close.tolist()
    if len(dates) > 500:
        step = len(dates) // 500 + 1
        idx = list(range(0, len(dates), step))
        if idx[-1] != len(dates) - 1:
            idx.append(len(dates) - 1)
        dates = [dates[i] for i in idx]
        eq_l = [eq_l[i] for i in idx]
        bh_l = [bh_l[i] for i in idx]
        px_l = [px_l[i] for i in idx]

    return {
        "ticker": ticker.upper(),
        "strategy": strategy,
        "params": {"fast": fast, "slow": slow, "rsi_period": rsi_period,
                   "rsi_low": rsi_low, "rsi_high": rsi_high},
        "dates": dates,
        "price": [_f(x) for x in px_l],
        "equity": [_f(x) for x in eq_l],
        "benchmark": [_f(x) for x in bh_l],
        "n_trades": len(trades),
        "trades": trades[-40:],
        "ohlc": ohlc,
        "volume": volume,
        "sma_fast": sma_fast,
        "sma_slow": sma_slow,
        "markers": markers,
        "support": support,
        "resistance": resistance,
        "stats": {"strategy": _stats(strat_ret), "buy_hold": _stats(ret)},
    }
