"""Offline tests for the news sentiment scorer and feed parser."""

from __future__ import annotations

from src.news.news_feed import _parse_item
from src.news.sentiment import score_headlines, score_text


def test_positive_headline():
    s = score_text("Apple beats earnings, stock surges to record high on strong demand")
    assert s["label"] == "positive" and s["score"] > 0


def test_negative_headline():
    s = score_text("Shares plunge after profit miss and analyst downgrade amid lawsuit")
    assert s["label"] == "negative" and s["score"] < 0


def test_neutral_headline():
    s = score_text("Company to hold annual shareholder meeting next week")
    assert s["label"] == "neutral" and s["score"] == 0.0


def test_aggregate():
    items = [
        {"title": "Stock surges on record profit and upgrade", "summary": ""},
        {"title": "Firm warns of weak demand, cuts outlook", "summary": ""},
        {"title": "Board schedules a routine meeting", "summary": ""},
    ]
    agg = score_headlines(items)
    assert agg["n"] == 3
    assert agg["counts"]["positive"] == 1
    assert agg["counts"]["negative"] == 1
    assert agg["overall_label"] in {"Bullish", "Bearish", "Neutral"}
    assert all("score" in it for it in agg["items"])


def test_parse_new_shape():
    item = {
        "content": {
            "title": "Big news",
            "provider": {"displayName": "Reuters"},
            "canonicalUrl": {"url": "http://x"},
            "pubDate": "2026-05-01T10:00:00Z",
            "summary": "details",
        },
        "relatedTickers": ["AAPL", "MSFT"],
    }
    p = _parse_item(item)
    assert (
        p["title"] == "Big news"
        and p["publisher"] == "Reuters"
        and p["url"] == "http://x"
    )
    assert p["related_tickers"] == ["AAPL", "MSFT"]


def test_parse_old_shape():
    item = {
        "title": "Old news",
        "publisher": "WSJ",
        "link": "http://y",
        "providerPublishTime": 1714557600,
    }
    p = _parse_item(item)
    assert (
        p["title"] == "Old news" and p["publisher"] == "WSJ" and p["url"] == "http://y"
    )


def test_parse_drops_titleless():
    assert _parse_item({"content": {"provider": {"displayName": "X"}}}) is None
