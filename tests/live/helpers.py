"""Shared fixtures for live-spine tests. No network anywhere in this package.

Fixture files: USGS, NWS, GDELT, CelesTrak, FRED/ALFRED (UNRATE), EIA and Federal
Reserve RSS are trimmed real responses captured 2026-11-14 from public-domain or
open-with-citation sources. ``polymarket.json`` and ``kalshi.json`` are SYNTHETIC
shape-only data, because those venues' redistribution terms are not reviewed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from src.live import model
from src.live.feeds import CelesTrak, CentralBankRSS, EIASpot, FREDVintages, GDELTEvents, Kalshi, NWSAlerts
from src.live.feeds import Polymarket, USGSQuakes
from src.live.feeds.base import Feed, Fetched

FIXTURES = Path(__file__).parent / "fixtures"
T0 = datetime(2026, 11, 14, 12, 0, 0, tzinfo=timezone.utc)


class Clock:
    def __init__(self, start: datetime = T0):
        self.now = start

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta) -> datetime:
        self.now += timedelta(**delta)
        return self.now


def fetched(name: str, at: datetime = T0) -> Fetched:
    return Fetched((FIXTURES / name).read_bytes(), "fixture:" + name, model.iso(at))


def fixture_observations(at: datetime = T0) -> dict[str, list]:
    """Every fixture parsed by its real feed parser."""
    return {
        "usgs": USGSQuakes().parse(fetched("usgs.json", at)),
        "nws": NWSAlerts().parse(fetched("nws.json", at)),
        "gdelt": GDELTEvents().parse(fetched("gdelt_export.zip", at)),
        "celestrak": CelesTrak().parse(fetched("celestrak.json", at)),
        "fred": FREDVintages().parse(fetched("fred_unrate.json", at), series="UNRATE"),
        "eia": EIASpot().parse(fetched("eia.json", at)),
        "polymarket": Polymarket().parse(fetched("polymarket.json", at)),
        "kalshi": Kalshi().parse(fetched("kalshi.json", at)),
        "rss": CentralBankRSS().parse(fetched("fed.xml", at), source="federal_reserve"),
    }


class FixtureFeed(Feed):
    """A feed whose fetch replays a parsed fixture (or raises a scripted error)."""

    def __init__(self, name: str, rows=None, *, errors=None, cadence_s: float = 120, min_interval_s: float = 10):
        self.name, self.rows, self.errors = name, list(rows or []), list(errors or [])
        self.cadence_s, self.min_interval_s = cadence_s, min_interval_s
        self.licence = model.licence("PUBLIC_DOMAIN", "fixture", "fixture:", "PUBLIC")
        self.delay = "FIXTURE"
        self.calls = 0

    def fetch(self):
        self.calls += 1
        if self.errors:
            error = self.errors.pop(0)
            if error is not None:
                raise error
        return self.rows
