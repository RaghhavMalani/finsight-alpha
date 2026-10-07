"""Quote routes: OHLCV candles for the Markets Overview, plus the price + analytics payload."""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from backend.routes.tape import _SYMBOL_RE
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

BAR_RANGES = ("1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y")
# Intraday ranges: the provider's latest period at a fixed bar interval.
_INTRADAY = {"1D": ("1d", "5m"), "5D": ("5d", "30m")}
# Daily ranges trim one cached daily frame; 5Y aggregates it into weeks.
_LOOKBACK = {
    "1M": pd.DateOffset(months=1),
    "3M": pd.DateOffset(months=3),
    "6M": pd.DateOffset(months=6),
    "1Y": pd.DateOffset(years=1),
    "5Y": pd.DateOffset(years=5),
}
_PRICES = ["Open", "High", "Low", "Close"]


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


def _clean_bars(frame: pd.DataFrame) -> pd.DataFrame:
    """Bars in time order with all four prices finite; a missing volume stays missing."""
    out = frame.sort_values("Date").reset_index(drop=True)
    prices = out[_PRICES].apply(pd.to_numeric, errors="coerce")
    keep = np.isfinite(prices.to_numpy(dtype=float)).all(axis=1)
    out = out.loc[keep].copy()
    out[_PRICES] = prices.loc[keep]
    volume = out["Volume"] if "Volume" in out else pd.Series(np.nan, index=out.index)
    out["Volume"] = pd.to_numeric(volume, errors="coerce")
    return out.reset_index(drop=True)


def weekly_bars(daily: pd.DataFrame) -> pd.DataFrame:
    """Aggregate daily bars into Monday-to-Sunday weeks.

    Open is the week's first open, high and low its extremes, close its last
    close, and volume the sum (missing when no day reported one). Each week is
    labelled with the date of its first session.
    """
    g = daily.groupby(daily["Date"].dt.to_period("W-SUN"), sort=True)
    return pd.DataFrame(
        {
            "Date": g["Date"].first(),
            "Open": g["Open"].first(),
            "High": g["High"].max(),
            "Low": g["Low"].min(),
            "Close": g["Close"].last(),
            "Volume": g["Volume"].sum(min_count=1),
        }
    ).reset_index(drop=True)


@router.get("/bars/{ticker}")
def get_bars(ticker: str, range_: str = Query("1D", alias="range")) -> Dict[str, Any]:
    """OHLCV candles for one chart range, with source, interval and timezone.

    1D and 5D are 5- and 30-minute regular-session bars, 1M to 1Y daily bars,
    and 5Y weekly bars aggregated from the daily ones. Prices are adjusted for
    splits and dividends. Nothing is synthesized: a provider failure is a 502
    and no bars a 404.
    """
    symbol = ticker.strip().upper()
    if not _SYMBOL_RE.fullmatch(symbol):
        raise HTTPException(status_code=422, detail=f"'{ticker}' is not a ticker symbol.")
    if range_ not in BAR_RANGES:
        raise HTTPException(
            status_code=422, detail=f"range must be one of {', '.join(BAR_RANGES)}."
        )

    service = MarketDataService("yfinance")
    intraday = range_ in _INTRADAY
    today = date.today()
    try:
        if intraday:
            period, interval = _INTRADAY[range_]
            frame = service.get_intraday(symbol, period, interval)
        else:
            interval = "1wk" if range_ == "5Y" else "1d"
            # One five-year frame serves every daily range. The end is exclusive,
            # so tomorrow keeps today's bar when the provider already has one.
            frame = service.get_data(
                symbol,
                (today - timedelta(days=5 * 366 + 14)).isoformat(),
                (today + timedelta(days=1)).isoformat(),
            )
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"Price bars unavailable: {exc}") from exc

    fetched_at = frame.attrs.get("fetched_at")
    source = str(frame["Provider"].iloc[0]).upper() if len(frame) else "UNKNOWN"
    bars = _clean_bars(frame)
    if not intraday and len(bars):
        days = pd.to_datetime(bars["Date"])
        # Daily bars are exchange trading dates; keep the wall date if a zone came with them.
        bars["Date"] = days.dt.tz_localize(None) if days.dt.tz is not None else days
        if range_ == "5Y":
            bars = weekly_bars(bars)
        start = (
            pd.Timestamp(today.year, 1, 1)
            if range_ == "YTD"
            else pd.Timestamp(today) - _LOOKBACK[range_]
        )
        bars = bars[bars["Date"] >= start]
    if bars.empty:
        raise HTTPException(
            status_code=404, detail=f"No {interval} bars for '{symbol}' over {range_}."
        )

    tz = bars["Date"].dt.tz if intraday else None
    return {
        "ticker": symbol,
        "range": range_,
        "interval": interval,
        "intraday": intraday,
        "source": source,
        "adjusted": "splits_and_dividends",
        "timezone": str(tz) if tz is not None else None,
        "fetched_at": fetched_at,
        "bars": [
            {
                "t": row.Date.isoformat() if intraday else row.Date.strftime("%Y-%m-%d"),
                "o": _f(row.Open),
                "h": _f(row.High),
                "l": _f(row.Low),
                "c": _f(row.Close),
                "v": _f(row.Volume),
            }
            for row in bars.itertuples(index=False)
        ],
    }


