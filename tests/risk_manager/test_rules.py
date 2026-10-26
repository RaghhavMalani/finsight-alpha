from pathlib import Path
from collections import Counter
from src.risk_manager.evidence import EvidenceReaders,forbidden_calls
from src.risk_manager.rules import evaluate
from src.risk_manager.reducer import reduce
from src.risk_manager.contracts import now,partition,clock,utc,canonical,decode
ROOT=Path(__file__).resolve().parents[2]

def result():
    with forbidden_calls():
        e=EvidenceReaders(ROOT).read(); o,c=evaluate(e,now()); i,t=reduce([],o,"a"*64)
    return e,o,c,i,t

def test_actual_retained_counts_and_all_origins():
    e,o,c,i,t=result()
    real=[x for x in i if partition(x)=="CURRENT_REAL"]
    # Current monitoring follows the admitted Data epoch, not the sealed Risk
    # snapshot's source-failure count. Check subjects as well as severity totals.
    data=e.values["data_issues"]["payload"]["items"]
    health=e.values["data_health"]["payload"]["items"]
    expected_data=[("R-DATA-ATTEMPT",source,"HIGH") for source in sorted({
        row["source"] for row in data
        if row["kind"]=="SOURCE_ATTEMPT_FAILED" and row["severity"]=="HIGH"
    })]
    health_groups={}
    for row in data:
        diagnostic=e.health_history.get(row["evidence"][0])
        if row["kind"]=="PARTIAL_SOURCE_HEALTH" and diagnostic:
            key=(row["source"],diagnostic["window_start"],diagnostic["window_end"])
            health_groups.setdefault(key,[]).append(row)
    current_diagnostics={row["diagnostic_id"] for row in health}
    for (source,_,_),rows in health_groups.items():
        if any(set(row["evidence"]) & current_diagnostics for row in rows):
            expected_data.append(("R-DATA-HEALTH",source,max(rows,key=lambda row:row["last_seen_at"])["severity"]))
    policy={row["rule_id"]:row for row in e.policy["rules"]}
    for row in health:
        if row["freshness_status"]=="STALE":
            expected_data.append(("R-DATA-FRESHNESS",row["source"],policy["R-DATA-FRESHNESS"]["severity"]))
        if row["calendar_status"]=="AVAILABLE" and row["missing_sessions"]>0:
            expected_data.append(("R-DATA-GAPS",row["source"],policy["R-DATA-GAPS"]["severity"]))
    if e.values["data_disagreement"]["payload"]["summary"]["different"]>0:
        expected_data.append(("R-DATA-MIRROR","alfred-bls",policy["R-DATA-MIRROR"]["severity"]))
    assert Counter((row["rule_id"],row["scope"]["subject_id"],row["severity"]) for row in real if row["category"]=="DATA")==Counter(expected_data)
    expected=Counter(("DATA",severity) for _,_,severity in expected_data)
    for country in ("US","INDIA"):
        age=(clock(e.cutoff)-clock(utc(e.values["model_"+country]["payload"]["state_at"]))).total_seconds()/86400
        if age>45:expected[("MODEL","HIGH" if age>120 else "MEDIUM")]+=1
    assert Counter((x["category"],x["severity"]) for x in real)==expected
    origins=[x for row in i for x in row["origin_records"] if x["source"]!="phase2-fixture"]
    assert Counter(canonical(x) for x in origins)==Counter(canonical(x) for x in data)
    # The sealed October 23 publication remains exact. New current inputs can
    # add a required-source check without rewriting that historical coverage.
    state_entry=e.manifest["artifacts"]["risk:state:70ac82fde3f0f115fa4eda0beda7451f1b4d17bbecf260fd1e5534f761a2be0f"]
    sealed=decode((ROOT/"frontend-v2/public"/state_entry["url"].lstrip("/")).read_bytes())["payload"]
    coverage_ref=next(row for row in sealed["evidence_index"] if row["selector_id"]=="risk_coverage")
    coverage_entry=e.manifest["artifacts"][coverage_ref["artifact_id"]]
    sealed_coverage=decode((ROOT/"frontend-v2/public"/coverage_entry["url"].lstrip("/")).read_bytes())["payload"]["coverage"]
    assert len(sealed["issues"])==34 and len(sealed_coverage)==76
    assert sum(origin["source"]!="phase2-fixture" for issue in sealed["issues"] for origin in issue["origin_records"])==47
    expected_checks={row["check_id"] for row in sealed_coverage if row["category"]!="DATA"}
    for row in data:
        if row["kind"]=="SOURCE_ATTEMPT_FAILED":
            rule="R-DATA-ATTEMPT"
            key="required-source" if row["severity"]=="HIGH" else "historical:"+row["id"]
        else:
            rule="R-DATA-HEALTH"
            diagnostic=e.health_history.get(row["evidence"][0])
            key=("health:"+diagnostic["window_start"]+":"+diagnostic["window_end"]
                 if diagnostic else "historical:"+row["id"])
        expected_checks.add(policy[rule]["check_id"]+":"+row["source"]+":"+key)
    for row in e.monitoring["unresolved_diagnostics"]:
        expected_checks.add(policy["R-DATA-HEALTH"]["check_id"]+":"+row["source"]+":historical-diagnostic:"+row["origin_id"])
    for row in health:
        key=row["window_start"]+":"+row["window_end"]+":"+row["library_start"]
        expected_checks.add(policy["R-DATA-FRESHNESS"]["check_id"]+":"+row["source"]+":"+key)
        expected_checks.add(policy["R-DATA-GAPS"]["check_id"]+":"+row["source"]+":"+key
                            if row["calendar_status"]=="AVAILABLE" else "DATA_GAPS:"+row["source"])
    expected_checks.update(policy["R-DATA-MIRROR"]["check_id"]+":"+source+":v0.1"
                           for source in ("alfred-bls","independent-market-providers"))
    assert {row["check_id"] for row in c}==expected_checks
    assert len(c)==len(expected_checks)

def test_models_and_research_not_invented_and_missing_checks_not_green():
    _,o,c,i,_=result()
    assert not any(x["rule_id"] in {"R-MODEL-OOD","R-MODEL-HMM-CONVERGENCE","R-MODEL-GARCH-CONVERGENCE","R-RESEARCH-GATE","R-RESEARCH-PREREG","R-RESEARCH-FAMILY"} for x in i)
    gaps=[x for x in c if x["category"]=="PORTFOLIO"]
    assert len(gaps)==6 and all(x["availability"]=="UNAVAILABLE" and x["outcome"]=="NOT_EVALUATED" for x in gaps)
    assert all(x["outcome"]=="NOT_EVALUATED" for x in c if x["reason_code"]=="HISTORICAL_WINDOW_ONLY")
    assert all(x["evidence_class"]=="RETAINED_SYNTHETIC" for x in i if x["rule_id"]=="R-RESEARCH-FIXTURE-WARNING")

def test_inherited_model_boundaries_without_fits():
    e=EvidenceReaders(ROOT).read()
    e.values["model_US"]["payload"]["hmm"]["hmm2"]["recent_switches"]=6
    e.values["model_US"]["payload"]["hmm"]["hmm2"]["converged"]=False
    e.values["model_US"]["payload"]["hmm"]["hmm2"]["ood"]=True
    o,_=evaluate(e,now())
    found={x["rule_id"]:x["severity"] for x in o if x["scope"]["subject_id"]=="US-MKT:hmm2" and x["outcome"]=="FINDING"}
    assert found=={"R-MODEL-HMM-CONVERGENCE":"MEDIUM","R-MODEL-INSTABILITY":"MEDIUM","R-MODEL-OOD":"LOW"}
