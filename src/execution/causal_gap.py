"""Deterministic stagewise decomposition of execution Reality Gap."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


STAGE_ORDER = ("screening", "fees", "event_semantics", "latency", "queue", "stress")


@dataclass(frozen=True)
class StageDelta:
    stage: str
    value: float
    delta: float


@dataclass(frozen=True)
class CausalRealityGap:
    stages: tuple[StageDelta, ...]
    total_gap: float
    survival_ratio: float
    largest_degradation: StageDelta
    second_degradation: StageDelta

    @classmethod
    def decompose(cls, values: Mapping[str, float]) -> "CausalRealityGap":
        if tuple(values) != STAGE_ORDER:
            raise ValueError(f"stages must be supplied in canonical order {STAGE_ORDER}")
        raw = [float(values[name]) for name in STAGE_ORDER]
        stages = tuple(StageDelta(name, raw[index], 0.0 if index == 0 else raw[index] - raw[index - 1]) for index, name in enumerate(STAGE_ORDER))
        ranked = sorted(stages[1:], key=lambda item: (item.delta, STAGE_ORDER.index(item.stage)))
        survival = raw[-1] / raw[0] if raw[0] != 0 else 0.0
        return cls(stages, raw[0] - raw[-1], survival, ranked[0], ranked[1])

