from pathlib import Path
from copy import deepcopy
import shutil
import pytest
from src.risk_manager.sweep import run
from src.risk_manager.publication import validate_public,safe_payload,publish
from src.risk_manager.contracts import digest,canonical
ROOT=Path(__file__).resolve().parents[2]

def test_budget_two_kinds_and_claims(preflight):
    page=preflight["coverage_state"]; state=preflight["state"]
    ref=state["payload"]["evidence_index"][0]
    staged={ref["artifact_id"]:(page,canonical(page)+b"\n")}
    for value in [page,state]:
        _,raw=validate_public(value,ROOT,staged=staged)
        assert len(raw)<=128*1024 and set(value["claim_flags"].values())=={False}
    bad=deepcopy(page); bad["kind"]="risk-history"
    with pytest.raises(ValueError): validate_public(bad,ROOT)

@pytest.mark.parametrize("field",["price","raw_holdings","provider_rows","credentials","database","model_object","execution_tapes"])
def test_positive_nested_whitelist(preflight,field):
    bad=deepcopy(preflight["coverage_state"])
    bad["payload"]["coverage"][0]["scope"][field]="leak"
    with pytest.raises(ValueError): validate_public(bad,ROOT)

@pytest.mark.parametrize("text",['data:application/json;base64,aaaa','https://private.invalid/rows','C:\\private\\db','api_key=secret','A'*150])
def test_encoded_and_url_carriers_rejected(text):
    with pytest.raises(ValueError): safe_payload({"reason":text})

def test_country_selector_counts_and_grant_sabotage(preflight):
    page=preflight["coverage_state"]
    for mutate in [
        lambda v:v["payload"]["evidence_index"][0].update(selector_id="arbitrary"),
        lambda v:v["licence"].update(dataset_key="vendor:raw"),
        lambda v:v["payload"]["counts"].append(dict(partition="CURRENT_REAL",category="MODEL",severity="HIGH",count=99)),
        lambda v:v["claim_flags"].update(validated_alpha=True)]:
        bad=deepcopy(page); mutate(bad)
        with pytest.raises(ValueError): validate_public(bad,ROOT)


def fixture_root(tmp_path):
    for name in ["eval/risk_manager/v0.1/policy.json","eval/risk_manager/v0.1/evidence-map.json","frontend-v2/public/replay-manifest.json"]:
        p=tmp_path/name; p.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(ROOT/name,p)
    # Fixture publications use an empty risk namespace in a temporary copy.
    # The actual first production sweep and all its bytes remain untouched.
    from src.risk_manager.contracts import decode
    manifest_path = tmp_path / "frontend-v2/public/replay-manifest.json"
    manifest = decode(manifest_path.read_bytes())
    manifest["artifacts"] = {k: v for k, v in manifest["artifacts"].items() if not k.startswith("risk:")}
    manifest["routes"] = {k: v for k, v in manifest["routes"].items() if not k.startswith("/risk-manager/")}
    manifest_path.write_bytes(canonical(manifest) + b"\n")
    return manifest_path.read_bytes()

def test_interrupted_publication_rolls_back_only_owned_files(preflight,tmp_path):
    original=fixture_root(tmp_path)
    def stop(): raise RuntimeError("SYNTHETIC_TEST_ONLY interruption")
    with pytest.raises(RuntimeError):
        publish(tmp_path,preflight["state"],preflight["receipt"],expected_manifest=original,
                extra_states=[preflight["coverage_state"]],interrupt=stop)
    assert (tmp_path/"frontend-v2/public/replay-manifest.json").read_bytes()==original
    assert list((tmp_path/"frontend-v2/public/artifacts/replay").glob("risk-*.json"))==[]

def test_transaction_publishes_complete_pair_and_coverage(preflight,tmp_path):
    original=fixture_root(tmp_path)
    result=publish(tmp_path,preflight["state"],preflight["receipt"],expected_manifest=original,
                   extra_states=[preflight["coverage_state"]])
    from src.risk_manager.contracts import decode
    m=decode((tmp_path/"frontend-v2/public/replay-manifest.json").read_bytes())
    assert m["routes"]["/risk-manager/state"]==result["state_ref"]
    assert len([i for i in m["artifacts"] if i.startswith("risk:")])==3
    assert {e["kind"] for i,e in m["artifacts"].items() if i.startswith("risk:")}=={"risk-state","risk-sweep"}
