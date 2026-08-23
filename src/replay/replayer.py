"""Deterministically replay and compare one content-addressed trajectory."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from src.agent.research_agent import ResearchAgent
from src.baseline import profile_by_name
from src.benchmark import BenchmarkRunner, load_benchmark_case
from src.eval.canonical import canonical_sha256
from src.rewards import ResourceUsage
from src.sandbox.cleanup import remove_runner_tree
from src.trajectories import Trajectory


def _normalized(value: Any) -> Any:
    volatile = {
        "action_hash",
        "execution_id",
        "runtime_ms",
        "peak_memory_mb",
        "termination_reason",
    }
    if isinstance(value, dict):
        return {
            key: _normalized(item)
            for key, item in sorted(value.items())
            if key not in volatile
        }
    if isinstance(value, list):
        return [_normalized(item) for item in value]
    return value


def replay_action_hash(action: Mapping[str, Any]) -> str:
    return canonical_sha256(_normalized(dict(action)))


def find_trajectory(root: Path, trajectory_hash: str) -> dict[str, Any]:
    for path in sorted(root.rglob("*.jsonl")):
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if trajectory_hash not in line:
                    continue
                document = json.loads(line)
                if document.get("trajectory_id") == trajectory_hash:
                    return document
                if document.get("trajectory_hash") == trajectory_hash:
                    trajectory = document.get("trajectory")
                    if isinstance(trajectory, dict):
                        return trajectory
    raise FileNotFoundError(f"trajectory {trajectory_hash!r} was not found below {root}")


def _task_path(repository_root: Path, task_id: str) -> Path:
    for path in sorted((repository_root / "eval" / "tasks").rglob("*.json")):
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if document.get("task", {}).get("task_id") == task_id:
            return path
    raise FileNotFoundError(f"frozen task {task_id!r} was not found")


@dataclass(frozen=True)
class ReplayResult:
    trajectory_id: str
    task_id: str
    world_hash: str
    model: str
    checks: dict[str, bool]
    expected: dict[str, Any]
    actual: dict[str, Any]

    @property
    def fidelity(self) -> float:
        return sum(self.checks.values()) / len(self.checks) if self.checks else 0.0

    @property
    def matched(self) -> bool:
        return all(self.checks.values())

    def to_dict(self) -> dict[str, Any]:
        return {
            "trajectory_id": self.trajectory_id,
            "task_id": self.task_id,
            "world_hash": self.world_hash,
            "model": self.model,
            "checks": self.checks,
            "expected": self.expected,
            "actual": self.actual,
            "fidelity": self.fidelity,
            "matched": self.matched,
        }


class TrajectoryReplayer:
    def __init__(self, repository_root: str | Path) -> None:
        self.repository_root = Path(repository_root).resolve()

    def replay_document(
        self,
        document: Mapping[str, Any],
        *,
        work_root: str | Path,
    ) -> ReplayResult:
        supplied_id = str(document.get("trajectory_id", ""))
        trajectory = Trajectory.from_dict(document)
        task_id = str(trajectory.task["task_id"])
        seed = int(trajectory.task["seed"])
        task_path = _task_path(self.repository_root, task_id)
        case = load_benchmark_case(task_path, seed_override=seed)
        profile = profile_by_name(trajectory.model)
        target = Path(work_root).resolve()
        if target.exists():
            raise FileExistsError(f"replay work root already exists: {target}")
        target.mkdir(parents=True)
        try:
            research = ResearchAgent(
                model=trajectory.model,
                finding_transform=profile.transform,
            ).run(case.task, case.world, sandbox_root=str(target / "sandbox"))
            recorded_usage = ResourceUsage.from_dict(trajectory.usage)
            episode = BenchmarkRunner().evaluate(
                case,
                research.finding,
                usage=recorded_usage,
                executions=research.executions,
            )
            actual_actions = [action.to_dict() for action in research.actions]
            expected_action_hashes = [
                replay_action_hash(action) for action in trajectory.actions
            ]
            actual_action_hashes = [
                replay_action_hash(action) for action in actual_actions
            ]
            expected_replays = [
                replay["reproducibility_hash"]
                for action in trajectory.actions
                if action["tool"] == "experiment.execute_python"
                for replay in action["result"]["value"]["replays"]
            ]
            actual_replays = [
                result.reproducibility_hash for result in research.executions
            ]
            expected_artifacts = trajectory.finding.get("artifacts", [])
            actual_artifacts = research.finding.to_dict().get("artifacts", [])
            expected_finding_hash = canonical_sha256(trajectory.finding)
            actual_finding_hash = research.finding.finding_hash
            actual_verifiers = [item.to_dict() for item in episode.verifier_results]
            actual_reward = episode.reward.to_dict()
            checks = {
                "trajectory_integrity": supplied_id == trajectory.trajectory_id,
                "task_identity": case.task.to_dict() == trajectory.task,
                "world_snapshot": case.world.world_id == trajectory.world_hash,
                "replay_sandbox": expected_replays == actual_replays,
                "tool_sequence": expected_action_hashes == actual_action_hashes,
                "artifacts": expected_artifacts == actual_artifacts,
                "finding": expected_finding_hash == actual_finding_hash,
                "verifier_output": list(trajectory.verifier_outputs) == actual_verifiers,
                "reward": trajectory.reward_components == actual_reward,
            }
            return ReplayResult(
                trajectory_id=supplied_id or trajectory.trajectory_id,
                task_id=task_id,
                world_hash=case.world.world_id,
                model=trajectory.model,
                checks=checks,
                expected={
                    "action_hashes": expected_action_hashes,
                    "replay_hashes": expected_replays,
                    "finding_hash": expected_finding_hash,
                    "reward": trajectory.reward_components,
                },
                actual={
                    "action_hashes": actual_action_hashes,
                    "replay_hashes": actual_replays,
                    "finding_hash": actual_finding_hash,
                    "reward": actual_reward,
                },
            )
        finally:
            if target.exists():
                remove_runner_tree(target)

    def replay_hash(
        self,
        trajectory_hash: str,
        *,
        search_root: str | Path,
        work_root: str | Path,
    ) -> ReplayResult:
        document = find_trajectory(Path(search_root), trajectory_hash)
        return self.replay_document(document, work_root=work_root)
