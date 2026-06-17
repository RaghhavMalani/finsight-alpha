"""Strategy Lab — composable rule-based strategies, costs, walk-forward, optimization.

A strategy is a set of *entry* conditions and *exit* conditions, each combined
with ALL (and) or ANY (or). Conditions are indicator predicates (RSI, SMA, MACD,
momentum...). Signals are lagged one bar (no look-ahead); transaction costs are
charged on every position change. Returns a full result: equity vs buy & hold,
rich stats, an out-of-sample split, a trade log, and a monthly-returns table.
"""

from __future__ import annotations

import json
import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.data.market_data import MarketDataService
from src.data.providers import ProviderError

router = APIRouter(prefix="/strategy", tags=["strategy"])


def _f(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


# --- indicators -------------------------------------------------------------
def _sma(c, p): return c.rolling(int(p)).mean()
def _ema(c, p): return c.ewm(span=int(p), adjust=False).mean()


def _rsi(c, p=14):
    d = c.diff()
    up = d.clip(lower=0).rolling(int(p)).mean()
    dn = (-d.clip(upper=0)).rolling(int(p)).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def _macd(c):
    m = _ema(c, 12) - _ema(c, 26)
    return m, m.ewm(span=9, adjust=False).mean()


def _cond(cond: Dict[str, Any], close: pd.Series) -> pd.Series:
    t = cond.get("type")

    def gi(key: str, default: int) -> int:
        v = cond.get(key)
        return int(v) if v is not None else default

    def gf(key: str, default: float) -> float:
        v = cond.get(key)
        return float(v) if v is not None else default

    if t == "rsi_below":   return _rsi(close, gi("period", 14)) < gf("value", 30)
    if t == "rsi_above":   return _rsi(close, gi("period", 14)) > gf("value", 70)
    if t == "price_above_sma": return close > _sma(close, gi("period", 50))
    if t == "price_below_sma": return close < _sma(close, gi("period", 50))
    if t == "sma_fast_above_slow": return _sma(close, gi("fast", 50)) > _sma(close, gi("slow", 200))
    if t == "sma_fast_below_slow": return _sma(close, gi("fast", 50)) < _sma(close, gi("slow", 200))
    if t == "macd_above_signal":
        m, s = _macd(close); return m > s
    if t == "macd_below_signal":
        m, s = _macd(close); return m < s
    if t == "momentum_above": return (close / close.shift(gi("period", 20)) - 1) > gf("value", 0)
    if t == "momentum_below": return (close / close.shift(gi("period", 20)) - 1) < gf("value", 0)
    return pd.Series(False, index=close.index)


def _combine(conds: List[Dict[str, Any]], close: pd.Series, mode: str) -> pd.Series:
    if not conds:
        return pd.Series(False, index=close.index)
    series = [_cond(c, close).fillna(False) for c in conds]
    out = series[0]
    for s in series[1:]:
        out = (out & s) if mode == "all" else (out | s)
    return out


def _positions(entry: pd.Series, exit_: pd.Series, close: pd.Series) -> pd.Series:
    e = entry.shift(1).fillna(False).to_numpy()
    x = exit_.shift(1).fillna(False).to_numpy()
    pos = np.zeros(len(close)); cur = 0.0
    for i in range(len(close)):
        if cur == 0 and e[i]:
            cur = 1.0
        elif cur == 1 and x[i]:
            cur = 0.0
        pos[i] = cur
    return pd.Series(pos, index=close.index)


def _stats(rets: pd.Series, ann: int = 252) -> Dict[str, Any]:
    rets = rets.dropna()
    if len(rets) == 0:
        return {}
    cum = float((1 + rets).prod() - 1)
    yrs = len(rets) / ann
    cagr = (1 + cum) ** (1 / yrs) - 1 if yrs > 0 and (1 + cum) > 0 else None
    sd = float(rets.std())
    down = float(rets[rets < 0].std())
    sharpe = float(rets.mean() / sd * math.sqrt(ann)) if sd > 0 else None
    sortino = float(rets.mean() / down * math.sqrt(ann)) if down > 0 else None
    curve = (1 + rets).cumprod()
    maxdd = float((curve / curve.cummax() - 1).min())
    active = rets[rets != 0]
    win = float((active > 0).mean()) if len(active) else None
    gains = active[active > 0].sum(); losses = -active[active < 0].sum()
    pf = float(gains / losses) if losses > 0 else None
    exposure = float((rets != 0).mean())
    return {"total_return": _f(cum), "cagr": _f(cagr), "vol": _f(sd * math.sqrt(ann)),
            "sharpe": _f(sharpe), "sortino": _f(sortino), "max_drawdown": _f(maxdd),
            "win_rate": _f(win), "profit_factor": _f(pf), "exposure": _f(exposure)}


class Condition(BaseModel):
    type: str
    period: Optional[float] = None
    value: Optional[float] = None
    fast: Optional[float] = None
    slow: Optional[float] = None


class StrategyRequest(BaseModel):
    ticker: str
    entry: List[Condition] = []
    exit: List[Condition] = []
    entry_mode: str = "all"
    exit_mode: str = "any"
    cost_bps: float = 5.0
    oos_split: float = 0.7


def _load_close(ticker: str):
    try:
        df = MarketDataService("yfinance").get_data(ticker)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}") from exc
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{ticker}'.")
    df = df.sort_values("Date").reset_index(drop=True)
    close = df["Close"].astype(float); close.index = pd.to_datetime(df["Date"])
    return df, close


