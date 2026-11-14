"""Live feed registry. Each feed owns its cadence, rate limit, licence and delay label."""

from __future__ import annotations

from .base import Feed, FeedError, Fetched, http_get  # noqa: F401
from .geo import CelesTrak, GDELTEvents, NWSAlerts, USGSQuakes
from .macro import EIASpot, FREDVintages
from .markets import AlpacaIEX, NSEEndOfDay, YahooUSQuotes
from .news import CentralBankRSS
from .predictions import Kalshi, Polymarket

FEED_CLASSES = (USGSQuakes, GDELTEvents, NWSAlerts, CelesTrak, FREDVintages, EIASpot,
                YahooUSQuotes, AlpacaIEX, NSEEndOfDay, Polymarket, Kalshi, CentralBankRSS)


def all_feeds(names: set[str] | None = None) -> list[Feed]:
    feeds = [cls() for cls in FEED_CLASSES]
    return [f for f in feeds if not names or f.name in names]
