"""Strict public and sealed contracts for Forge v0.2.5.1 hardening."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Mapping

from src.behavioral.contracts import ModelIdentity
from src.eval.canonical import canonical_sha256
from src.execution.trust import EngineTrustPolicy


SCHEMA_VERSION = "forge-behavioral-hardening-task/0.2.5.1"
SUITE_VERSION = "forge-behavioral-hardening-suite/0.2.5.1"
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
    NOT_COMPARABLE = "NOT_COMPARABLE"


class EvidenceStatus(str, Enum):
    OBSERVED = "OBSERVED"
    UNAVAILABLE = "UNAVAILABLE"
    REFUSED = "REFUSED"


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
class HardeningBudget:
    max_tool_calls: int
    max_engine_runs: int
    max_high_fidelity_runs: int
    max_tokens: int
    max_cost_usd: float
    max_wall_seconds: float
    max_experiment_cost_usd: float

    def __post_init__(self) -> None:
        for name in (
            "max_tool_calls", "max_engine_runs", "max_high_fidelity_runs", "max_tokens"
        ):
            value = getattr(self, name)
            if type(value) is not int or value <= 0:
                raise ValueError(f"{name} must be a positive integer")
        if self.max_high_fidelity_runs > self.max_engine_runs:
            raise ValueError("high-fidelity run budget cannot exceed engine run budget")
        for name in ("max_cost_usd", "max_experiment_cost_usd"):
            object.__setattr__(self, name, _number(getattr(self, name), name))
        object.__setattr__(
            self,
            "max_wall_seconds",
            _number(self.max_wall_seconds, "max_wall_seconds", minimum=0.001),
        )

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "HardeningBudget":
        return cls(**_exact(value, {
            "max_tool_calls", "max_engine_runs", "max_high_fidelity_runs",
            "max_tokens", "max_cost_usd", "max_wall_seconds",
            "max_experiment_cost_usd",
        }, "hardening budget"))

    def to_dict(self) -> dict[str, Any]:
        return {
            "max_tool_calls": self.max_tool_calls,
            "max_engine_runs": self.max_engine_runs,
            "max_high_fidelity_runs": self.max_high_fidelity_runs,
            "max_tokens": self.max_tokens,
            "max_cost_usd": self.max_cost_usd,
            "max_wall_seconds": self.max_wall_seconds,
            "max_experiment_cost_usd": self.max_experiment_cost_usd,
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
    semantics: Mapping[str, str]
    reason: str | None
    prerequisites: tuple[str, ...]
    experiment_cost_usd: float
    expected_wall_seconds: float
    capability_scope: str

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "StageEvidence":
        data = _exact(value, {
            "tool", "stage", "engine", "minimum_certification", "high_fidelity",
            "available", "observations", "evidence_quality", "metrics", "semantics",
            "reason", "prerequisites", "experiment_cost_usd",
            "expected_wall_seconds", "capability_scope",
        }, "stage evidence")
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
        semantics = dict(data["semantics"])
        if any(not isinstance(k, str) or not k.strip() or not isinstance(v, str) or not v.strip()
               for k, v in semantics.items()):
            raise ValueError("stage semantics must contain non-empty string pairs")
        prerequisites = tuple(data["prerequisites"])
        if len(set(prerequisites)) != len(prerequisites) or any(
            item not in STAGE_TOOLS for item in prerequisites
        ):
            raise ValueError("stage prerequisites must be unique stage tools")
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
            semantics=semantics,
            reason=None if reason is None else _text(reason, "stage reason"),
            prerequisites=prerequisites,
            experiment_cost_usd=_number(data["experiment_cost_usd"], "experiment cost"),
            expected_wall_seconds=_number(data["expected_wall_seconds"], "expected wall seconds"),
            capability_scope=_text(data["capability_scope"], "capability scope"),
        )

    def catalog_dict(self) -> dict[str, Any]:
        return {
            "tool": self.tool,
            "stage": self.stage,
            "engine": self.engine,
            "minimum_certification": self.minimum_certification,
            "high_fidelity": self.high_fidelity,
            "prerequisites": list(self.prerequisites),
            "experiment_cost_usd": self.experiment_cost_usd,
            "expected_wall_seconds": self.expected_wall_seconds,
            "capability_scope": self.capability_scope,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            **self.catalog_dict(),
            "available": self.available,
            "observations": self.observations,
            "evidence_quality": self.evidence_quality,
            "metrics": dict(sorted(self.metrics.items())),
            "semantics": dict(sorted(self.semantics.items())),
            "reason": self.reason,
        }

    @property
    def evidence_hash(self) -> str:
        return canonical_sha256(self.to_dict())


@dataclass(frozen=True)
class EvidenceRequirement:
    stage: str
    status: EvidenceStatus

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "EvidenceRequirement":
        data = _exact(value, {"stage", "status"}, "evidence requirement")
        return cls(stage=_text(data["stage"], "required stage"), status=EvidenceStatus(data["status"]))

    def to_dict(self) -> dict[str, str]:
        return {"stage": self.stage, "status": self.status.value}


@dataclass(frozen=True)
class OracleResources:
    experiment_cost_usd: float
    tool_calls: int
    high_fidelity_runs: int
    wall_seconds: float

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "OracleResources":
        data = _exact(value, {
            "experiment_cost_usd", "tool_calls", "high_fidelity_runs", "wall_seconds"
        }, "oracle resources")
        if type(data["tool_calls"]) is not int or data["tool_calls"] <= 0:
            raise ValueError("oracle tool_calls must be positive")
        if type(data["high_fidelity_runs"]) is not int or data["high_fidelity_runs"] < 0:
            raise ValueError("oracle high_fidelity_runs must be non-negative")
        return cls(
            experiment_cost_usd=_number(data["experiment_cost_usd"], "oracle experiment cost"),
            tool_calls=data["tool_calls"],
            high_fidelity_runs=data["high_fidelity_runs"],
            wall_seconds=_number(data["wall_seconds"], "oracle wall seconds"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "experiment_cost_usd": self.experiment_cost_usd,
            "tool_calls": self.tool_calls,
            "high_fidelity_runs": self.high_fidelity_runs,
            "wall_seconds": self.wall_seconds,
        }


@dataclass(frozen=True)
class GradingContract:
    expected_verdict: Verdict
    required_evidence: tuple[EvidenceRequirement, ...]
    oracle_path: tuple[str, ...]
    oracle_resources: OracleResources

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "GradingContract":
        data = _exact(value, {
            "expected_verdict", "required_evidence", "oracle_path", "oracle_resources"
        }, "grading contract")
        requirements = tuple(EvidenceRequirement.from_dict(item) for item in data["required_evidence"])
        if not requirements:
            raise ValueError("grading requires at least one evidence gate")
        oracle_path = tuple(data["oracle_path"])
        if not oracle_path or oracle_path[-1] != "research.submit":
            raise ValueError("oracle path must terminate in research.submit")
        allowed = set(STAGE_TOOLS) | {"research.inspect_hypothesis", "research.submit"}
        if any(tool not in allowed for tool in oracle_path):
            raise ValueError("oracle path contains an unsupported tool")
        resources = OracleResources.from_dict(data["oracle_resources"])
        if resources.tool_calls != len(oracle_path):
            raise ValueError("oracle tool_calls must equal oracle path length")
        return cls(
            expected_verdict=Verdict(data["expected_verdict"]),
            required_evidence=requirements,
            oracle_path=oracle_path,
            oracle_resources=resources,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "expected_verdict": self.expected_verdict.value,
            "required_evidence": [item.to_dict() for item in self.required_evidence],
            "oracle_path": list(self.oracle_path),
            "oracle_resources": self.oracle_resources.to_dict(),
        }


@dataclass(frozen=True)
class HardeningTask:
    task_id: str
    task_class: str
    objective: str
    hypothesis: str
    acceptance_criteria: str
    primary_metric: str
    execution_mode: str
    budget: HardeningBudget
    engine_trust_policy: EngineTrustPolicy
    stages: tuple[StageEvidence, ...]
    grading: GradingContract
    reality_ladder_artifact_hash: str
    pair_id: str | None
    schema_version: str = SCHEMA_VERSION

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "HardeningTask":
        data = _exact(value, {
            "schema_version", "task_id", "task_class", "objective", "hypothesis",
            "acceptance_criteria", "primary_metric", "budget", "allowed_engines",
            "execution_mode", "stages", "grading", "reality_ladder_artifact_hash",
            "pair_id",
        }, "hardening task")
        if data["schema_version"] != SCHEMA_VERSION:
            raise ValueError("unsupported hardening task schema")
        if data["execution_mode"] != "frozen_evidence_replay":
            raise ValueError("v0.2.5.1 requires frozen_evidence_replay execution mode")
        stages = tuple(StageEvidence.from_dict(item) for item in data["stages"])
        if len(stages) != len(STAGE_TOOLS) or {item.tool for item in stages} != set(STAGE_TOOLS):
            raise ValueError("hardening tasks must define each selectable experiment exactly once")
        tools = {item.tool for item in stages}
        seen: set[str] = set()
        remaining = set(tools)
        while remaining:
            ready = {item.tool for item in stages if item.tool in remaining and set(item.prerequisites) <= seen}
            if not ready:
                raise ValueError("experiment prerequisites must be acyclic")
            seen.update(ready)
            remaining -= ready
        grading = GradingContract.from_dict(data["grading"])
        names = {item.stage for item in stages}
        if any(item.stage not in names for item in grading.required_evidence):
            raise ValueError("grading requirements must name task stages")
        trust = EngineTrustPolicy.from_dict({"allowed_engines": data["allowed_engines"]})
        for stage in stages:
            requirement = trust.allowed_engines.get(stage.engine)
            if requirement is None or requirement.minimum_certification != stage.minimum_certification:
                raise ValueError("stage engine requirement must match allowed_engines")
        pair_id = data["pair_id"]
        return cls(
            schema_version=data["schema_version"],
            task_id=_text(data["task_id"], "task_id"),
            task_class=_text(data["task_class"], "task_class"),
            objective=_text(data["objective"], "objective"),
            hypothesis=_text(data["hypothesis"], "hypothesis"),
            acceptance_criteria=_text(data["acceptance_criteria"], "acceptance criteria"),
            primary_metric=_text(data["primary_metric"], "primary metric"),
            execution_mode=data["execution_mode"],
            budget=HardeningBudget.from_dict(data["budget"]),
            engine_trust_policy=trust,
            stages=stages,
            grading=grading,
            reality_ladder_artifact_hash=_text(data["reality_ladder_artifact_hash"], "Reality Ladder hash"),
            pair_id=None if pair_id is None else _text(pair_id, "pair_id"),
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
            "experiment_catalog": [item.catalog_dict() for item in self.stages],
            "reality_ladder_artifact_hash": self.reality_ladder_artifact_hash,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            **{key: value for key, value in self.public_dict().items() if key != "experiment_catalog"},
            "task_class": self.task_class,
            "pair_id": self.pair_id,
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
class HardeningSuite:
    suite_id: str
    research_question: str
    tasks: tuple[HardeningTask, ...]
    certification_artifact_hash: str
    reality_ladder_artifact_hash: str
    supersedes_suite_hash: str
    schema_version: str = SUITE_VERSION

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "HardeningSuite":
        data = _exact(value, {
            "schema_version", "suite_id", "research_question",
            "certification_artifact_hash", "reality_ladder_artifact_hash",
            "supersedes_suite_hash", "tasks",
        }, "hardening suite")
        if data["schema_version"] != SUITE_VERSION:
            raise ValueError("unsupported hardening suite schema")
        tasks = tuple(HardeningTask.from_dict(item) for item in data["tasks"])
        if len(tasks) != 12 or len({task.task_id for task in tasks}) != 12:
            raise ValueError("v0.2.5.1 suite requires exactly twelve unique tasks")
        ladder_hash = _text(data["reality_ladder_artifact_hash"], "suite ladder hash")
        if any(task.reality_ladder_artifact_hash != ladder_hash for task in tasks):
            raise ValueError("every task must bind the suite Reality Ladder artifact")
        pair_counts: dict[str, int] = {}
        for task in tasks:
            if task.pair_id:
                pair_counts[task.pair_id] = pair_counts.get(task.pair_id, 0) + 1
        if not pair_counts or any(count != 2 for count in pair_counts.values()):
            raise ValueError("paired cases must occur in exact pairs")
        return cls(
            schema_version=data["schema_version"],
            suite_id=_text(data["suite_id"], "suite_id"),
            research_question=_text(data["research_question"], "research question"),
            tasks=tasks,
            certification_artifact_hash=_text(data["certification_artifact_hash"], "certification hash"),
            reality_ladder_artifact_hash=ladder_hash,
            supersedes_suite_hash=_text(data["supersedes_suite_hash"], "superseded suite hash"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "suite_id": self.suite_id,
            "research_question": self.research_question,
            "certification_artifact_hash": self.certification_artifact_hash,
            "reality_ladder_artifact_hash": self.reality_ladder_artifact_hash,
            "supersedes_suite_hash": self.supersedes_suite_hash,
            "tasks": [task.to_dict() for task in self.tasks],
        }

    @property
    def suite_hash(self) -> str:
        return canonical_sha256(self.to_dict())


def load_hardening_suite(path: str | Path) -> HardeningSuite:
    return HardeningSuite.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


__all__ = [
    "EvidenceRequirement", "EvidenceStatus", "GradingContract", "HardeningBudget",
    "HardeningSuite", "HardeningTask", "ModelIdentity", "OracleResources",
    "SCHEMA_VERSION", "STAGE_TOOLS", "SUITE_VERSION", "StageEvidence", "Verdict",
    "load_hardening_suite",
]
