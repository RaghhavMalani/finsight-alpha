"""Command-line entry point for the cross-layer validation suite."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from src.validation.suite import run_validation_suite, write_validation_reports


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate pricing, risk, signal, portfolio, and RAG layers."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPOSITORY_ROOT / "data" / "exports" / "validation",
        help="Directory for validation_report.json and validation_report.md.",
    )
    parser.add_argument(
        "--returns-csv",
        type=Path,
        help="Optional historical returns CSV (return/returns/y_true column).",
    )
    parser.add_argument(
        "--ml-predictions-csv",
        type=Path,
        help="Optional walk-forward classification prediction CSV.",
    )
    parser.add_argument(
        "--rag-question-set",
        type=Path,
        help="Optional hand-labeled RAG question-set JSON.",
    )
    parser.add_argument(
        "--mc-path-counts",
        default="10000,100000,1000000,10000000",
        help="Comma-separated Monte Carlo checkpoints.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    path_counts = tuple(int(value) for value in args.mc_path_counts.split(","))
    report = run_validation_suite(
        repository_root=REPOSITORY_ROOT,
        returns_csv=args.returns_csv,
        ml_predictions_csv=args.ml_predictions_csv,
        rag_question_set=args.rag_question_set,
        mc_path_counts=path_counts,
    )
    json_path, markdown_path = write_validation_reports(report, args.output_dir)
    print(f"overall_status={report['overall_status']}")
    print(f"json={json_path}")
    print(f"markdown={markdown_path}")
    return 0 if report["overall_status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
