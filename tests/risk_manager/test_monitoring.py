"""Synthetic retained-bundle admission fixtures; no scientific runtime or publication."""
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import shutil
from datetime import timedelta
from src.risk_manager.contracts import clock
import pytest
from src.risk_manager.contracts import canonical, decode, digest
from src.risk_manager.monitoring import (ALL_KINDS, selected_bundle, monitoring_catalog,
    monitoring_operation, read_data, current_receipt, LEGACY_DIAGNOSTIC_GAP)
from src.risk_manager.evidence import EvidenceReaders, forbidden_calls

ROOT=Path(__file__).resolve().parents[2]

@pytest.fixture
def retained(tmp_path):
    for relative in ("eval/risk_manager/v0.1", "data/exports/data_organ_v0_1"):
        shutil.copytree(ROOT/relative,tmp_path/relative)
    manifest=decode((ROOT/"frontend-v2/public/replay-manifest.json").read_bytes())
    paths=["frontend-v2/public/replay-manifest.json", "scripts/export_data_organ_replay.py"]
    paths += ["frontend-v2/public"+entry["url"] for identity,entry in manifest["artifacts"].items() if identity.startswith("data-organ:")]
    paths += ["src/data_organ/"+name+".py" for name in ("adapters","calendars","contracts","costs","diagnostics","lineage","publication","revisions","service")]
    for relative in paths:
        target=tmp_path/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/relative,target)
    return tmp_path,manifest

def write(root,relative,value):
    target=root/relative;target.parent.mkdir(parents=True,exist_ok=True)
    raw=canonical(value)+b"\n";target.write_bytes(raw);return raw

def reseal(root,manifest,*,kind=None,mutate=None,epoch=None,new_health=False):
    """An internally coherent future metadata publication, never an actual capture."""
    receipt=decode((root/"data/exports/data_organ_v0_1/receipt.json").read_bytes())
    epoch=epoch or (clock(receipt["as_of"])+timedelta(days=1)).isoformat().replace("+00:00","Z")
    receipt["as_of"]=epoch; receipt["input_hash"]=digest(["SYNTHETIC_TEST_ONLY",epoch])
    payloads={k:decode((root/("data/exports/data_organ_v0_1/"+k+".json")).read_bytes()) for k in ALL_KINDS}
    if new_health:
        health=next(row for row in payloads["health"]["items"] if row["source"]=="iima:daily-factors")
        health["diagnostic_id"]=digest(["SYNTHETIC_TEST_ONLY",epoch,"health"])
        health["age_reference"]=epoch
        origin=deepcopy(next(row for row in payloads["issues"]["items"] if row["kind"]=="PARTIAL_SOURCE_HEALTH" and row["source"]==health["source"]))
        origin.update(id=digest([health["diagnostic_id"],"health"]),evidence=[health["diagnostic_id"]],first_seen_at=epoch,last_seen_at=epoch)
        payloads["issues"]["items"].append(origin)
    if mutate:
        mutate(payloads[kind])
    for k in ALL_KINDS:
        old=receipt["entries"][k]; value=decode((root/("frontend-v2/public"+old["url"])).read_bytes())
        value.update(as_of=epoch,input_hash=receipt["input_hash"],payload=payloads[k])
        raw=canonical(value)+b"\n"; hashed=sha256(raw).hexdigest();identity="data-organ:"+k+":"+hashed
        entry={key:val for key,val in old.items() if key!="artifact_id"}
        entry.update(sha256=hashed,bytes=len(raw),as_of=epoch,available_at=epoch,observed_at=epoch,input_hash=receipt["input_hash"],url="/artifacts/replay/"+identity.replace(":","-")+".json")
        (root/("frontend-v2/public"+entry["url"])).write_bytes(raw)
        manifest["artifacts"][identity]=entry;manifest["routes"]["/data/"+k]=identity
        receipt["entries"][k]=dict(artifact_id=identity,**entry)
        write(root,"data/exports/data_organ_v0_1/"+k+".json",payloads[k])
    manifest["as_of"]=epoch
    raw=write(root,"data/exports/data_organ_v0_1/receipt.json",receipt)
    (root/("data/exports/data_organ_v0_1/receipt-"+sha256(raw).hexdigest()+".json")).write_bytes(raw)
    write(root,"data/exports/data_organ_v0_1/manifest.json",receipt["entries"])
    write(root,"frontend-v2/public/replay-manifest.json",manifest)
    return receipt

def test_current_selected_inputs_have_deterministic_epoch_and_exact_legacy_gap():
    with monitoring_operation(),forbidden_calls():
        evidence=EvidenceReaders(ROOT).read()
    assert evidence.cutoff==evidence.manifest["artifacts"][evidence.manifest["routes"]["/data/issues"]]["as_of"]
    assert evidence.monitoring["unresolved_diagnostics"]==[LEGACY_DIAGNOSTIC_GAP]
    assert len(evidence.values["data_issues"]["payload"]["items"])>=37
    assert len(evidence.monitoring["health_history"])>len(evidence.map["health_history"])
    for alias,route in {"data_"+k:"/data/"+k for k in ALL_KINDS if k not in {"costs","revisions"}}.items():
        assert evidence.monitoring["artifacts"][alias]["artifact_id"]==evidence.manifest["routes"][route]

