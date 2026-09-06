"""Capability-scoped comparison; unsupported overlap is never fabricated."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import math
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
    tolerances: Mapping[str, float] | None = None
    left_semantics: Mapping[str, Any] | None = None
    right_semantics: Mapping[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.left_engine == self.right_engine:
            raise ValueError("comparison requires two independent engines")
        object.__setattr__(self, "left_capabilities", frozenset(self.left_capabilities))
        object.__setattr__(self, "right_capabilities", frozenset(self.right_capabilities))
        object.__setattr__(self, "excluded_capabilities", frozenset(self.excluded_capabilities))
        tolerances = dict(self.tolerances or {})
        if any(type(value) not in {int, float} or not math.isfinite(value) or value < 0 for value in tolerances.values()):
            raise ValueError("comparison tolerances must be finite and non-negative")
        object.__setattr__(self, "tolerances", tolerances)

    @property
    def capability_intersection(self) -> frozenset[str]:
        return (self.left_capabilities & self.right_capabilities) - self.excluded_capabilities

    def compare(self, left: Mapping[str, Any], right: Mapping[str, Any], *, required_capability: str) -> "ComparisonResult":
        if required_capability not in self.capability_intersection:
            reason = "QUEUE_MODEL_NOT_IN_COMMON_CAPABILITY_SET" if required_capability in {"queue", "queue_model"} else "CAPABILITY_NOT_IN_COMMON_CAPABILITY_SET"
            return ComparisonResult(ComparisonStatus.NOT_COMPARABLE, required_capability, {}, reason)
        if self.left_semantics != self.right_semantics:
            return ComparisonResult(ComparisonStatus.NOT_COMPARABLE, required_capability, {}, "SEMANTIC_ASSUMPTIONS_DIFFER")
        if not self.tolerances:
            return ComparisonResult(ComparisonStatus.NOT_COMPARABLE, required_capability, {}, "NO_CONTRACTED_METRICS")
        names = sorted(self.tolerances)
        if any(name not in left or name not in right for name in names):
            return ComparisonResult(ComparisonStatus.FAIL, required_capability, {}, "CONTRACTED_METRIC_MISSING")
        if any(type(value[name]) not in {int, float} or not math.isfinite(value[name]) for value in (left, right) for name in names):
            return ComparisonResult(ComparisonStatus.FAIL, required_capability, {}, "CONTRACTED_METRIC_INVALID")
        deltas = {name: abs(float(left[name]) - float(right[name])) for name in names}
        passed = all(deltas[name] <= self.tolerances[name] for name in names)
        return ComparisonResult(ComparisonStatus.PASS if passed else ComparisonStatus.FAIL, required_capability, deltas, None)


@dataclass(frozen=True)
class ComparisonResult:
    status: ComparisonStatus
    capability: str
    metric_deltas: Mapping[str, float]
    reason: str | None

    def to_dict(self) -> dict[str, Any]:
        return {"status": self.status.value, "capability": self.capability,
                "metric_deltas": dict(self.metric_deltas), "reason": self.reason,
                "reasons": [self.reason] if self.reason else []}
