from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class NormalDistribution:
    location: float
    scale: float

    def __post_init__(self) -> None:
        if not math.isfinite(self.location) or not math.isfinite(self.scale) or self.scale <= 0:
            raise ValueError("normal location must be finite and scale positive")

    def cdf(self, value: float) -> float:
        z = (float(value) - self.location) / (self.scale * math.sqrt(2.0))
        return 0.5 * (1.0 + math.erf(z))