@router.post("/run")
def run_strategy(req: StrategyRequest) -> Dict[str, Any]:
    df, close = _load_close(req.ticker)
    ret = close.pct_change()
    entry = _combine([c.dict() for c in req.entry], close, req.entry_mode)
    exit_ = _combine([c.dict() for c in req.exit], close, req.exit_mode)
    pos = _positions(entry, exit_, close)
    changes = pos.diff().fillna(0.0)
    cost = (changes != 0).astype(float) * (req.cost_bps / 10000.0)
    strat_ret = pos.shift(1).fillna(0.0) * ret - cost

    # Trade log (pair entries/exits).
    trades, open_px, open_dt = [], None, None
    for dt, ch in changes.items():
        if ch > 0:
            open_px, open_dt = float(close.loc[dt]), str(dt)[:10]
        elif ch < 0 and open_px is not None:
            xp = float(close.loc[dt])
            trades.append({"entry_date": open_dt, "exit_date": str(dt)[:10],
                           "entry": round(open_px, 2), "exit": round(xp, 2),
                           "return": _f(xp / open_px - 1)})
            open_px = None

    # Monthly returns table.
    monthly = strat_ret.fillna(0.0).resample("M").apply(lambda r: (1 + r).prod() - 1)
    months = [{"month": str(idx)[:7], "ret": _f(val)} for idx, val in monthly.items()]

    # Out-of-sample split.
    n = len(strat_ret); cut = int(n * req.oos_split)
    is_stats = _stats(strat_ret.iloc[:cut]); oos_stats = _stats(strat_ret.iloc[cut:])
    split_date = str(strat_ret.index[cut])[:10] if 0 < cut < n else None

    eq = (1 + strat_ret.fillna(0.0)).cumprod()
    bh = (1 + ret.fillna(0.0)).cumprod()
    o = df["Open"].astype(float); h = df["High"].astype(float); lo = df["Low"].astype(float); vv = df["Volume"].astype(float)
    o.index = h.index = lo.index = vv.index = close.index
    ohlc = [{"time": str(dt)[:10], "open": _f(o.loc[dt]), "high": _f(h.loc[dt]), "low": _f(lo.loc[dt]), "close": _f(close.loc[dt])} for dt in close.index]
    volume = [{"time": str(dt)[:10], "value": _f(vv.loc[dt]), "color": ("rgba(38,194,129,0.45)" if close.loc[dt] >= o.loc[dt] else "rgba(239,83,80,0.45)")} for dt in close.index]
    markers = []
    for dt, ch in changes.items():
        if ch > 0: markers.append({"time": str(dt)[:10], "side": "buy", "price": _f(close.loc[dt])})
        elif ch < 0: markers.append({"time": str(dt)[:10], "side": "sell", "price": _f(close.loc[dt])})

    dates = [str(d)[:10] for d in close.index]
    eq_l, bh_l = eq.tolist(), bh.tolist()
    if len(dates) > 600:
        step = len(dates) // 600 + 1; idx = list(range(0, len(dates), step))
        dates = [dates[i] for i in idx]; eq_l = [eq_l[i] for i in idx]; bh_l = [bh_l[i] for i in idx]

    return {
        "ticker": req.ticker.upper(),
        "dates": dates, "equity": [_f(x) for x in eq_l], "benchmark": [_f(x) for x in bh_l],
        "ohlc": ohlc, "volume": volume, "markers": markers,
        "stats": _stats(strat_ret), "buy_hold": _stats(ret),
        "in_sample": is_stats, "out_of_sample": oos_stats, "split_date": split_date,
        "n_trades": len(trades), "trades": trades[-60:], "monthly": months,
    }


