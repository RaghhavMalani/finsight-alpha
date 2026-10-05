"""Explicit, versioned PIT inputs for the integrated research lab. No downloads."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from typing import Literal
from zoneinfo import ZoneInfo

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.data.as_of import AsOfContext

FACTORS = ("MKT", "SMB", "HML", "MOM", "QUAL", "VOL", "LIQ")


class RegimeInputError(ValueError):
    """Input cannot support an honest point-in-time calculation."""


def utc(value: str | datetime) -> datetime:
    result = (
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, str)
        else value
    )
    if result.tzinfo is None:
        raise RegimeInputError(
            "All timestamps, including as_of, need an explicit timezone"
        )
    return result.astimezone(timezone.utc)


def digest(value: object) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


class Timed(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    observed_at: datetime
    available_at: datetime

    @model_validator(mode="after")
    def timestamps(self):
        self.observed_at, self.available_at = utc(self.observed_at), utc(
            self.available_at
        )
        if self.available_at < self.observed_at:
            raise RegimeInputError("Availability cannot precede observation")
        return self


class Bar(Timed):
    close: float = Field(gt=0)
    volume: float = Field(ge=0)
    strategy_return: float | None = Field(default=None, gt=-1, le=5)
    spread_bps: float | None = Field(default=None, ge=0, le=10000)
    liquidity: float | None = Field(default=None, ge=0)
    order_imbalance: float | None = Field(default=None, ge=-1, le=1)
    trade_count: int | None = Field(default=None, ge=0)


class Factor(Timed):
    values: dict[str, float]
    revision: str

    @field_validator("values")
    @classmethod
    def names(cls, values):
        if set(values) - set(FACTORS):
            raise RegimeInputError(
                "Unknown factor; use explicit MKT/SMB/HML/MOM/QUAL/VOL/LIQ returns"
            )
        if any(isinstance(v, bool) or not (-1 < v <= 5) for v in values.values()):
            raise RegimeInputError(
                "Factor returns must be finite decimal simple returns"
            )
        return values


class Macro(Timed):
    series: str = Field(min_length=1, max_length=80)
    value: float
    direction: Literal["HIGH_IS_STRESS", "LOW_IS_STRESS"]
    revision: str


class Event(Timed):
    pass


class RegimeWorld(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    schema_version: Literal["market-regime-input/0.4.2"]
    id: str = Field(min_length=1, max_length=100)
    ticker: str = Field(min_length=1, max_length=32)
    evidence_scope: Literal["SYNTHETIC_DEMO", "PIT_LOCAL"]
    source: str = Field(min_length=1)
    revision: str = Field(min_length=1)
    price_basis: Literal["TOTAL_RETURN", "UNADJUSTED", "SYNTHETIC"]
    timezone: str = "America/New_York"
    calendar_note: str
    bucket_minutes: int = Field(default=30, ge=1, le=120)
    session_minutes: int = Field(default=390, ge=1, le=1440)
    annual_sessions: int = Field(default=252, ge=1, le=366)
    daily: list[Bar] = Field(max_length=2000)
    intraday: list[Bar] = Field(default_factory=list, max_length=50000)
    factors: list[Factor] = Field(default_factory=list, max_length=20000)
    macro: list[Macro] = Field(default_factory=list, max_length=20000)
    events: list[Event] = Field(default_factory=list, max_length=50000)

    @model_validator(mode="after")
    def ordered(self):
        try:
            ZoneInfo(self.timezone)
        except KeyError as exc:
            raise RegimeInputError("Unknown exchange timezone") from exc
        for field in ("daily", "intraday"):
            rows = getattr(self, field)
            times = [r.observed_at for r in rows]
            if times != sorted(set(times)):
                raise RegimeInputError(
                    field + " bars must be immutable and strictly ordered"
                )
            if any(
                rows[i].available_at > rows[i + 1].available_at
                for i in range(len(rows) - 1)
            ):
                raise RegimeInputError(
                    field + " bar publication order must be monotone"
                )
        for field in ("factors", "macro"):
            seen = set()
            for row in getattr(self, field):
                key = (
                    getattr(row, "series", "factors"),
                    row.observed_at,
                    row.available_at,
                )
                if key in seen:
                    raise RegimeInputError("Ambiguous same-time vintages")
                seen.add(key)
        times = [r.observed_at for r in self.events]
        if times != sorted(set(times)):
            raise RegimeInputError("Aggregate event times must be strictly increasing")
        if self.evidence_scope == "PIT_LOCAL" and self.price_basis == "SYNTHETIC":
            raise RegimeInputError("Synthetic prices cannot be labeled PIT_LOCAL")
        return self

    def payload(self) -> dict:
        return self.model_dump(mode="json")


def known(rows: list, cutoff: datetime) -> list:
    # Reuse the shared contract, checking BOTH observation and availability.
    if not rows:
        return []
    frame = pd.DataFrame(
        {
            "Date": [r.observed_at for r in rows],
            "available_at": [r.available_at for r in rows],
        }
    )
    indices = (
        AsOfContext.bind(cutoff)
        .filter_frame(frame, available_from="available_at")
        .index
    )
    return [rows[i] for i in indices]


def vintage(rows: list, cutoff: datetime) -> list:
    latest = {}
    for row in known(rows, cutoff):
        key = (getattr(row, "series", "factors"), row.observed_at)
        if key not in latest or row.available_at > latest[key].available_at:
            latest[key] = row
    return sorted(
        latest.values(), key=lambda r: (r.observed_at, getattr(r, "series", ""))
    )


def bars_from_market_frame(frame: pd.DataFrame, *, as_of: datetime) -> list[Bar]:
    """Adapt existing provider frames ONLY when genuine publication times exist.

    Date alone, a provider label, or retrieval time guessed as historical release
    time is insufficient. This helper performs no network or filesystem writes.
    """
    required = {"Date", "available_at", "Close", "Volume"}
    if not required <= set(frame.columns):
        raise RegimeInputError(
            "Provider frame lacks explicit available_at / OHLCV PIT fields"
        )
    for column in ("Date", "available_at"):
        for value in frame[column]:
            utc(pd.Timestamp(value).to_pydatetime())
    filtered = AsOfContext.bind(utc(as_of)).filter_frame(
        frame, available_from="available_at"
    )
    return [
        Bar(
            observed_at=r["Date"],
            available_at=r["available_at"],
            close=r["Close"],
            volume=r["Volume"],
        )
        for r in filtered.to_dict("records")
    ]
