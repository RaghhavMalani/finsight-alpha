"""Central-bank press-release headlines via ``src.news.rss``. Headlines only, no bodies."""

from __future__ import annotations

import time
from dataclasses import replace

from src.news.rss import SOURCES, parse_rss

from .. import model
from .base import Feed, FeedError, Fetched, http_get


class CentralBankRSS(Feed):
    name = "rss"
    event_type = "news.headline"
    cadence_s = 1800
    min_interval_s = 600
    delay = "POLLED_30_MIN: publisher RSS; publication time is the publisher's pubDate"
    confidence = "OFFICIAL"
    parser = "live-rss/1"
    licence = model.licence("MIXED", "See per-source licence", "per-source", "LOCAL_ONLY")

    def __init__(self, sources: dict | None = None):
        self.sources = sources or SOURCES
        self.partial_errors: list[str] = []

    def fetch(self):
        out, self.partial_errors = [], []
        for name, spec in self.sources.items():
            try:
                out.extend(self.parse(http_get(spec[0]), source=name))
            except (FeedError, ValueError) as error:
                self.partial_errors.append(f"{name}: {error}")
            time.sleep(0.5)
        if not out and self.partial_errors:
            raise FeedError("; ".join(self.partial_errors))
        return out

    def parse(self, fetched: Fetched, *, source: str):
        url, attribution, terms, status, redistribution, note = self.sources[source]
        licence = model.licence(status, attribution, terms, redistribution, note)
        out = []
        for item in parse_rss(fetched.raw):
            observed = item["published"] or fetched.fetched_at
            obs = self.observation(
                source_id=item["guid"], revision="1", observed_at=observed, effective_at=item["published"],
                fetched=fetched, source="rss:" + source,
                payload={"kind": "headline", "publisher": attribution, "title": item["title"],
                         "url": item["link"], "category": item["category"],
                         "published_basis": "PUBLISHER_PUBDATE" if item["published"] else
                         "NOT_MEASURED: no pubDate; observed_at is fetch time"},
            )
            out.append(replace(obs, licence=licence))
        return out
