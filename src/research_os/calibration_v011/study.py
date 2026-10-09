"""Frozen execution, append-only attempt receipts and discovery-before-confirmation."""
from __future__ import annotations
from concurrent.futures import ProcessPoolExecutor, as_completed
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import math
import ast
from pathlib import Path
import subprocess
import sys
import numpy as np
from src.research_os.provenance import code_identity, environment
from .protocol import BASE_COMMIT, FREEZE_COMMIT, PROTOCOL_SHA, METHODS, digest, json_bytes, load, seed
from .dgp import generate
from .methods import infer
from .metrics import summarize, select


def utcnow(): return datetime.now(timezone.utc).isoformat()


def exclusive_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("xb") as f: f.write(json_bytes(value))


def execution(root):
    commit,source=code_identity(root)
    paths=["scripts/run_inference_calibration_v011.py","src/research_os/calibration_v011"]
    if subprocess.check_output(["git","status","--porcelain","--",*paths],cwd=root,text=True).strip():
        raise ValueError("Tournament computation must be committed")
    subprocess.run(["git","merge-base","--is-ancestor",FREEZE_COMMIT,commit],cwd=root,check=True)
    return {"code_commit":commit,"source_hash":source,"runner_hash":digest((root/paths[0]).read_bytes()),"environment":environment()}


def ledger(folder,event,payload):
    path=folder/"attempts.jsonl";rows=read_ledger(folder)
    row={"sequence":len(rows),"at":utcnow(),"event":event,"payload":payload,
         "previous":rows[-1]["hash"] if rows else None}
    row["hash"]=digest(json_bytes(row))
    with path.open("ab") as f: f.write(json_bytes(row));f.flush()
    return row


def read_ledger(folder):
    path=folder/"attempts.jsonl";rows=[]
    if path.exists():
        for raw in path.read_bytes().splitlines():
            row=json.loads(raw);copy=dict(row);value=copy.pop("hash")
            if digest(json_bytes(copy))!=value or row["sequence"]!=len(rows) or row["previous"]!=(rows[-1]["hash"] if rows else None):
                raise ValueError("Attempt hash chain substitution")
            rows.append(row)
    return rows


@contextmanager
def process_lock(runtime):
    runtime.mkdir(parents=True,exist_ok=True)
    with (runtime/"execution.lock").open("a+b") as f:
        f.seek(0)
        if not f.read(1): f.write(b"0");f.flush()
        f.seek(0)
        if sys.platform=="win32":
            import msvcrt
            msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        try: yield
        finally:
            f.seek(0)
            if sys.platform=="win32": msvcrt.locking(f.fileno(),msvcrt.LK_UNLCK,1)
            else: fcntl.flock(f,fcntl.LOCK_UN)


def payload_hash(values,data_hashes):
    return digest(np.asarray(values,dtype="<f8").tobytes()+np.asarray(data_hashes,dtype="S64").tobytes())


def write_npz(path,values,data_hashes,metadata):
    path.parent.mkdir(parents=True,exist_ok=True)
    metadata={**metadata,"payload_hash":payload_hash(values,data_hashes)}
    with path.open("xb") as f:
        np.savez_compressed(f,values=np.asarray(values,dtype="<f8"),data_hashes=np.asarray(data_hashes,dtype="S64"),metadata=np.frombuffer(json_bytes(metadata),dtype=np.uint8))


def read_npz(path):
    with np.load(path,allow_pickle=False) as data:
        values=data["values"];hashes=data["data_hashes"];meta=json.loads(data["metadata"].tobytes())
    if payload_hash(values,hashes)!=meta["payload_hash"]: raise ValueError("World payload substitution")
    return values,hashes,meta


