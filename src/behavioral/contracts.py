"""Strict public and sealed contracts for the v0.2.5 behavioral suite."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Mapping

from src.eval.canonical import canonical_sha256
from src.execution.trust import EngineTrustPolicy


SCHEMA_VERSION = "forge-real-single-agent-task/0.2.5"
SUITE_VERSION = "forge-real-single-agent-suite/0.2.5"
STAGE_TOOLS = (
    "research.run_screen",
    "research.promote_event_replay",
    "research.add_costs",
    "research.run_latency_sensitivity",
    "research.run_counterfactual_stress",
)


class Verdict(str, Enum):
    ACCEPT = "ACCEPT"
    REJECT = "REJECT"
    ABSTAIN = "ABSTAIN"


def _exact(data: Mapping[str, Any], fields: set[str], label: str) -> dict[str, Any]:
    value = dict(data)
    if set(value) != fields:
        raise ValueError(f"{label} fields must be exactly {sorted(fields)}")
    return value


def _text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value.strip()


def _number(value: Any, label: str, *, minimum: float = 0.0) -> float:
    if type(value) not in {int, float} or not math.isfinite(float(value)):
        raise ValueError(f"{label} must be finite")
    result = float(value)
    if result < minimum:
        raise ValueError(f"{label} must be >= {minimum}")
    return result


@dataclass(frozen=True)
class BehavioralBudget:
    max_tool_calls: int
    max_engine_runs: int
    max_high_fidelity_runs: int
    max_tokens: int
    max_cost_usd: float
    max_wall_seconds: float

    def __post_init__(self) -> None:
        for name in (
            "max_tool_calls", "max_engine_runs", "max_high_fidelity_runs", "max_tokens"
        ):
            value = getattr(self, name)
            if type(value) is not int or value <= 0:
                raise ValueError(f"{name} must be a positive integer")
        if self.max_high_fidelity_runs > self.max_engine_runs:
            raise ValueError("high-fidelity run budget cannot exceed engine run budget")
        object.__setattr__(self, "max_cost_usd", _number(self.max_cost_usd, "max_cost_usd"))
        object.__setattr__(
            self, "max_wall_seconds", _number(self.max_wall_seconds, "max_wall_seconds", minimum=0.001)
        )

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "BehavioralBudget":
        fields = {
            "max_tool_calls", "max_engine_runs", "max_high_fidelity_runs",
            "max_tokens", "max_cost_usd", "max_wall_seconds",
        }
        return cls(**_exact(value, fields, "behavioral budget"))

    def to_dict(self) -> dict[str, Any]:
        return {
            "max_tool_calls": self.max_tool_calls,
            "max_engine_runs": self.max_engine_runs,
            "max_high_fidelity_runs": self.max_high_fidelity_runs,
            "max_tokens": self.max_tokens,
            "max_cost_usd": self.max_cost_usd,
            "max_wall_seconds": self.max_wall_seconds,
        }


@dataclass(frozen=True)
class StageEvidence:
    tool: str
    stage: str
    engine: str
    minimum_certification: str
    high_fidelity: bool
    available: bool
    observations: int
    evidence_quality: str
    metrics: Mapping[str, float]
    reason: str | None

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "StageEvidence":
        fields = {
            "tool", "stage", "engine", "minimum_certification", "high_fidelity",
            "available", "observations", "evidence_quality", "metrics", "reason",
        }
        data = _exact(value, fields, "stage evidence")
        tool = _text(data["tool"], "stage tool")
        if tool not in STAGE_TOOLS:
            raise ValueError(f"unsupported stage tool {tool!r}")
        if type(data["high_fidelity"]) is not bool or type(data["available"]) is not bool:
            raise ValueError("stage availability and high_fidelity must be booleans")
        if type(data["observations"]) is not int or data["observations"] < 0:
            raise ValueError("stage observations must be an integer >= 0")
        metrics = dict(data["metrics"])
        for name, metric in metrics.items():
            _text(name, "metric name")
            if type(metric) not in {int, float} or not math.isfinite(float(metric)):
                raise ValueError("stage metrics must be finite")
            metrics[name] = float(metric)
        reason = data["reason"]
        if not data["available"] and not reason:
            raise ValueError("unavailable stage evidence requires a reason")
        if data["available"] and reason is not None:
            raise ValueError("available stage evidence cannot have an unavailable reason")
        if not data["available"] and metrics:
            raise ValueError("unavailable stage evidence cannot contain metrics")
        return cls(
            tool=tool,
            stage=_text(data["stage"], "stage"),
            engine=_text(data["engine"], "engine"),
            minimum_certification=_text(data["minimum_certification"], "minimum certification"),
            high_fidelity=data["high_fidelity"],
            available=data["available"],
            observations=data["observations"],
            evidence_quality=_text(data["evidence_quality"], "evidence quality"),
            metrics=metrics,
            reason=None if reason is None else _text(reason, "stage reason"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "tool": self.tool,
            "stage": self.stage,
            "engine": self.engine,
            "minimum_certification": self.minimum_certification,
            "high_fidelity": self.high_fidelity,
            "available": self.available,
            "observations": self.observations,
            "evidence_quality": self.evidence_quality,
            "metrics": dict(sorted(self.metrics.items())),
            "reason": self.reason,
        }

    @property
    def evidence_hash(self) -> str:
        return canonical_sha256(self.to_dict())


@dataclass(frozen=True)
class GradingContract:
    expected_verdict: Verdict
    required_stage: str
    recommended_stop_stage: str
    require_trust_refusal: bool

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "GradingContract":
        fields = {
            "expected_verdict", "required_stage", "recommended_stop_stage",
            "require_trust_refusal",
        }
        data = _exact(value, fields, "grading contract")
        if type(data["require_trust_refusal"]) is not bool:
            raise ValueError("require_trust_refusal must be boolean")
        return cls(
            expected_verdict=Verdict(data["expected_verdict"]),
            required_stage=_text(data["required_stage"], "required_stage"),
            recommended_stop_stage=_text(data["recommended_stop_stage"], "recommended_stop_stage"),
            require_trust_refusal=data["require_trust_refusal"],
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "expected_verdict": self.expected_verdict.value,
            "required_stage": self.required_stage,
            "recommended_stop_stage": self.recommended_stop_stage,
            "require_trust_refusal": self.require_trust_refusal,
        }


@dataclass(frozen=True)
class BehavioralTask:
    task_id: str
    task_class: str
    objective: str
    hypothesis: str
    acceptance_criteria: str
    primary_metric: str
    execution_mode: str
    budget: BehavioralBudget
    engine_trust_policy: EngineTrustPolicy
    stages: tuple[StageEvidence, ...]
    grading: GradingContract
    reality_ladder_artifact_hash: str
    schema_version: str = SCHEMA_VERSION

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "BehavioralTask":
        fields = {
            "schema_version", "task_id", "task_class", "objective", "hypothesis",
            "acceptance_criteria", "primary_metric", "budget", "allowed_engines",
            "execution_mode", "stages", "grading", "reality_ladder_artifact_hash",
        }
        data = _exact(value, fields, "behavioral task")
        if data["schema_version"] != SCHEMA_VERSION:
            raise ValueError("unsupported behavioral task schema")
        if data["execution_mode"] != "frozen_evidence_replay":
            raise ValueError("v0.2.5 requires frozen_evidence_replay execution mode")
        stages = tuple(StageEvidence.from_dict(item) for item in data["stages"])
        if tuple(item.tool for item in stages) != STAGE_TOOLS:
            raise ValueError("behavioral task stages must define the complete ordered ladder")
        grading = GradingContract.from_dict(data["grading"])
        names = {item.stage for item in stages}
        if grading.required_stage not in names or grading.recommended_stop_stage not in names:
            raise ValueError("grading stages must name stages in the task")
        trust = EngineTrustPolicy.from_dict({"allowed_engines": data["allowed_engines"]})
        for stage in stages:
            requirement = trust.allowed_engines.get(stage.engine)
            if requirement is None or requirement.minimum_certification != stage.minimum_certification:
                raise ValueError("stage engine requirement must match allowed_engines")
        return cls(
            schema_version=data["schema_version"],
            task_id=_text(data["task_id"], "task_id"),
            task_class=_text(data["task_class"], "task_class"),
            objective=_text(data["objective"], "objective"),
            hypothesis=_text(data["hypothesis"], "hypothesis"),
            acceptance_criteria=_text(data["acceptance_criteria"], "acceptance criteria"),
            primary_metric=_text(data["primary_metric"], "primary metric"),
            execution_mode=_text(data["execution_mode"], "execution mode"),
            budget=BehavioralBudget.from_dict(data["budget"]),
            engine_trust_policy=trust,
            stages=stages,
            grading=grading,
            reality_ladder_artifact_hash=_text(
                data["reality_ladder_artifact_hash"], "Reality Ladder artifact hash"
            ),
        )

    def public_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "task_id": self.task_id,
            "objective": self.objective,
            "hypothesis": self.hypothesis,
            "acceptance_criteria": self.acceptance_criteria,
            "primary_metric": self.primary_metric,
            "execution_mode": self.execution_mode,
            "budget": self.budget.to_dict(),
            **self.engine_trust_policy.to_dict(),
            "reality_ladder_artifact_hash": self.reality_ladder_artifact_hash,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            **self.public_dict(),
            "task_class": self.task_class,
            "stages": [item.to_dict() for item in self.stages],
            "grading": self.grading.to_dict(),
        }

    @property
    def task_hash(self) -> str:
        return canonical_sha256(self.public_dict())

    @property
    def world_hash(self) -> str:
        return canonical_sha256([item.to_dict() for item in self.stages])

    @property
    def case_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    def stage_for_tool(self, tool: str) -> StageEvidence:
        return next(item for item in self.stages if item.tool == tool)


@dataclass(frozen=True)
class BehavioralSuite:
    suite_id: str
    tasks: tuple[BehavioralTask, ...]
    certification_artifact_hash: str
    reality_ladder_artifact_hash: str
    schema_version: str = SUITE_VERSION

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "BehavioralSuite":
        fields = {
            "schema_version", "suite_id", "certification_artifact_hash",
            "reality_ladder_artifact_hash", "tasks",
        }
        data = _exact(value, fields, "behavioral suite")
        if data["schema_version"] != SUITE_VERSION:
            raise ValueError("unsupported behavioral suite schema")
        tasks = tuple(BehavioralTask.from_dict(item) for item in data["tasks"])
        if len(tasks) != 6 or len({task.task_id for task in tasks}) != 6:
            raise ValueError("v0.2.5 suite requires exactly six unique tasks")
        ladder_hash = _text(data["reality_ladder_artifact_hash"], "suite ladder hash")
        if any(task.reality_ladder_artifact_hash != ladder_hash for task in tasks):
            raise ValueError("every task must bind the suite Reality Ladder artifact")
        return cls(
            schema_version=data["schema_version"],
            suite_id=_text(data["suite_id"], "suite_id"),
            tasks=tasks,
            certification_artifact_hash=_text(
                data["certification_artifact_hash"], "certification artifact hash"
            ),
            reality_ladder_artifact_hash=ladder_hash,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "suite_id": self.suite_id,
            "certification_artifact_hash": self.certification_artifact_hash,
            "reality_ladder_artifact_hash": self.reality_ladder_artifact_hash,
            "tasks": [task.to_dict() for task in self.tasks],
        }

    @property
    def suite_hash(self) -> str:
        return canonical_sha256(self.to_dict())


@dataclass(frozen=True)
class ModelIdentity:
    provider: str
    model: str
    model_version: str
    model_kind: str
    temperature: float
    seed_supported: bool
    input_usd_per_million_tokens: float
    output_usd_per_million_tokens: float

    def __post_init__(self) -> None:
        for name in ("provider", "model", "model_version", "model_kind"):
            object.__setattr__(self, name, _text(getattr(self, name), name))
        if self.model_kind not in {"live", "test_double"}:
            raise ValueError("model_kind must be live or test_double")
        if type(self.seed_supported) is not bool:
            raise ValueError("seed_supported must be boolean")
        object.__setattr__(self, "temperature", _number(self.temperature, "temperature"))
        object.__setattr__(
            self, "input_usd_per_million_tokens",
            _number(self.input_usd_per_million_tokens, "input token price"),
        )
        object.__setattr__(
            self, "output_usd_per_million_tokens",
            _number(self.output_usd_per_million_tokens, "output token price"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model,
            "model_version": self.model_version,
            "model_kind": self.model_kind,
            "temperature": self.temperature,
            "seed_supported": self.seed_supported,
            "input_usd_per_million_tokens": self.input_usd_per_million_tokens,
            "output_usd_per_million_tokens": self.output_usd_per_million_tokens,
        }

    @property
    def identity_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "ModelIdentity":
        fields = {
            "provider", "model", "model_version", "model_kind", "temperature",
            "seed_supported", "input_usd_per_million_tokens",
            "output_usd_per_million_tokens",
        }
        return cls(**_exact(value, fields, "model identity"))


def load_behavioral_suite(path: str | Path) -> BehavioralSuite:
    return BehavioralSuite.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))
