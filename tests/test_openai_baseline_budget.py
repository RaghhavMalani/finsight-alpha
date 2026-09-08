"""Offline provider fixtures: no API credentials or paid calls used by these tests."""
import json
from dataclasses import replace
from types import SimpleNamespace
from pathlib import Path

import pytest

from src.behavioral.openai_api import (
    OpenAIClient, SpendLedger, OpenAIFactory, frozen_models, MODEL_CAPS,
    token_cost, ledger_state, input_bound, append_event, verify_api_evidence,
)
from src.behavioral import LiveBaselineRunner, SingleResearchAgent, BehavioralVerifier
from src.behavioral.contracts import load_behavioral_suite
from src.behavioral.tool_plane import BudgetExceeded
from src.execution.trust import CertificationIndex

ROOT = Path(__file__).resolve().parents[1]
MESSAGES = [{"role": "user", "content": "Return a JSON action."}]


def response(request, content=None, inputs=1000, cached=100, outputs=100, reasoning=50):
    raw = {"id": "chatcmpl-fixture", "model": request["model"], "service_tier": "default",
           "choices": [{"message": {"content": content or json.dumps({"action": "research.run_screen", "arguments": {}})}}],
           "usage": {"prompt_tokens": inputs, "completion_tokens": outputs,
                     "total_tokens": inputs + outputs,
                     "prompt_tokens_details": {"cached_tokens": cached},
                     "completion_tokens_details": {"reasoning_tokens": reasoning}}}
    return SimpleNamespace(status_code=200, content=json.dumps(raw).encode(), headers={"x-request-id": "req-fixture"})


def call(client, identity=None, **kwargs):
    return client.complete(MESSAGES, identity=identity or frozen_models()[0], seed=101,
        max_output_tokens=4096, max_cost_usd=kwargs.get("cost", 1),
        remaining_tokens=kwargs.get("tokens", 30000), remaining_seconds=180)


def test_cached_and_reasoning_usage_recorded_without_double_count(tmp_path):
    calls = []
    def transport(url, **kwargs):
        calls.append(kwargs)
        return response(kwargs["json"])
    ledger = SpendLedger(tmp_path / "requests.jsonl")
    turn = call(OpenAIClient(ledger, "fixture-secret", transport))
    assert turn.cost_usd == token_cost(frozen_models()[0], 1000, 100, 100)
    assert turn.api_evidence["reasoning_tokens"] == 50
    assert "seed" not in calls[0]["json"] and "temperature" not in calls[0]["json"]
    assert calls[0]["json"]["reasoning_effort"] == "medium"
    assert calls[0]["allow_redirects"] is False
    assert "fixture-secret" not in ledger.path.read_text()
    pending, settled, costs = ledger_state(ledger.path)
    assert not pending and len(settled) == 1
    assert float(sum(costs.values())) == turn.cost_usd


def test_budget_refusal_happens_before_network(tmp_path):
    calls = []
    client = OpenAIClient(SpendLedger(tmp_path / "ledger"), "fixture", lambda *a, **kw: calls.append(kw))
    with pytest.raises(BudgetExceeded):
        call(client, cost=0.00001)
    with pytest.raises(BudgetExceeded):
        call(client, tokens=10)
    assert calls == []
    assert not client.ledger.path.exists()


def test_model_allowance_is_not_refilled_from_other_tiers(tmp_path):
    ledger = SpendLedger(tmp_path / "ledger")
    key = ledger.reserve("gpt-5.6-luna", 0.499, {}, 1)
    ledger.settle(key, "gpt-5.6-luna", 0.499, {})
    with pytest.raises(BudgetExceeded):
        ledger.reserve("gpt-5.6-luna", 0.002, {}, 1)
    # Other allowances remain available, but cannot be transferred to Luna.
    key = ledger.reserve("gpt-5.6-terra", 0.1, {}, 1)
    ledger.settle(key, "gpt-5.6-terra", 0.1, {})


def test_timeout_keeps_reservation_and_no_retry(tmp_path):
    calls = []
    def timeout(*args, **kwargs):
        calls.append(kwargs)
        raise TimeoutError("provider timed out")
    client = OpenAIClient(SpendLedger(tmp_path / "ledger"), "fixture", timeout)
    with pytest.raises(RuntimeError):
        call(client)
    pending, settled, costs = ledger_state(client.ledger.path)
    assert len(pending) == 1 and not settled and sum(costs.values()) > 0
    with pytest.raises(RuntimeError, match="unresolved"):
        call(client)
    assert len(calls) == 1


@pytest.mark.parametrize("status,body", [(429, b'{}'), (200, b'{'), (200, b'{"usage":{}}')])
def test_http_and_malformed_usage_fail_closed(tmp_path, status, body):
    client = OpenAIClient(SpendLedger(tmp_path / "ledger"), "fixture",
        lambda *a, **kw: SimpleNamespace(status_code=status, content=body, headers={}))
    with pytest.raises(RuntimeError):
        call(client)
    assert len(ledger_state(client.ledger.path)[0]) == 1
    assert len(list((tmp_path / "responses").iterdir())) == 1


