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

@pytest.mark.parametrize("text",['data:application/json;base64,aaaa','https://private.invalid/rows','C:\\private\\db','api_key=secret','A'*150,r'c:\private\db','/tmp/private.json','s3://private/rows','mailto:private@example.invalid','tel:+10000000','blob:private','javascript:alert(1)'])
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
    from src.risk_manager.sweep import SOURCE_FILES
    names = ["eval/risk_manager/v0.1/policy.json", "eval/risk_manager/v0.1/evidence-map.json",
             "frontend-v2/public/replay-manifest.json", *SOURCE_FILES]
    for name in names:
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


@pytest.mark.parametrize("sabotage", ["coverage_private", "coverage_test", "publication_source", "envelope_fingerprint", "payload_cutoff"])
def test_resealed_payload_still_rejects_boundary_substitution(preflight, sabotage):
    value = deepcopy(preflight["coverage_state"])
    if sabotage == "coverage_private":
        value["payload"]["coverage"][0]["evidence_class"] = "LOCAL_PAPER_BOOK"
    elif sabotage == "coverage_test":
        value["payload"]["coverage"][0]["evidence_class"] = "SYNTHETIC_TEST_ONLY"
    elif sabotage == "publication_source":
        value["sources"] = ["unreviewed:provider"]
    elif sabotage == "envelope_fingerprint":
        value["input_hash"] = "a" * 64
    elif sabotage == "payload_cutoff":
        value["payload"]["evaluation_cutoff"] = "2026-10-13T07:48:06Z"
    value["payload"]["state_id"] = digest({k: v for k, v in value["payload"].items() if k != "state_id"})
    with pytest.raises(ValueError):
        validate_public(value, ROOT)


@pytest.mark.parametrize("field", ["as_of", "available_at", "source_ids"])
def test_coverage_leaf_reference_clocks_and_sources_cannot_be_substituted(preflight, field):
    value = deepcopy(preflight["state"])
    page = preflight["coverage_state"]
    original = value["payload"]["evidence_index"][0]
    staged = {original["artifact_id"]: (page, canonical(page) + b"\n")}
    original[field] = ["unreviewed:provider"] if field == "source_ids" else "2026-10-13T08:00:00Z"
    value["payload"]["state_id"] = digest({k: v for k, v in value["payload"].items() if k != "state_id"})
    with pytest.raises(ValueError):
        validate_public(value, ROOT, staged=staged)


@pytest.mark.parametrize("sabotage", ["observation_id", "observation_fingerprint", "witness_clock", "transition_issue"])
def test_receipt_observation_cross_join_substitution(preflight, sabotage):
    value = deepcopy(preflight["receipt"])
    payload = value["payload"]
    if sabotage == "observation_id":
        payload["observations"][0]["observation_id"] = "a" * 64
    elif sabotage == "observation_fingerprint":
        payload["observations"][0]["fingerprint"] = "a" * 64
    elif sabotage == "witness_clock":
        payload["observations"][0]["witnessed_at"] = "2026-10-15T12:00:00Z"
    elif sabotage == "transition_issue":
        payload["transitions"][0]["issue_id"] = "risk-issue:" + "a" * 64
    with pytest.raises(ValueError):
        validate_public(value, ROOT)


def test_atomic_pair_rejects_valid_unrelated_state(preflight, tmp_path):
    original = fixture_root(tmp_path)
    other = deepcopy(preflight["state"])
    other["payload"]["prior_state_ref"] = "risk:state:" + "a" * 64
    other["payload"]["state_id"] = digest({k: v for k, v in other["payload"].items() if k != "state_id"})
    with pytest.raises(ValueError):
        publish(tmp_path, other, preflight["receipt"], expected_manifest=original,
                extra_states=[preflight["coverage_state"]])
    assert (tmp_path / "frontend-v2/public/replay-manifest.json").read_bytes() == original
    assert list((tmp_path / "frontend-v2/public/artifacts/replay").glob("risk-*.json")) == []