@router.get("/live/{ticker}")
def get_live_quote(ticker: str) -> Dict[str, Any]:
    """Real-time snapshot via Finnhub (free tier). Degrades gracefully.

    Returns ``{"available": false, "reason": ...}`` (HTTP 200) when Finnhub
    isn't configured or rate-limited, so the frontend can quietly fall back to
    the end-of-day price instead of erroring.
    """
    from src.data.providers.finnhub_provider import (
        FinnhubError, finnhub_available, get_live_quote as _live,
    )

    if not finnhub_available():
        return {"available": False, "reason": "Finnhub not configured (set FINNHUB_API_KEY)."}
    try:
        q = _live(ticker)
        q["available"] = True
        return q
    except FinnhubError as exc:
        return {"available": False, "reason": str(exc)}


@router.get("/{ticker}")
def get_quote(
    ticker: str,
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Price series + overlays (SMA), drawdown, rolling vol, periods, RSI, 52w range."""
    start = start or config.DEFAULT_START_DATE
    end = end or date.today().isoformat()

    # Cache the raw price frame on disk (6h) so repeat loads are instant and we
    # stop hammering yfinance (also helps avoid rate-limit collisions).
    from src.data import cache
    # ``v2`` busts any frames cached before the duplicate-column dedup fix
    # (those could store a wrong "Close", surfacing as a bogus header price).
    cache_key = f"quote_df:v2:{ticker.upper()}:{start}:{end}"
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
            if isinstance(_store.columns, pd.MultiIndex):
                _store.columns = [c[0] if isinstance(c, tuple) else c for c in _store.columns]
            _store = _store.loc[:, ~pd.Index(_store.columns).duplicated()]
            _store["Date"] = _store["Date"].astype(str)
            cache.put_json(cache_key, _store.to_dict(orient="records"))
        except Exception:
            pass
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{ticker}'.")

    # yfinance occasionally returns duplicate/multi-level columns (e.g. a second
    # "Close"), which makes df["Close"] a DataFrame and breaks downstream Series
    # math. Flatten and de-duplicate so every column access yields one Series.
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    df = df.loc[:, ~pd.Index(df.columns).duplicated()]

    df = df.sort_values("Date").reset_index(drop=True)
    close_col = df["Close"]
    if isinstance(close_col, pd.DataFrame):  # belt-and-suspenders
        close_col = close_col.iloc[:, 0]
    close = pd.to_numeric(close_col, errors="coerce").astype(float).reset_index(drop=True)
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