def test_future_bundle_and_new_diagnostic_are_discovered_without_pin_edit(retained):
    root,manifest=retained; receipt=reseal(root,manifest,new_health=True)
    with monitoring_operation(),forbidden_calls():bundle=selected_bundle(root,manifest)
    assert bundle["evaluation_cutoff"]==receipt["as_of"]
    assert bundle["artifacts"]["data_issues"]["artifact_id"]==receipt["entries"]["issues"]["artifact_id"]
    assert receipt["entries"]["health"]["artifact_id"] in bundle["health_history"]
    origins=read_data(root,manifest,receipt["entries"]["issues"]["artifact_id"])["payload"]["items"]
    assert len(origins)==len(decode((ROOT/"data/exports/data_organ_v0_1/issues.json").read_bytes())["items"])+1
    assert bundle["unresolved_diagnostics"]==[LEGACY_DIAGNOSTIC_GAP]

@pytest.mark.parametrize("fault",["mixed","hash","licence","source","clock","missing_history","orphan_changed","new_unknown","wrong_source","map_rollback","nested","enum","infinite","meaning","unavailable_nested"])
def test_sabotaged_admission_cannot_be_resealed_into_trust(retained,fault):
    root,manifest=retained
    if fault=="mixed":
        original=manifest["routes"]["/data/health"];reseal(root,manifest);manifest["routes"]["/data/health"]=original
    elif fault=="hash":
        entry=manifest["artifacts"][manifest["routes"]["/data/health"]];(root/("frontend-v2/public"+entry["url"])).write_bytes(b"{}")
    elif fault=="licence":
        entry=manifest["artifacts"][manifest["routes"]["/data/issues"]];entry["licence"]["permitted_uses"]=["local_only"]
    elif fault in {"source","clock"}:
        def mutate(p):
            source=p["items"][0]["source"]
            if fault=="source":source["field_definition"]="different raw market meaning"
            else:source["captured_at"]="2099-01-01T00:00:00Z"
        reseal(root,manifest,kind="lineage",mutate=mutate)
    elif fault=="missing_history":
        frozen=decode((root/"eval/risk_manager/v0.1/evidence-map.json").read_bytes())
        identity=next(iter(frozen["health_history"])); del manifest["artifacts"][identity]
    elif fault in {"orphan_changed","new_unknown","wrong_source"}:
        def mutate(p):
            row=next(o for o in p["items"] if o["id"]==LEGACY_DIAGNOSTIC_GAP["origin_id"])
            if fault=="orphan_changed":row["reason"]="Changed legacy origin"
            elif fault=="new_unknown":row["evidence"]=["f"*64];row["id"]=digest([row["evidence"][0],"health"])
            else:
                row["source"]="bls:LNS14000000"
        reseal(root,manifest,kind="issues",mutate=mutate)
    elif fault=="map_rollback":
        evidence=decode((root/"eval/risk_manager/v0.1/evidence-map.json").read_bytes());identity=manifest["routes"]["/data/issues"]
        evidence["artifacts"]["data_issues"]={"artifact_id":identity,"entry":manifest["artifacts"][identity]};write(root,"eval/risk_manager/v0.1/evidence-map.json",evidence)
    elif fault in {"nested","enum","infinite"}:
        def mutate(p):
            key,value={"nested":("finding",{"raw_prices":[1,2]}),"enum":("freshness_status","HEALTHY_MARKET"),"infinite":("capture_age_seconds",float("inf"))}[fault]
            p["items"][0][key]=value
        if fault=="infinite":
            # Test finite validation below JSON canonicalization without writing non-JSON data.
            from src.risk_manager.monitoring import _payload
            p=decode((root/"data/exports/data_organ_v0_1/health.json").read_bytes());mutate(p)
            with pytest.raises(ValueError):_payload("health",p,manifest["as_of"])
            return
        reseal(root,manifest,kind="health",mutate=mutate)
    elif fault in {"meaning","unavailable_nested"}:
        def mutate(p):
            if fault=="meaning":p["summary"]["meaning"]="Independent economic confirmation"
            else:p["summary"].update(status="UNAVAILABLE",different={"raw_prices":[1,2]})
        reseal(root,manifest,kind="disagreement",mutate=mutate)
    with monitoring_operation(),forbidden_calls(),pytest.raises((ValueError,KeyError,FileNotFoundError)):
        selected_bundle(root,manifest)


def test_new_unknown_in_older_complete_bundle_is_rejected_even_when_current_is_good(retained):
    root,manifest=retained
    def unknown(p):
        row=next(o for o in p["items"] if o["id"]==LEGACY_DIAGNOSTIC_GAP["origin_id"])
        row["evidence"]=["a"*64];row["id"]=digest(["a"*64,"health"])
    reseal(root,manifest,kind="issues",mutate=unknown)
    # Restore original origins in the newer bundle; the poisoned retained prior bundle still fails.
    current=decode((ROOT/"data/exports/data_organ_v0_1/issues.json").read_bytes())
    reseal(root,manifest,kind="issues",mutate=lambda p:p.update(deepcopy(current)))
    with monitoring_operation(),pytest.raises(ValueError):monitoring_catalog(root,manifest)


def test_manifest_change_after_read_starts_fails_without_science(monkeypatch):
    reader=EvidenceReaders(ROOT);original=reader.manifest_raw
    reader.manifest_raw=original+b" "
    with forbidden_calls(),pytest.raises(ValueError,match="Manifest changed"):
        reader.read()


def test_operation_cache_is_not_reused_across_calls(retained):
    root,manifest=retained
    with monitoring_operation():assert selected_bundle(root,manifest)
    entry=manifest["artifacts"][manifest["routes"]["/data/health"]]
    (root/("frontend-v2/public"+entry["url"])).write_bytes(b"{}")
    with monitoring_operation(),pytest.raises(ValueError):selected_bundle(root,manifest)