def test_nonnull_container_producer_run_and_unknown_policy_selector(preflight):
    value = deepcopy(preflight["coverage_state"])
    ref = next(r for r in value["payload"]["evidence_index"] if r["type"] == "REPLAY_ARTIFACT")
    ref["run_id"] = "a" * 64
    value["payload"]["state_id"] = digest({k: v for k, v in value["payload"].items() if k != "state_id"})
    with pytest.raises(ValueError):
        validate_public(value, ROOT)
    value = deepcopy(preflight["coverage_state"])
    row = next(c for c in value["payload"]["coverage"] if c["evidence_refs"][0]["type"] == "POLICY_ASSERTION")
    row["evidence_refs"][0]["check_id"] = "UNREVIEWED_HOLDINGS:private-account:v0.1"
    value["payload"]["state_id"] = digest({k: v for k, v in value["payload"].items() if k != "state_id"})
    with pytest.raises(ValueError):
        validate_public(value, ROOT)


@pytest.mark.parametrize("sabotage", ["missing", "extra", "duplicate", "hash", "bytes"])
def test_receipt_input_inventory_bound_even_after_rehashing(preflight, sabotage):
    value = deepcopy(preflight["receipt"])
    payload = value["payload"]
    if sabotage == "missing":
        payload["inputs"].pop()
    elif sabotage == "extra":
        payload["inputs"].append(dict(input_id="unreviewed_private_input", sha256="a" * 64, bytes=42))
    elif sabotage == "duplicate":
        payload["inputs"].append(deepcopy(payload["inputs"][0]))
    elif sabotage == "hash":
        payload["inputs"][0]["sha256"] = "a" * 64
    elif sabotage == "bytes":
        payload["inputs"][0]["bytes"] += 1
    payload["fingerprint"] = digest(dict(inputs=payload["inputs"], evaluation_cutoff=payload["evaluation_cutoff"],
                                        policy_sha256=payload["policy_sha256"], evaluator_source_hash=payload["evaluator_source_hash"],
                                        scope="RETAINED_RISK_EVIDENCE"))
    value["input_hash"] = payload["fingerprint"]
    with pytest.raises(ValueError):
        validate_public(value, ROOT)


def test_publisher_rejects_unreviewed_evaluator_hash_before_writing(preflight, tmp_path):
    original = fixture_root(tmp_path)
    receipt = deepcopy(preflight["receipt"])
    receipt["payload"]["evaluator_source_hash"] = "a" * 64
    receipt["payload"]["fingerprint"] = digest(dict(inputs=receipt["payload"]["inputs"],
        evaluation_cutoff=receipt["payload"]["evaluation_cutoff"], policy_sha256=receipt["payload"]["policy_sha256"],
        evaluator_source_hash=receipt["payload"]["evaluator_source_hash"], scope="RETAINED_RISK_EVIDENCE"))
    receipt["input_hash"] = receipt["payload"]["fingerprint"]
    state = deepcopy(preflight["state"])
    page = deepcopy(preflight["coverage_state"])
    for value in [state, page]:
        value["input_hash"] = receipt["input_hash"]
        value["payload"]["sweep_fingerprint"] = receipt["input_hash"]
    page["payload"]["state_id"] = digest({k: v for k, v in page["payload"].items() if k != "state_id"})
    from hashlib import sha256
    ref = state["payload"]["evidence_index"][0]
    raw = canonical(page) + b"\n"
    ref.update(artifact_id="risk:state:" + sha256(raw).hexdigest(), sha256=sha256(raw).hexdigest(), bytes=len(raw))
    state["payload"]["state_id"] = digest({k: v for k, v in state["payload"].items() if k != "state_id"})
    receipt["payload"]["state_ref"] = "risk:state:" + sha256(canonical(state) + b"\n").hexdigest()
    receipt["payload"]["sweep_id"] = digest(["risk-sweep/1", receipt["payload"]["fingerprint"], receipt["payload"]["started_at"],
                                           state["payload"]["state_id"]])
    # The fixture root has the exact current evaluator, independent of the forged receipt.
    with pytest.raises(ValueError, match="evaluator hash"):
        publish(tmp_path, state, receipt, expected_manifest=original, extra_states=[page])
    assert (tmp_path / "frontend-v2/public/replay-manifest.json").read_bytes() == original
    assert list((tmp_path / "frontend-v2/public/artifacts/replay").glob("risk-*.json")) == []
