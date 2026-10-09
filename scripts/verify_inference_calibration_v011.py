"""Verify sealed worlds and blind selection without generating confirmation data."""
from datetime import datetime
import json
import math
from pathlib import Path
import subprocess
import sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.research_os.calibration_v011.protocol import load,digest,PROTOCOL_SHA,FREEZE_COMMIT,BASE_COMMIT,assert_disjoint
from src.research_os.calibration_v011.study import read_ledger,read_npz
from scripts.research_archive import historical_guard,verify_closed_history
from src.research_os.calibration_v011.metrics import summarize,select
from scripts.verify_research_os import verify as verify_old

FLOAT_TOLERANCE=1e-12
COMPARISON_MAX=0.


def equivalent(left,right):
    """Read-only cross-library arithmetic check. Hashes/counts/gate decisions stay exact."""
    global COMPARISON_MAX
    if isinstance(left,dict):
        return isinstance(right,dict) and left.keys()==right.keys() and all(equivalent(left[k],right[k]) for k in left)
    if isinstance(left,list):
        return isinstance(right,list) and len(left)==len(right) and all(equivalent(a,b) for a,b in zip(left,right))
    if isinstance(left,bool) or isinstance(right,bool): return type(left) is bool and type(right) is bool and left==right
    if isinstance(left,float) and isinstance(right,(float,np.floating)):
        COMPARISON_MAX=max(COMPARISON_MAX,abs(left-right))
        return math.isfinite(left) and math.isfinite(right) and math.isclose(left,right,rel_tol=0,abs_tol=FLOAT_TOLERANCE)
    return type(left)==type(right) and left==right


def audit_family(report,phase,p,methods):
    expected={s["id"] for s in p["settings"]}
    paths={phase+"/"+name+".npz" for name in expected}
    if (report["phase"]!=phase or report["protocol_sha256"]!=PROTOCOL_SHA
            or set(report["methods"])!=set(methods) or set(report["artifacts"])!=paths
            or report["worlds"]!=p[phase+"_worlds"]
            or any(set(rows)!=expected for rows in report["methods"].values())):
        raise ValueError("Phase family changed")


def audit_summary(summary,confirmation,p,selected):
    rows=confirmation["methods"][selected];cfg=p["confirmation_acceptance"]
    failed={name:[label for label,test in (
        ("greater size",row.get("greater_size_upper",1)>cfg["size_upper_max"]),
        ("two-sided size",row.get("two_sided_size_upper",1)>cfg["size_upper_max"]),
        ("coverage",row.get("coverage_lower",0)<cfg["coverage_lower_min"]),
        ("bias",row.get("standardized_bias_upper",1)>cfg["standardized_bias_upper_max"]),
        ("invalid worlds",bool(row.get("failed_worlds",0)))) if test]
        for name,row in rows.items() if not row["accepted"]}
    expected={"status":confirmation["status"],"selected":selected,
        "settings_passed":sum(row["accepted"] for row in rows.values()),"settings_total":len(p["settings"]),
        "failed_settings":failed,"discovery_worlds":p["discovery_worlds"]*len(p["settings"]),
        "discovery_method_worlds":p["discovery_worlds"]*len(p["settings"])*len(p["candidates"]),
        "confirmation_null_worlds":p["confirmation_worlds"]*len(p["settings"]),
        "confirmation_planted_evaluations":p["confirmation_worlds"]*len(p["settings"])*(len(p["effect_grid"])-1),
        "old_gate":"PERMANENTLY_CLOSED","market_replication_authorized":False,"engine_authorized":False}
    if not equivalent(summary,expected): raise ValueError("Summary differs from sealed confirmation")


