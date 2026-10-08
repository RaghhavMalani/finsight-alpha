"""Execute the committed calibration or flagship once; preserve failed outcomes."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.eval.canonical import canonical_json_bytes,canonical_sha256
from src.research_os.contracts import Preregistration,FreezeReceipt,now
from src.research_os.registry import Registry
from src.research_os.provenance import code_identity,environment
from src.research_os.calibration import calibrate
from src.research_os.service import ResearchService
from src.research_os.multiple_testing import correct
from src.research_os.sharpe import sharpe_diagnostics
from src.research_os.projection import scorecard
from src.research_os.replication import compare
from src.research_os.dag import validate_dag

FROZEN=ROOT/"data/exports/research_os_v0_1"


def write_once(path,payload):
    with path.open("xb") as stream: stream.write(canonical_json_bytes(payload)+b"\n")


def bound_spec():
    spec=Preregistration.model_validate_json((FROZEN/"preregistration.json").read_bytes())
    receipt=FreezeReceipt.model_validate_json((FROZEN/"freeze-receipt.json").read_bytes())
    identities=json.loads((FROZEN/"identities.json").read_text())
    if spec.identity!=identities["preregistration_hash"] or receipt.identity!=identities["freeze_receipt_hash"]:
        raise ValueError("Frozen specification/receipt bytes changed")
    return spec,receipt


def calibration(canary=False):
    spec,_=bound_spec();commit,code_hash=code_identity(ROOT)
    destination=(ROOT/"data/exports/replay-source/research-calibration-canary.json") if canary else FROZEN/"calibration.json"
    if destination.exists(): raise ValueError("Calibration already executed; refuse overwrite or outcome repair")
    started=now();settings=spec.parameters["calibration"]
    result=calibrate(settings,worlds=settings["canary_worlds"] if canary else None)
    result.update(code_commit=commit,code_sha256=code_hash,environment=environment(),
        preregistration_hash=spec.identity,started_at=started,finished_at=now())
    write_once(destination,result)
    print(result["status"],result["total_null_worlds"],"null worlds",flush=True)
    for case,r in result["cases"].items(): print(case,r["null"],r["planted"],flush=True)


def flagship():
    spec,receipt=bound_spec();destination=FROZEN/"flagship.json"
    if destination.exists(): raise ValueError("Flagship already executed; refuse overwrite or altered preregistration")
    calibration=json.loads((FROZEN/"calibration.json").read_text())
    registry=Registry(ROOT/"data/exports/replay-source/research-os.db",1)
    service=ResearchService(ROOT,registry,ROOT/"data/exports/replay-source")
    # Resume only interrupted attempts under the identical spec; complete results stay immutable.
    checkpoint=ROOT/"data/exports/replay-source/research-flagship-checkpoint.json"
    records=json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
    cache={};started=now()
    for index,trial in enumerate(spec.family.trial_ids):
        if trial in records:
            from src.research_os.runner import read_artifact
            record=records[trial]
            if read_artifact(registry,record["artifact_hash"],record["run_hash"])!=record["payload"]:
                raise ValueError("Checkpoint artifact substitution")
            continue
        seed=spec.seeds[1] if any(x in trial for x in ("SHUFFLED","RANDOM","PERMUTED")) else spec.seeds[0]
        record=service.run(receipt.identity,trial,seed,cache=cache)
        record["run"]=registry.get(record["run_hash"]).model_dump(mode="json")
        records[trial]=record
        checkpoint.write_bytes(canonical_json_bytes(records))
        print(index+1,trial,record["payload"]["result"]["status"],flush=True)
    correction=correct(spec.family,{k:v["payload"]["result"]["p_value"] for k,v in records.items()})
    import numpy as np
    trial_sharpes=[float(np.mean(r["payload"]["net_returns"])/np.std(r["payload"]["net_returns"],ddof=1))
        for r in records.values() if "net_returns" in r["payload"]]
    # Corrections are a family projection; immutable raw artifacts are never overwritten.
    corrected={k:{**v,"payload":{**v["payload"],"correction":correction[k]}} for k,v in records.items()}
    for c in ("US","INDIA"):
        p=corrected[c+":PRIMARY"]["payload"]
        if "net_returns" in p: p["sharpe"]=sharpe_diagnostics(p["net_returns"],trial_sharpes=trial_sharpes)
    def comparable(key):
        r=records[key];p=r["payload"]
        return {"run_hash":r["run_hash"],"country":p.get("country",key.split(":")[0]),
            "start":p.get("period_start",""),"end":p.get("period_end",""),
            "unit":p["result"]["unit"],"result":p["result"]}
    replications=[compare("EXACT",comparable("US:PRIMARY"),comparable("US:PRIMARY"),
        differences=("Researcher extension; original empirical paper/data/seeds not provided",)).model_dump(mode="json"),
        compare("CROSS_MARKET",comparable("US:PRIMARY"),comparable("INDIA:PRIMARY"),
            differences=("French versus IIMA factor construction", "Different sample dates and calendars", "10 vs 25 assumed bps, not statutory costs")).model_dump(mode="json")]
    for country in ("US","INDIA"):
        replications.append(compare("TEMPORAL",comparable(country+":FIRST_HALF"),comparable(country+":SECOND_HALF"),
            differences=("Disjoint chronological holdout halves; same fixed revised capture",)).model_dump(mode="json"))
    nodes=[{"id":spec.hypothesis.identity,"kind":"HYPOTHESIS","hypothesis_hash":spec.hypothesis.identity}]
    edges=[]
    for trial,record in records.items():
        nodes.append({"id":record["run_hash"],"kind":"RUN","trial_id":trial,"hypothesis_hash":spec.hypothesis.identity,"artifact_hash":record["artifact_hash"]})
        v=trial.split(":")[1]
        kind="BASELINE" if v=="BASELINE" else "PLACEBO" if any(k in v for k in ("WRONG","SHUFFLED","RANDOM","PERMUTED")) else "ABLATION" if v=="NO_CONTROLS" else "EXECUTION" if v=="PRIMARY" else "ROBUSTNESS"
        edges.append({"from":spec.hypothesis.identity,"to":record["run_hash"],"kind":kind})
    result={"schema_version":"research-os/0.1","preregistration_hash":spec.identity,
        "freeze_receipt":receipt.model_dump(mode="json"),"started_at":started,"finished_at":now(),
        "records":corrected,"scorecard":scorecard(corrected,calibration).model_dump(mode="json"),
        "replications":replications,"dag":validate_dag(nodes,edges),"attempts":registry.events(),
        "holdout_openings":registry.holdout_openings(spec.identity),"calibration_status":calibration["status"],
        "claims":{"market_claim_eligible":False,"causal_claim_eligible":False,"validated_alpha":False},
        "evidence_mode":"CAPTURE_ONLY","series_label":"market factor, not a ticker",
        "licence_status":"LOCAL_ONLY — public projection has not been published at the engine gate",
        "scope":"Narrow adapters to existing captures/ledger; Phase 2 plugin SDK and Phase 3 data organ are not claimed complete."}
    write_once(destination,result)
    print(json.dumps(result["scorecard"],indent=2),flush=True)


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("action",choices=("calibration","flagship"));parser.add_argument("--canary",action="store_true")
    args=parser.parse_args()
    if args.action=="calibration": calibration(args.canary)
    else: flagship()
