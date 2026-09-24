"""Create the immutable 150-episode Forge v0.2 benchmark freeze."""

from __future__ import annotations

import csv
import json
import statistics
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from src.agent.research_agent import ResearchAgent
from src.baseline.profiles import BaselineProfile, PROFILES
from src.benchmark import BenchmarkRunner, load_benchmark_case
from src.eval.canonical import canonical_sha256
from src.rewards import VerifiedRewardModel
from src.trajectories import Trajectory
from src.sandbox.cleanup import remove_runner_tree


BASELINE_TAG = "FORGE_BASELINE_V0_2"
DEFAULT_SEEDS = (0, 1, 2, 3, 4)


def _split_map(path: Path) -> dict[str, str]:
    document = json.loads(path.read_text(encoding="utf-8"))
    values: dict[str, str] = {}
    for split in ("train", "dev", "holdout"):
        for task_id in document[split]:
            if task_id in values:
                raise ValueError(f"task {task_id!r} appears in multiple splits")
            values[task_id] = split
    return values


def _failure_category(results: Iterable[dict[str, Any]]) -> str | None:
    failed = [item["verifier"] for item in results if item["status"] != "pass"]
    return "+".join(failed) if failed else None


def _summary_rows(
    episodes: list[dict[str, Any]],
    key: str,
) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for episode in episodes:
        groups[str(episode[key])].append(episode)
    rows = []
    for name, group in sorted(groups.items()):
        rewards = [float(item["reward"]) for item in group]
        verified = sum(bool(item["verified"]) for item in group)
        total_cost = sum(float(item["costs"]["total_cost_usd"]) for item in group)
        rows.append(
            {
                key: name,
                "episodes": len(group),
                "verified": verified,
                "verified_rate": verified / len(group),
                "mean_reward": statistics.fmean(rewards),
                "reward_variance": statistics.pvariance(rewards),
                "min_reward": min(rewards),
                "max_reward": max(rewards),
                "mean_tool_calls": statistics.fmean(item["tool_calls"] for item in group),
                "mean_wall_clock_seconds": statistics.fmean(
                    item["wall_clock_seconds"] for item in group
                ),
                "total_cost_usd": total_cost,
                "cost_per_verified_finding_usd": total_cost / verified if verified else None,
            }
        )
    return rows


def _reward_analysis(episodes: list[dict[str, Any]]) -> dict[str, Any]:
    verified = [item["reward"] for item in episodes if item["verified"]]
    failed = [item["reward"] for item in episodes if not item["verified"]]
    by_configuration: dict[str, dict[str, float]] = {}
    for configuration in sorted({item["configuration"] for item in episodes}):
        rewards = [
            item["reward"]
            for item in episodes
            if item["configuration"] == configuration
        ]
        by_configuration[configuration] = {
            "variance": statistics.pvariance(rewards),
            "near_perfect_fraction": sum(value > 0.95 for value in rewards) / len(rewards),
        }
    clean_variance = by_configuration["deterministic-scripted"]["variance"]
    failed_mean = statistics.fmean(failed) if failed else None
    saturated = clean_variance < 0.001 or (
        failed_mean is not None and failed_mean > 0.60
    )
    return {
        "overall_variance": statistics.pvariance(item["reward"] for item in episodes),
        "verified_mean_reward": statistics.fmean(verified) if verified else None,
        "failed_mean_reward": failed_mean,
        "failed_min_reward": min(failed) if failed else None,
        "near_perfect_fraction": sum(item["reward"] > 0.95 for item in episodes) / len(episodes),
        "by_configuration": by_configuration,
        "saturation_detected": saturated,
        "recommendation": (
            "Do not use the current scalar reward for learning unchanged; add graded "
            "statistical, citation-quality, and robustness checks plus harder partial-credit tasks."
            if saturated
            else "Reward spread is adequate for the current benchmark slice."
        ),
    }


