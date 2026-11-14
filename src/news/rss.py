"""Minimal RSS 2.0 headline parser (stdlib only) and the reviewed source list.

Only headline, link, category and publication time are kept; article bodies are
never stored. A source is listed only with a terms note; anything whose terms
are not clearly permissive is ``LOCAL_ONLY``.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

try:  # hardened parser when available; the DOCTYPE/ENTITY refusal below applies either way
    from defusedxml.ElementTree import fromstring as _fromstring
except ImportError:  # pragma: no cover
    _fromstring = ET.fromstring
from email.utils import parsedate_to_datetime
from datetime import timezone

# name -> (url, attribution, terms_url, licence status, redistribution, note)
SOURCES = {
    "federal_reserve": (
        "https://www.federalreserve.gov/feeds/press_all.xml",
        "Board of Governors of the Federal Reserve System",
        "https://www.federalreserve.gov/disclaimer.htm",
        "PUBLIC_DOMAIN", "PUBLIC",
        "U.S. Government work; headlines and links only",
    ),
    "ecb": (
        "https://www.ecb.europa.eu/rss/press.html",
        "European Central Bank",
        "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html",
        "ATTRIBUTION_REQUIRED", "LOCAL_ONLY",
        "Reproduction permitted with source acknowledged; kept local until reviewed",
    ),
}


def parse_rss(raw: bytes) -> list[dict]:
    """Items as {title, link, guid, category, published (UTC ISO or None)}; malformed items skipped."""
    body = raw.lstrip(b"\xef\xbb\xbf").strip()
    if b"<!DOCTYPE" in body[:4096].upper() or b"<!ENTITY" in body.upper():
        raise ValueError("RSS with a DOCTYPE or ENTITY declaration is refused")
    root = _fromstring(body)
    items = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if not title or not link:
            continue
        published = None
        stamp = (item.findtext("pubDate") or "").strip()
        if stamp:
            try:
                when = parsedate_to_datetime(stamp)
                if when.tzinfo is not None:
                    published = when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
            except (TypeError, ValueError):
                published = None
        items.append({"title": title, "link": link, "guid": (item.findtext("guid") or link).strip(),
                      "category": (item.findtext("category") or "").strip() or None, "published": published})
    return items
