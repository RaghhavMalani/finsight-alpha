"""Reference-data route: supported assets and sector mapping."""

from __future__ import annotations
import re
from typing import Any


from fastapi import APIRouter, Query

from src import config
from src.data.providers import AVAILABLE_PROVIDERS

router = APIRouter(tags=["reference"])
_SYMBOL_RE = re.compile(r"^[A-Z0-9^][A-Z0-9.\-^=]{0,24}$")
_US_EXCHANGES = {"ASE", "BTS", "NCM", "NGM", "NMS", "NYQ", "PCX", "PNK"}
_INDIA_EXCHANGES = {"BSE", "BOM", "NSI", "NSE"}


def _market(exchange: str, symbol: str) -> str | None:
    if symbol.endswith((".NS", ".BO")) or exchange in _INDIA_EXCHANGES:
        return "INDIA"
    if exchange in _US_EXCHANGES or not exchange:
        return "US"
    return None


@router.get("/assets")
def list_assets() -> dict[str, object]:
    """Return the supported tickers grouped by region, plus the sector map.

    Useful for populating dashboard dropdowns from a single source of truth.
    """
    return {
        "indian": config.INDIAN_TICKERS,
        "us": config.US_TICKERS,
        "all": config.ALL_TICKERS,
        "default": config.DEFAULT_TICKERS,
        "sectors": config.TICKER_SECTOR_MAP,
        "providers": AVAILABLE_PROVIDERS,
    }


@router.get("/assets/search")
def search_assets(
    q: str = Query(..., min_length=1, max_length=80),
    market: str = Query("ALL", pattern="^(ALL|US|INDIA)$"),
    limit: int = Query(12, ge=1, le=30),
) -> dict[str, Any]:
    """Search Yahoo-listed US, NSE, and BSE instruments on demand."""
    query = q.strip()
    if not query:
        return {"query": q, "market": market, "items": [], "coverage": "US · NSE · BSE"}

    quotes: list[dict[str, Any]] = []
    try:
        import yfinance as yf

        quotes = (
            yf.Search(query, max_results=max(limit * 2, 16), news_count=0).quotes or []
        )
    except Exception:
        quotes = []

    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for quote in quotes:
        if not isinstance(quote, dict):
            continue
        symbol = str(quote.get("symbol") or "").upper()
        exchange = str(quote.get("exchange") or "").upper()
        quote_type = str(quote.get("quoteType") or "").upper()
        region = _market(exchange, symbol)
        if not symbol or not region or (market != "ALL" and market != region):
            continue
        if quote_type and quote_type not in {"EQUITY", "ETF", "INDEX"}:
            continue
        if symbol in seen:
            continue
        seen.add(symbol)
        items.append(
            {
                "symbol": symbol,
                "name": str(quote.get("shortname") or quote.get("longname") or symbol),
                "exchange": exchange
                or (
                    "NSE"
                    if symbol.endswith(".NS")
                    else "BSE" if symbol.endswith(".BO") else "US"
                ),
                "market": region,
                "type": quote_type or "EQUITY",
            }
        )
        if len(items) >= limit:
            break

    direct = query.upper()
    if _SYMBOL_RE.fullmatch(direct) and direct not in seen:
        region = _market("", direct)
        if region and (market == "ALL" or market == region):
            items.append(
                {
                    "symbol": direct,
                    "name": "Direct symbol lookup",
                    "exchange": (
                        "NSE"
                        if direct.endswith(".NS")
                        else "BSE" if direct.endswith(".BO") else "US"
                    ),
                    "market": region,
                    "type": "EQUITY",
                }
            )

    return {
        "query": query,
        "market": market,
        "items": items[:limit],
        "coverage": "Yahoo-listed US · NSE (.NS) · BSE (.BO)",
    }
