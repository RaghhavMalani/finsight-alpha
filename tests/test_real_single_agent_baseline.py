import json
from dataclasses import replace
from pathlib import Path

import pytest

from scripts.build_real_single_agent_suite import build_suite
from src.behavioral import (
    BehavioralToolPlane,
    BehavioralVerifier,
    BudgetExceeded,
    ModelIdentity,
    ModelTurn,
    SingleResearchAgent,
    LiveBaselineRunner,
    load_behavioral_suite,
    summarize_verifications,
    verify_baseline_artifact,
)
from src.eval.canonical import canonical_sha256
from src.execution.trust import CertificationIndex


ROOT = Path(__file__).resolve().parents[1]
SUITE_PATH = ROOT / "eval/tasks/forge_v0_2_5/suite.json"
CERTIFICATION_PATH = ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json"
REALITY_LADDER_PATH = ROOT / "eval/reality_ladder/forge_v0_2_4_1/reality_ladder_artifact.json"


class ScriptedClient:
    model_kind = "test_double"

    def __init__(self, actions):
        self.actions = list(actions)
        self.requests = []

    def complete(
        self, messages, *, identity, seed, max_output_tokens, max_cost_usd
    ):
        self.requests.append(tuple(dict(item) for item in messages))
        action = self.actions.pop(0)
        return ModelTurn(
            text=json.dumps(action, sort_keys=True, separators=(",", ":")),
            tokens_in=80,
            tokens_out=20,
            latency_seconds=0.001,
            cost_usd=0.0,
            provider_request_id=f"test-{len(self.requests)}",
        )


class FixtureLiveClient:
    model_kind = "live"

    def __init__(self, action_map):
        self.action_map = action_map

    def complete(
        self, messages, *, identity, seed, max_output_tokens, max_cost_usd
    ):
        task = json.loads(messages[1]["content"].removeprefix("TASK "))
        turn_index = sum(item["role"] == "assistant" for item in messages)
        action = self.action_map[task["task_id"]][turn_index]
        return ModelTurn(
            text=json.dumps(action, sort_keys=True, separators=(",", ":")),
            tokens_in=40,
            tokens_out=10,
            latency_seconds=0.0,
            cost_usd=min(0.0001, max_cost_usd),
            provider_request_id=f"fixture-{identity.model}-{seed}-{turn_index}",
        )


class OverspendingLiveClient:
    model_kind = "live"

    def complete(
        self, messages, *, identity, seed, max_output_tokens, max_cost_usd
    ):
        return ModelTurn(
            text=json.dumps(_action("research.inspect_hypothesis")),
            tokens_in=1,
            tokens_out=1,
            latency_seconds=0.0,
            cost_usd=max_cost_usd + 0.01,
        )


IDENTITY = ModelIdentity(
    provider="test",
    model="scripted",
    model_version="1",
    model_kind="test_double",
    temperature=0.0,
    seed_supported=True,
    input_usd_per_million_tokens=0.0,
    output_usd_per_million_tokens=0.0,
)


def _action(name, **arguments):
    return {"action": name, "arguments": arguments}


def _optimal_actions(task):
    actions = [_action("research.inspect_hypothesis")]
    for stage in task.stages:
        actions.append(_action(stage.tool))
        if stage.stage == task.grading.required_stage:
            break
    actions.append(
        _action(
            "research.submit",
            verdict=task.grading.expected_verdict.value,
            reason="The observed evidence satisfies the declared decision rule.",
        )
    )
    return actions


@pytest.fixture(scope="module")
def suite():
    return load_behavioral_suite(SUITE_PATH)


@pytest.fixture(scope="module")
def certifications():
    return CertificationIndex.load(CERTIFICATION_PATH)


def test_suite_is_byte_reproducible_and_bound_to_frozen_artifacts(suite):
    expected = json.dumps(build_suite(), indent=2, sort_keys=True) + "\n"
    assert SUITE_PATH.read_text(encoding="utf-8") == expected
    certification = json.loads(CERTIFICATION_PATH.read_text(encoding="utf-8"))
    ladder = json.loads(REALITY_LADDER_PATH.read_text(encoding="utf-8"))
    assert suite.certification_artifact_hash == certification["artifact_hash"]
    assert suite.reality_ladder_artifact_hash == ladder["artifact_hash"]
    assert len(suite.tasks) == 6


