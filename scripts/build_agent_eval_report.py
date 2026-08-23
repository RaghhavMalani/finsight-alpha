"""Build FinSight's six-metric coding-agent scorecard from JSONL evidence."""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from src.eval import (
    EvaluationDataError,
    EvaluationThresholds,
    build_evaluation_report,
    load_attempt_records,
    write_evaluation_report,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Calculate replay, contamination, cost, recovery, agreement, and "
            "per-commit regression metrics from strict JSONL evidence."
        )
    )
    parser.add_argument("--input", type=Path, required=True, help="Attempt JSONL.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPOSITORY_ROOT / "data" / "exports" / "agent-eval",
    )
    parser.add_argument("--minimum-replay-runs", type=int, default=5)
    parser.add_argument("--minimum-fault-trials", type=int, default=1)
    parser.add_argument("--minimum-judgments", type=int, default=2)
    parser.add_argument("--minimum-seeds", type=int, default=5)
    parser.add_argument(
        "--require-complete",
        action="store_true",
        help="Exit non-zero when any metric is partial, undefined, or not measured.",
    )
    parser.add_argument(
        "--require-gates",
        action="store_true",
        help="Exit non-zero unless the report is complete and every gate passes.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        source_bytes = args.input.read_bytes()
        records = load_attempt_records(args.input)
        thresholds = EvaluationThresholds(
            minimum_replay_runs=args.minimum_replay_runs,
            minimum_fault_trials=args.minimum_fault_trials,
            minimum_judgments=args.minimum_judgments,
            minimum_seeds=args.minimum_seeds,
        )
        report = build_evaluation_report(
            records,
            thresholds=thresholds,
            source_sha256=hashlib.sha256(source_bytes).hexdigest(),
        )
        json_path, markdown_path = write_evaluation_report(report, args.output_dir)
    except (OSError, EvaluationDataError, ValueError) as exc:
        print(f"agent-eval error: {exc}", file=sys.stderr)
        return 2

    print(f"evaluation_id={report['evaluation_id']}")
    print(f"publication_status={report['publication_status']}")
    print(f"all_gates_passed={str(report['all_gates_passed']).lower()}")
    print(f"json={json_path}")
    print(f"markdown={markdown_path}")
    if args.require_gates and not report["all_gates_passed"]:
        return 1
    if args.require_complete and report["publication_status"] != "complete":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
