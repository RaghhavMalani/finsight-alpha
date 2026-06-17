"""Ticker-tape route: lightweight last price + daily change for a few symbols.

Fetched server-side and sequentially (a short ~12-day window, no analytics) so the
strip fills instantly and reliably — unlike firing many concurrent /quote calls,
which collide on yfinance and return stale/duplicate data.
"""

from __future__ import annotations

import datetime
import math
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


@router.get("/tape")
def tape(symbols: str = Query("AAPL,MSFT,NVDA,SPY,JPM,BLK")) -> Dict[str, List[Dict[str, Any]]]:
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:12]
    start = (datetime.date.today() - datetime.timedelta(days=12)).isoformat()
    svc = MarketDataService("yfinance")
    items: List[Dict[str, Any]] = []
    for s in syms:
        try:
            df = svc.get_data(s, start)
            if df is None or df.empty:
                continue
            c = df.sort_values("Date")["Close"].astype(float)
            last = float(c.iloc[-1])
            prev = float(c.iloc[-2]) if len(c) > 1 else last
            items.append({"ticker": s, "last": _f(last),
                          "change_pct": _f(last / prev - 1 if prev else 0.0)})
        except (ProviderError, Exception):
            continue
    return {"items": items}
