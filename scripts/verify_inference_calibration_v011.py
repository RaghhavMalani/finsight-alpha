"""Verify sealed worlds and blind selection without generating confirmation data."""
from datetime import datetime
import json
from pathlib import Path
import subprocess
import sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.research_os.calibration_v011.protocol import load,digest,PROTOCOL_SHA,FREEZE_COMMIT,BASE_COMMIT,assert_disjoint
from src.research_os.calibration_v011.study import read_ledger,validate_phase,selection_guard,read_npz,assert_inference_unchanged
from scripts.verify_research_os import verify as verify_old


def verify(root=ROOT):
    p=load(root);folder=root/"data/exports/research_os_v0_1_1"
    old=verify_old()
    if old["calibration"]!="NOT_CALIBRATED" or old["scientific_engine_gate"]!="CLOSED":
        raise ValueError("Old v0.1 gate must remain permanently closed")
    paths=["data/exports/research_os_v0_1","docs/findings/momentum-regimes.md","docs/findings/momentum-regimes-forest.png"]
    old_sources=subprocess.check_output(["git","ls-tree","-r","--name-only",BASE_COMMIT,"--","src/research_os"],cwd=root,text=True).splitlines()
    changed=subprocess.check_output(["git","diff","--name-only",BASE_COMMIT,"HEAD","--",*paths,*old_sources],cwd=root,text=True)
    if changed.strip(): raise ValueError("Immutable old study/source changed: "+changed)
    receipt=json.loads((folder/"freeze-receipt.json").read_bytes())
    declaration=subprocess.check_output(["git","show",FREEZE_COMMIT+":scripts/freeze_inference_calibration_v011.py"],cwd=root)
    if digest(declaration)!=receipt["declaration_source_sha256"]: raise ValueError("Declaration-source identity mismatch")
    seed_hash,seeds=assert_disjoint(p)
    result={"integrity":"VERIFIED","protocol_sha256":PROTOCOL_SHA,"freeze_commit":FREEZE_COMMIT,
            "seed_domains_disjoint":True,"seed_manifest_hash":seed_hash,"seed_count":seeds,
            "old_gate":"PERMANENTLY_CLOSED","new_gate":"PREREGISTERED_UNOPENED"}
    rows=read_ledger(folder)
    freeze_time=datetime.fromisoformat(receipt["frozen_at"])
    if any(datetime.fromisoformat(r["at"])<freeze_time for r in rows): raise ValueError("Attempt before freeze")
    if (folder/"discovery.json").exists():
        discovery=validate_phase(folder,"discovery",p)
        result["discovery_worlds"]=p["discovery_worlds"]*len(p["settings"])
        result["discovery_candidate_evaluations"]=result["discovery_worlds"]*len(p["candidates"])
        result["new_gate"]="DISCOVERY_ONLY"
        commit=discovery["execution"]["code_commit"]
        subprocess.run(["git","merge-base","--is-ancestor",FREEZE_COMMIT,commit],cwd=root,check=True)
        starts=[r for r in rows if r["event"]=="START" and r["payload"]["phase"]=="discovery"]
        ends=[r for r in rows if r["event"]=="SUCCESS" and r["payload"]["phase"]=="discovery"]
        if not starts or not ends or ends[-1]["payload"]["output_sha256"]!=digest((folder/"discovery.json").read_bytes()):
            raise ValueError("Missing/unbound discovery attempt")
    if (folder/"confirmation.json").exists():
        selected,selection_hash=selection_guard(root,folder,p)
        confirmation=validate_phase(folder,"confirmation",p)
        if confirmation["selection_hash"]!=selection_hash: raise ValueError("Confirmation/selection binding changed")
        for key in ("runner_hash","environment"):
            if confirmation["execution"][key]!=discovery["execution"][key]: raise ValueError("Inference changed after discovery")
        if confirmation["execution"]["source_hash"]!=discovery["execution"]["source_hash"]:
            if confirmation["execution"].get("pre_confirmation_guard_repair_hash")!=assert_inference_unchanged(root,discovery["execution"]):
                raise ValueError("Unbound guard-only source correction")
        log=subprocess.check_output(["git","log","--format=%H","--","data/exports/research_os_v0_1_1/selection.json"],cwd=root,text=True).splitlines()
        if not log: raise ValueError("Selection not historically committed")
        selection_commit=log[-1]
        when=int(subprocess.check_output(["git","show","-s","--format=%ct",selection_commit],cwd=root,text=True))
        starts=[r for r in rows if r["event"]=="START" and r["payload"]["phase"]=="confirmation"]
        ends=[r for r in rows if r["event"]=="SUCCESS" and r["payload"]["phase"]=="confirmation"]
        if not starts or not ends or any(datetime.fromisoformat(r["at"]).timestamp()<when for r in starts):
            raise ValueError("Confirmation opened before committed selection")
        if ends[-1]["payload"]["output_sha256"]!=digest((folder/"confirmation.json").read_bytes()): raise ValueError("Confirmation outcome receipt changed")
        discovery_hashes=set();confirmation_hashes=set()
        for phase,target in (("discovery",discovery_hashes),("confirmation",confirmation_hashes)):
            for setting in p["settings"]:
                _,hashes,_=read_npz(folder/phase/(setting["id"]+".npz"))
                if len(set(hashes.tolist()))!=len(hashes): raise ValueError("Duplicate world input hashes")
                target.update(hashes.tolist())
        if discovery_hashes&confirmation_hashes: raise ValueError("Confirmation reused discovery inputs")
        result.update(selected=selected,selection_commit=selection_commit,new_gate=confirmation["status"],
                      confirmation_worlds=p["confirmation_worlds"]*len(p["settings"]),
                      confirmation_planted_evaluations=p["confirmation_worlds"]*len(p["settings"])*(len(p["effect_grid"])-1))
    manifest=folder/"manifest.json"
    if manifest.exists():
        sealed=json.loads(manifest.read_bytes())
        for name,sha in sealed["files"].items():
            if digest((folder/name).read_bytes())!=sha: raise ValueError("Sealed file substitution: "+name)
        if sealed["new_gate"]!=result["new_gate"]: raise ValueError("Sealed gate mismatch")
    return result


if __name__=="__main__": print(json.dumps(verify(),indent=2))
