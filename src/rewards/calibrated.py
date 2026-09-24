"""Interpretable, gate-aware evaluation and training reward calibration."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Iterable

from src.findings.schema import ResearchBudget
from src.rewards.reward_model import ResourceUsage
from src.verifiers.core import VerificationResult, VerificationStatus


@dataclass(frozen=True)
class CalibrationConfig:
    """Versioned v0.2.2 scoring policy.

    Correctness quality is a weighted geometric mean. Efficiency remains a
    separately inspectable signal, and categorical gate failures control the
    multiplier applied only to the training reward.
    """

    temporal_weight: float = 0.25
    evidence_weight: float = 0.20
    numerical_weight: float = 0.25
    reproducibility_weight: float = 0.20
    robustness_weight: float = 0.10
    epsilon: float = 0.05
    critical_failure_multiplier: float = 0.40
    quality_failure_multiplier: float = 0.65
    cost_efficiency_rate: float = 0.20
    latency_efficiency_rate: float = 0.10
    tool_efficiency_rate: float = 0.06
    critical_verifiers: tuple[str, ...] = (
        "temporal",
        "evidence",
        "numerical",
        "reproducibility",
    )

    def __post_init__(self) -> None:
        numeric = {
            key: value
            for key, value in self.to_dict().items()
            if key != "critical_verifiers"
        }
        for name, value in numeric.items():
            if type(value) not in {int, float} or not math.isfinite(float(value)):
                raise ValueError(f"{name} must be finite")
            if value < 0.0:
                raise ValueError(f"{name} must be >= 0")
        if not 0.0 < self.epsilon <= 1.0:
            raise ValueError("epsilon must be in (0, 1]")
        for name in ("critical_failure_multiplier", "quality_failure_multiplier"):
            if getattr(self, name) > 1.0:
                raise ValueError(f"{name} must be <= 1")
        critical = tuple(dict.fromkeys(self.critical_verifiers))
        if not critical or any(not item for item in critical):
            raise ValueError("critical_verifiers must contain names")
        object.__setattr__(self, "critical_verifiers", critical)

    @property
    def weights(self) -> dict[str, float]:
        return {
            "temporal": self.temporal_weight,
            "evidence": self.evidence_weight,
            "numerical": self.numerical_weight,
            "reproducibility": self.reproducibility_weight,
            "robustness": self.robustness_weight,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "temporal_weight": self.temporal_weight,
            "evidence_weight": self.evidence_weight,
            "numerical_weight": self.numerical_weight,
            "reproducibility_weight": self.reproducibility_weight,
            "robustness_weight": self.robustness_weight,
            "epsilon": self.epsilon,
            "critical_failure_multiplier": self.critical_failure_multiplier,
            "quality_failure_multiplier": self.quality_failure_multiplier,
            "cost_efficiency_rate": self.cost_efficiency_rate,
            "latency_efficiency_rate": self.latency_efficiency_rate,
            "tool_efficiency_rate": self.tool_efficiency_rate,
            "critical_verifiers": list(self.critical_verifiers),
        }


@dataclass(frozen=True)
class EvaluationResult:
    """Separate validity, quality, efficiency, and learning signals."""

    verified: bool
    critical_gate_passed: bool
    verifier_scores: dict[str, float]
    verifier_statuses: dict[str, str]
    research_quality: float
    efficiency_score: float
    training_reward: float
    failure_multiplier: float
    efficiency_components: dict[str, float]
    aggregation: str = "weighted_geometric_mean"
    schema_version: str = "0.2.2"

    @property
    def reward(self) -> float:
        """Compatibility alias for callers that previously displayed reward."""

        return self.training_reward

    @property
    def verified_quality(self) -> float:
        """Compatibility alias for the legacy quality field."""

        return self.research_quality

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "verified": self.verified,
            "critical_gate_passed": self.critical_gate_passed,
            "verifier_scores": self.verifier_scores,
            "verifier_statuses": self.verifier_statuses,
            "research_quality": self.research_quality,
            "efficiency_score": self.efficiency_score,
            "training_reward": self.training_reward,
            "failure_multiplier": self.failure_multiplier,
            "efficiency_components": self.efficiency_components,
            "aggregation": self.aggregation,
        }


def _utilization(used: float, allowance: float) -> float:
    if allowance > 0.0:
        return used / allowance
    return 0.0 if used == 0.0 else 10.0


def _status_band(result: VerificationResult) -> str:
    if result.status is VerificationStatus.PASS:
        return "pass"
    if result.status is VerificationStatus.NOT_MEASURED:
        return "not_measured"
    return "partial" if result.score > 0.0 else "fail"


class CalibratedRewardModel:
    """Compute the v0.2.2 gate-aware evaluation contract."""

    def __init__(self, config: CalibrationConfig | None = None) -> None:
        self.config = config or CalibrationConfig()

    def score(
        self,
        results: Iterable[VerificationResult],
        *,
        required_verifiers: Iterable[str],
        usage: ResourceUsage,
        budget: ResearchBudget,
    ) -> EvaluationResult:
        ordered = tuple(results)
        by_name = {result.verifier: result for result in ordered}
        if len(by_name) != len(ordered):
            raise ValueError("verifier results must have unique names")
        required = tuple(required_verifiers)
        missing = set(required) - set(by_name)
        if missing:
            raise ValueError(f"required verifier results are missing: {sorted(missing)}")

        weights = self.config.weights
        active_weight = sum(weights.get(name, 0.0) for name in required)
        if active_weight <= 0.0:
            raise ValueError("required verifiers have no configured calibration weight")
        scores = {name: float(by_name[name].score) for name in required}
        log_quality = sum(
            weights.get(name, 0.0)
            * math.log(max(self.config.epsilon, min(1.0, scores[name])))
            for name in required
        ) / active_weight
        research_quality = math.exp(log_quality)

        verified = all(
            by_name[name].status is VerificationStatus.PASS for name in required
        )
        active_critical = tuple(
            name for name in self.config.critical_verifiers if name in required
        )
        critical_gate_passed = all(
            by_name[name].status is VerificationStatus.PASS
            for name in active_critical
        )
        if verified:
            failure_multiplier = 1.0
        elif not critical_gate_passed:
            failure_multiplier = self.config.critical_failure_multiplier
        else:
            failure_multiplier = self.config.quality_failure_multiplier

        utilizations = {
            "cost_utilization": _utilization(
                usage.total_cost_usd, budget.max_cost_usd
            ),
            "latency_utilization": _utilization(
                usage.latency_seconds, budget.max_compute_seconds
            ),
            "tool_utilization": _utilization(
                float(usage.tool_calls), float(budget.max_tool_calls)
            ),
        }
        efficiency_score = math.exp(
            -self.config.cost_efficiency_rate * utilizations["cost_utilization"]
            -self.config.latency_efficiency_rate
            * utilizations["latency_utilization"]
            -self.config.tool_efficiency_rate * utilizations["tool_utilization"]
        )
        efficiency_score = max(0.0, min(1.0, efficiency_score))
        training_reward = max(
            0.0,
            min(1.0, research_quality * efficiency_score * failure_multiplier),
        )
        return EvaluationResult(
            verified=verified,
            critical_gate_passed=critical_gate_passed,
            verifier_scores=scores,
            verifier_statuses={
                name: _status_band(by_name[name]) for name in required
            },
            research_quality=research_quality,
            efficiency_score=efficiency_score,
            training_reward=training_reward,
            failure_multiplier=failure_multiplier,
            efficiency_components=utilizations,
        )
