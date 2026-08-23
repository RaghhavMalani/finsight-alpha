"""Immutable trajectory records collected before any policy learning."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from src.agent.research_agent import ResearchRun
from src.benchmark import BenchmarkCase, EpisodeResult
from src.eval.canonical import canonical_sha256


@dataclass(frozen=True)
class Trajectory:
    task: dict[str, Any]
    world_hash: str
    model: str
    prompt_version: str
    states: tuple[str, ...]
    actions: tuple[dict[str, Any], ...]
    finding: dict[str, Any]
    verifier_outputs: tuple[dict[str, Any], ...]
    reward_components: dict[str, Any]
    usage: dict[str, Any]
    token_usage: int
    compute_cost_usd: float
    latency_seconds: float
    outcome: str
    schema_version: str = "0.2.1"

    @classmethod
    def from_episode(
        cls,
        case: BenchmarkCase,
        research: ResearchRun,
        episode: EpisodeResult,
        *,
        token_usage: int | None = None,
    ) -> "Trajectory":
        usage = research.usage.to_dict()
        resolved_tokens = (
            usage["tokens_in"] + usage["tokens_out"]
            if token_usage is None
            else token_usage
        )
        return cls(
            task=case.task.to_dict(),
            world_hash=case.world.world_id,
            model=research.model,
            prompt_version=research.prompt_version,
            states=research.state_trace,
            actions=tuple(action.to_dict() for action in research.actions),
            finding=research.finding.to_dict(),
            verifier_outputs=tuple(
                result.to_dict() for result in episode.verifier_results
            ),
            reward_components=episode.reward.to_dict(),
            usage=usage,
            token_usage=resolved_tokens,
            compute_cost_usd=research.usage.compute_cost_usd,
            latency_seconds=research.usage.latency_seconds,
            outcome="verified" if episode.passed else "failed_verification",
        )

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "Trajectory":
        data = dict(value)
        data.pop("trajectory_id", None)
        usage = dict(data.get("usage") or {})
        usage.setdefault("latency_seconds", data.get("latency_seconds", 0.0))
        usage.setdefault("compute_cost_usd", data.get("compute_cost_usd", 0.0))
        usage.setdefault("tokens_in", data.get("token_usage", 0))
        usage.setdefault("tokens_out", 0)
        usage.setdefault("tool_calls", len(data.get("actions", [])))
        usage.setdefault("sandbox_executions", 0)
        usage.setdefault("cost_usd", data.get("compute_cost_usd", 0.0))
        return cls(
            task=dict(data["task"]),
            world_hash=data["world_hash"],
            model=data["model"],
            prompt_version=data["prompt_version"],
            states=tuple(data["states"]),
            actions=tuple(dict(item) for item in data["actions"]),
            finding=dict(data["finding"]),
            verifier_outputs=tuple(dict(item) for item in data["verifier_outputs"]),
            reward_components=dict(data["reward_components"]),
            usage=usage,
            token_usage=data.get("token_usage", usage["tokens_in"] + usage["tokens_out"]),
            compute_cost_usd=data.get("compute_cost_usd", usage["compute_cost_usd"]),
            latency_seconds=data.get("latency_seconds", usage["latency_seconds"]),
            outcome=data["outcome"],
            schema_version=data.get("schema_version", "0.2"),
        )

    @property
    def trajectory_id(self) -> str:
        return canonical_sha256(self.to_dict(include_id=False))

    def to_dict(self, *, include_id: bool = True) -> dict[str, Any]:
        value = {
            "schema_version": self.schema_version,
            "task": self.task,
            "world_hash": self.world_hash,
            "model": self.model,
            "prompt_version": self.prompt_version,
            "states": list(self.states),
            "actions": list(self.actions),
            "finding": self.finding,
            "verifier_outputs": list(self.verifier_outputs),
            "reward_components": self.reward_components,
            "usage": self.usage,
            "token_usage": self.token_usage,
            "compute_cost_usd": self.compute_cost_usd,
            "latency_seconds": self.latency_seconds,
            "outcome": self.outcome,
        }
        if include_id:
            value["trajectory_id"] = self.trajectory_id
        return value
