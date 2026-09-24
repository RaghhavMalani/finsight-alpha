"""Multi-label failure taxonomy derived from trusted verifier output."""

from __future__ import annotations

from typing import Any, Mapping


FAILURE_LABELS = (
    "TEMPORAL_LEAK",
    "MISSING_EVIDENCE",
    "INVALID_PROVENANCE",
    "NUMERICAL_ERROR",
    "STATISTICAL_ERROR",
    "UNSUPPORTED_CLAIM",
    "SANDBOX_FAILURE",
    "NONDETERMINISM",
    "REPLAY_MISMATCH",
    "TOOL_MISUSE",
    "TASK_MISINTERPRETATION",
    "PREMATURE_SUBMISSION",
    "RESOURCE_EXHAUSTION",
    "ROBUSTNESS_FAILURE",
)


def classify_failure(episode: Mapping[str, Any]) -> tuple[str, ...]:
    if bool(episode.get("verified")):
        return ()
    labels: set[str] = set()
    task_id = str(episode.get("task_id", "")).lower()
    outputs = episode.get("verifier_outputs", ())
    for output in outputs:
        if output.get("status") == "pass":
            continue
        verifier = str(output.get("verifier", ""))
        failed_codes = {
            str(check.get("code", ""))
            for check in output.get("checks", ())
            if not check.get("passed", False)
        }
        if verifier == "temporal":
            labels.add("TEMPORAL_LEAK")
        elif verifier == "evidence":
            labels.add("MISSING_EVIDENCE")
            if any(
                code.startswith(("resolves:", "claim_sources:"))
                for code in failed_codes
            ):
                labels.add("INVALID_PROVENANCE")
            if any(code.startswith("claim_sources:") for code in failed_codes):
                labels.add("UNSUPPORTED_CLAIM")
        elif verifier == "numerical":
            labels.add("NUMERICAL_ERROR")
            if any(token in task_id for token in ("covariance", "var_", "regime")):
                labels.add("STATISTICAL_ERROR")
        elif verifier == "reproducibility":
            labels.update(("NONDETERMINISM", "REPLAY_MISMATCH"))
        elif verifier == "robustness":
            labels.add("ROBUSTNESS_FAILURE")
            if "limitations_declared" in failed_codes:
                labels.add("PREMATURE_SUBMISSION")

    if not episode.get("task_completion", True):
        labels.update(("TASK_MISINTERPRETATION", "PREMATURE_SUBMISSION"))
    if int(episode.get("tool_calls", 0)) == 0:
        labels.add("TOOL_MISUSE")

    trajectory = episode.get("trajectory") or {}
    for action in trajectory.get("actions", ()):
        if action.get("tool") != "experiment.execute_python":
            continue
        for replay in action.get("result", {}).get("value", {}).get("replays", ()):
            termination = str(replay.get("termination_reason", ""))
            status = str(replay.get("status", ""))
            if status not in {"success", "succeeded", "ok"}:
                labels.add("SANDBOX_FAILURE")
            if termination in {"timeout", "memory_limit", "output_limit"}:
                labels.add("RESOURCE_EXHAUSTION")

    return tuple(label for label in FAILURE_LABELS if label in labels)
