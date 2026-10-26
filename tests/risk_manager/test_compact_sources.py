"""Compact source links retain raw reducer semantics across sweep history."""
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import pytest
from src.risk_manager import sweep
from src.risk_manager.contracts import canonical

ROOT=Path(__file__).resolve().parents[2]


def history(preflight):
    state,receipt=deepcopy(preflight["state"]),deepcopy(preflight["receipt"])
    sid="risk:state:"+sha256(canonical(state)+b"\n").hexdigest()
    rid="risk:sweep:"+sha256(canonical(receipt)+b"\n").hexdigest()
    values={sid:state,rid:receipt}
    manifest={"routes":{"/risk-manager/state":sid,"/risk-manager/sweep":rid}}
    return values,manifest,sid,rid


def test_previous_hydrates_sources_and_unmatched_issue_keeps_them(preflight,monkeypatch):
    values,manifest,sid,rid=history(preflight)
    monkeypatch.setattr(sweep,"read_artifact",lambda root,m,identity:deepcopy(values[identity]))
    previous=sweep.previous(ROOT,manifest)
    sources={o["observation_id"]:o for o in values[rid]["payload"]["observations"]}
    for issue in previous[2]["payload"]["issues"]:
        assert issue["evidence_refs"]==sources[issue["last_observation_id"]]["evidence_refs"]
    # A later synthetic evaluation omits one Issue: it must carry its original
    # sources and exact lifecycle, rather than a pointer to the earlier receipt.
    omitted=previous[2]["payload"]["issues"][0]
    evaluate=sweep.evaluate
    def without_one(evidence,witness):
        observations,coverage=evaluate(evidence,witness)
        return [o for o in observations if o["issue_id"]!=omitted["issue_id"]],coverage
    monkeypatch.setattr(sweep,"previous",lambda root,m:deepcopy(previous))
    # Changed evaluator identity deliberately bypasses the unchanged-input no-op.
    monkeypatch.setattr(sweep,"evaluator_hash",lambda root:"f"*64)
    monkeypatch.setattr(sweep,"evaluate",without_one)
    result=sweep.run(ROOT,publish_artifacts=False)
    assert result["status"]=="PARTIAL"
    carried=next(i for i in result["state"]["payload"]["issues"] if i["issue_id"]==omitted["issue_id"])
    assert carried==omitted
    assert all(r["type"]!="RISK_OBSERVATION" for r in carried["evidence_refs"])


@pytest.mark.parametrize("sabotage",["fingerprint","missing_observation","other_issue","owning_receipt","self_source","mixed"])
def test_previous_rejects_missing_or_substituted_compact_sources(preflight,monkeypatch,sabotage):
    values,manifest,sid,rid=history(preflight)
    issue=values[sid]["payload"]["issues"][0]
    ref=issue["evidence_refs"][0]
    receipt=values[rid]["payload"]
    if sabotage=="fingerprint":
        ref["sweep_fingerprint"]="a"*64
    elif sabotage=="missing_observation":
        ref["observation_id"]="a"*64
    elif sabotage=="mixed":
        observation=next(o for o in receipt["observations"] if o["observation_id"]==issue["last_observation_id"])
        issue["evidence_refs"].append(deepcopy(observation["evidence_refs"][0]))
    elif sabotage=="other_issue":
        other=values[sid]["payload"]["issues"][1]
        issue["evidence_refs"]=deepcopy(other["evidence_refs"])
        issue["last_observation_id"]=other["last_observation_id"]
    elif sabotage=="owning_receipt":
        receipt["fingerprint"]="a"*64
    else:
        observation=next(o for o in receipt["observations"] if o["observation_id"]==issue["last_observation_id"])
        observation["evidence_refs"]=[deepcopy(ref)]
    monkeypatch.setattr(sweep,"read_artifact",lambda root,m,identity:deepcopy(values[identity]))
    with pytest.raises(ValueError):
        sweep.previous(ROOT,manifest)


def test_clear_pointer_cannot_replace_preserved_finding_evidence(preflight):
    from src.risk_manager.publication import source_observation
    receipt=deepcopy(preflight["receipt"])
    issue=preflight["state"]["payload"]["issues"][0]
    observation=next(o for o in receipt["payload"]["observations"] if o["observation_id"]==issue["last_observation_id"])
    observation["outcome"]="CLEAR"
    with pytest.raises(ValueError,match="Clearing observation"):
        source_observation(issue,receipt)
