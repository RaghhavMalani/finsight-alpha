"""Capability-scoped comparison; unsupported overlap is never fabricated."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping


class ComparisonStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    NOT_COMPARABLE = "NOT_COMPARABLE"


@dataclass(frozen=True)
class ComparisonContract:
    left_engine: str
    right_engine: str
    left_capabilities: frozenset[str]
    right_capabilities: frozenset[str]
    excluded_capabilities: frozenset[str] = frozenset()
    tolerances: Mapping[str, float] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.left_engine == self.right_engine:
            raise ValueError("comparison requires two independent engines")
        object.__setattr__(self, "left_capabilities", frozenset(self.left_capabilities))
        object.__setattr__(self, "right_capabilities", frozenset(self.right_capabilities))
        object.__setattr__(self, "excluded_capabilities", frozenset(self.excluded_capabilities))
        tolerances = dict(self.tolerances or {})
        if any(type(value) not in {int, float} or value < 0 for value in tolerances.values()):
            raise ValueError("comparison tolerances must be non-negative")
        object.__setattr__(self, "tolerances", tolerances)

    @property
    def capability_intersection(self) -> frozenset[str]:
        return (self.left_capabilities & self.right_capabilities) - self.excluded_capabilities

    def compare(self, left: Mapping[str, float], right: Mapping[str, float], *, required_capability: str) -> "ComparisonResult":
        if required_capability not in self.capability_intersection:
            return ComparisonResult(ComparisonStatus.NOT_COMPARABLE, required_capability, {}, "capability is outside the declared intersection")
        shared = sorted(set(left) & set(right) & set(self.tolerances))
        if not shared:
            return ComparisonResult(ComparisonStatus.NOT_COMPARABLE, required_capability, {}, "no contracted metrics overlap")
        deltas = {name: abs(float(left[name]) - float(right[name])) for name in shared}
        passed = all(deltas[name] <= self.tolerances[name] for name in shared)
        return ComparisonResult(ComparisonStatus.PASS if passed else ComparisonStatus.FAIL, required_capability, deltas, None)


@dataclass(frozen=True)
class ComparisonResult:
    status: ComparisonStatus
    capability: str
    metric_deltas: Mapping[str, float]
    reason: str | None

