"""Versioned publication evidence at the provider/analytics boundary."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.dynamics.market_regime_inputs import Bar, RegimeInputError, RegimeWorld, utc, digest

STREAMS = ("daily", "intraday", "factors", "macro", "events")
ASSETS = ("SPY", "QQQ", "IWM")


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    stream: Literal["daily", "intraday", "factors", "macro", "events"]
    observed_at: datetime
    available_at: datetime
    as_of: datetime
    source: str = Field(min_length=1)
    revision: str = Field(min_length=1)
    quality: Literal[
        "PUBLICATION_TIMESTAMP", "CONSERVATIVE_VINTAGE_DAY",
        "CONSERVATIVE_MARKET_TIME", "RECEIVE_TIMESTAMP_CAPTURED",
        "CAPTURE_ONLY",
    ]
    publication_evidence: str = Field(min_length=1)
    values: dict

    @model_validator(mode="after")
    def validate_evidence(self):
        for name in ("observed_at", "available_at", "as_of"):
            setattr(self, name, utc(getattr(self, name)))
        if not self.observed_at <= self.available_at <= self.as_of:
            raise RegimeInputError(
                "Require observed_at <= available_at <= source as_of"
            )
        if self.quality == "CONSERVATIVE_VINTAGE_DAY" and self.stream != "macro":
            raise RegimeInputError(
                "Day-granular vintage quality is only supported for macro"
            )
        if self.quality in ("CONSERVATIVE_MARKET_TIME", "RECEIVE_TIMESTAMP_CAPTURED"):
            if self.stream not in ("daily", "intraday") or self.source != "ALPACA_IEX":
                raise RegimeInputError("Alpaca market evidence requires ALPACA_IEX bars")
        if self.quality == "CAPTURE_ONLY" and self.stream != "factors":
            raise RegimeInputError("Capture-only factor evidence requires the factors stream")
        if self.quality == "CAPTURE_ONLY" and self.available_at != self.as_of:
            raise RegimeInputError("Capture-only factor evidence cannot be backdated")
        digest(self.values)
        return self


class FactorRelease(BaseModel):
    """Source-library evidence; FF5 RMW/CMA never become QUAL/VOL/LIQ."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    family: Literal["FF3", "FF5", "MOM"]
    frequency: Literal["daily", "monthly"]
    observed_at: datetime
    available_at: datetime
    as_of: datetime
    source: str
    source_url: str
    content_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    release_identity: str
    quality: Literal["CONSERVATIVE_RELEASE_MONTH", "CAPTURE_ONLY"]
    values: dict[str, float]

    @model_validator(mode="after")
    def evidence(self):
        self.observed_at, self.available_at, self.as_of = (
            utc(self.observed_at), utc(self.available_at), utc(self.as_of)
        )
        if not self.observed_at <= self.available_at <= self.as_of:
            raise RegimeInputError("Invalid French release availability")
        if self.quality == "CAPTURE_ONLY" and self.available_at != self.as_of:
            raise RegimeInputError("A current French capture cannot be backdated")
        allowed = {"MKT", "SMB", "HML", "RF", "RMW", "CMA", "MOM"}
        if not self.values or set(self.values) - allowed:
            raise RegimeInputError("Unknown French library factor")
        return self


