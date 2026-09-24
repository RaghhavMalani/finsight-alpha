"""Grade machine-actionable finding submissions against frozen Forge tasks."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from src.benchmark import BenchmarkRunner, load_benchmark_cases
from src.eval.canonical import canonical_sha256
from src.findings import ResearchFinding
from src.rewards import ResourceUsage


def build_report(tasks: Path, submissions: Path) -> dict:
    runner = BenchmarkRunner()
    rows = []
    for case in load_benchmark_cases(tasks):
        submission_path = submissions / f"{case.task.task_id}.json"
        if not submission_path.exists():
            rows.append(
                {
                    "task_id": case.task.task_id,
                    "status": "missing",
                    "passed": False,
                    "reward": None,
                }
            )
            continue
        document = json.loads(submission_path.read_text(encoding="utf-8"))
        finding_data = document.get("finding", document)
        usage = ResourceUsage.from_dict(document.get("usage") if "finding" in document else None)
        episode = runner.evaluate(
            case,
            ResearchFinding.from_dict(finding_data),
            usage=usage,
        )
        rows.append(
            {
                "task_id": case.task.task_id,
                "status": "graded",
                "passed": episode.passed,
                "reward": episode.reward.reward,
                "episode": episode.to_dict(),
            }
        )
    graded = [row for row in rows if row["status"] == "graded"]
    passed = [row for row in graded if row["passed"]]
    report = {
        "schema_version": "0.1",
        "tasks": len(rows),
        "graded": len(graded),
        "verified": len(passed),
        "verified_rate": len(passed) / len(rows) if rows else None,
        "mean_reward": (
            sum(row["reward"] for row in graded) / len(graded) if graded else None
        ),
        "results": rows,
    }
    report["report_id"] = canonical_sha256(report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tasks", type=Path, default=Path("eval/tasks/forge_v0_1"))
    parser.add_argument("--submissions", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = build_report(args.tasks, args.submissions)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"verified {report['verified']}/{report['tasks']} tasks; "
        f"report_id={report['report_id']}"
    )


if __name__ == "__main__":
    main()
