"""Free IEX history with disclosed reconstructed availability, never strict PIT."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
import json
import os
from pathlib import Path
import time as clock
from zoneinfo import ZoneInfo

import requests

from src.dynamics.market_regime_inputs import digest, utc
from src.intelligence.snapshots import ProviderUnavailable, SnapshotStore
from src.regime_intelligence.contracts import ASSETS, Observation, PITDataset

NY = ZoneInfo("America/New_York")
URL = "https://data.alpaca.markets/v2/stocks/bars"
LATENCY_SECONDS = 900


def sessions(start: date, end: date) -> dict:
    """Exchange holidays, DST and early closes; no synthetic weekday calendar."""
    import exchange_calendars as xc

    calendar = xc.get_calendar("XNYS", start=start - timedelta(days=7), end=end)
    return {
        day.date(): (row["open"].to_pydatetime(), row["close"].to_pydatetime())
        for day, row in calendar.schedule.iterrows()
        if start <= day.date() < end
    }


def historical_bar(row: dict, *, stream: str, calendar: dict, as_of: str,
                   snapshot_id: str, content_hash: str) -> Observation | None:
    provider_time = utc(row["t"])
    day = provider_time.astimezone(NY).date()
    if day not in calendar:
        return None
    if stream == "daily":
        # Alpaca 1Day is a New York calendar-day aggregate. Its midnight label
        # is the START, not a market close or independently witnessed release.
        observed = datetime.combine(day + timedelta(days=1), time.min, NY)
        expected_start = datetime.combine(day, time.min, NY)
        if provider_time != utc(expected_start):
            raise ValueError("Daily provider timestamp is not NY interval start")
    else:
        opening, closing = calendar[day]
        observed = provider_time + timedelta(minutes=1)
        if not opening <= provider_time < observed <= closing:
            return None
        if provider_time.second or provider_time.microsecond:
            raise ValueError("Minute bar timestamp is not an interval boundary")
    available = observed + timedelta(seconds=LATENCY_SECONDS)
    if available > utc(as_of):
        return None
    row_hash = digest(row)
    values = {name: row[key] for name, key in
              [("open", "o"), ("high", "h"), ("low", "l"), ("close", "c"), ("volume", "v")]}
    if "n" in row:
        values["trade_count"] = row["n"]
    return Observation(
        stream=stream, observed_at=observed, available_at=available, as_of=as_of,
        source="ALPACA_IEX", revision="alpaca-row:" + row_hash,
        quality="CONSERVATIVE_MARKET_TIME", values=values,
        publication_evidence=json.dumps({
            "snapshot_id": snapshot_id, "snapshot_content_hash": content_hash,
            "raw_row_hash": row_hash, "provider_timestamp": row["t"],
            "feed": "iex", "coverage": "IEX ONLY",
            "historical_receive_timestamp": None,
            "availability_rule": "completed interval + 900 seconds; reconstruction, not witnessed publication",
        }, sort_keys=True, separators=(",", ":")),
    )


class AlpacaPITProvider:
    """Bounded pagination; immutable page cache resumes without re-fetching history."""

    def __init__(self, asset: str, start: date, end: date, snapshot_root: Path,
                 *, intraday_sessions: int = 90, session=None):
        if asset not in ASSETS or not start < end or (end - start).days > 12 * 366:
            raise ValueError("Supported assets and a bounded date range are required")
        if not 1 <= intraday_sessions <= 100:
            raise ValueError("Intraday scope must be 1–100 sessions")
        self.asset, self.start, self.end = asset, start, end
        self.intraday_sessions = intraday_sessions
        self.store = SnapshotStore(snapshot_root, register_metadata=False)
        self.session = session or requests.Session()
        key, secret = os.getenv("APCA_API_KEY_ID"), os.getenv("APCA_API_SECRET_KEY")
        if not key or not secret:
            raise ProviderUnavailable("APCA_API_KEY_ID/APCA_API_SECRET_KEY are not configured")
        self._headers = {"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret}
        self.audit = []

    def _page(self, params: dict):
        cached = self.store.latest("ALPACA_IEX", URL, params)
        if cached is not None:
            if digest(cached.payload) != cached.lineage.content_hash:
                raise ValueError("Immutable Alpaca snapshot hash mismatch")
            return cached
        for attempt in range(3):
            try:
                response = self.session.get(URL, params=params, headers=self._headers, timeout=(5, 30))
                if response.status_code == 429 and attempt < 2:
                    clock.sleep(2 ** attempt)
                    continue
                if response.status_code != 200:
                    raise ProviderUnavailable(f"Alpaca free IEX request failed: HTTP {response.status_code}")
                payload = response.json()
                if not isinstance(payload, dict) or not isinstance(payload.get("bars"), dict):
                    raise ValueError("Malformed Alpaca bars page")
                if set(payload["bars"]) - {self.asset}:
                    raise ValueError("Alpaca returned an unexpected asset")
                return self.store.record("ALPACA_IEX", URL, params, payload,
                                         dataset_key="regime-iex:" + self.asset)
            except requests.RequestException:
                if attempt == 2:
                    raise ProviderUnavailable("Alpaca transport unavailable") from None
        raise ProviderUnavailable("Alpaca rate limit persisted")

    def _bars(self, stream: str, start: date, calendar: dict) -> list[Observation]:
        params = {
            "symbols": self.asset, "timeframe": "1Day" if stream == "daily" else "1Min",
            "start": datetime.combine(start, time.min, NY).isoformat(),
            "end": (datetime.combine(self.end, time.min, NY) - timedelta(microseconds=1)).isoformat(),
            "feed": "iex", "adjustment": "raw", "asof": "-", "sort": "asc", "limit": 10000,
        }
        rows, tokens, identities = [], set(), set()
        for _ in range(40):
            snapshot = self._page(params)
            bars = snapshot.payload["bars"].get(self.asset, [])
            if len(bars) > 10000:
                raise ValueError("Oversized Alpaca response page")
            for bar in bars:
                if bar["t"] in identities:
                    raise ValueError("Duplicate or revised bar across pagination")
                identities.add(bar["t"])
                converted = historical_bar(
                    bar, stream=stream, calendar=calendar, as_of=snapshot.lineage.retrieved_at,
                    snapshot_id=snapshot.lineage.snapshot_id, content_hash=snapshot.lineage.content_hash,
                )
                if converted is not None:
                    rows.append(converted)
            self.audit.append({"stream": stream, "raw_rows": len(bars),
                               "snapshot_id": snapshot.lineage.snapshot_id,
                               "content_hash": snapshot.lineage.content_hash})
            token = snapshot.payload.get("next_page_token")
            if not token:
                return rows
            if token in tokens:
                raise ValueError("Repeated Alpaca pagination token")
            tokens.add(token)
            params = {**params, "page_token": token}
        raise ValueError("Alpaca pagination exceeded bounded scope; partial import refused")

    def load(self) -> PITDataset:
        calendar = sessions(self.start, self.end)
        if not calendar:
            raise ValueError("No completed exchange sessions in the request")
        intraday_start = sorted(calendar)[-self.intraday_sessions:][0]
        rows = self._bars("daily", self.start, calendar)
        rows.extend(self._bars("intraday", intraday_start, calendar))
        if not any(r.stream == "daily" for r in rows) or not any(r.stream == "intraday" for r in rows):
            raise ProviderUnavailable("Required free IEX daily/intraday history is empty")
        return PITDataset(
            asset=self.asset, price_basis="UNADJUSTED", bucket_minutes=1,
            calendar_note="XNYS exchange calendar: holidays, DST, early closes. Intraday regular hours only; daily NY calendar-day intervals.",
            definitions={
                "coverage": "IEX ONLY. Not consolidated US market volume, trades or liquidity.",
                "market_availability": "CONSERVATIVE_MARKET_TIME: completed interval + 900 seconds; exact historical receive timestamp unavailable; revised historical values may differ from original publications.",
                "daily_interval": "Alpaca 1Day timestamp is NY midnight START; observed_at is next NY midnight END, including DST.",
                "intraday_interval": "Alpaca 1Min timestamp is interval START; observed_at is +1 minute, regular exchange session only. Empty minutes are not fabricated.",
                "analytics_daily_window": "2000",
                "analytics_history_policy": "All history retained; latest 2000 visible daily rows passed to unchanged frozen engine at each cutoff. No forward selection.",
                "factors": "French MKT/SMB/HML/MOM are decimal returns. Archived releases enter after their disclosed release month; current daily files enter only at actual capture. FF5 RMW/CMA remain source-library fields, never aliases for QUAL/VOL/LIQ.",
            }, observations=rows,
        )
