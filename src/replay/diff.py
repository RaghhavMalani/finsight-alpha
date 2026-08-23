"""Provenance-aware first-divergence and downstream replay analysis."""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from src.eval.canonical import canonical_sha256


CHECK_ORDER = (
    "trajectory_integrity",
    "task_identity",
    "world_snapshot",
    "tool_sequence",
    "replay_sandbox",
    "artifacts",
    "finding",
    "verifier_output",
    "reward",
)

DISPLAY = {
    "trajectory_integrity": "trajectory",
    "task_identity": "task",
    "world_snapshot": "world_snapshot",
    "tool_sequence": "tool_sequence",
    "replay_sandbox": "sandbox_replays",
    "artifacts": "artifacts",
    "finding": "finding",
    "verifier_output": "verifier_output",
    "reward": "reward",
}

VOLATILE_FIELDS = {
    "action_hash",
    "execution_id",
    "runtime_ms",
    "peak_memory_mb",
    "termination_reason",
}


def _stable(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _stable(item)
            for key, item in sorted(value.items())
            if key not in VOLATILE_FIELDS
        }
    if isinstance(value, list):
        return [_stable(item) for item in value]
    return value


def _summary(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return {"content_hash": canonical_sha256(_stable(value))}


def _first_path(expected: Any, actual: Any, prefix: str) -> str:
    expected = _stable(expected)
    actual = _stable(actual)
    if type(expected) is not type(actual):
        return prefix
    if isinstance(expected, dict):
        for key in sorted(set(expected) | set(actual)):
            path = f"{prefix}.{key}" if prefix else key
            if key not in expected or key not in actual:
                return path
            if expected[key] != actual[key]:
                return _first_path(expected[key], actual[key], path)
    elif isinstance(expected, list):
        for index in range(max(len(expected), len(actual))):
            path = f"{prefix}[{index}]"
            if index >= len(expected) or index >= len(actual):
                return path
            if expected[index] != actual[index]:
                return _first_path(expected[index], actual[index], path)
    return prefix


def _first_action_divergence(
    expected: Sequence[Mapping[str, Any]], actual: Sequence[Mapping[str, Any]]
) -> dict[str, Any]:
    for index in range(max(len(expected), len(actual))):
        expected_action = expected[index] if index < len(expected) else None
        actual_action = actual[index] if index < len(actual) else None
        if _stable(expected_action) == _stable(actual_action):
            continue
        tool = None
        if expected_action is not None:
            tool = expected_action.get("tool")
        if tool is None and actual_action is not None:
            tool = actual_action.get("tool")
        return {
            "step": index + 1,
            "tool": tool,
            "field": _first_path(
                expected_action, actual_action, f"actions[{index}]"
            ),
            "expected": _summary(expected_action),
            "actual": _summary(actual_action),
        }
    return {
        "step": None,
        "tool": None,
        "field": "actions",
        "expected": _summary(list(expected)),
        "actual": _summary(list(actual)),
    }


def build_causal_diff(
    *,
    checks: Mapping[str, bool],
    supplied_trajectory_id: str,
    calculated_trajectory_id: str,
    expected_task: Mapping[str, Any],
    actual_task: Mapping[str, Any],
    expected_world: str,
    actual_world: str,
    expected_actions: Sequence[Mapping[str, Any]],
    actual_actions: Sequence[Mapping[str, Any]],
    expected_replays: Sequence[str],
    actual_replays: Sequence[str],
    expected_artifacts: Any,
    actual_artifacts: Any,
    expected_finding_hash: str,
    actual_finding_hash: str,
    expected_verifiers: Any,
    actual_verifiers: Any,
    expected_reward: Any,
    actual_reward: Any,
) -> dict[str, Any]:
    pairs = {
        "trajectory_integrity": (
            supplied_trajectory_id,
            calculated_trajectory_id,
            "trajectory_id",
        ),
        "task_identity": (
            expected_task,
            actual_task,
            _first_path(expected_task, actual_task, "task"),
        ),
        "world_snapshot": (expected_world, actual_world, "world_hash"),
        "replay_sandbox": (expected_replays, actual_replays, "replay_hashes"),
        "artifacts": (expected_artifacts, actual_artifacts, "artifacts"),
        "finding": (expected_finding_hash, actual_finding_hash, "finding_hash"),
        "verifier_output": (
            expected_verifiers,
            actual_verifiers,
            _first_path(expected_verifiers, actual_verifiers, "verifier_outputs"),
        ),
        "reward": (
            expected_reward,
            actual_reward,
            _first_path(expected_reward, actual_reward, "reward"),
        ),
    }
    differences: list[dict[str, Any]] = []
    for check in CHECK_ORDER:
        if checks.get(check, False):
            continue
        if check == "tool_sequence":
            detail = _first_action_divergence(expected_actions, actual_actions)
        else:
            expected, actual, field = pairs[check]
            detail = {
                "field": field,
                "expected": _summary(expected),
                "actual": _summary(actual),
            }
        differences.append({"component": DISPLAY[check], **detail})

    if not differences:
        return {
            "first_divergence": None,
            "affected_downstream": [],
            "unaffected": [DISPLAY[check] for check in CHECK_ORDER],
            "differences": [],
            "interpretation": "No replay divergence observed.",
        }
    first_check = next(check for check in CHECK_ORDER if not checks.get(check, False))
    first_index = CHECK_ORDER.index(first_check)
    return {
        "first_divergence": differences[0],
        "affected_downstream": [
            DISPLAY[check]
            for check in CHECK_ORDER[first_index + 1 :]
            if not checks.get(check, False)
        ],
        "unaffected": [
            DISPLAY[check] for check in CHECK_ORDER if checks.get(check, False)
        ],
        "differences": differences,
        "interpretation": (
            "Observed dependency divergence in deterministic replay; this is "
            "provenance propagation, not a randomized causal intervention."
        ),
    }
