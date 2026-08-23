"""Independent contracts for bounded-payout event-market research."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol


def _finite(value: float, label: str) -> float:
    if type(value) not in {int, float} or not math.isfinite(float(value)):
        raise ValueError(f"{label} must be finite")
    return float(value)


@dataclass(frozen=True)
class EventBand:
    lower_exclusive: float
    upper_inclusive: float
    payout: float = 1.0

    def __post_init__(self) -> None:
        lower = _finite(self.lower_exclusive, "lower_exclusive")
        upper = _finite(self.upper_inclusive, "upper_inclusive")
        payout = _finite(self.payout, "payout")
        if upper <= lower:
            raise ValueError("event band upper bound must exceed lower bound")
        if payout <= 0:
            raise ValueError("payout must be positive")
        object.__setattr__(self, "lower_exclusive", lower)
        object.__setattr__(self, "upper_inclusive", upper)
        object.__setattr__(self, "payout", payout)

    def settles(self, terminal_value: float) -> bool:
        value = _finite(terminal_value, "terminal_value")
        return self.lower_exclusive < value <= self.upper_inclusive


class ProbabilityDistribution(Protocol):
    def cdf(self, value: float) -> float: ...


@dataclass(frozen=True)
class EventQuote:
    fair_probability: float
    reservation_probability: float
    bid: float
    ask: float

    def __post_init__(self) -> None:
        for name in ("fair_probability", "reservation_probability", "bid", "ask"):
            value = _finite(getattr(self, name), name)
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be between zero and one")
            object.__setattr__(self, name, value)
        if self.bid > self.ask:
            raise ValueError("event quote bid cannot exceed ask")
