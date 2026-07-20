"""Ticker-tape route: real-time prices via Finnhub, EOD fallback via yfinance.

When FINNHUB_API_KEY is set, quotes are truly live (fetched in parallel with a
short per-request TTL cache so the free-tier rate limit isn't burned). Without
the key it degrades to the cached end-of-day path.
"""

from __future__ import annotations

import datetime
import math
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

from src.data.market_data import MarketDataService
from src.data.providers import ProviderError

router = APIRouter(tags=["tape"])


def _f(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


# short TTL cache: live quotes are shared across clients for 20s.
_live_cache: dict[str, tuple[float, Dict[str, Any]]] = {}
_live_lock = threading.Lock()
_LIVE_TTL = 20.0
_SYMBOL_RE = re.compile(r"^[A-Z0-9][A-Z0-9.\-^=]{0,24}$")


def _live_one(sym: str) -> Optional[Dict[str, Any]]:
    from src.data.providers.finnhub_provider import FinnhubError, get_live_quote

    now = time.time()
    with _live_lock:
        hit = _live_cache.get(sym)
        if hit and now - hit[0] < _LIVE_TTL:
            return hit[1]
    try:
        q = get_live_quote(sym)
        item = {
            "ticker": sym,
            "last": _f(q.get("price")),
            "change_pct": _f(q.get("change_pct")),
            "open": _f(q.get("open")),
            "high": _f(q.get("high")),
            "low": _f(q.get("low")),
            "prev_close": _f(q.get("prev_close")),
            "volume": None,
            "quote_ts": q.get("ts"),
            "source": "FINNHUB",
            "live": True,
        }
        if item["last"] is None:
            return None
        with _live_lock:
            _live_cache[sym] = (now, item)
        return item
    except (FinnhubError, Exception):
        return None


def _eod_one(sym: str) -> Optional[Dict[str, Any]]:
    start = (datetime.date.today() - datetime.timedelta(days=12)).isoformat()
    try:
        df = MarketDataService("yfinance").get_data(sym, start)
        if df is None or df.empty:
            return None
        ordered = df.sort_values("Date")
        c = ordered["Close"].astype(float)
        last = float(c.iloc[-1])
        prev = float(c.iloc[-2]) if len(c) > 1 else last
        latest = ordered.iloc[-1]
        quote_date = latest.get("Date")
        return {
            "ticker": sym,
            "last": _f(last),
            "change_pct": _f(last / prev - 1 if prev else 0.0),
            "open": _f(latest.get("Open")),
            "high": _f(latest.get("High")),
            "low": _f(latest.get("Low")),
            "prev_close": _f(prev),
            "volume": _f(latest.get("Volume")),
            "quote_ts": (
                quote_date.isoformat()
                if hasattr(quote_date, "isoformat")
                else str(quote_date)
            ),
            "source": "YFINANCE_EOD",
            "live": False,
        }
    except (ProviderError, Exception):
        return None


@router.get("/tape")
def tape(symbols: str = Query("AAPL,MSFT,NVDA,SPY,JPM,BLK")) -> Dict[str, Any]:
    from src.data.providers.finnhub_provider import finnhub_available

    syms = list(
        dict.fromkeys(
            symbol
            for raw in symbols.split(",")
            if (symbol := raw.strip().upper()) and _SYMBOL_RE.fullmatch(symbol)
        )
    )[:30]
    use_live = finnhub_available()

    items: List[Dict[str, Any]] = []
    if use_live:
        with ThreadPoolExecutor(max_workers=min(6, len(syms) or 1)) as ex:
            for res in ex.map(_live_one, syms):
                if res:
                    items.append(res)
        # Finnhub free tier doesn't cover some non-US symbols — fill gaps with EOD.
        got = {i["ticker"] for i in items}
        for s in syms:
            if s not in got:
                res = _eod_one(s)
                if res:
                    items.append(res)
        order = {s: i for i, s in enumerate(syms)}
        items.sort(key=lambda x: order.get(x["ticker"], 99))
    else:
        for s in syms:
            res = _eod_one(s)
            if res:
                items.append(res)
    return {"items": items, "live": use_live}