class PITDataset(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    schema_version: Literal["regime-pit/1"] = "regime-pit/1"
    asset: str = Field(pattern=r"^[A-Z][A-Z0-9.\-]{0,15}$")
    timezone: str = "America/New_York"
    price_basis: Literal["TOTAL_RETURN", "UNADJUSTED"]
    calendar_note: str = Field(min_length=1)
    bucket_minutes: int = Field(default=30, ge=1, le=120)
    session_minutes: int = Field(default=390, ge=1, le=1440)
    annual_sessions: int = Field(default=252, ge=1, le=366)
    definitions: dict[str, str]
    observations: list[Observation] = Field(max_length=120000)
    factor_library: list[FactorRelease] = Field(default_factory=list, max_length=120000)

    @model_validator(mode="after")
    def unique(self):
        identities, immutable = set(), set()
        for row in self.observations:
            entity = row.values.get("series", "") if row.stream == "macro" else ""
            identity = (row.stream, entity, row.observed_at, row.available_at)
            if identity in identities:
                raise RegimeInputError("Duplicate or ambiguous publication identity")
            identities.add(identity)
            if row.stream in ("daily", "intraday", "events"):
                key = (row.stream, row.observed_at)
                if key in immutable:
                    raise RegimeInputError(
                        "Bar/event rewrites are unsupported; preserve original history"
                    )
                immutable.add(key)
            if row.stream in ("daily", "intraday"):
                values = row.values
                if not {"open", "high", "low", "close", "volume"} <= values.keys():
                    raise RegimeInputError("Real OHLCV requires all five fields")
                numbers = [
                    values[k] for k in ("open", "high", "low", "close", "volume")
                ]
                if any(
                    isinstance(x, bool) or not isinstance(x, (float, int))
                    for x in numbers
                ):
                    raise RegimeInputError("OHLCV requires numbers, not booleans")
                if (
                    not 0
                    < values["low"]
                    <= min(values["open"], values["close"])
                    <= max(values["open"], values["close"])
                    <= values["high"]
                    or values["volume"] < 0
                ):
                    raise RegimeInputError("Invalid OHLC bounds or negative volume")
                if values.get("liquidity") is not None and not self.definitions.get(
                    "liquidity"
                ):
                    raise RegimeInputError("Liquidity requires an explicit definition")
                Bar.model_validate({
                    "observed_at": row.observed_at, "available_at": row.available_at,
                    **{k: v for k, v in values.items() if k not in ("open", "high", "low")},
                })
            if row.stream == "factors" and not self.definitions.get("factors"):
                raise RegimeInputError(
                    "Factor construction and return units must be documented"
                )
            if row.stream == "events" and not self.definitions.get("events"):
                raise RegimeInputError(
                    "Aggregate event observation policy must be documented"
                )
            if (
                row.stream in ("daily", "intraday")
                and row.values.get("spread_bps") is not None
                and not self.definitions.get("spread_bps")
            ):
                raise RegimeInputError(
                    "Spread requires an explicit quote/proxy definition"
                )
            if row.stream == "factors":
                returns = row.values.get("values")
                if not isinstance(returns, dict) or any(
                    isinstance(v, bool) for v in returns.values()
                ):
                    raise RegimeInputError(
                        "Factor returns require a numeric mapping, not booleans"
                    )
        # Validate the complete adapter boundary BEFORE accepting an import,
        # including stream sizes, optional fields, and publication ordering.
        for stream in ("daily", "intraday"):
            bars = sorted((r for r in self.observations if r.stream == stream), key=lambda r: r.observed_at)
            if any(a.available_at > b.available_at for a, b in zip(bars, bars[1:])):
                raise RegimeInputError(stream + " bar publication order must be monotone")
        RegimeWorld.model_validate(_world_fields(self))
        return self


def visible_payload(dataset: PITDataset, cutoff: datetime | str) -> dict:
    """Identity includes ONLY visible rows; future append cannot evict old replay."""
    cutoff = utc(cutoff)
    metadata = dataset.model_dump(mode="json", exclude={"observations", "factor_library"})
    metadata["factor_library"] = [
        r.model_dump(mode="json") for r in dataset.factor_library
        if r.observed_at <= cutoff and r.available_at <= cutoff
    ]
    rows = [
        r
        for r in dataset.observations
        if r.observed_at <= cutoff and r.available_at <= cutoff
    ]
    rows.sort(
        key=lambda r: (
            r.stream,
            r.observed_at,
            r.available_at,
            r.values.get("series", ""),
        )
    )
    metadata["observations"] = [r.model_dump(mode="json") for r in rows]
    return metadata


def _world_fields(dataset: PITDataset) -> dict:
    streams = {name: [] for name in STREAMS}
    for row in dataset.observations:
        values = dict(row.values)
        if row.stream in ("daily", "intraday"):
            for key in ("open", "high", "low"):
                values.pop(key)
        if row.stream in ("factors", "macro"):
            values["revision"] = row.revision
        streams[row.stream].append(
            {"observed_at": row.observed_at, "available_at": row.available_at, **values}
        )
    for rows in streams.values():
        rows.sort(key=lambda r: (r["observed_at"], r["available_at"]))
    # Keep the frozen engine's bounded input contract, while retaining the full
    # provider history for older replays. Windowing happens AFTER PIT filtering.
    if dataset.definitions.get("analytics_daily_window") == "2000":
        streams["daily"] = streams["daily"][-2000:]
    # Asset-only input: published buy-and-hold returns are the attribution target.
    # Never mix asset returns into a separately supplied strategy series.
    if not any(r.get("strategy_return") is not None for r in streams["daily"]):
        for i, row in enumerate(streams["daily"]):
            row["strategy_return"] = (
                row["close"] / streams["daily"][i - 1]["close"] - 1 if i else None
            )
    return {
        "schema_version": "market-regime-input/0.4.2",
        "id": "real:" + dataset.asset,
        "ticker": dataset.asset,
        "evidence_scope": "PIT_LOCAL",
        "source": "Publication-evidenced provider inputs; see per-stream lineage",
        "revision": digest(dataset.model_dump(mode="json")),
        **dataset.model_dump(
            exclude={"schema_version", "asset", "observations", "definitions", "factor_library"}
        ),
        **streams,
    }


def to_world(payload: dict) -> RegimeWorld:
    return RegimeWorld.model_validate(_world_fields(PITDataset.model_validate(payload)))
