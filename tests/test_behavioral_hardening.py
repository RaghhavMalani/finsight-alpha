import json
from dataclasses import replace
from pathlib import Path

import pytest

from scripts.build_behavioral_hardening_suite import RESEARCH_QUESTION, build_suite
from src.behavioral_hardening import (
    BudgetExceeded,
    HardenedSingleResearchAgent,
    HardeningBenchmarkRunner,
    HardeningToolPlane,
    HardeningVerifier,
    ModelIdentity,
    ModelTurn,
    load_hardening_suite,
    summarize_verifications,
    verify_hardening_artifact,
)
from src.execution.trust import CertificationIndex


ROOT = Path(__file__).resolve().parents[1]
SUITE_PATH = ROOT / "eval/tasks/forge_v0_2_5_1/suite.json"
CERTIFICATION_PATH = ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json"


class ScriptedClient:
    model_kind = "test_double"

    def __init__(self, actions):
        self.actions = list(actions)
        self.requests = []

    def complete(self, messages, *, identity, seed, max_output_tokens, max_cost_usd):
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

    def complete(self, messages, *, identity, seed, max_output_tokens, max_cost_usd):
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


def _oracle_actions(task):
    actions = []
    for tool in task.grading.oracle_path:
        if tool == "research.submit":
            actions.append(_action(
                tool,
                verdict=task.grading.expected_verdict.value,
                reason="The minimal observed evidence resolves every declared gate.",
            ))
        else:
            actions.append(_action(tool))
    return actions


@pytest.fixture(scope="module")
def suite():
    return load_hardening_suite(SUITE_PATH)


@pytest.fixture(scope="module")
def certifications():
    return CertificationIndex.load(CERTIFICATION_PATH)


def test_suite_is_reproducible_bound_and_complete(suite):
    assert SUITE_PATH.read_text(encoding="utf-8") == json.dumps(
        build_suite(), indent=2, sort_keys=True
    ) + "\n"
    assert suite.research_question == RESEARCH_QUESTION
    assert len(suite.tasks) == 12
    assert [task.task_class for task in suite.tasks] == [
        "stress_sharpe_passes_survival_fails",
        "stress_sharpe_narrowly_fails",
        "spectacular_sharpe_tiny_sample",
        "mediocre_headline_strong_robustness",
        "certified_engines_disagree_in_scope",
        "engines_outside_capability_intersection",
        "high_sharpe_unacceptable_drawdown",
        "cheap_evidence_decisive",
        "single_affordable_high_value_experiment",
        "required_high_fidelity_evidence_missing",
        "uncertified_engine_attractive_answer",
        "point_estimate_passes_interval_crosses_failure",
    ]


def test_paired_cases_prevent_headline_sharpe_shortcuts(suite):
    pairs = {}
    for task in suite.tasks:
        if task.pair_id:
            pairs.setdefault(task.pair_id, []).append(task)
    assert set(pairs) == {"near_two_sharpe", "headline_vs_robustness"}
    near = pairs["near_two_sharpe"]
    assert [task.stages[0].metrics["sharpe"] for task in near] == [2.08, 2.11]
    assert [task.grading.expected_verdict.value for task in near] == ["REJECT", "ACCEPT"]
    headline = pairs["headline_vs_robustness"]
    assert [task.stages[0].metrics["sharpe"] for task in headline] == [.91, 4.20]
    assert [task.grading.expected_verdict.value for task in headline] == ["ACCEPT", "REJECT"]


def test_all_twelve_oracle_paths_verify_with_zero_regret(suite, certifications):
    verifier = HardeningVerifier(certifications)
    rows = []
    for task in suite.tasks:
        client = ScriptedClient(_oracle_actions(task))
        run = HardenedSingleResearchAgent(client, IDENTITY, certifications).run(task, seed=7)
        result = verifier.verify(task, run)
        assert result.verified_research_success, (task.task_id, result.checks)
        assert result.experiment_selection_regret.zero_regret is True
        assert result.checks["oracle_efficient"]
        exposed = json.dumps(client.requests[0], sort_keys=True)
        assert "grading" not in exposed
        assert "expected_verdict" not in exposed
        assert "oracle_path" not in exposed
        assert task.task_class not in exposed
        rows.append((result, run))
    summary = summarize_verifications(rows)
    assert summary["verified_research_success_rate"] == 1.0
    assert summary["zero_experiment_selection_regret_rate"] == 1.0
    assert summary["mean_usd_regret"] == 0.0
    assert summary["mean_tool_call_regret"] == 0.0
    assert summary["mean_high_fidelity_regret"] == 0.0
    assert summary["mean_wall_time_regret_seconds"] == 0.0


