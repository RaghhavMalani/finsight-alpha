"""Fetch recent headlines for a ticker via yfinance (free, no API key).

yfinance has changed its news payload shape across versions: older builds return
flat dicts (``title``, ``publisher``, ``link``, ``providerPublishTime``); newer
builds nest everything under ``content``. This parser handles both and returns a
single normalized schema::

    {title, publisher, url, published (ISO str), summary}
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List


def _epoch_to_iso(ts: Any) -> str:
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
    except (TypeError, ValueError, OSError):
        return ""


def _parse_item(item: Dict[str, Any]) -> Dict[str, Any] | None:
    """Normalize one yfinance news item from either payload shape."""
    content = item.get("content") if isinstance(item.get("content"), dict) else None
    if content:  # newer shape
        title = content.get("title")
        publisher = (content.get("provider") or {}).get("displayName")
        url = ((content.get("canonicalUrl") or {}).get("url")
               or (content.get("clickThroughUrl") or {}).get("url") or "")
        published = content.get("pubDate") or content.get("displayTime") or ""
        summary = content.get("summary") or content.get("description") or ""
    else:  # older flat shape
        title = item.get("title")
        publisher = item.get("publisher")
        url = item.get("link") or ""
        published = _epoch_to_iso(item.get("providerPublishTime"))
        summary = item.get("summary") or ""

    if not title:
        return None
    return {
        "title": str(title),
        "publisher": str(publisher or "—"),
        "url": str(url or ""),
        "published": str(published or "")[:16].replace("T", " "),
        "summary": str(summary or ""),
    }


def fetch_news(ticker: str, limit: int = 12) -> List[Dict[str, Any]]:
    """Return up to ``limit`` recent, normalized headlines. Never raises."""
    try:
        import yfinance as yf
    except Exception:
        return []
    try:
        raw = yf.Ticker(ticker).news or []
    except Exception:
        return []

    out: List[Dict[str, Any]] = []
    seen = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        parsed = _parse_item(item)
        if not parsed or parsed["title"] in seen:
            continue
        seen.add(parsed["title"])
        out.append(parsed)
        if len(out) >= limit:
            break
    return out
