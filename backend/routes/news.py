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


@router.get("/{ticker}/impact")
def get_news_impact(ticker: str, limit: int = Query(12, ge=1, le=30)) -> Dict[str, Any]:
    """Return an evidence-labelled catalyst-to-company impact graph."""
    from src.news.impact import analyze_news_impact
    from src.news.news_feed import fetch_news
    from src.news.sentiment import score_headlines

    scored = score_headlines(fetch_news(ticker, limit=limit))
    return analyze_news_impact(ticker, scored["items"])
