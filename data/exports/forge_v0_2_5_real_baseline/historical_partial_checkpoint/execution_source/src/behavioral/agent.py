"""Provider-neutral loop for the v0.2.5 real single research agent."""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass
from typing import Any, Mapping, Protocol, Sequence

from src.behavioral.contracts import BehavioralTask, ModelIdentity
from src.behavioral.tool_plane import BehavioralToolPlane, BudgetExceeded
from src.eval.canonical import canonical_sha256
from src.execution.trust import CertificationIndex


PROMPT_VERSION = "forge-real-single-agent-v0.2.5"


@dataclass(frozen=True)
class ModelTurn:
    text: str
    tokens_in: int
    tokens_out: int
    latency_seconds: float
    cost_usd: float | None = None
    provider_request_id: str | None = None
    api_evidence: Mapping[str, Any] | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.text, str) or (not self.text.strip() and self.api_evidence is None):
            raise ValueError("model turn text must be non-empty")
        for name in ("tokens_in", "tokens_out"):
            value = getattr(self, name)
            if type(value) is not int or value < 0:
                raise ValueError(f"{name} must be an integer >= 0")
        if not math.isfinite(self.latency_seconds) or self.latency_seconds < 0:
            raise ValueError("latency_seconds must be finite and >= 0")
        if self.cost_usd is not None and (
            not math.isfinite(self.cost_usd) or self.cost_usd < 0
        ):
            raise ValueError("cost_usd must be finite and >= 0")


class ModelClient(Protocol):
    """Adapter implemented by each real provider integration."""

    model_kind: str

    def complete(
        self,
        messages: Sequence[Mapping[str, str]],
        *,
        identity: ModelIdentity,
        seed: int,
        max_output_tokens: int,
        max_cost_usd: float,
    ) -> ModelTurn: ...


@dataclass(frozen=True)
class AgentRun:
    task_id: str
    task_hash: str
    world_hash: str
    model_identity: Mapping[str, Any]
    model_identity_hash: str
    seed: int
    prompt_version: str
    system_prompt_hash: str
    tool_schema_hash: str
    certification_artifact_hash: str
    reality_ladder_artifact_hash: str
    actions: tuple[dict[str, Any], ...]
    model_turns: tuple[dict[str, Any], ...]
    decision: dict[str, str] | None
    usage: Mapping[str, Any]
    completed: bool
    failure_reason: str | None
    schema_version: str = "forge-real-single-agent-trajectory/0.2.5"

    @property
    def trajectory_hash(self) -> str:
        return canonical_sha256(self.to_dict(include_hash=False))

    def to_dict(self, *, include_hash: bool = True) -> dict[str, Any]:
        value = {
            "schema_version": self.schema_version,
            "task_id": self.task_id,
            "task_hash": self.task_hash,
            "world_hash": self.world_hash,
            "model_identity": dict(self.model_identity),
            "model_identity_hash": self.model_identity_hash,
            "seed": self.seed,
            "prompt_version": self.prompt_version,
            "system_prompt_hash": self.system_prompt_hash,
            "tool_schema_hash": self.tool_schema_hash,
            "certification_artifact_hash": self.certification_artifact_hash,
            "reality_ladder_artifact_hash": self.reality_ladder_artifact_hash,
            "actions": list(self.actions),
            "model_turns": list(self.model_turns),
            "decision": None if self.decision is None else dict(self.decision),
            "usage": dict(self.usage),
            "completed": self.completed,
            "failure_reason": self.failure_reason,
        }
        if include_hash:
            value["trajectory_hash"] = self.trajectory_hash
        return value

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "AgentRun":
        data = dict(value)
        supplied_hash = data.pop("trajectory_hash", None)
        fields = {
            "schema_version", "task_id", "task_hash", "world_hash", "model_identity",
            "model_identity_hash", "seed", "prompt_version", "system_prompt_hash",
            "tool_schema_hash", "certification_artifact_hash",
            "reality_ladder_artifact_hash", "actions", "model_turns", "decision",
            "usage", "completed", "failure_reason",
        }
        if set(data) != fields:
            raise ValueError(f"trajectory fields must be exactly {sorted(fields)}")
        if data["schema_version"] != "forge-real-single-agent-trajectory/0.2.5":
            raise ValueError("unsupported behavioral trajectory schema")
        run = cls(
            schema_version=data["schema_version"],
            task_id=data["task_id"],
            task_hash=data["task_hash"],
            world_hash=data["world_hash"],
            model_identity=dict(data["model_identity"]),
            model_identity_hash=data["model_identity_hash"],
            seed=data["seed"],
            prompt_version=data["prompt_version"],
            system_prompt_hash=data["system_prompt_hash"],
            tool_schema_hash=data["tool_schema_hash"],
            certification_artifact_hash=data["certification_artifact_hash"],
            reality_ladder_artifact_hash=data["reality_ladder_artifact_hash"],
            actions=tuple(dict(item) for item in data["actions"]),
            model_turns=tuple(dict(item) for item in data["model_turns"]),
            decision=None if data["decision"] is None else dict(data["decision"]),
            usage=dict(data["usage"]),
            completed=data["completed"],
            failure_reason=data["failure_reason"],
        )
        if supplied_hash is not None and supplied_hash != run.trajectory_hash:
            raise ValueError("trajectory hash does not verify")
        return run


