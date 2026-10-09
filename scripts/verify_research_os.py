"""Verify frozen evidence, complete accounting and the fail-closed engine gate."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.eval.canonical import canonical_json_bytes,canonical_sha256,sha256_bytes
from src.research_os.contracts import Preregistration,FreezeReceipt,Run,Artifact,StatisticalResult,Scorecard,utc
from src.research_os.runner import validate_run
from src.research_os.multiple_testing import correct
from src.research_os.calibration import calibrate
from src.research_os.projection import scorecard
from src.research_os.power import wilson
from src.research_os.dag import validate_dag
from scripts.research_archive import verify_shared_history

FROZEN=ROOT/"data/exports/research_os_v0_1"


def read(name): return json.loads((FROZEN/name).read_bytes())


def require(condition,reason):
    if not condition: raise ValueError(reason)


def verify(full_calibration=False):
    manifest=read("manifest.json")
    for name,digest in manifest["files"].items():
        require(sha256_bytes((FROZEN/name).read_bytes())==digest,"Frozen byte substitution: "+name)
    spec=Preregistration.model_validate(read("preregistration.json"));receipt=FreezeReceipt.model_validate(read("freeze-receipt.json"))
    identities=read("identities.json")
    require(spec.identity==identities["preregistration_hash"] and receipt.identity==identities["freeze_receipt_hash"],"Freeze identity mismatch")
    # Compare the actual historical Git blob: preregistration was committed before either execution.
    frozen_commit=manifest["preregistration_commit"]
    committed=subprocess.check_output(["git","show",frozen_commit+":data/exports/research_os_v0_1/preregistration.json"],cwd=ROOT)
    require(Preregistration.model_validate_json(committed).identity==spec.identity,"Committed preregistration mismatch")
    cal=read("calibration.json");study=read("flagship.json")
    require(utc(receipt.frozen_at)<utc(cal["started_at"])<utc(study["started_at"]),"Freeze/execution clock mismatch")
    settings=spec.parameters["calibration"]
    require(cal["preregistration_hash"]==spec.identity and cal["settings_hash"]==canonical_sha256(settings),"Calibration settings substitution")
    require(cal["worlds_per_case"]>=1000,"Scientific calibration weakened")
    accepted=True
    for key,case in cal["cases"].items():
        for mode in ("null","planted"):
            p=case["p_values"][mode]
            require(len(p)==settings["worlds"] and all(0<=v<=1 for v in p),"Incomplete calibration worlds")
            interval=wilson(sum(v<settings["alpha"] for v in p),len(p))
            require(interval==case[mode],"Calibration interval/count substitution")
        null_ok=case["null"]["ci_lower"]<=settings["alpha"]<=case["null"]["ci_upper"]
        power_ok=case["planted"]["ci_lower"]>=.8
        require(null_ok==case["null_accepted"] and power_ok==case["power_accepted"],"Calibration criterion changed")
        accepted=accepted and null_ok and power_ok
    accepted=accepted and all(r["ci_upper"]<=.075 for r in cal["family"].values())
    require(cal["status"]==("CALIBRATED" if accepted else "NOT_CALIBRATED"),"False CALIBRATED badge")
    if full_calibration:
        recalculated=calibrate(settings)
        require(recalculated["generated_data_hash"]==cal["generated_data_hash"] and recalculated["seed_hash"]==cal["seed_hash"],"Full calibration input mismatch")
        require(recalculated["status"]==cal["status"],"Full calibration acceptance changed")
        for key,case in cal["cases"].items():
            for mode in ("null","planted"):
                import numpy as np
                require(np.allclose(recalculated["cases"][key]["p_values"][mode],case["p_values"][mode],atol=1e-10,rtol=1e-10),"Full frozen calibration metric mismatch")
    records=study["records"]
    require(set(records)==set(spec.family.trial_ids),"Missing unsuccessful family trial")
    correction=correct(spec.family,{k:r["payload"]["result"]["p_value"] for k,r in records.items()})
    starts={e["attempt"]:e for e in study["attempts"] if e["kind"]=="START"}
    endings={e["attempt"]:e for e in study["attempts"] if e["kind"]=="SUCCESS"}
    for key,row in records.items():
        run=Run.model_validate(row["run"]);artifact=Artifact.model_validate(row["artifact"])
        validate_run(spec,receipt,run)
        require(run.identity==row["run_hash"] and run.trial_id==key,"Run identity substitution")
        require(artifact.identity==row["artifact_hash"] and artifact.run_hash==run.identity,"Artifact/run substitution")
        raw={k:v for k,v in row["payload"].items() if k not in {"correction","sharpe"}}
        require(canonical_sha256(raw)==artifact.payload_sha256,"Output artifact substitution")
        StatisticalResult.model_validate(raw["result"])
        require(row["payload"]["correction"]==correction[key],"Family correction mismatch")
        require(starts[row["attempt"]]["payload"]["run_hash"]==run.identity and endings[row["attempt"]]["payload"]["artifact_hash"]==artifact.identity,"Omitted/unbound execution receipt")
        require(utc(starts[row["attempt"]]["at"])>utc(receipt.frozen_at),"Execution predates freeze")
        subprocess.run(["git","merge-base","--is-ancestor",frozen_commit,run.code_commit],cwd=ROOT,check=True)
    require(scorecard(records,cal).model_dump(mode="json")==study["scorecard"],"Scorecard upgraded without evidence")
    require(study["evidence_mode"]=="CAPTURE_ONLY" and not any(study["claims"].values()),"Claim boundary violation")
    validate_dag(study["dag"]["nodes"],study["dag"]["edges"])
    repeat=read("repeatability.json")
    require(repeat["status"]=="IDENTICAL" and repeat["holdout_openings_after_repeat"]==48,"Repeatability/holdout accounting mismatch")
    require(all(r["metrics_identical"] and r["original_run_hash"]==r["repeat_run_hash"] and r["original_artifact_hash"]==r["repeat_artifact_hash"] for r in repeat["records"]),"Altered-repeat claim")
    mutations=read("mutations.json")
    require(mutations["killed"]==mutations["total"]==12 and all(r["errors"]==0 for r in mutations["mutants"]),"Invalid mutation acceptance")
    # Preserve the historical phase boundary and every old public byte/entry.
    # Only the separately reviewed Phase 2 synthetic plugin publication is added.
    verify_shared_history(ROOT)
    require(not (ROOT/"src/research_os/adapters/vectorbt.py").exists(),"Trading engine crossed the unreviewed gate")
    return {"status":"VERIFIED","scientific_engine_gate":"CLOSED" if not accepted else "REQUIRES_USER_REVIEW",
        "calibration":cal["status"],"trials":len(records),"null_worlds":cal["total_null_worlds"],
        "planted_worlds":cal["total_planted_worlds"],"mutations_killed":12,"holdout_openings":48}


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--full-calibration",action="store_true")
    args=parser.parse_args();print(json.dumps(verify(args.full_calibration),indent=2))
