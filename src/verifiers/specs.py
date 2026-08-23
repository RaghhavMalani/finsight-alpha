"""Frozen oracle specifications used by benchmark verifiers."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class NumericExpectation:
    claim_id: str
    metric: str
    expected: float
    unit: str
    absolute_tolerance: float = 0.0
    relative_tolerance: float = 0.0

    def __post_init__(self) -> None:
        if not self.claim_id.strip() or not self.metric.strip() or not self.unit.strip():
            raise ValueError("numeric expectation identifiers must be non-empty")
        values = (self.expected, self.absolute_tolerance, self.relative_tolerance)
        if any(type(value) not in {int, float} or not math.isfinite(float(value)) for value in values):
            raise ValueError("numeric expectation values must be finite")
        if self.absolute_tolerance < 0 or self.relative_tolerance < 0:
            raise ValueError("numeric tolerances must be >= 0")
        object.__setattr__(self, "expected", float(self.expected))
        object.__setattr__(self, "absolute_tolerance", float(self.absolute_tolerance))
        object.__setattr__(self, "relative_tolerance", float(self.relative_tolerance))

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "NumericExpectation":
        data = dict(value)
        required = {"claim_id", "metric", "expected", "unit"}
        allowed = required | {"absolute_tolerance", "relative_tolerance"}
        if required - set(data) or set(data) - allowed:
            raise ValueError("invalid numeric expectation fields")
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return {
            "claim_id": self.claim_id,
            "metric": self.metric,
            "expected": self.expected,
            "unit": self.unit,
            "absolute_tolerance": self.absolute_tolerance,
            "relative_tolerance": self.relative_tolerance,
        }


@dataclass(frozen=True)
class EvidenceRequirement:
    dataset: str
    minimum_count: int = 1

    def __post_init__(self) -> None:
        if not self.dataset.strip():
            raise ValueError("evidence requirement dataset must be non-empty")
        if type(self.minimum_count) is not int or self.minimum_count < 1:
            raise ValueError("minimum_count must be an integer >= 1")

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "EvidenceRequirement":
        data = dict(value)
        if set(data) - {"dataset", "minimum_count"} or "dataset" not in data:
            raise ValueError("invalid evidence requirement fields")
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return {"dataset": self.dataset, "minimum_count": self.minimum_count}