def test_tier_estimate_blocks_before_client_creation(tmp_path):
    factory = OpenAIFactory(tmp_path, "fixture")
    records = [{"run": {"completed": True, "model_turns": [],
                         "usage": {"tokens_in": 0, "tokens_out": 30000}}}]
    with pytest.raises(BudgetExceeded, match="tier estimate"):
        factory.before_tier(frozen_models()[2], records, 18)
    assert not factory.ledger.path.exists()


def test_usage_tampering_is_rejected(tmp_path):
    client = OpenAIClient(SpendLedger(tmp_path / "ledger"), "fixture", lambda *a, **kw: response(kw["json"]))
    turn = call(client)
    record = dict(api_evidence=dict(turn.api_evidence), provider_request_id=turn.provider_request_id,
                  tokens_in=turn.tokens_in, tokens_out=turn.tokens_out, text=turn.text,
                  cost_usd=turn.cost_usd, calculated_cost_usd=turn.cost_usd)
    assert verify_api_evidence(frozen_models()[0], record)
    record["api_evidence"]["reasoning_tokens"] += 1
    assert not verify_api_evidence(frozen_models()[0], record)


def test_frozen_54_grid_with_fake_http_and_independent_verifier(tmp_path):
    suite = load_behavioral_suite(ROOT / "eval/tasks/forge_v0_2_5/suite.json")
    cert = CertificationIndex.load(ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json")
    action_map = {}
    for task in suite.tasks:
        actions = [{"action": "research.inspect_hypothesis", "arguments": {}}]
        for stage in task.stages:
            actions.append({"action": stage.tool, "arguments": {}})
            if stage.stage == task.grading.required_stage:
                break
        actions.append({"action": "research.submit", "arguments": {"verdict": task.grading.expected_verdict.value, "reason": "Observed evidence."}})
        action_map[task.task_id] = actions
    def transport(url, **kw):
        request = kw["json"]
        task = json.loads(request["messages"][1]["content"].removeprefix("TASK "))
        ordinal = sum(m["role"] == "assistant" for m in request["messages"])
        return response(request, json.dumps(action_map[task["task_id"]][ordinal]))
    output = tmp_path / "baseline"
    class Factory(OpenAIFactory):
        def __call__(self, identity):
            return OpenAIClient(self.ledger, "fixture", transport)
    factory = Factory(tmp_path / ".baseline.checkpoint", "fixture")
    manifest = LiveBaselineRunner(root=ROOT, suite=suite, certifications=cert,
        models=frozen_models(), client_factory=factory, output=output,
        authorized_total_cost_usd=8).run()
    assert manifest["episodes"] == 54
    assert manifest["metrics"]["verified_research_success_rate"] == 1
    assert manifest["total_cost_usd"] < 8
    assert "REAL API MODEL BASELINE" in (output / "README.md").read_text()
    events = [json.loads(line) for line in (output / "requests.jsonl").read_text().splitlines()]
    order = list(dict.fromkeys(e["model"] for e in events))
    assert order == [m.model for m in frozen_models()]


def test_bootstrap_preflight_fits_luna(tmp_path):
    OpenAIFactory(tmp_path, "fixture").before_tier(frozen_models()[0], [], 18)
    report = json.loads((tmp_path / "tier_preflight.json").read_text())
    assert report["estimated_tier_cost_usd"] < 0.5


def test_global_cap_refuses_after_all_model_allowances(tmp_path):
    ledger = SpendLedger(tmp_path / "ledger")
    for model, cap in MODEL_CAPS.items():
        key = ledger.reserve(model, cap, {}, cap)
        ledger.settle(key, model, cap, {})
    assert float(sum(ledger_state(ledger.path)[2].values())) == 8
    with pytest.raises(BudgetExceeded):
        ledger.reserve("gpt-5.6-sol", 0.000001, {}, 1)


def test_orphan_response_blocks_resume(tmp_path):
    factory = OpenAIFactory(tmp_path, "fixture")
    client = OpenAIClient(factory.ledger, "fixture", lambda *a, **kw: response(kw["json"]))
    call(client)
    with pytest.raises(RuntimeError, match="orphan paid"):
        factory.before_tier(frozen_models()[0], [], 18)


def test_changed_response_version_stops_without_retry(tmp_path):
    calls = []
    def transport(url, **kw):
        result = response(kw["json"])
        raw = json.loads(result.content)
        raw["model"] += "-version-" + str(len(calls))
        result.content = json.dumps(raw).encode()
        calls.append(kw)
        return result
    client = OpenAIClient(SpendLedger(tmp_path / "ledger"), "fixture", transport)
    call(client)
    with pytest.raises(RuntimeError):
        call(client)
    assert len(calls) == 2
    assert len(ledger_state(client.ledger.path)[0]) == 1


def test_budget_stop_saves_episode_and_never_reruns(tmp_path):
    suite = load_behavioral_suite(ROOT / "eval/tasks/forge_v0_2_5/suite.json")
    cert = CertificationIndex.load(ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json")
    class StopClient:
        model_kind = "live"
        def complete(self, *a, **kw):
            raise BudgetExceeded("fixture allowance exhausted")
    class Factory(OpenAIFactory):
        def __call__(self, identity):
            return StopClient()
    output = tmp_path / "baseline"
    factory = Factory(tmp_path / ".baseline.checkpoint", "fixture")
    runner = LiveBaselineRunner(root=ROOT, suite=suite, certifications=cert,
        models=frozen_models(), client_factory=factory, output=output,
        authorized_total_cost_usd=8)
    with pytest.raises(RuntimeError, match="BUDGET_EXHAUSTED"):
        runner.run()
    rows = (factory.ledger.path.parent / "episodes.jsonl").read_text().splitlines()
    assert len(rows) == 1 and "BUDGET_EXHAUSTED" in rows[0]
    with pytest.raises(RuntimeError, match="partial episode"):
        runner.run()
    assert not output.exists()
    assert len((factory.ledger.path.parent / "episodes.jsonl").read_text().splitlines()) == 1


def test_stale_lock_prevents_calls(tmp_path):
    suite = load_behavioral_suite(ROOT / "eval/tasks/forge_v0_2_5/suite.json")
    cert = CertificationIndex.load(ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json")
    checkpoint = tmp_path / ".baseline.checkpoint"
    checkpoint.mkdir()
    (checkpoint / "run.lock").write_text("interrupted process")
    runner = LiveBaselineRunner(root=ROOT, suite=suite, certifications=cert,
        models=frozen_models(), client_factory=OpenAIFactory(checkpoint, "fixture"),
        output=tmp_path / "baseline", authorized_total_cost_usd=8)
    with pytest.raises(FileExistsError):
        runner.run()
    assert (checkpoint / "run.lock").exists()
    assert not (checkpoint / "requests.jsonl").exists()


def test_recovery_preserves_paid_evidence_and_charges_interrupted_request(tmp_path):
    from src.behavioral.agent import _system_prompt
    from src.behavioral.tool_plane import BehavioralToolPlane
    from src.behavioral.baseline import SOURCE_PATHS, _episode_key
    from src.behavioral.recovery import prepare_recovery, recovery_info, snapshot_checkpoint
    from src.eval.canonical import canonical_sha256, sha256_bytes
    suite = load_behavioral_suite(ROOT / "eval/tasks/forge_v0_2_5/suite.json")
    cert = CertificationIndex.load(ROOT / "eval/certification/forge_v0_2_4/engine_probe_artifact.json")
    factory = OpenAIFactory(tmp_path, "fixture")
    client = OpenAIClient(factory.ledger, "fixture", lambda *a, **kw: response(kw["json"]))
    task = suite.tasks[0]
    messages = [{"role": "system", "content": _system_prompt(BehavioralToolPlane.definitions())},
                {"role": "user", "content": "TASK " + json.dumps(task.public_dict(), sort_keys=True, separators=(",", ":"))}]
    turn = client.complete(messages, identity=frozen_models()[0], seed=101,
                           max_output_tokens=4096, max_cost_usd=1,
                           remaining_tokens=30000, remaining_seconds=180)
    sources = {}
    for name in SOURCE_PATHS:
        raw = (ROOT / name).read_bytes().replace(b"\r\n", b"\n")
        sources[name] = sha256_bytes(raw)
        dest = tmp_path / "execution_source" / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(raw)
    config = {"models": [m.to_dict() for m in frozen_models()], "seeds": [101, 211, 307],
              "suite_hash": suite.suite_hash, "global_cap_usd": 8, "source_hashes": sources}
    (tmp_path / "original_run_config.json").write_text(json.dumps(config))
    (tmp_path / "original_episodes.jsonl").write_text("")
    ledger_before = factory.ledger.path.read_bytes()
    snapshot_checkpoint(tmp_path, tmp_path.with_name(tmp_path.name + ".interrupted-history"))
    audit = prepare_recovery(ROOT, tmp_path, suite, cert)
    interrupted, overhead = recovery_info(tmp_path, [])
    assert overhead == turn.cost_usd and len(interrupted) == 1
    assert audit["interrupted_attempts"][0]["status"] == "INTERRUPTED_EXCLUDED"
    assert audit["interrupted_attempts"][0]["wall_seconds"] is None
    assert factory.ledger.path.read_bytes() == ledger_before
    factory.before_tier(frozen_models()[0], [], 18)
    report = json.loads((tmp_path / "tier_preflight.json").read_text())
    assert report["remaining_model_usd"] == pytest.approx(0.5 - turn.cost_usd)
    with pytest.raises(RuntimeError, match="already prepared"):
        prepare_recovery(ROOT, tmp_path, suite, cert)