def _system_prompt(tool_definitions: Mapping[str, Any]) -> str:
    tools = json.dumps(tool_definitions, sort_keys=True, separators=(",", ":"))
    return (
        "You are the sole FinSight Forge research agent. Decide whether the supplied "
        "alpha hypothesis merits ACCEPT, REJECT, or ABSTAIN. Research is sequential and "
        "budgeted; stop when the evidence resolves the decision. Never infer evidence from "
        "a stage you have not run. An unavailable or refused required experiment supports "
        "ABSTAIN. Return exactly one JSON object per turn with keys action and arguments. "
        "The action must be one of the tools below. Do not include markdown or extra prose. "
        f"Tools: {tools}"
    )


def _parse_action(text: str) -> tuple[str, dict[str, Any]]:
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {"action", "arguments"}:
        raise ValueError("response must contain exactly action and arguments")
    if not isinstance(value["action"], str) or not isinstance(value["arguments"], dict):
        raise ValueError("action must be a string and arguments must be an object")
    return value["action"], dict(value["arguments"])


class SingleResearchAgent:
    """Run one model, without planner or skeptic roles, against one sealed case."""

    def __init__(
        self,
        client: ModelClient,
        identity: ModelIdentity,
        certifications: CertificationIndex,
    ) -> None:
        if getattr(client, "model_kind", None) != identity.model_kind:
            raise ValueError("model client kind must match the frozen model identity")
        self.client = client
        self.identity = identity
        self.certifications = certifications

    def run(
        self,
        task: BehavioralTask,
        *,
        seed: int,
        cost_ceiling_usd: float | None = None,
    ) -> AgentRun:
        if type(seed) is not int or seed < 0:
            raise ValueError("seed must be an integer >= 0")
        cost_limit = task.budget.max_cost_usd
        if cost_ceiling_usd is not None:
            if not math.isfinite(cost_ceiling_usd) or cost_ceiling_usd < 0:
                raise ValueError("cost_ceiling_usd must be finite and >= 0")
            cost_limit = min(cost_limit, cost_ceiling_usd)
        plane = BehavioralToolPlane(task, self.certifications)
        system_prompt = _system_prompt(plane.definitions())
        messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": "TASK " + json.dumps(
                    task.public_dict(), sort_keys=True, separators=(",", ":")
                ),
            },
        ]
        turns: list[dict[str, Any]] = []
        tokens_in = 0
        tokens_out = 0
        inference_cost = 0.0
        failure_reason: str | None = None
        started = time.perf_counter()
        max_model_turns = task.budget.max_tool_calls + 3
        for ordinal in range(1, max_model_turns + 1):
            elapsed = time.perf_counter() - started
            remaining_tokens = task.budget.max_tokens - tokens_in - tokens_out
            if elapsed >= task.budget.max_wall_seconds:
                failure_reason = "max_wall_seconds exhausted"
                break
            remaining_cost = cost_limit - inference_cost
            if remaining_tokens <= 0 or remaining_cost <= 0:
                failure_reason = "model inference budget exhausted"
                break
            try:
                extra = {}
                if getattr(self.client, "enforces_request_budget", False):
                    extra = {"remaining_tokens": remaining_tokens,
                             "remaining_seconds": task.budget.max_wall_seconds - elapsed}
                turn = self.client.complete(
                    tuple(messages), identity=self.identity, seed=seed,
                    max_output_tokens=min(4096, remaining_tokens),
                    max_cost_usd=remaining_cost, **extra,
                )
            except BudgetExceeded as exc:
                failure_reason = f"BUDGET_EXHAUSTED: {exc}"
                break
            except RuntimeError as exc:
                failure_reason = f"PROVIDER_STOPPED: {exc}"
                break
            calculated_cost = (
                turn.tokens_in * self.identity.input_usd_per_million_tokens
                + turn.tokens_out * self.identity.output_usd_per_million_tokens
            ) / 1_000_000
            if turn.api_evidence is not None:
                cached = turn.api_evidence["cached_input_tokens"]
                calculated_cost -= cached * (
                    self.identity.input_usd_per_million_tokens
                    - self.identity.cached_input_usd_per_million_tokens
                ) / 1_000_000
            turn_cost = calculated_cost if turn.cost_usd is None else turn.cost_usd
            tokens_in += turn.tokens_in
            tokens_out += turn.tokens_out
            inference_cost += turn_cost
            turns.append(
                {
                    **({"api_evidence": dict(turn.api_evidence)} if turn.api_evidence is not None else {}),
                    "sequence": ordinal,
                    "text": turn.text,
                    "tokens_in": turn.tokens_in,
                    "tokens_out": turn.tokens_out,
                    "latency_seconds": turn.latency_seconds,
                    "cost_usd": turn_cost,
                    "calculated_cost_usd": calculated_cost,
                    "cost_source": "calculated" if turn.cost_usd is None or turn.api_evidence is not None else "provider",
                    "provider_request_id": turn.provider_request_id,
                }
            )
            messages.append({"role": "assistant", "content": turn.text})
            if time.perf_counter() - started > task.budget.max_wall_seconds:
                failure_reason = "max_wall_seconds exceeded"
                break
            if tokens_in + tokens_out > task.budget.max_tokens:
                failure_reason = "max_tokens exceeded"
                break
            if inference_cost > cost_limit:
                failure_reason = "max_cost_usd exceeded"
                break
            try:
                action, arguments = _parse_action(turn.text)
                result = plane.call(action, arguments)
            except BudgetExceeded as exc:
                failure_reason = str(exc)
                break
            except (json.JSONDecodeError, ValueError, RuntimeError) as exc:
                messages.append(
                    {"role": "user", "content": f"ACTION_ERROR {type(exc).__name__}: {exc}"}
                )
                continue
            messages.append(
                {
                    "role": "user",
                    "content": "TOOL_RESULT "
                    + json.dumps(result, sort_keys=True, separators=(",", ":")),
                }
            )
            if plane.decision is not None:
                break
        elapsed = time.perf_counter() - started
        if plane.decision is None and failure_reason is None:
            failure_reason = "model did not submit a verdict"
        usage = {
            **plane.usage(),
            "model_calls": len(turns),
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "total_tokens": tokens_in + tokens_out,
            "inference_cost_usd": round(inference_cost, 12),
            "wall_seconds": round(elapsed, 6),
            **({"cached_input_tokens": sum(t["api_evidence"]["cached_input_tokens"] for t in turns),
                "reasoning_tokens": sum(t["api_evidence"]["reasoning_tokens"] for t in turns)}
               if turns and all("api_evidence" in t for t in turns) else {}),
        }
        return AgentRun(
            task_id=task.task_id,
            task_hash=task.task_hash,
            world_hash=task.world_hash,
            model_identity=self.identity.to_dict(),
            model_identity_hash=self.identity.identity_hash,
            seed=seed,
            prompt_version=PROMPT_VERSION,
            system_prompt_hash=canonical_sha256(system_prompt),
            tool_schema_hash=plane.tool_schema_hash,
            certification_artifact_hash=self.certifications.artifact_hash,
            reality_ladder_artifact_hash=task.reality_ladder_artifact_hash,
            actions=tuple(item.to_dict() for item in plane.actions),
            model_turns=tuple(turns),
            decision=None if plane.decision is None else plane.decision.to_dict(),
            usage=usage,
            completed=plane.decision is not None and failure_reason is None,
            failure_reason=failure_reason,
        )
