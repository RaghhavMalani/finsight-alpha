"""Macro feeds: FRED/ALFRED vintages (Data Organ / regime parser) and EIA spot prices."""

from __future__ import annotations

import json
import time
from datetime import date, timedelta

from src.regime_intelligence.providers import alfred_observations

from .. import model
from .base import Feed, FeedError, Fetched, http_get

FRED_URL = "https://api.stlouisfed.org/fred/series/observations"


class FREDVintages(Feed):
    """Vintage-aware: every (period, vintage) pair is its own revision, so a revised
    print lands as a new row next to the original instead of overwriting it."""

    name = "fred"
    event_type = "macro.release"
    cadence_s = 86400
    min_interval_s = 3600
    delay = ("DAILY_VINTAGE: ALFRED records vintage days, not release times; a vintage is admitted "
             "from the next New York midnight (conservative)")
    confidence = "OFFICIAL"
    parser = "live-fred/1"
    required_env = (("FRED_API_KEY",),)
    series = {"UNRATE": "neutral", "PAYEMS": "neutral", "CPIAUCSL": "neutral",
              "FEDFUNDS": "neutral", "DGS10": "neutral"}
    window_days = 730
    licence = model.licence(
        "PUBLIC_DOMAIN_CITATION_REQUESTED",
        "Federal Reserve Bank of St. Louis, FRED/ALFRED; original series publishers (BLS, Federal Reserve Board)",
        "https://fred.stlouisfed.org/legal/", "LOCAL_ONLY",
        "Series-level copyright varies; public publication needs a series-specific review")

    def __init__(self):
        self.partial_errors: list[str] = []

    def fetch(self):
        key = self.env("FRED_API_KEY")
        self.partial_errors = []
        out = []
        today = model.utcnow().date()
        for series in self.series:
            try:
                fetched = http_get(FRED_URL, params={
                    "api_key": key, "file_type": "json", "series_id": series,
                    "realtime_start": "1776-07-04", "realtime_end": today.isoformat(),
                    "observation_start": (today - timedelta(days=self.window_days)).isoformat(),
                    "output_type": 1, "limit": 100000,
                }, secret_params=("api_key",))
                out.extend(self.parse(fetched, series=series))
            except (FeedError, ValueError) as error:
                self.partial_errors.append(f"{series}: {error}")
            time.sleep(1.0)
        if not out and self.partial_errors:
            raise FeedError("; ".join(self.partial_errors))
        return out

    def parse(self, fetched: Fetched, *, series: str):
        payload = json.loads(fetched.raw.decode("utf-8"))
        rows = alfred_observations(payload, series=series, direction=self.series.get(series, "neutral"),
                                   source_as_of=fetched.fetched_at,
                                   reference="FRED/ALFRED response sha256 " + fetched.sha256)
        rows.sort(key=lambda r: (model.normalize_iso(r.observed_at), r.revision))
        previous: dict[str, float] = {}
        out = []
        for r in rows:
            observed = model.normalize_iso(r.observed_at)
            prior = previous.get(observed)
            value = r.values["value"]
            out.append(self.observation(
                source_id=f"{series}:{observed[:10]}", revision=r.revision, observed_at=observed,
                effective_at=model.normalize_iso(r.available_at), fetched=fetched, source="fred",
                availability_rule=r.quality,
                payload={"kind": "fred_vintage", "series": series, "period": observed[:10],
                         "value": value, "vintage": r.revision.removeprefix("vintage:"),
                         "previous_vintage_value": prior,
                         "is_revision": prior is not None and prior != value},
            ))
            previous[observed] = value
        return out


class EIASpot(Feed):
    name = "eia"
    event_type = "macro.release"
    cadence_s = 86400
    min_interval_s = 3600
    delay = "DAILY_WITH_LAG: EIA spot prices appear days after the trade date; release time not provided"
    confidence = "OFFICIAL"
    parser = "live-eia/1"
    required_env = (("EIA_API_KEY",),)
    url = "https://api.eia.gov/v2/petroleum/pri/spt/data/"
    licence = model.licence(
        "PUBLIC_DOMAIN", "U.S. Energy Information Administration",
        "https://www.eia.gov/about/copyrights_reuse.php", "PUBLIC")

    def fetch(self):
        return self.parse(http_get(self.url, params={
            "api_key": self.env("EIA_API_KEY"), "frequency": "daily", "data[0]": "value",
            "facets[series][]": ["RWTC", "RBRTE"], "sort[0][column]": "period",
            "sort[0][direction]": "desc", "length": 20,
        }, secret_params=("api_key",)))

    def parse(self, fetched: Fetched):
        payload = json.loads(fetched.raw.decode("utf-8"))
        out = []
        for row in (payload.get("response") or {}).get("data") or []:
            if not row.get("series") or not row.get("period"):
                continue
            date.fromisoformat(row["period"])
            value = row.get("value")
            out.append(self.observation(
                source_id=f"{row['series']}:{row['period']}", revision="value:" + str(value),
                observed_at=row["period"] + "T00:00:00Z", effective_at=None, fetched=fetched,
                payload={"kind": "eia_spot", "series": row["series"],
                         "description": row.get("series-description"), "period": row["period"],
                         "period_convention": "UTC date-only trade date",
                         "value": float(value) if value not in (None, "") else None,
                         "value_status": "MEASURED" if value not in (None, "") else "NOT_MEASURED",
                         "units": row.get("units")},
            ))
        return out
