from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import pytest
from scripts.risk_archive import verify, verify_route, verify_addition, verify_graph
from src.risk_manager.contracts import canonical, decode

ROOT = Path(__file__).resolve().parents[2]


def test_baseline_subsets_and_withdrawals():
    result = verify(ROOT)
    assert result["prior_artifacts"] == 221 and result["prior_routes"] == 126 and result["withdrawals"] == 6
    assert result["d6"] == "DISABLED / DEFERRED"
    frozen = decode((ROOT / "eval/risk_manager/v0.1/phase0-6-freeze.json").read_bytes())
    assert frozen["files"][".github/workflows/organs.yml"]


def test_unreviewed_kind_and_route_rejected():
    for route in ["/risk-manager/unknown", "/risk-manager/state?path=secret", "//private/risk-manager/state",
                  "/risk-manager/state?sweep_id=bad", "/risk-manager/state?sweep_id="]:
        with pytest.raises(ValueError):
            verify_route(route, "risk:state:" + "a" * 64, {"risk:state:" + "a" * 64: {}})
    with pytest.raises(ValueError):
        verify_addition(ROOT / "frontend-v2/public", "risk:history:" + "a" * 64, {})


def graph_fixture(preflight):
    values = {}
    for value in [preflight["coverage_state"], preflight["state"], preflight["receipt"]]:
        kind = "state" if value["kind"] == "risk-state" else "sweep"
        identity = "risk:" + kind + ":" + sha256(canonical(value) + b"\n").hexdigest()
        values[identity] = deepcopy(value)
    receipt_ref = next(key for key, value in values.items() if value["kind"] == "risk-sweep")
    state_ref = values[receipt_ref]["payload"]["state_ref"]
    leaf_ref = values[state_ref]["payload"]["evidence_index"][0]["artifact_id"]
    origins = decode((ROOT / "data/exports/data_organ_v0_1/issues.json").read_bytes())["items"]
    return values, receipt_ref, state_ref, leaf_ref, origins


@pytest.mark.parametrize("sabotage", [
    "first_seen_fingerprint", "first_seen_clock", "duplicate_origin", "coverage_fingerprint",
    "missing_category", "state_parent", "sweep_id", "history_cycle", "orphan_state", "orphan_risk_reference",
])
def test_cross_join_sabotage_cannot_pass(preflight, sabotage):
    values, receipt_ref, state_ref, leaf_ref, origins = graph_fixture(preflight)
    assert verify_graph(values, origins)
    state = values[state_ref]["payload"]
    receipt = values[receipt_ref]["payload"]
    if sabotage == "first_seen_fingerprint":
        state["issues"][0]["first_seen_ref"]["sweep_fingerprint"] = "a" * 64
    elif sabotage == "first_seen_clock":
        state["issues"][0]["first_seen_at"] = "2026-10-14T00:00:00Z"
    elif sabotage == "duplicate_origin":
        issue = next(row for row in state["issues"] if row["origin_records"]
                     and row["origin_records"][0]["source"] != "phase2-fixture")
        issue["origin_records"].append(deepcopy(issue["origin_records"][0]))
    elif sabotage == "coverage_fingerprint":
        values[leaf_ref]["payload"]["sweep_fingerprint"] = "a" * 64
    elif sabotage == "missing_category":
        values[leaf_ref]["payload"]["coverage"]=[row for row in values[leaf_ref]["payload"]["coverage"] if row["category"]!="SYSTEM"]
    elif sabotage == "state_parent":
        state["prior_state_ref"] = leaf_ref
    elif sabotage == "sweep_id":
        receipt["sweep_id"] = "a" * 64
    elif sabotage == "history_cycle":
        receipt["prior_sweep_ref"] = receipt_ref
    elif sabotage == "orphan_state":
        values["risk:state:" + "a" * 64] = deepcopy(values[leaf_ref])
    elif sabotage == "orphan_risk_reference":
        state["issues"][0]["evidence_refs"] = [dict(type="RISK_OBSERVATION", observation_id="a" * 64, sweep_fingerprint="a" * 64)]
    with pytest.raises(ValueError):
        verify_graph(values, origins)


def test_each_historical_sweep_binds_its_own_retained_origin_inventory():
    from src.risk_manager.monitoring import read_data,monitoring_operation
    from src.risk_manager.publication import read_artifact
    manifest=decode((ROOT/"frontend-v2/public/replay-manifest.json").read_bytes())
    with monitoring_operation():
        values={identity:read_artifact(ROOT,manifest,identity) for identity in manifest["artifacts"] if identity.startswith("risk:")}
        expected={}
        for value in values.values():
            if value["kind"]!="risk-sweep" or value["payload"]["status"]=="FAILED":continue
            receipt=value["payload"]
            issue_input=next(item["input_id"] for item in receipt["inputs"] if item["input_id"].startswith("data-organ:issues:"))
            expected[receipt["fingerprint"]]=read_data(ROOT,manifest,issue_input)["payload"]["items"]
        assert verify_graph(values,expected)
        # The older successful sweeps preserve27origins; current raw monitoring contains later origins.
        current=read_data(ROOT,manifest,manifest["routes"]["/data/issues"])["payload"]["items"]
        if any(len(origins)!=len(current) for origins in expected.values()):
            with pytest.raises(ValueError,match="Data origin"):
                verify_graph(values,current)


@pytest.mark.parametrize("sabotage",["fingerprint","missing_observation","other_issue","self_source","cyclic_source","mixed"])
def test_primary_source_graph_substitution_rejected(preflight,sabotage):
    values,receipt_ref,state_ref,_,origins=graph_fixture(preflight)
    state=values[state_ref]["payload"]
    receipt=values[receipt_ref]["payload"]
    issue=state["issues"][0]
    ref=issue["evidence_refs"][0]
    if sabotage=="fingerprint":
        ref["sweep_fingerprint"]="a"*64
    elif sabotage=="missing_observation":
        ref["observation_id"]="a"*64
    elif sabotage=="mixed":
        observation=next(o for o in receipt["observations"] if o["observation_id"]==issue["last_observation_id"])
        issue["evidence_refs"].append(deepcopy(observation["evidence_refs"][0]))
    elif sabotage=="other_issue":
        other=state["issues"][1]
        issue["evidence_refs"]=deepcopy(other["evidence_refs"])
        issue["last_observation_id"]=other["last_observation_id"]
        issue["observation_ids"].append(other["last_observation_id"])
    else:
        observation=next(o for o in receipt["observations"] if o["observation_id"]==issue["last_observation_id"])
        observation["evidence_refs"]=[deepcopy(ref)]
        if sabotage=="cyclic_source":
            other=receipt["observations"][1]
            observation["evidence_refs"][0]["observation_id"]=other["observation_id"]
            other["evidence_refs"]=[deepcopy(ref)]
    with pytest.raises(ValueError):
        verify_graph(values,origins)
