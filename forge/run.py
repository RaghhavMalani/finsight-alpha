"""Run one frozen benchmark task through the single Forge research agent."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from src.agent.research_agent import ResearchAgent
from src.benchmark import BenchmarkRunner, load_benchmark_case
from src.trajectories import Trajectory, TrajectoryStore


def resolve_task(value: str, repository_root: Path) -> Path:
    requested = Path(value)
    candidates = (
        requested,
        requested.with_suffix(".json"),
        repository_root / "eval" / "tasks" / requested,
        (repository_root / "eval" / "tasks" / requested).with_suffix(".json"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError(f"could not resolve frozen Forge task {value!r}")


def run_task(
    *,
    task_path: Path,
    model: str,
    output_root: Path,
) -> tuple[Trajectory, dict]:
    case = load_benchmark_case(task_path)
    sandbox_root = output_root / ".sandbox" / case.task.task_id
    research = ResearchAgent(model=model).run(
        case.task,
        case.world,
        sandbox_root=str(sandbox_root),
    )
    episode = BenchmarkRunner().evaluate(
        case,
        research.finding,
        usage=research.usage,
        executions=research.executions,
    )
    trajectory = Trajectory.from_episode(case, research, episode)
    run_root = output_root / case.task.task_id / trajectory.trajectory_id
    run_root.mkdir(parents=True, exist_ok=True)
    (run_root / "finding.json").write_text(
        json.dumps(research.finding.to_dict(), indent=2) + "\n",
        encoding="utf-8",
    )
    report = episode.to_dict()
    report["trajectory_id"] = trajectory.trajectory_id
    report["manifest_hashes"] = sorted(
        {result.manifest_hash for result in research.executions}
    )
    (run_root / "episode.json").write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )
    TrajectoryStore(run_root / "trajectory.jsonl").append(trajectory)
    return trajectory, report


def _print_report(trajectory: Trajectory, report: dict) -> None:
    rows = [
        ("TASK", report["task_id"]),
        ("WORLD", report["world_id"][:12] + "..."),
        ("TRAJECTORY", trajectory.trajectory_id[:12] + "..."),
        ("FINDING", report["finding_hash"][:12] + "..."),
        ("", ""),
    ]
    rows.extend(
        (
            result["verifier"].title(),
            result["status"].upper(),
        )
        for result in report["verifier_results"]
    )
    rows.extend(
        (
            ("", ""),
            ("Reward", f"{report['reward']['reward']:.3f}"),
            ("Cost", f"${report['usage']['cost_usd']:.2f}"),
            ("Tool calls", str(report["usage"]["tool_calls"])),
            ("Runtime", f"{report['usage']['latency_seconds']:.3f}s"),
        )
    )
    for label, value in rows:
        print(f"{label:<20}{value}")


def main() -> None:
    repository_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", required=True)
    parser.add_argument("--agent", default="research-agent", choices=("research-agent",))
    parser.add_argument("--model", default="deterministic-baseline")
    parser.add_argument("--seed", type=int)
    parser.add_argument(
        "--output",
        type=Path,
        default=repository_root / "data" / "exports" / "forge-v0.2",
    )
    args = parser.parse_args()
    task_path = resolve_task(args.task, repository_root)
    case = load_benchmark_case(task_path)
    if args.seed is not None and args.seed != case.task.seed:
        parser.error(
            f"seed {args.seed} does not match frozen task seed {case.task.seed}"
        )
    trajectory, report = run_task(
        task_path=task_path,
        model=args.model,
        output_root=args.output.resolve(),
    )
    _print_report(trajectory, report)
    if not report["passed"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
