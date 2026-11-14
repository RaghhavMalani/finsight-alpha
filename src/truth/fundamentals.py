"""Point-in-time company fundamentals. Missing is NOT_MEASURED, never zero.

``fundamentals(ticker, field, as_of)`` returns the value of the most recent
fiscal period whose filing is available by ``as_of``; within that period the
latest available filing (a restatement once filed) wins. Rows are admitted
Data Organ SEC observations; every result carries its full provenance.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any

from finsight.plugins.contracts import utc
from src.data.as_of import AsOfViolation
from src.data_organ.contracts import Capture
from src.data_organ.sec_edgar import FIELDS, edgar_available_at
from src.data_organ.sec_edgar import SOURCE as SEC_SOURCE

AVAILABLE, NOT_MEASURED, AMBIGUOUS = "AVAILABLE", "NOT_MEASURED", "AMBIGUOUS"


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class FundamentalObservation:
    """One filed fact. ``observed_at`` is the fetch clock; ``effective_at`` the period end."""

    asset: str
    field: str
    value: float
    effective_at: datetime
    available_at: datetime
    observed_at: datetime
    revision: str
    source: str
    licence: str
    filed: str
    form: str | None = None
    fiscal_year: int | None = None
    fiscal_period: str | None = None
    effective_start: str | None = None
    source_version_id: str | None = None

    def __post_init__(self):
        if self.source != SEC_SOURCE:
            raise ValueError("Unsupported fundamentals source")
        for name in ("effective_at", "available_at", "observed_at"):
            object.__setattr__(self, name, utc(getattr(self, name)))
        if (
            type(self.value) not in (int, float)
            or not math.isfinite(self.value)
            or not self.revision
        ):
            raise ValueError("A filed fact needs a finite value and an accession")
        if self.available_at < self.effective_at:
            raise AsOfViolation("Availability precedes the period end")
        if date.fromisoformat(self.filed) < self.effective_at.date():
            raise AsOfViolation("Filing date precedes the period end")
        if self.available_at != utc(edgar_available_at(self.filed)):
            raise AsOfViolation("Backdated or unevidenced availability for the filing date")
        if self.available_at > self.observed_at:
            raise AsOfViolation("Availability is later than the capture clock")

    def evidence(self) -> dict[str, Any]:
        payload = asdict(self)
        for name in ("effective_at", "available_at", "observed_at"):
            payload[name] = _iso(payload[name])
        return payload


@dataclass(frozen=True)
class FundamentalValue:
    status: str
    ticker: str
    field: str
    as_of: str
    value: float | None = None
    reason: str | None = None
    evidence: dict | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def point_in_time(observations, *, ticker, asset, field, as_of) -> FundamentalValue:
    """The as_of guard: nothing filed after ``as_of`` can influence the answer."""
    cutoff = utc(as_of)
    base = {"ticker": ticker, "field": field, "as_of": _iso(cutoff)}
    known = [o for o in observations if o.asset == asset and o.field == field]
    visible = [o for o in known if o.available_at <= cutoff]
    if not visible:
        return FundamentalValue(
            NOT_MEASURED,
            **base,
            reason="No admitted filing reports this field"
            if not known
            else "No filing for this field was available by as_of",
        )
    period = max(o.effective_at for o in visible)
    current = [o for o in visible if o.effective_at == period]
    latest = max(o.available_at for o in current)
    final = [o for o in current if o.available_at == latest]
    if len({o.value for o in final}) != 1:
        return FundamentalValue(
            AMBIGUOUS,
            **base,
            reason="Filings available at the same instant disagree for this period",
        )
    chosen = min(final, key=lambda o: (o.revision, o.source_version_id or ""))
    return FundamentalValue(AVAILABLE, **base, value=chosen.value, evidence=chosen.evidence())


class FundamentalsBook:
    """Admitted SEC observations plus the ticker->CIK links captured with them."""

    def __init__(self, observations, tickers):
        self.observations = tuple(observations)
        self.tickers = dict(tickers)

    @classmethod
    def from_registry(cls, registry, tenant_id):
        captures = {
            e["identity"]: Capture(**e["payload"])
            for e in registry.entries(tenant_id, "SOURCE_VERSION")
        }
        observations, tickers = [], {}
        for entry in registry.entries(tenant_id, "ADMISSION"):
            capture = captures[entry["payload"]["source_version_id"]]
            if capture.source != SEC_SOURCE:
                continue
            ticker, asset = capture.metadata["ticker"], "CIK" + capture.metadata["cik"]
            if tickers.setdefault(ticker, asset) != asset:
                tickers[ticker] = None  # conflicting captured links: never guess
            for row in entry["payload"]["observations"]:
                observations.append(
                    FundamentalObservation(
                        asset=row["asset"],
                        field=row["field"],
                        value=row["value"],
                        effective_at=row["observed_at"],
                        available_at=row["available_at"],
                        observed_at=capture.captured_at,
                        revision=row["revision"],
                        source=capture.source,
                        licence=capture.licence.get("status", "UNVERIFIED"),
                        filed=row["filed"],
                        form=row.get("form"),
                        fiscal_year=row.get("fiscal_year"),
                        fiscal_period=row.get("fiscal_period"),
                        effective_start=row.get("effective_start"),
                        source_version_id=capture.identity,
                    )
                )
        return cls(observations, tickers)

    def fundamentals(self, ticker, field, as_of) -> FundamentalValue:
        if field not in FIELDS:
            raise ValueError("Undeclared fundamentals field: " + str(field))
        key = ticker.strip().upper()
        if key not in self.tickers:
            return FundamentalValue(
                NOT_MEASURED,
                ticker=key,
                field=field,
                as_of=_iso(utc(as_of)),
                reason="Ticker has no admitted SEC capture",
            )
        if self.tickers[key] is None:
            return FundamentalValue(
                AMBIGUOUS,
                ticker=key,
                field=field,
                as_of=_iso(utc(as_of)),
                reason="Captured SEC ticker maps disagree on the CIK",
            )
        return point_in_time(
            self.observations, ticker=key, asset=self.tickers[key], field=field, as_of=as_of
        )


def fundamentals(ticker, field, as_of, *, book: FundamentalsBook) -> FundamentalValue:
    return book.fundamentals(ticker, field, as_of)
