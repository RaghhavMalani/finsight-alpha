"""News route: recent headlines with financial sentiment scoring."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Query

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/{ticker}")
def get_news(ticker: str, limit: int = Query(12, ge=1, le=30)) -> Dict[str, Any]:
    """Recent headlines for a ticker, each scored, plus an aggregate sentiment."""
    from src.news.news_feed import fetch_news
    from src.news.sentiment import score_headlines

    items = fetch_news(ticker, limit=limit)
    payload = score_headlines(items)
    payload["ticker"] = ticker.upper()
    return payload
