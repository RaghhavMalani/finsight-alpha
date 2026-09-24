from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class CauchyDistribution:
    location: float
    scale: float

    def __post_init__(self) -> None:
        if not math.isfinite(self.location) or not math.isfinite(self.scale) or self.scale <= 0:
            raise ValueError("Cauchy location must be finite and scale positive")

    def cdf(self, value: float) -> float:
        return math.atan((float(value) - self.location) / self.scale) / math.pi + 0.5