def compute_chunk(p,phase,setting,methods,start,stop):
    values=np.full((len(methods),stop-start,13),np.nan);hashes=[];errors=[]
    for world in range(start,stop):
        x,y=generate(p,phase,setting,world)
        hashes.append(digest(np.asarray(x,dtype="<f8").tobytes()+np.asarray(y,dtype="<f8").tobytes()))
        for i,method in enumerate(methods):
            try:
                random_seed=seed(p,phase,setting["id"],world,method) if method in p["seed"]["streams"] else 0
                values[i,world-start]=infer(x,y,method,seed=random_seed,effects=p["effect_grid"],resamples=p["inference"]["resamples"])
            except (ValueError,np.linalg.LinAlgError,FloatingPointError) as exc:
                errors.append({"world":world,"method":method,"error":type(exc).__name__+": "+str(exc)})
    return values,np.asarray(hashes,dtype="S64"),errors


def selection_guard(root,folder,p):
    path=folder/"selection.json"
    if not path.exists(): raise ValueError("Confirmation unopened: selection receipt missing")
    actual=path.read_bytes()
    try: historical=subprocess.check_output(["git","show","HEAD:data/exports/research_os_v0_1_1/selection.json"],cwd=root,stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError as exc: raise ValueError("Selection must be committed before confirmation") from exc
    if actual!=historical: raise ValueError("Selection changed after commit")
    receipt=json.loads(actual)
    disc=validate_phase(folder,"discovery",p)
    # Restore the declared setting order used by the original execution. JSON
    # object ordering cannot change floating-point summation in the audit check.
    ordered={m:{s["id"]:disc["methods"][m][s["id"]] for s in p["settings"]} for m in p["candidates"]}
    expected=select(ordered,p)
    if receipt["selection"]!=expected or receipt["discovery_file_hash"]!=digest((folder/"discovery.json").read_bytes()):
        raise ValueError("Selection does not match frozen discovery rule/evidence")
    if receipt["protocol_sha256"]!=PROTOCOL_SHA or receipt["selection"]["selected"] not in METHODS:
        raise ValueError("No valid selected candidate")
    return receipt["selection"]["selected"],digest(actual)


def assert_inference_unchanged(root,original):
    """A byte-sealed pre-confirmation guard repair permits no inference changes."""
    path="data/exports/research_os_v0_1_1/pre-confirmation-guard-repair.json"
    raw=(root/path).read_bytes()
    committed=subprocess.check_output(["git","show","HEAD:"+path],cwd=root)
    if raw!=committed: raise ValueError("Guard repair must be committed")
    repair=json.loads(raw)
    source="src/research_os/calibration_v011/study.py"
    before=subprocess.check_output(["git","show",original["code_commit"]+":"+source],cwd=root)
    after=subprocess.check_output(["git","show","HEAD:"+source],cwd=root)
    changes=subprocess.check_output(["git","diff","--name-only",original["code_commit"],"HEAD","--","src","pyproject.toml"],cwd=root,text=True).splitlines()
    if (changes!=[source] or repair["protocol_sha256"]!=PROTOCOL_SHA or repair["confirmation_worlds_generated"]!=0
            or repair["study_source_sha256_before"]!=digest(before) or repair["study_source_sha256_after"]!=digest(after)):
        raise ValueError("Unapproved computation change after discovery")
    old_ast=ast.parse(before);new_ast=ast.parse(after)
    # Every numerical, DGP, selector and seed module is byte-identical (changes
    # allow-list above); the only execution file change has its exact byte seal.
    for name in ("compute_chunk","payload_hash","write_npz","read_npz","validate_phase"):
        old=next(n for n in old_ast.body if isinstance(n,ast.FunctionDef) and n.name==name)
        new=next(n for n in new_ast.body if isinstance(n,ast.FunctionDef) and n.name==name)
        if ast.dump(old,include_attributes=False)!=ast.dump(new,include_attributes=False):
            raise ValueError("World computation or validation changed in guard repair")
    return digest(raw)


def validate_phase(folder,phase,p):
    report=json.loads((folder/(phase+".json")).read_bytes())
    expected_methods=list(METHODS) if phase=="discovery" else [json.loads((folder/"selection.json").read_bytes())["selection"]["selected"]]
    count=p[phase+"_worlds"]
    expected_paths={phase+"/"+s["id"]+".npz" for s in p["settings"]}
    if (report["protocol_sha256"]!=PROTOCOL_SHA or report["methods"].keys()!=set(expected_methods)
            or set(report["artifacts"])!=expected_paths or report["worlds"]!=count):
        raise ValueError("Phase candidate/setting/world family substitution")
    for setting in p["settings"]:
        name=phase+"/"+setting["id"]+".npz";path=folder/name
        if digest(path.read_bytes())!=report["artifacts"][name]: raise ValueError("Artifact bytes changed")
        values,hashes,meta=read_npz(path)
        if (values.shape!=(len(expected_methods),count,13) or hashes.shape!=(count,)
                or meta["methods"]!=expected_methods or meta["phase"]!=phase or meta["setting"]!=setting["id"]
                or meta["protocol_sha256"]!=PROTOCOL_SHA or meta["execution"]!=report["execution"]):
            raise ValueError("Artifact run/family binding mismatch")
        for index,method in enumerate(expected_methods):
            errors=sum(r["method"]==method for r in meta["errors"])
            row=({"worlds":count,"failed_worlds":errors,"accepted":False,"status":"UNAVAILABLE"} if errors
                 else {**summarize(values[index],p),"failed_worlds":0})
            if row!=report["methods"][method][setting["id"]]: raise ValueError("Metrics do not match retained worlds")
    expected_status="DISCOVERY_ONLY" if phase=="discovery" else ("CONFIRMED_FOR_FROZEN_DGPS"
        if all(r["accepted"] for rows in report["methods"].values() for r in rows.values()) else "NOT_CONFIRMED")
    if report["status"]!=expected_status: raise ValueError("False inference gate badge")
    return report


def run(root,phase,*,resume=False,workers=4):
    p=load(root);folder=root/"data/exports/research_os_v0_1_1"
    if phase not in ("discovery","confirmation","canary"): raise ValueError("Unknown phase")
    selection_hash=None
    methods=list(METHODS)
    if phase=="confirmation":
        chosen,selection_hash=selection_guard(root,folder,p);methods=[chosen]
    count=p[phase+"_worlds"] if phase!="canary" else p["execution"]["canary_worlds"]
    if not 1<=workers<=p["execution"]["workers_max"]: raise ValueError("Worker limit exceeded")
    output=folder/(phase+".json")
    if phase=="canary":
        if (folder/"selection.json").exists(): methods=list(METHODS)
        reports={name:{} for name in methods}
        for setting in p["settings"]:
            values,_,errors=compute_chunk(p,phase,setting,methods,0,count)
            if errors or not np.isfinite(values).all(): raise ValueError("Infrastructure canary failed")
            for i,name in enumerate(methods): reports[name][setting["id"]]=summarize(values[i],p,simultaneous=False)
        return {"status":"CANARY_ONLY","worlds_per_setting":count,"methods":reports}
    if output.exists(): raise ValueError("Completed phase immutable; no outcome rerun")
    identity=execution(root)
    if phase=="confirmation":
        original=json.loads((folder/"discovery.json").read_bytes())["execution"]
        for key in ("runner_hash","environment"):
            if identity[key]!=original[key]: raise ValueError("Inference code/environment changed after discovery selection")
        if identity["source_hash"]!=original["source_hash"]:
            identity["pre_confirmation_guard_repair_hash"]=assert_inference_unchanged(root,original)
    runtime=root/"data/exports/replay-source/inference-v011-runtime"/phase
    with process_lock(runtime):
        header=runtime/"identity.json"
        expected={"protocol_sha256":PROTOCOL_SHA,"phase":phase,"methods":methods,"worlds":count,"execution":identity,"selection_hash":selection_hash}
        if header.exists():
            if not resume or json.loads(header.read_bytes())!=expected: raise ValueError("Resume requires identical protocol/code/environment/selection")
        else: exclusive_json(header,expected)
        ledger(folder,"START",expected)
        jobs=[];chunk_size=128
        completed={r["payload"]["file"]:r["payload"]["sha256"] for r in read_ledger(folder) if r["event"]=="CHUNK_SUCCESS" and r["payload"]["phase"]==phase}
        for setting in p["settings"]:
            for start in range(0,count,chunk_size):
                stop=min(start+chunk_size,count);key=f"{setting['id']}/{start:06d}-{stop:06d}.npz";path=runtime/key
                if key in completed:
                    if not path.exists() or digest(path.read_bytes())!=completed[key]: raise ValueError("Checkpoint bytes changed")
                elif path.exists(): raise ValueError("Unreceipted checkpoint: retained for audit, cannot silently reuse")
                else: jobs.append((setting,start,stop,key))
        try:
            with ProcessPoolExecutor(max_workers=workers) as pool:
                pending={pool.submit(compute_chunk,p,phase,s,methods,a,b):(s,a,b,key) for s,a,b,key in jobs}
                for i,future in enumerate(as_completed(pending),1):
                    s,a,b,key=pending[future];values,hashes,errors=future.result()
                    meta={**expected,"setting":s["id"],"start":a,"stop":b,"errors":errors}
                    path=runtime/key;write_npz(path,values,hashes,meta)
                    ledger(folder,"CHUNK_SUCCESS",{"phase":phase,"file":key,"sha256":digest(path.read_bytes()),"worlds":b-a,"errors":len(errors)})
                    print(f"{phase}: {i}/{len(jobs)} new fixed chunks complete",flush=True)
        except BaseException as exc:
            ledger(folder,"ABORT_OR_ERROR",{"phase":phase,"reason":type(exc).__name__+": "+str(exc)});raise
        reports={name:{} for name in methods};artifacts={}
        for setting in p["settings"]:
            pieces=[];hash_pieces=[];errors=[]
            for start in range(0,count,chunk_size):
                stop=min(start+chunk_size,count);path=runtime/f"{setting['id']}/{start:06d}-{stop:06d}.npz"
                v,h,meta=read_npz(path)
                if any(meta.get(k)!=value for k,value in expected.items()) or meta["start"]!=start or meta["stop"]!=stop or meta["setting"]!=setting["id"]:
                    raise ValueError("Checkpoint run binding mismatch")
                pieces.append(v);hash_pieces.append(h);errors+=meta["errors"]
            values=np.concatenate(pieces,axis=1);hashes=np.concatenate(hash_pieces)
            path=folder/phase/(setting["id"]+".npz")
            meta={**expected,"setting":setting["id"],"errors":errors,"generated_at":utcnow(),"evidence_mode":"SYNTHETIC_CALIBRATION"}
            if path.exists():
                old_v,old_h,old_meta=read_npz(path)
                if not np.array_equal(old_v,values,equal_nan=True) or not np.array_equal(old_h,hashes) or any(old_meta.get(k)!=value for k,value in expected.items()):
                    raise ValueError("Completed artifact substitution")
            else: write_npz(path,values,hashes,meta)
            artifacts[path.relative_to(folder).as_posix()]=digest(path.read_bytes())
            for i,name in enumerate(methods):
                failures=sum(r["method"]==name for r in errors)
                reports[name][setting["id"]]=({"worlds":count,"failed_worlds":failures,"accepted":False,"status":"UNAVAILABLE"}
                    if failures else {**summarize(values[i],p),"failed_worlds":0})
        status="DISCOVERY_ONLY" if phase=="discovery" else ("CONFIRMED_FOR_FROZEN_DGPS" if all(r["accepted"] for rows in reports.values() for r in rows.values()) else "NOT_CONFIRMED")
        report={**expected,"status":status,"completed_at":utcnow(),"methods":reports,"artifacts":artifacts,"evidence_mode":"SYNTHETIC_CALIBRATION"}
        exclusive_json(output,report)
        ledger(folder,"SUCCESS",{"phase":phase,"output_sha256":digest(output.read_bytes()),"status":status})
        if phase=="discovery":
            selection={"protocol_sha256":PROTOCOL_SHA,"selected_at":utcnow(),"discovery_file_hash":digest(output.read_bytes()),"selection":select(reports,p),"confirmation_worlds_generated":0}
            exclusive_json(folder/"selection.json",selection)
            ledger(folder,"SELECTION_FROZEN",{"selection_sha256":digest((folder/"selection.json").read_bytes()),"selected":selection["selection"]["selected"]})
        return report
