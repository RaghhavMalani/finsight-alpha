"""Point-in-time contracts shared by data and computation boundaries.

An ``AsOfContext`` is deliberately explicit: callers must choose the latest
fact timestamp a calculation may observe. The helper then applies that cutoff
to frames before they reach a quant engine.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Any

import pandas as pd


class AsOfViolation(ValueError):
    """Raised when data crosses the caller's point-in-time boundary."""


def _utc(value: date | datetime | str) -> datetime:
    if isinstance(value, str):
        raw = value.strip()
        parsed = (
            datetime.combine(date.fromisoformat(raw), time.max)
            if len(raw) == 10
            else datetime.fromisoformat(raw.replace("Z", "+00:00"))
        )
    elif isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, time.max)
    else:  # pragma: no cover - protected by public type hints
        raise TypeError("as_of must be a date, datetime, or ISO-8601 string")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


@dataclass(frozen=True)
class AsOfContext:
    """The latest timestamp a reproducible computation is allowed to observe."""

    cutoff: datetime

    def __post_init__(self) -> None:
        object.__setattr__(self, "cutoff", _utc(self.cutoff))

    @classmethod
    def bind(cls, value: date | datetime | str) -> "AsOfContext":
        return cls(_utc(value))

    @property
    def isoformat(self) -> str:
        return self.cutoff.isoformat().replace("+00:00", "Z")

    @property
    def date(self) -> date:
        return self.cutoff.date()

    def filter_frame(
        self,
        frame: pd.DataFrame,
        *,
        observed_at: str = "Date",
        available_from: str | None = None,
    ) -> pd.DataFrame:
        """Return only rows both observed and available by this cutoff."""

        if observed_at not in frame.columns:
            raise AsOfViolation(f"Missing observed timestamp column '{observed_at}'.")
        observed = pd.to_datetime(frame[observed_at], utc=True, errors="coerce")
        valid = observed.notna() & (observed <= self.cutoff)
        if available_from is not None:
            if available_from not in frame.columns:
                raise AsOfViolation(
                    f"Missing availability timestamp column '{available_from}'."
                )
            available = pd.to_datetime(frame[available_from], utc=True, errors="coerce")
            valid &= available.notna() & (available <= self.cutoff)
        return frame.loc[valid].copy()

    def assert_not_future(self, value: date | datetime | str, *, label: str) -> None:
        if _utc(value) > self.cutoff:
            raise AsOfViolation(f"{label} occurs after as_of={self.isoformat}.")

    def to_dict(self) -> dict[str, Any]:
        return {"as_of": self.isoformat}
