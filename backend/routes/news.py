"""News routes: company headlines plus global cross-asset cue coverage."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict

from fastapi import APIRouter, Query

router = APIRouter(prefix="/news", tags=["news"])


GLOBAL_NEWS_TOPICS = (
    {
        "symbol": "ACWI",
        "topic": "Global risk",
        "region": "GLOBAL",
        "channel": "RISK APPETITE",
    },
    {
        "symbol": "EEM",
        "topic": "Emerging markets",
        "region": "EM",
        "channel": "LIQUIDITY / USD",
    },
    {
        "symbol": "FXI",
        "topic": "China",
        "region": "ASIA",
        "channel": "DEMAND / SUPPLY CHAIN",
    },
    {
        "symbol": "EWJ",
        "topic": "Japan",
        "region": "ASIA",
        "channel": "YEN / INDUSTRIALS",
    },
    {
        "symbol": "FEZ",
        "topic": "Europe",
        "region": "EUROPE",
        "channel": "TRADE / REGULATION",
    },
    {
        "symbol": "INDA",
        "topic": "India",
        "region": "INDIA",
        "channel": "GROWTH / INR / OIL",
    },
    {
        "symbol": "USO",
        "topic": "Crude oil",
        "region": "COMMODITIES",
        "channel": "INFLATION / MARGINS",
    },
    {
        "symbol": "TLT",
        "topic": "Long rates",
        "region": "RATES",
        "channel": "DISCOUNT RATE",
    },
    {
        "symbol": "UUP",
        "topic": "US dollar",
        "region": "FX",
        "channel": "TRANSLATION / LIQUIDITY",
    },
    {
        "symbol": "GLD",
        "topic": "Gold",
        "region": "HAVENS",
        "channel": "REAL YIELDS / RISK",
    },
)


@router.get("/global/cues")
def get_global_cues(limit: int = Query(48, ge=12, le=60)) -> Dict[str, Any]:
    """Aggregate tagged headlines across global regions and transmission channels."""
    from src.news.news_feed import fetch_news
    from src.news.sentiment import score_headlines

    per_topic = max(
        4,
        min(
            8,
            (limit + len(GLOBAL_NEWS_TOPICS) - 1) // len(GLOBAL_NEWS_TOPICS),
        ),
    )

    def load(topic: dict[str, str]) -> list[dict[str, Any]]:
        return [
            {
                **item,
                "proxy": topic["symbol"],
                "topic": topic["topic"],
                "region": topic["region"],
                "channel": topic["channel"],
            }
            for item in fetch_news(topic["symbol"], limit=per_topic)
        ]

    with ThreadPoolExecutor(max_workers=6) as executor:
        batches = list(executor.map(load, GLOBAL_NEWS_TOPICS))

    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in (entry for batch in batches for entry in batch):
        key = str(item.get("title") or "").strip().casefold()
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(item)

    unique.sort(key=lambda item: str(item.get("published") or ""), reverse=True)
    scored = score_headlines(unique[:limit])
    covered_topics = {str(item.get("topic")) for item in scored["items"]}
    covered_regions = {str(item.get("region")) for item in scored["items"]}
    scored.update(
        {
            "ticker": "GLOBAL",
            "source": "YFINANCE SEARCH",
            "coverage": {
                "topics_requested": len(GLOBAL_NEWS_TOPICS),
                "topics_with_news": len(covered_topics),
                "regions_with_news": len(covered_regions),
                "headlines": len(scored["items"]),
            },
        }
    )
    return scored


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