def _write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(
                json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n"
            )


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        raise ValueError("summary rows must not be empty")
    with path.open("x", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


class BaselineFreezeRunner:
    def __init__(
        self,
        *,
        tasks: Path,
        splits: Path,
        output: Path,
        profiles: tuple[BaselineProfile, ...] = PROFILES,
        seeds: tuple[int, ...] = DEFAULT_SEEDS,
    ) -> None:
        self.tasks = tasks.resolve()
        self.splits = splits.resolve()
        self.output = output.resolve()
        self.profiles = profiles
        self.seeds = seeds

    def run(self) -> dict[str, Any]:
        if self.output.exists():
            raise FileExistsError(
                f"baseline freeze already exists and is immutable: {self.output}"
            )
        task_paths = sorted(self.tasks.glob("*.json"))
        if len(task_paths) != 10:
            raise ValueError(f"expected 10 frozen tasks, found {len(task_paths)}")
        if len(self.seeds) != 5 or len(self.profiles) != 3:
            raise ValueError("v0.2 freeze requires exactly 5 seeds and 3 profiles")
        split_by_task = _split_map(self.splits)
        staging = self.output.with_name(f".{self.output.name}.staging")
        work = self.output.with_name(f".{self.output.name}.work")
        if staging.exists() or work.exists():
            raise FileExistsError("baseline staging/work directory already exists")
        staging.mkdir(parents=True)
        work.mkdir(parents=True)
        episodes: list[dict[str, Any]] = []
        try:
            for profile in self.profiles:
                for seed in self.seeds:
                    for task_path in task_paths:
                        case = load_benchmark_case(task_path, seed_override=seed)
                        started = time.perf_counter()
                        research = ResearchAgent(
                            model=profile.name,
                            finding_transform=profile.transform,
                        ).run(
                            case.task,
                            case.world,
                            sandbox_root=str(
                                work / profile.name / f"seed-{seed}" / case.task.task_id
                            ),
                        )
                        episode = BenchmarkRunner(
                            reward_model=VerifiedRewardModel()
                        ).evaluate(
                            case,
                            research.finding,
                            usage=research.usage,
                            executions=research.executions,
                        )
                        wall_clock = time.perf_counter() - started
                        trajectory = Trajectory.from_episode(case, research, episode)
                        verifier_rows = [item.to_dict() for item in episode.verifier_results]
                        artifact_hashes = sorted(
                            {
                                artifact.content_hash
                                for artifact in research.finding.artifacts
                            }
                        )
                        replay_hashes = [
                            result.reproducibility_hash for result in research.executions
                        ]
                        episodes.append(
                            {
                                "episode_id": episode.episode_id,
                                "task_id": case.task.task_id,
                                "task_hash": case.task.task_hash,
                                "case_hash": case.case_hash,
                                "split": split_by_task[case.task.task_id],
                                "seed": seed,
                                "configuration": profile.name,
                                "model_kind": profile.model_kind,
                                "injected_fault": profile.fault_for(case.task),
                                "reward": episode.reward.reward,
                                "reward_components": episode.reward.to_dict(),
                                "verifiers": {
                                    item.verifier: item.status.value
                                    for item in episode.verifier_results
                                },
                                "verifier_outputs": verifier_rows,
                                "task_completion": True,
                                "verified": episode.passed,
                                "tool_calls": research.usage.tool_calls,
                                "sandbox_executions": len(research.executions),
                                "tokens_in": research.usage.tokens_in,
                                "tokens_out": research.usage.tokens_out,
                                "costs": {
                                    key: value
                                    for key, value in research.usage.to_dict().items()
                                    if key.endswith("cost_usd")
                                },
                                "compute_time_seconds": sum(
                                    result.runtime_ms for result in research.executions
                                ) / 1000.0,
                                "wall_clock_seconds": wall_clock,
                                "trajectory_hash": trajectory.trajectory_id,
                                "artifact_hashes": artifact_hashes,
                                "replay_hashes": replay_hashes,
                                "manifest_hashes": sorted(
                                    {result.manifest_hash for result in research.executions}
                                ),
                                "failure_category": _failure_category(verifier_rows),
                                "usage": research.usage.to_dict(),
                                "trajectory": trajectory.to_dict(),
                            }
                        )
            failures = [episode for episode in episodes if not episode["verified"]]
            task_summary = _summary_rows(episodes, "task_id")
            model_summary = _summary_rows(episodes, "configuration")
            reward_analysis = _reward_analysis(episodes)
            _write_jsonl(staging / "episodes.jsonl", episodes)
            _write_jsonl(staging / "failures.jsonl", failures)
            _write_csv(staging / "task_summary.csv", task_summary)
            _write_csv(staging / "model_summary.csv", model_summary)
            readme = self._readme(episodes, model_summary, reward_analysis)
            (staging / "README.md").write_text(readme, encoding="utf-8", newline="\n")
            artifact_hashes = {
                path.name: canonical_sha256(path.read_text(encoding="utf-8"))
                for path in sorted(staging.iterdir())
            }
            manifest_payload = {
                "schema_version": "0.2.1",
                "tag": BASELINE_TAG,
                "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "tasks": len(task_paths),
                "seeds": list(self.seeds),
                "configurations": [profile.to_dict() for profile in self.profiles],
                "episodes": len(episodes),
                "verified": sum(item["verified"] for item in episodes),
                "reward_variance": statistics.pvariance(
                    item["reward"] for item in episodes
                ),
                "reward_discrimination": reward_analysis,
                "task_source_hashes": {
                    path.name: canonical_sha256(
                        json.loads(path.read_text(encoding="utf-8"))
                    )
                    for path in task_paths
                },
                "split_manifest_hash": canonical_sha256(
                    json.loads(self.splits.read_text(encoding="utf-8"))
                ),
                "cost_accounting": {
                    "inference": "zero: no external model calls",
                    "embedding": "zero: no embedding calls",
                    "retrieval": "zero: in-memory frozen fixtures",
                    "compute": "zero USD: local compute unpriced; seconds recorded",
                    "external_data": "zero: no network or paid data APIs",
                },
                "artifacts": artifact_hashes,
            }
            manifest_payload["baseline_id"] = canonical_sha256(manifest_payload)
            (staging / "manifest.json").write_text(
                json.dumps(manifest_payload, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
                newline="\n",
            )
            staging.rename(self.output)
            return manifest_payload
        except BaseException:
            if staging.exists():
                remove_runner_tree(staging)
            raise
        finally:
            if work.exists():
                remove_runner_tree(work)

    @staticmethod
    def _readme(
        episodes: list[dict[str, Any]],
        model_summary: list[dict[str, Any]],
        reward_analysis: dict[str, Any],
    ) -> str:
        overall_variance = statistics.pvariance(item["reward"] for item in episodes)
        rows = "\n".join(
            f"| {row['configuration']} | {row['verified_rate']:.1%} | "
            f"{row['mean_reward']:.4f} | {row['reward_variance']:.6f} | "
            f"${row['cost_per_verified_finding_usd'] or 0.0:.6f} |"
            for row in model_summary
        )
        return f"""# {BASELINE_TAG}

Immutable FinSight Forge v0.2.1 systems baseline: 10 frozen tasks × 5 seeds ×
3 offline policy configurations = {len(episodes)} episodes.

The weak and strong configurations are deterministic error emulators used to
test reward discrimination. They are not measurements of external LLM quality.
All token and inference costs are exactly zero because no model API was called.
Local compute is unpriced in USD and is reported separately in seconds.

| Configuration | Verified | Mean reward | Reward variance | Cost / verified finding |
| --- | ---: | ---: | ---: | ---: |
{rows}

Overall reward variance: `{overall_variance:.6f}`.

## Reward-discrimination finding

**Saturation detected:** `{reward_analysis['saturation_detected']}`.

- Mean verified reward: `{reward_analysis['verified_mean_reward']:.6f}`
- Mean failed reward: `{reward_analysis['failed_mean_reward']:.6f}`
- Minimum failed reward: `{reward_analysis['failed_min_reward']:.6f}`
- Fraction above 0.95: `{reward_analysis['near_perfect_fraction']:.1%}`

{reward_analysis['recommendation']}

Holdout numerical expectations and verifier implementations never enter the
agent tool plane or sandbox. The sandbox can read only its frozen `input.json`
and can write only content-addressed artifacts.
"""