def audit_phase(folder,phase,p):
    report=json.loads((folder/(phase+".json")).read_bytes())
    methods=p["candidates"] if phase=="discovery" else [json.loads((folder/"selection.json").read_bytes())["selection"]["selected"]]
    count=p[phase+"_worlds"]
    audit_family(report,phase,p,methods)
    for s in p["settings"]:
        name=phase+"/"+s["id"]+".npz";path=folder/name
        if digest(path.read_bytes())!=report["artifacts"][name]: raise ValueError("Artifact byte substitution")
        values,hashes,meta=read_npz(path)
        if (values.shape!=(len(methods),count,13) or hashes.shape!=(count,) or meta["methods"]!=methods
                or meta["setting"]!=s["id"] or meta["phase"]!=phase or meta["protocol_sha256"]!=PROTOCOL_SHA
                or meta["execution"]!=report["execution"]): raise ValueError("Artifact binding changed")
        for index,method in enumerate(methods):
            failures=sum(e["method"]==method for e in meta["errors"])
            row=({"worlds":count,"failed_worlds":failures,"accepted":False,"status":"UNAVAILABLE"} if failures
                 else {**summarize(values[index],p),"failed_worlds":0})
            if not equivalent(report["methods"][method][s["id"]],row): raise ValueError("Metrics/decisions differ from retained worlds")
    status="DISCOVERY_ONLY" if phase=="discovery" else ("CONFIRMED_FOR_FROZEN_DGPS"
        if all(row["accepted"] for rows in report["methods"].values() for row in rows.values()) else "NOT_CONFIRMED")
    if report["status"]!=status: raise ValueError("False gate badge")
    return report


def audit_selection(root,folder,p):
    path=folder/"selection.json";raw=path.read_bytes()
    if raw!=subprocess.check_output(["git","show","HEAD:data/exports/research_os_v0_1_1/selection.json"],cwd=root):
        raise ValueError("Selection differs from committed receipt")
    receipt=json.loads(raw);disc=audit_phase(folder,"discovery",p)
    ordered={m:{s["id"]:disc["methods"][m][s["id"]] for s in p["settings"]} for m in p["candidates"]}
    if not equivalent(receipt["selection"],select(ordered,p)) or receipt["discovery_file_hash"]!=digest((folder/"discovery.json").read_bytes()):
        raise ValueError("Fixed selection changed")
    return receipt["selection"]["selected"],digest(raw)


def verify(root=ROOT):
    verify_closed_history(root)
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
        discovery=audit_phase(folder,"discovery",p)
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
        selected,selection_hash=audit_selection(root,folder,p)
        confirmation=audit_phase(folder,"confirmation",p)
        if confirmation["selection_hash"]!=selection_hash: raise ValueError("Confirmation/selection binding changed")
        for key in ("runner_hash","environment"):
            if confirmation["execution"][key]!=discovery["execution"][key]: raise ValueError("Inference changed after discovery")
        if confirmation["execution"]["source_hash"]!=discovery["execution"]["source_hash"]:
            if confirmation["execution"].get("pre_confirmation_guard_repair_hash")!=historical_guard(root,discovery["execution"],confirmation["execution"]):
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
        if (folder/"summary.json").exists():
            audit_summary(json.loads((folder/"summary.json").read_bytes()),confirmation,p,selected)
            result["confirmation_settings_passed"]=sum(row["accepted"] for row in confirmation["methods"][selected].values())
    manifest=folder/"manifest.json"
    if manifest.exists():
        sealed=json.loads(manifest.read_bytes())
        files={path.relative_to(folder).as_posix() for path in folder.rglob("*") if path.is_file() and path!=manifest}
        if set(sealed["files"])!=files: raise ValueError("Manifest file family changed")
        for name,sha in sealed["files"].items():
            if digest((folder/name).read_bytes())!=sha: raise ValueError("Sealed file substitution: "+name)
        for name,sha in sealed["findings"].items():
            if digest((root/name).read_bytes())!=sha: raise ValueError("Sealed findings substitution: "+name)
        if sealed["new_gate"]!=result["new_gate"]: raise ValueError("Sealed gate mismatch")
    result["read_only_float_tolerance"]=FLOAT_TOLERANCE
    result["read_only_max_float_difference"]=COMPARISON_MAX
    return result


if __name__=="__main__": print(json.dumps(verify(),indent=2))