class OptimizeRequest(BaseModel):
    ticker: str
    family: str = "sma_cross"           # sma_cross | rsi
    p1: List[float] = [10, 20, 50]      # fast / rsi_low
    p2: List[float] = [100, 150, 200]   # slow / rsi_high
    cost_bps: float = 5.0


@router.post("/optimize")
def optimize(req: OptimizeRequest) -> Dict[str, Any]:
    _, close = _load_close(req.ticker)
    ret = close.pct_change()
    grid, best = [], None
    for a in req.p1:
        row = []
        for b in req.p2:
            if req.family == "sma_cross":
                if a >= b:
                    row.append(None); continue
                pos = (_sma(close, a) > _sma(close, b)).astype(float)
            else:  # rsi
                rsi = _rsi(close, 14); vals, cur = [], 0
                for v in rsi:
                    if not np.isnan(v):
                        if cur == 0 and v < a: cur = 1
                        elif cur == 1 and v > b: cur = 0
                    vals.append(cur)
                pos = pd.Series(vals, index=close.index, dtype=float)
            ch = pos.diff().fillna(0.0)
            sr = pos.shift(1).fillna(0.0) * ret - (ch != 0).astype(float) * (req.cost_bps / 10000.0)
            sh = _stats(sr).get("sharpe")
            row.append(sh)
            if sh is not None and (best is None or sh > best["sharpe"]):
                best = {"p1": a, "p2": b, "sharpe": sh, "stats": _stats(sr)}
        grid.append(row)
    return {"ticker": req.ticker.upper(), "family": req.family,
            "p1": req.p1, "p2": req.p2, "sharpe_grid": grid, "best": best}


class CritiqueRequest(BaseModel):
    ticker: str
    stats: Dict[str, Any] = {}
    buy_hold: Dict[str, Any] = {}
    in_sample: Dict[str, Any] = {}
    out_of_sample: Dict[str, Any] = {}
    n_trades: int = 0
    provider: str = "ollama"


@router.post("/critique")
def critique(req: CritiqueRequest) -> Dict[str, Any]:
    """LLM critique of a backtest: overfitting check, robustness, concrete fixes."""
    from src.rag import llm_client

    prompt = (
        f"You are a senior quantitative strategy reviewer. Critically analyze this backtest "
        f"of a long/flat trading strategy on {req.ticker} (all values are decimals; "
        f"e.g. 0.4 = 40%).\n\n"
        f"Overall: {json.dumps(req.stats)}\n"
        f"Buy & hold: {json.dumps(req.buy_hold)}\n"
        f"In-sample: {json.dumps(req.in_sample)}\n"
        f"Out-of-sample: {json.dumps(req.out_of_sample)}\n"
        f"Number of trades: {req.n_trades}\n\n"
        "In 5-7 sentences: (1) Is there evidence of OVERFITTING? Compare in-sample vs "
        "out-of-sample Sharpe explicitly. (2) Judge ROBUSTNESS given trade count, exposure, "
        "profit factor, and max drawdown vs buy & hold. (3) Give 3 CONCRETE, specific "
        "improvements (e.g. add a trend filter, a stop-loss, change the exit rule, size by "
        "volatility). Be direct and quantitative. Do not give investment advice."
    )
    res = llm_client.generate(
        prompt, provider=req.provider,
        system="You are a precise quant strategy reviewer. No fluff, no boilerplate disclaimers.",
        temperature=0.3,
    )
    if not res.ok:
        return {"ok": False, "text": f"LLM unavailable ({res.error}). Start Ollama or set an API key."}
    return {"ok": True, "text": res.text, "provider": res.provider}
