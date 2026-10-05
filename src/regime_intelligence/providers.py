"""Operator-driven adapters. Product GET requests never download provider data."""

from __future__ import annotations

import csv
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Protocol
from zoneinfo import ZoneInfo

from src.intelligence.snapshots import (
    ExternalJsonClient,
    SnapshotStore,
    ProviderUnavailable,
)
from src.regime_intelligence.contracts import Observation, PITDataset
from src.dynamics.market_regime_inputs import utc
from src.regime_intelligence.alpaca import AlpacaPITProvider  # provider-neutral load() contract


class PITProvider(Protocol):
    def load(self) -> PITDataset: ...


class VersionedExportProvider:
    def __init__(self, path: Path):
        self.path = path

    def load(self) -> PITDataset:
        if self.path.stat().st_size > 64 * 1024 * 1024:
            raise ValueError("Provider export exceeds 64 MB")
        return PITDataset.model_validate_json(self.path.read_bytes())


def publication_csv(path: Path, *, stream: str, source: str) -> list[Observation]:
    """No Date-only/current-history fallback, no guessed release timestamp."""
    if stream not in ("daily", "intraday"):
        raise ValueError(
            "Numeric CSV adapter supports OHLCV; use versioned JSON for other streams"
        )
    result = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            required = (
                "observed_at",
                "available_at",
                "as_of",
                "revision",
                "quality",
                "publication_evidence",
            )
            if not set(required) <= row.keys():
                raise ValueError(
                    "CSV requires publication timestamps and all evidence fields"
                )
            envelope = {k: row.pop(k) for k in required}
            values = {k: float(v) for k, v in row.items() if v not in (None, "")}
            if "trade_count" in values:
                if not values["trade_count"].is_integer():
                    raise ValueError("trade_count must be an integer")
                values["trade_count"] = int(values["trade_count"])
            result.append(
                Observation(stream=stream, source=source, values=values, **envelope)
            )
    return result


def alfred_observations(
    payload: dict,
    *,
    series: str,
    direction: str,
    source_as_of: datetime | str,
    reference: str,
) -> list[Observation]:
    """Actual real-time intervals, not a query snapshot masquerading as a release.

    ALFRED vintage DAYS are conservatively admitted at next NY midnight.
    """
    if payload.get("realtime_start") != "1776-07-04":
        raise ValueError(
            "Need unrestricted real-time history; point snapshots lose original vintage times"
        )
    if payload.get("count", len(payload.get("observations", []))) > len(
        payload.get("observations", [])
    ):
        raise ValueError("Incomplete ALFRED pagination; refuse partial history")
    records = []
    source_as_of = utc(source_as_of)
    for row in payload.get("observations", []):
        if row.get("value") == ".":
            continue
        vintage_day = date.fromisoformat(row["realtime_start"])
        if vintage_day == date(1776, 7, 4):
            raise ValueError("Sentinel vintage is not publication evidence")
        available = datetime.combine(
            vintage_day + timedelta(days=1), time.min, ZoneInfo("America/New_York")
        )
        if available > source_as_of:
            continue
        records.append(
            Observation(
                stream="macro",
                observed_at=row["date"] + "T00:00:00Z",
                available_at=available,
                as_of=source_as_of,
                source="FRED/ALFRED:" + series,
                revision="vintage:" + row["realtime_start"],
                quality="CONSERVATIVE_VINTAGE_DAY",
                publication_evidence=reference,
                values={
                    "series": series,
                    "value": float(row["value"]),
                    "direction": direction,
                },
            )
        )
    return records


class FredVintageProvider:
    def __init__(self, key: str, snapshot_root: Path):
        if not key:
            raise ProviderUnavailable("FRED_API_KEY is not configured")
        self.key = key
        self.client = ExternalJsonClient(
            SnapshotStore(snapshot_root, register_metadata=False)
        )

    def observations(
        self, series: str, direction: str, as_of: datetime | str
    ) -> list[Observation]:
        cutoff = utc(as_of)
        payload, lineage = self.client.get(
            "FRED/ALFRED",
            "https://api.stlouisfed.org/fred/series/observations",
            dataset_key="regime-macro:" + series,
            params={
                "api_key": self.key,
                "file_type": "json",
                "series_id": series,
                "realtime_start": "1776-07-04",
                "realtime_end": cutoff.date().isoformat(),
                "observation_end": cutoff.date().isoformat(),
                "output_type": 1,
                "limit": 100000,
            },
            timeout=15,
            vintage_date=cutoff.date().isoformat(),
        )
        return alfred_observations(
            payload,
            series=series,
            direction=direction,
            source_as_of=lineage.retrieved_at,
            reference="Immutable snapshot " + lineage.snapshot_id,
        )
