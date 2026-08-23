"""Evidence-backed evaluation for coding-agent research runs."""

from src.eval.metrics import EvaluationThresholds, build_evaluation_report
from src.eval.models import (
    AttemptRecord,
    EvaluationDataError,
    load_attempt_records,
)
from src.eval.report import render_markdown_report, write_evaluation_report

__all__ = [
    "AttemptRecord",
    "EvaluationDataError",
    "EvaluationThresholds",
    "build_evaluation_report",
    "load_attempt_records",
    "render_markdown_report",
    "write_evaluation_report",
]
