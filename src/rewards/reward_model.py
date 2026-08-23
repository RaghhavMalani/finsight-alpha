"""Deterministic reward model built from verifier outputs, not prose judgment."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Iterable, Mapping

from src.findings.schema import ResearchBudget
from src.verifiers.core import VerificationResult, VerificationStatus


@dataclass(frozen=True)
class ResourceUsage:
    cost_usd: float = 0.0
    latency_seconds: float = 0.0
    tool_calls: int = 0
    inference_cost_usd: float = 0.0
    embedding_cost_usd: float = 0.0
    retrieval_cost_usd: float = 0.0
    compute_cost_usd: float = 0.0
    external_data_cost_usd: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    sandbox_executions: int = 0

    def __post_init__(self) -> None:
        for label, value in (
            ("cost_usd", self.cost_usd),
            ("latency_seconds", self.latency_seconds),
            ("inference_cost_usd", self.inference_cost_usd),
            ("embedding_cost_usd", self.embedding_cost_usd),
            ("retrieval_cost_usd", self.retrieval_cost_usd),
            ("compute_cost_usd", self.compute_cost_usd),
            ("external_data_cost_usd", self.external_data_cost_usd),
        ):
            if type(value) not in {int, float} or not math.isfinite(float(value)):
                raise ValueError(f"{label} must be finite")
            if value < 0:
                raise ValueError(f"{label} must be >= 0")
            object.__setattr__(self, label, float(value))
        for label in ("tool_calls", "tokens_in", "tokens_out", "sandbox_executions"):
            value = getattr(self, label)
            if type(value) is not int or value < 0:
                raise ValueError(f"{label} must be an integer >= 0")

    @property
    def total_cost_usd(self) -> float:
        components = sum(
            (
                self.inference_cost_usd,
                self.embedding_cost_usd,
                self.retrieval_cost_usd,
                self.compute_cost_usd,
                self.external_data_cost_usd,
            )
        )
        return components if components > 0.0 else self.cost_usd

    @classmethod
    def from_dict(cls, value: Mapping[str, Any] | None) -> "ResourceUsage":
        data = dict(value or {})
        data.pop("total_cost_usd", None)
        allowed = {
            "cost_usd", "latency_seconds", "tool_calls",
            "inference_cost_usd", "embedding_cost_usd", "retrieval_cost_usd",
            "compute_cost_usd", "external_data_cost_usd",
            "tokens_in", "tokens_out", "sandbox_executions",
        }
        if set(data) - allowed:
            raise ValueError("resource usage contains unknown fields")
        if data.get("cost_usd", 0.0) and any(
            data.get(name, 0.0)
            for name in (
                "inference_cost_usd", "embedding_cost_usd", "retrieval_cost_usd",
                "compute_cost_usd", "external_data_cost_usd",
            )
        ):
            data["cost_usd"] = 0.0
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return {
            "cost_usd": self.total_cost_usd,
            "inference_cost_usd": self.inference_cost_usd,
            "embedding_cost_usd": self.embedding_cost_usd,
            "retrieval_cost_usd": self.retrieval_cost_usd,
            "compute_cost_usd": self.compute_cost_usd,
            "external_data_cost_usd": self.external_data_cost_usd,
            "total_cost_usd": self.total_cost_usd,
            "latency_seconds": self.latency_seconds,
            "tool_calls": self.tool_calls,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "sandbox_executions": self.sandbox_executions,
        }

@dataclass(frozen=True)
class RewardConfig:
    temporal_weight: float = 0.30
    evidence_weight: float = 0.25
    robustness_weight: float = 0.10
    numerical_weight: float = 0.30
    reproducibility_weight: float = 0.15
    cost_penalty_per_usd: float = 0.05
    latency_penalty_per_second: float = 0.0005
    tool_call_penalty: float = 0.002
    required_gate_penalty: float = 0.40
    temporal_leak_penalty: float = 0.60
    budget_overrun_penalty: float = 0.25

    def __post_init__(self) -> None:
        for name, value in self.to_dict().items():
            if type(value) not in {int, float} or not math.isfinite(float(value)):
                raise ValueError(f"{name} must be finite")
            if value < 0:
                raise ValueError(f"{name} must be >= 0")

    @property
    def weights(self) -> dict[str, float]:
        return {
            "temporal": self.temporal_weight,
            "evidence": self.evidence_weight,
            "robustness": self.robustness_weight,
            "numerical": self.numerical_weight,
            "reproducibility": self.reproducibility_weight,
        }

    def to_dict(self) -> dict[str, float]:
        return {
            "temporal_weight": self.temporal_weight,
            "evidence_weight": self.evidence_weight,
            "numerical_weight": self.numerical_weight,
            "reproducibility_weight": self.reproducibility_weight,
            "robustness_weight": self.robustness_weight,
            "cost_penalty_per_usd": self.cost_penalty_per_usd,
            "latency_penalty_per_second": self.latency_penalty_per_second,
            "tool_call_penalty": self.tool_call_penalty,
            "required_gate_penalty": self.required_gate_penalty,
            "temporal_leak_penalty": self.temporal_leak_penalty,
            "budget_overrun_penalty": self.budget_overrun_penalty,
        }


@dataclass(frozen=True)
class RewardBreakdown:
    reward: float
    verified_quality: float
    verifier_scores: dict[str, float]
    penalties: dict[str, float]

    def to_dict(self) -> dict[str, Any]:
        return {
            "reward": self.reward,
            "verified_quality": self.verified_quality,
            "verifier_scores": self.verifier_scores,
            "penalties": self.penalties,
        }


class VerifiedRewardModel:
    """Shape a bounded reward from independent, inspectable components."""

    def __init__(self, config: RewardConfig | None = None) -> None:
        self.config = config or RewardConfig()

    def score(
        self,
        results: Iterable[VerificationResult],
        *,
        required_verifiers: Iterable[str],
        usage: ResourceUsage,
        budget: ResearchBudget,
    ) -> RewardBreakdown:
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
            raise ValueError("required verifiers have no configured reward weight")
        scores = {name: by_name[name].score for name in required}
        quality = sum(weights.get(name, 0.0) * scores[name] for name in required)
        quality /= active_weight

        failed_required = sum(
            by_name[name].status is not VerificationStatus.PASS for name in required
        )
        gate_penalty = self.config.required_gate_penalty * failed_required / len(required)
        temporal = by_name.get("temporal")
        leakage_penalty = (
            self.config.temporal_leak_penalty
            if temporal is not None and temporal.status is VerificationStatus.FAIL
            else 0.0
        )
        overrun_count = sum(
            (
                usage.total_cost_usd > budget.max_cost_usd,
                usage.latency_seconds > budget.max_compute_seconds,
                usage.tool_calls > budget.max_tool_calls,
            )
        )
        penalties = {
            "cost": self.config.cost_penalty_per_usd * usage.total_cost_usd,
            "latency": self.config.latency_penalty_per_second * usage.latency_seconds,
            "tool_calls": self.config.tool_call_penalty * usage.tool_calls,
            "required_gates": gate_penalty,
            "temporal_leak": leakage_penalty,
            "budget_overrun": self.config.budget_overrun_penalty * overrun_count,
        }
        reward = max(-1.0, min(1.0, quality - sum(penalties.values())))
        return RewardBreakdown(
            reward=reward,
            verified_quality=quality,
            verifier_scores=scores,
            penalties=penalties,
        )