def test_paired_cases_have_same_screen_and_different_real_outcomes(suite):
    paired = suite.tasks[1:4]
    assert {task.stages[0].metrics["sharpe"] for task in paired} == {2.0}
    assert [task.stages[-1].metrics["sharpe"] for task in paired] == [0.05, 0.2, 1.2]
    assert [task.grading.expected_verdict.value for task in paired] == [
        "REJECT", "REJECT", "ACCEPT"
    ]


def test_all_six_optimal_single_agent_paths_verify(suite, certifications):
    verifier = BehavioralVerifier(certifications)
    rows = []
    expected_runs = [1, 4, 5, 5, 1, 1]
    for task, engine_runs in zip(suite.tasks, expected_runs, strict=True):
        client = ScriptedClient(_optimal_actions(task))
        run = SingleResearchAgent(client, IDENTITY, certifications).run(task, seed=7)
        result = verifier.verify(task, run)
        assert result.verified_research_success, (task.task_id, result.checks)
        assert run.usage["engine_runs"] == engine_runs
        exposed = json.dumps(client.requests[0], sort_keys=True)
        assert "grading" not in exposed
        assert "expected_verdict" not in exposed
        assert task.task_class not in exposed
        rows.append((result, run))
    summary = summarize_verifications(rows)
    assert summary["verified_research_success_rate"] == 1.0
    assert summary["false_alpha_acceptance_rate"] == 0.0
    assert summary["correct_rejection_rate"] == 1.0
    assert summary["correct_acceptance_rate"] == 1.0
    assert summary["abstention_accuracy"] == 1.0
    assert summary["critical_gate_failure_rate"] == 0.0


def test_uncertified_engine_is_refused_before_evidence_or_run(suite, certifications):
    task = suite.tasks[-1]
    plane = BehavioralToolPlane(task, certifications)
    plane.call("research.inspect_hypothesis")
    plane.call("research.run_screen")
    result = plane.call("research.promote_event_replay")
    assert result["status"] == "REFUSED"
    assert result["engine"] == "hftbacktest"
    assert "metrics" not in result
    assert plane.engine_runs == 1


def test_engine_budget_fails_before_second_execution(suite, certifications):
    task = suite.tasks[1]
    budget = replace(task.budget, max_engine_runs=1, max_high_fidelity_runs=1)
    constrained = replace(task, budget=budget)
    plane = BehavioralToolPlane(constrained, certifications)
    plane.call("research.inspect_hypothesis")
    plane.call("research.run_screen")
    with pytest.raises(BudgetExceeded, match="max_engine_runs"):
        plane.call("research.promote_event_replay")
    assert plane.engine_runs == 1


def test_tool_and_high_fidelity_budgets_fail_closed(suite, certifications):
    task = suite.tasks[2]
    tool_limited = replace(task, budget=replace(task.budget, max_tool_calls=1))
    plane = BehavioralToolPlane(tool_limited, certifications)
    plane.call("research.inspect_hypothesis")
    with pytest.raises(BudgetExceeded, match="max_tool_calls"):
        plane.call("research.run_screen")

    high_limited = replace(
        task, budget=replace(task.budget, max_high_fidelity_runs=1)
    )
    plane = BehavioralToolPlane(high_limited, certifications)
    plane.call("research.inspect_hypothesis")
    for stage in high_limited.stages[:-1]:
        plane.call(stage.tool)
    with pytest.raises(BudgetExceeded, match="max_high_fidelity_runs"):
        plane.call(high_limited.stages[-1].tool)
    assert plane.high_fidelity_runs == 1


def test_false_alpha_acceptance_is_a_first_class_failure(suite, certifications):
    task = suite.tasks[0]
    actions = [
        _action("research.inspect_hypothesis"),
        _action("research.run_screen"),
        _action("research.submit", verdict="ACCEPT", reason="Headline Sharpe is enough."),
    ]
    run = SingleResearchAgent(ScriptedClient(actions), IDENTITY, certifications).run(task, seed=1)
    result = BehavioralVerifier(certifications).verify(task, run)
    assert not result.verified_research_success
    assert result.false_alpha_acceptance
    assert result.behavioral_score == -1.0
    assert not result.checks["verdict"]