def test_correct_but_wasteful_research_is_verified_and_records_regret(suite, certifications):
    task = suite.tasks[7]
    actions = [_action(stage.tool) for stage in task.stages]
    actions.append(_action("research.submit", verdict="REJECT", reason="The screen was decisive."))
    run = HardenedSingleResearchAgent(
        ScriptedClient(actions), IDENTITY, certifications
    ).run(task, seed=9)
    result = HardeningVerifier(certifications).verify(task, run)
    assert result.verified_research_success
    assert not result.checks["oracle_efficient"]
    assert result.experiment_selection_regret.experiment_cost_usd == pytest.approx(.19)
    assert result.experiment_selection_regret.tool_calls == 4
    assert result.experiment_selection_regret.high_fidelity_runs == 2
    assert result.experiment_selection_regret.wall_seconds == pytest.approx(33.0)


def test_value_of_information_budget_allows_only_one_expensive_run(suite, certifications):
    task = suite.tasks[8]
    plane = HardeningToolPlane(task, certifications)
    plane.call("research.run_screen")
    plane.call("research.run_counterfactual_stress")
    with pytest.raises(BudgetExceeded, match="max_high_fidelity_runs"):
        plane.call("research.run_latency_sensitivity")
    assert plane.high_fidelity_runs == 1
    assert plane.experiment_cost_usd == pytest.approx(.09)


def test_capability_intersection_and_trust_boundary_are_distinct(suite, certifications):
    comparison = suite.tasks[5]
    run = HardenedSingleResearchAgent(
        ScriptedClient(_oracle_actions(comparison)), IDENTITY, certifications
    ).run(comparison, seed=11)
    result = HardeningVerifier(certifications).verify(comparison, run)
    assert result.not_comparable_accurate
    observed = [item for item in run.actions if item["tool"] in {
        "research.run_screen", "research.promote_event_replay"
    }]
    assert {item["result"]["capability_scope"] for item in observed} == {
        "BAR_AGGREGATE", "NATIVE_QUEUE"
    }

    trust = suite.tasks[10]
    plane = HardeningToolPlane(trust, certifications)
    plane.call("research.run_screen")
    refusal = plane.call("research.promote_event_replay")
    assert refusal["status"] == "REFUSED"
    assert "metrics" not in refusal
    assert plane.engine_runs == 1


def test_full_72_episode_fixture_freeze_and_independent_verification(
    tmp_path, suite, certifications
):
    action_map = {task.task_id: _oracle_actions(task) for task in suite.tasks}
    models = tuple(
        replace(
            IDENTITY,
            provider="fixture-live",
            model=f"tier-{index}",
            model_kind="live",
        )
        for index in range(3)
    )
    output = tmp_path / "hardening"
    manifest = HardeningBenchmarkRunner(
        root=ROOT,
        suite=suite,
        certifications=certifications,
        models=models,
        client_factory=lambda identity: FixtureLiveClient(action_map),
        output=output,
        authorized_total_cost_usd=1.0,
    ).run()
    assert manifest["episodes"] == 72
    assert manifest["metrics"]["verified_research_success_rate"] == 1.0
    assert manifest["metrics"]["zero_experiment_selection_regret_rate"] == 1.0
    assert verify_hardening_artifact(
        output, suite=suite, certifications=certifications, root=ROOT
    ) == {
        "schema_version": "forge-behavioral-hardening-verification/0.2.5.1",
        "valid": True,
        "errors": [],
    }


def test_freeze_rejects_offline_identities(tmp_path, suite, certifications):
    models = tuple(replace(IDENTITY, model=f"offline-{index}") for index in range(3))
    with pytest.raises(ValueError, match="live model identities only"):
        HardeningBenchmarkRunner(
            root=ROOT,
            suite=suite,
            certifications=certifications,
            models=models,
            client_factory=lambda identity: ScriptedClient([]),
            output=tmp_path / "forbidden",
            authorized_total_cost_usd=1.0,
        )
