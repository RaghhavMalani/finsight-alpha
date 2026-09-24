"""Strict loader for versioned execution benchmark specifications."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from src.eval.canonical import canonical_sha256
from src.execution.reality_ladder import RealityLevel
from src.execution.trust import EngineTrustPolicy


@dataclass(frozen=True)
class ExecutionTaskBudget:
    max_engine_runs: int
    max_compute_seconds: float

    def __post_init__(self) -> None:
        if type(self.max_engine_runs) is not int or self.max_engine_runs <= 0:
            raise ValueError("max_engine_runs must be a positive integer")
        if type(self.max_compute_seconds) not in {int, float} or self.max_compute_seconds <= 0:
            raise ValueError("max_compute_seconds must be positive")

    def to_dict(self) -> dict[str, Any]:
        return {"max_engine_runs": self.max_engine_runs, "max_compute_seconds": float(self.max_compute_seconds)}


@dataclass(frozen=True)
class ExecutionBenchmarkTask:
    task_id: str
    objective: str
    engines: tuple[str, ...]
    capabilities: tuple[str, ...]
    reality_levels: tuple[RealityLevel, ...]
    primary_metric: str
    required_verifiers: tuple[str, ...]
    budget: ExecutionTaskBudget
    engine_trust_policy: EngineTrustPolicy | None = None
    schema_version: str = "0.2.3"

    def __post_init__(self) -> None:
        for name in ("task_id", "objective", "primary_metric"):
            if not isinstance(getattr(self, name), str) or not getattr(self, name).strip():
                raise ValueError(f"{name} must be a non-empty string")
        for name in ("engines", "capabilities", "required_verifiers"):
            values = getattr(self, name)
            if not values or any(not isinstance(item, str) or not item for item in values):
                raise ValueError(f"{name} must contain non-empty strings")
            if len(values) != len(set(values)):
                raise ValueError(f"{name} must be unique")
        if not self.reality_levels:
            raise ValueError("reality_levels must not be empty")
        if self.schema_version not in {"0.2.3", "0.2.4.1"}:
            raise ValueError("unsupported execution benchmark schema")
        if self.schema_version == "0.2.4.1":
            if self.engine_trust_policy is None:
                raise ValueError("v0.2.4.1 benchmark tasks require allowed_engines")
            if set(self.engines) != set(self.engine_trust_policy.allowed_engines):
                raise ValueError("task engines must exactly match allowed_engines")

    @property
    def task_hash(self) -> str:
        return canonical_sha256(self.to_dict())

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "ExecutionBenchmarkTask":
        data = dict(value)
        base_fields = {
            "schema_version", "task_id", "objective", "engines", "capabilities",
            "reality_levels", "primary_metric", "required_verifiers", "budget",
        }
        fields = base_fields | ({"allowed_engines"} if data.get("schema_version") == "0.2.4.1" else set())
        if set(data) != fields:
            raise ValueError(f"execution task fields must be exactly {sorted(fields)}")
        budget = dict(data["budget"])
        if set(budget) != {"max_engine_runs", "max_compute_seconds"}:
            raise ValueError("execution task budget fields are invalid")
        return cls(
            schema_version=data["schema_version"], task_id=data["task_id"],
            objective=data["objective"], engines=tuple(data["engines"]),
            capabilities=tuple(data["capabilities"]),
            reality_levels=tuple(RealityLevel(item) for item in data["reality_levels"]),
            primary_metric=data["primary_metric"],
            required_verifiers=tuple(data["required_verifiers"]),
            budget=ExecutionTaskBudget(**budget),
            engine_trust_policy=(
                EngineTrustPolicy.from_dict({"allowed_engines": data["allowed_engines"]})
                if "allowed_engines" in data else None
            ),
        )

    def to_dict(self) -> dict[str, Any]:
        value = {
            "schema_version": self.schema_version, "task_id": self.task_id,
            "objective": self.objective, "engines": list(self.engines),
            "capabilities": list(self.capabilities),
            "reality_levels": [item.value for item in self.reality_levels],
            "primary_metric": self.primary_metric,
            "required_verifiers": list(self.required_verifiers),
            "budget": self.budget.to_dict(),
        }
        if self.engine_trust_policy is not None:
            value.update(self.engine_trust_policy.to_dict())
        return value


def load_execution_task(path: str | Path) -> ExecutionBenchmarkTask:
    return ExecutionBenchmarkTask.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


def load_execution_suite(root: str | Path) -> tuple[ExecutionBenchmarkTask, ...]:
    tasks = tuple(load_execution_task(path) for path in sorted(Path(root).glob("*.json")))
    if len(tasks) != 12:
        raise ValueError(f"forge_v0_2_3_execution requires exactly 12 tasks; found {len(tasks)}")
    if len({task.task_id for task in tasks}) != len(tasks):
        raise ValueError("execution benchmark task IDs must be unique")
    return tasks
