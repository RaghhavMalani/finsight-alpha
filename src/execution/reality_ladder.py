"""Strategy promotion and edge-survival metrics across increasing realism."""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from src.execution.contracts import EpistemicValue, MeasurementState, SimulationResult


class RealityLevel(str, Enum):
    L0_MATHEMATICAL = "L0_MATHEMATICAL"
    L1_VECTORIZED = "L1_VECTORIZED"
    L2_EVENT_REPLAY = "L2_EVENT_REPLAY"
    L3_MICROSTRUCTURE = "L3_MICROSTRUCTURE"
    L4_COUNTERFACTUAL_STRESS = "L4_COUNTERFACTUAL_STRESS"


LEVEL_ORDER = {level: index for index, level in enumerate(RealityLevel)}


@dataclass(frozen=True)
class LadderStage:
    level: RealityLevel
    label: str
    metric: EpistemicValue
    engine_id: str | None = None
    result_hash: str | None = None

    @classmethod
    def from_result(
        cls,
        level: RealityLevel,
        label: str,
        result: SimulationResult,
        metric: str = "sharpe",
    ) -> "LadderStage":
        if metric not in result.metrics:
            raise KeyError(metric)
        return cls(level, label, result.metrics[metric], result.provenance.engine_id, result.result_hash)


@dataclass(frozen=True)
class AlphaSurvivalCurve:
    stages: tuple[LadderStage, ...]

    def __post_init__(self) -> None:
        if not self.stages:
            raise ValueError("alpha survival curve requires at least one stage")
        positions = [LEVEL_ORDER[stage.level] for stage in self.stages]
        if positions != sorted(positions) or len(positions) != len(set(positions)):
            raise ValueError("reality stages must be unique and ordered")

    @property
    def measured_stages(self) -> tuple[LadderStage, ...]:
        return tuple(stage for stage in self.stages if stage.metric.state is MeasurementState.MEASURED)

    @property
    def alpha_survival_ratio(self) -> EpistemicValue:
        measured = self.measured_stages
        if len(measured) < 2:
            return EpistemicValue.absent(MeasurementState.NOT_MEASURED, "at least two measured stages are required")
        initial = float(measured[0].metric.value)
        final = float(measured[-1].metric.value)
        if math.isclose(initial, 0.0, abs_tol=1e-12):
            return EpistemicValue.absent(MeasurementState.NOT_MEASURED, "initial alpha is zero")
        return EpistemicValue.measured(final / initial, "ratio")

    @property
    def execution_reality_gap(self) -> EpistemicValue:
        measured = self.measured_stages
        if len(measured) < 2:
            return EpistemicValue.absent(MeasurementState.NOT_MEASURED, "at least two measured stages are required")
        return EpistemicValue.measured(
            float(measured[0].metric.value) - float(measured[-1].metric.value),
            measured[0].metric.unit or "metric",
        )

    def promote(self, *, minimum_final: float, minimum_survival_ratio: float) -> bool:
        ratio = self.alpha_survival_ratio
        measured = self.measured_stages
        return bool(
            measured
            and ratio.state is MeasurementState.MEASURED
            and float(measured[-1].metric.value) >= minimum_final
            and float(ratio.value) >= minimum_survival_ratio
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "stages": [
                {
                    "level": stage.level.value, "label": stage.label,
                    "metric": stage.metric.to_dict(), "engine_id": stage.engine_id,
                    "result_hash": stage.result_hash,
                }
                for stage in self.stages
            ],
            "alpha_survival_ratio": self.alpha_survival_ratio.to_dict(),
            "execution_reality_gap": self.execution_reality_gap.to_dict(),
        }


def build_survival_curve(stages: Iterable[LadderStage]) -> AlphaSurvivalCurve:
    return AlphaSurvivalCurve(tuple(stages))
