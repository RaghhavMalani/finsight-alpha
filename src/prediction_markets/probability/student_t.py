from __future__ import annotations

import math
from dataclasses import dataclass

from scipy.special import betainc


@dataclass(frozen=True)
class StudentTDistribution:
    location: float
    scale: float
    degrees_of_freedom: float

    def __post_init__(self) -> None:
        if not all(math.isfinite(value) for value in (self.location, self.scale, self.degrees_of_freedom)):
            raise ValueError("Student-t parameters must be finite")
        if self.scale <= 0 or self.degrees_of_freedom <= 0:
            raise ValueError("Student-t scale and degrees_of_freedom must be positive")

    def cdf(self, value: float) -> float:
        x = (float(value) - self.location) / self.scale
        if x == 0:
            return 0.5
        nu = self.degrees_of_freedom
        tail = 0.5 * float(betainc(nu / 2.0, 0.5, nu / (nu + x * x)))
        return 1.0 - tail if x > 0 else tail
