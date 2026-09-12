"""Selectable, trust-bound experiment plane for Forge v0.2.5.1."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping

from src.behavioral.tool_plane import BudgetExceeded
from src.behavioral_hardening.contracts import HardeningTask, STAGE_TOOLS, Verdict
from src.eval.canonical import canonical_sha256
from src.execution.trust import BoundEngineTrust, CertificationIndex, EngineTrustError


class ToolStatus(str, Enum):
    OK = "OK"
    OBSERVED = "OBSERVED"
    UNAVAILABLE = "UNAVAILABLE"
    REFUSED = "REFUSED"


ACTION_SCHEMAS: dict[str, dict[str, Any]] = {
    "research.inspect_hypothesis": {"required": [], "properties": {}},
    "research.run_screen": {"required": [], "properties": {}},
    "research.promote_event_replay": {"required": [], "properties": {}},
    "research.add_costs": {"required": [], "properties": {}},
    "research.run_latency_sensitivity": {"required": [], "properties": {}},
    "research.run_counterfactual_stress": {"required": [], "properties": {}},
    "research.revise_hypothesis": {
        "required": ["hypothesis"], "properties": {"hypothesis": "string"},
    },
    "research.abandon": {
        "required": ["reason"], "properties": {"reason": "string"},
    },
    "research.submit": {
        "required": ["verdict", "reason"],
        "properties": {
            "verdict": [item.value for item in Verdict],
            "reason": "string",
        },
    },
}


@dataclass(frozen=True)
class ResearchDecision:
    verdict: Verdict
    reason: str

    def to_dict(self) -> dict[str, str]:
        return {"verdict": self.verdict.value, "reason": self.reason}


@dataclass(frozen=True)
class HardeningAction:
    sequence: int
    tool: str
    arguments: Mapping[str, Any]
    status: ToolStatus
    result: Mapping[str, Any]
    engine_run: bool = False
    high_fidelity_run: bool = False
    experiment_cost_usd: float = 0.0
    experiment_wall_seconds: float = 0.0

    @property
    def result_hash(self) -> str:
        return canonical_sha256(self.result)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sequence": self.sequence,
            "tool": self.tool,
            "arguments": dict(self.arguments),
            "status": self.status.value,
            "result": dict(self.result),
            "result_hash": self.result_hash,
            "engine_run": self.engine_run,
            "high_fidelity_run": self.high_fidelity_run,
            "experiment_cost_usd": self.experiment_cost_usd,
            "experiment_wall_seconds": self.experiment_wall_seconds,
        }


class HardeningToolPlane:
    """Expose sealed experiments only after dependencies, trust, and budgets pass."""

    def __init__(self, task: HardeningTask, certifications: CertificationIndex) -> None:
        self.task = task
        self.certifications = certifications
        self.trust = BoundEngineTrust(task.engine_trust_policy, certifications)
        self.actions: list[HardeningAction] = []
        self.decision: ResearchDecision | None = None
        self.tool_calls = 0
        self.engine_runs = 0
        self.high_fidelity_runs = 0
        self.experiment_cost_usd = 0.0
        self.experiment_wall_seconds = 0.0
        self._attempted_stages: set[str] = set()

    @staticmethod
    def definitions() -> dict[str, dict[str, Any]]:
        return {
            name: {
                "required": list(spec["required"]),
                "properties": dict(spec["properties"]),
            }
            for name, spec in ACTION_SCHEMAS.items()
        }

    @property
    def tool_schema_hash(self) -> str:
        return canonical_sha256(self.definitions())

    def _validate_arguments(self, tool: str, arguments: Mapping[str, Any]) -> dict[str, Any]:
        if tool not in ACTION_SCHEMAS:
            raise ValueError(f"unknown hardening tool {tool!r}")
        args = dict(arguments)
        required = set(ACTION_SCHEMAS[tool]["required"])
        if set(args) != required:
            raise ValueError(f"{tool} arguments must be exactly {sorted(required)}")
        for name in required:
            if not isinstance(args[name], str) or not args[name].strip():
                raise ValueError(f"{tool} argument {name!r} must be a non-empty string")
            args[name] = args[name].strip()
        return args

    def _start_call(self) -> None:
        if self.decision is not None:
            raise RuntimeError("no actions are allowed after submission")
        if self.tool_calls >= self.task.budget.max_tool_calls:
            raise BudgetExceeded("max_tool_calls exhausted")
        self.tool_calls += 1

    def _record(
        self,
        tool: str,
        arguments: Mapping[str, Any],
        status: ToolStatus,
        result: Mapping[str, Any],
        *,
        engine_run: bool = False,
        high_fidelity_run: bool = False,
        experiment_cost_usd: float = 0.0,
        experiment_wall_seconds: float = 0.0,
    ) -> dict[str, Any]:
        action = HardeningAction(
            sequence=len(self.actions) + 1,
            tool=tool,
            arguments=dict(arguments),
            status=status,
            result=dict(result),
            engine_run=engine_run,
            high_fidelity_run=high_fidelity_run,
            experiment_cost_usd=round(experiment_cost_usd, 12),
            experiment_wall_seconds=round(experiment_wall_seconds, 6),
        )
        self.actions.append(action)
        return {**action.result, "status": action.status.value, "result_hash": action.result_hash}

    def _stage_call(self, tool: str, arguments: Mapping[str, Any]) -> dict[str, Any]:
        if tool in self._attempted_stages:
            raise ValueError(f"experiment {tool!r} has already been attempted")
        stage = self.task.stage_for_tool(tool)
        missing = set(stage.prerequisites) - self._attempted_stages
        if missing:
            raise ValueError(f"experiment prerequisites not satisfied: {sorted(missing)}")
        self._attempted_stages.add(tool)
        try:
            certified = self.trust.require(stage.engine)
        except EngineTrustError as exc:
            return self._record(
                tool,
                arguments,
                ToolStatus.REFUSED,
                {
                    "stage": stage.stage,
                    "engine": stage.engine,
                    "minimum_certification": stage.minimum_certification,
                    "capability_scope": stage.capability_scope,
                    "reason": str(exc),
                    "certification_artifact_hash": self.certifications.artifact_hash,
                },
            )
        if not stage.available:
            return self._record(
                tool,
                arguments,
                ToolStatus.UNAVAILABLE,
                {
                    "stage": stage.stage,
                    "engine": stage.engine,
                    "minimum_certification": stage.minimum_certification,
                    "capability_scope": stage.capability_scope,
                    "reason": stage.reason,
                    "observations": stage.observations,
                    "evidence_quality": stage.evidence_quality,
                    "semantics": dict(sorted(stage.semantics.items())),
                },
            )
        budget = self.task.budget
        if self.engine_runs >= budget.max_engine_runs:
            raise BudgetExceeded("max_engine_runs exhausted")
        if stage.high_fidelity and self.high_fidelity_runs >= budget.max_high_fidelity_runs:
            raise BudgetExceeded("max_high_fidelity_runs exhausted")
        if self.experiment_cost_usd + stage.experiment_cost_usd > budget.max_experiment_cost_usd + 1e-12:
            raise BudgetExceeded("max_experiment_cost_usd exhausted")
        self.engine_runs += 1
        if stage.high_fidelity:
            self.high_fidelity_runs += 1
        self.experiment_cost_usd += stage.experiment_cost_usd
        self.experiment_wall_seconds += stage.expected_wall_seconds
        return self._record(
            tool,
            arguments,
            ToolStatus.OBSERVED,
            {
                "stage": stage.stage,
                "engine": stage.engine,
                "certification_level": certified.certification_level,
                "minimum_certification": stage.minimum_certification,
                "engine_fingerprint_hash": certified.fingerprint_hash,
                "capability_scope": stage.capability_scope,
                "observations": stage.observations,
                "evidence_quality": stage.evidence_quality,
                "metrics": dict(sorted(stage.metrics.items())),
                "semantics": dict(sorted(stage.semantics.items())),
                "evidence_hash": stage.evidence_hash,
                "execution_mode": self.task.execution_mode,
                "reality_ladder_artifact_hash": self.task.reality_ladder_artifact_hash,
            },
            engine_run=True,
            high_fidelity_run=stage.high_fidelity,
            experiment_cost_usd=stage.experiment_cost_usd,
            experiment_wall_seconds=stage.expected_wall_seconds,
        )

    def call(self, tool: str, arguments: Mapping[str, Any] | None = None) -> dict[str, Any]:
        args = self._validate_arguments(tool, arguments or {})
        self._start_call()
        if tool in STAGE_TOOLS:
            return self._stage_call(tool, args)
        if tool == "research.inspect_hypothesis":
            return self._record(
                tool,
                args,
                ToolStatus.OK,
                {"task": self.task.public_dict(), "task_hash": self.task.task_hash},
            )
        if tool == "research.revise_hypothesis":
            return self._record(tool, args, ToolStatus.OK, {"hypothesis": args["hypothesis"]})
        if tool == "research.abandon":
            return self._record(tool, args, ToolStatus.OK, {"abandoned": True})
        decision = ResearchDecision(Verdict(args["verdict"]), args["reason"])
        self.decision = decision
        return self._record(tool, args, ToolStatus.OK, decision.to_dict())

    def usage(self) -> dict[str, int | float]:
        return {
            "tool_calls": self.tool_calls,
            "engine_runs": self.engine_runs,
            "high_fidelity_runs": self.high_fidelity_runs,
            "experiment_cost_usd": round(self.experiment_cost_usd, 12),
            "experiment_wall_seconds": round(self.experiment_wall_seconds, 6),
        }


__all__ = [
    "ACTION_SCHEMAS", "BudgetExceeded", "HardeningAction", "HardeningToolPlane",
    "ResearchDecision", "ToolStatus",
]
