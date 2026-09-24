from src.replay.diff import build_causal_diff


def test_causal_replay_diff_reports_first_field_and_downstream_propagation():
    checks = {
        "trajectory_integrity": True,
        "task_identity": True,
        "world_snapshot": True,
        "tool_sequence": False,
        "replay_sandbox": True,
        "artifacts": True,
        "finding": False,
        "verifier_output": False,
        "reward": False,
    }
    result = build_causal_diff(
        checks=checks,
        supplied_trajectory_id="a",
        calculated_trajectory_id="a",
        expected_task={"task_id": "task", "seed": 1},
        actual_task={"task_id": "task", "seed": 1},
        expected_world="world",
        actual_world="world",
        expected_actions=[
            {"tool": "experiment.execute_python", "arguments": {"code": "x = 1"}}
        ],
        actual_actions=[
            {"tool": "experiment.execute_python", "arguments": {"code": "x = 2"}}
        ],
        expected_replays=["replay"],
        actual_replays=["replay"],
        expected_artifacts=[{"content_hash": "a"}],
        actual_artifacts=[{"content_hash": "a"}],
        expected_finding_hash="finding-a",
        actual_finding_hash="finding-b",
        expected_verifiers=[{"verifier": "numerical", "score": 1.0}],
        actual_verifiers=[{"verifier": "numerical", "score": 0.0}],
        expected_reward={"training_reward": 0.9},
        actual_reward={"training_reward": 0.2},
    )
    first = result["first_divergence"]
    assert first["component"] == "tool_sequence"
    assert first["step"] == 1
    assert first["tool"] == "experiment.execute_python"
    assert first["field"] == "actions[0].arguments.code"
    assert result["affected_downstream"] == [
        "finding", "verifier_output", "reward"
    ]
    assert "world_snapshot" in result["unaffected"]


def test_causal_replay_diff_is_empty_for_a_faithful_replay():
    checks = {
        "trajectory_integrity": True,
        "task_identity": True,
        "world_snapshot": True,
        "tool_sequence": True,
        "replay_sandbox": True,
        "artifacts": True,
        "finding": True,
        "verifier_output": True,
        "reward": True,
    }
    result = build_causal_diff(
        checks=checks,
        supplied_trajectory_id="a",
        calculated_trajectory_id="a",
        expected_task={},
        actual_task={},
        expected_world="world",
        actual_world="world",
        expected_actions=[],
        actual_actions=[],
        expected_replays=[],
        actual_replays=[],
        expected_artifacts=[],
        actual_artifacts=[],
        expected_finding_hash="finding",
        actual_finding_hash="finding",
        expected_verifiers=[],
        actual_verifiers=[],
        expected_reward={},
        actual_reward={},
    )
    assert result["first_divergence"] is None
    assert result["affected_downstream"] == []
    assert len(result["unaffected"]) == 9