def test_brute_force_every_stage_fails_efficient_routing(suite, certifications):
    task = suite.tasks[0]
    actions = [_action("research.inspect_hypothesis")]
    actions.extend(_action(stage.tool) for stage in task.stages)
    actions.append(
        _action("research.submit", verdict="REJECT", reason="Ran every available test.")
    )
    run = SingleResearchAgent(
        ScriptedClient(actions), IDENTITY, certifications
    ).run(task, seed=5)
    result = BehavioralVerifier(certifications).verify(task, run)
    assert not result.verified_research_success
    assert not result.checks["efficient_routing"]
    assert result.unnecessary_high_fidelity_promotion


def test_posthoc_decision_substitution_breaks_binding(suite, certifications):
    task = suite.tasks[3]
    run = SingleResearchAgent(
        ScriptedClient(_optimal_actions(task)), IDENTITY, certifications
    ).run(task, seed=2)
    tampered = replace(run, decision={"verdict": "REJECT", "reason": "substituted"})
    result = BehavioralVerifier(certifications).verify(task, tampered)
    assert not result.verified_research_success
    assert not result.checks["decision_binding"]


def test_result_mutation_breaks_action_integrity(suite, certifications):
    task = suite.tasks[0]
    run = SingleResearchAgent(
        ScriptedClient(_optimal_actions(task)), IDENTITY, certifications
    ).run(task, seed=3)
    actions = list(run.actions)
    mutated = dict(actions[1])
    result = dict(mutated["result"])
    result["metrics"] = dict(result["metrics"], sharpe=9.0)
    mutated["result"] = result
    mutated["result_hash"] = canonical_sha256(result)
    actions[1] = mutated
    report = BehavioralVerifier(certifications).verify(
        task, replace(run, actions=tuple(actions))
    )
    assert not report.verified_research_success
    assert not report.checks["trajectory_actions"]


def test_full_54_episode_freeze_and_independent_verification(
    tmp_path, suite, certifications
):
    action_map = {task.task_id: _optimal_actions(task) for task in suite.tasks}
    models = tuple(
        replace(
            IDENTITY,
            provider="fixture-live",
            model=f"tier-{index}",
            model_kind="live",
        )
        for index in range(3)
    )
    output = tmp_path / "baseline"
    manifest = LiveBaselineRunner(
        root=ROOT,
        suite=suite,
        certifications=certifications,
        models=models,
        client_factory=lambda identity: FixtureLiveClient(action_map),
        output=output,
        authorized_total_cost_usd=1.0,
    ).run()
    assert manifest["episodes"] == 54
    assert manifest["metrics"]["verified_research_success_rate"] == 1.0
    report = verify_baseline_artifact(
        output, suite=suite, certifications=certifications, root=ROOT
    )
    assert report == {
        "schema_version": "forge-real-single-agent-verification/0.2.5",
        "valid": True,
        "errors": [],
    }


def test_freeze_rejects_offline_model_identities(tmp_path, suite, certifications):
    models = tuple(replace(IDENTITY, model=f"offline-{index}") for index in range(3))
    with pytest.raises(ValueError, match="live model identities only"):
        LiveBaselineRunner(
            root=ROOT,
            suite=suite,
            certifications=certifications,
            models=models,
            client_factory=lambda identity: ScriptedClient([]),
            output=tmp_path / "forbidden",
            authorized_total_cost_usd=1.0,
        )


def test_provider_overspend_aborts_freeze_and_preserves_checkpoint(
    tmp_path, suite, certifications
):
    models = tuple(
        replace(
            IDENTITY,
            provider="fixture-live",
            model=f"tier-{index}",
            model_kind="live",
        )
        for index in range(3)
    )
    output = tmp_path / "overspend"
    runner = LiveBaselineRunner(
        root=ROOT,
        suite=suite,
        certifications=certifications,
        models=models,
        client_factory=lambda identity: OverspendingLiveClient(),
        output=output,
        authorized_total_cost_usd=0.05,
    )
    with pytest.raises(RuntimeError, match="exceeded the authorized"):
        runner.run()
    checkpoint = tmp_path / ".overspend.checkpoint/episodes.jsonl"
    assert not output.exists()
    assert len(checkpoint.read_text(encoding="utf-8").splitlines()) == 1
