from pathlib import Path
from collections import Counter
from src.risk_manager.evidence import EvidenceReaders,forbidden_calls
from src.risk_manager.rules import evaluate
from src.risk_manager.reducer import reduce
from src.risk_manager.contracts import now,partition,clock,utc
ROOT=Path(__file__).resolve().parents[2]

def result():
    with forbidden_calls():
        e=EvidenceReaders(ROOT).read(); o,c=evaluate(e,now()); i,t=reduce([],o,"a"*64)
    return e,o,c,i,t

def test_actual_retained_counts_and_all_origins():
    e,o,c,i,t=result()
    real=[x for x in i if partition(x)=="CURRENT_REAL"]
    expected=Counter({("DATA","HIGH"):8,("DATA","MEDIUM"):2})
    for country in ("US","INDIA"):
        age=(clock(e.cutoff)-clock(utc(e.values["model_"+country]["payload"]["state_at"]))).total_seconds()/86400
        if age>45:expected[("MODEL","HIGH" if age>120 else "MEDIUM")]+=1
    assert Counter((x["category"],x["severity"]) for x in real)==expected
    origins=[x for row in i for x in row["origin_records"] if x["source"]!="phase2-fixture"]
    assert Counter(x["severity"] for x in origins)==Counter(x["severity"] for x in e.values["data_issues"]["payload"]["items"])
    assert {x["id"] for x in origins}=={x["id"] for x in e.values["data_issues"]["payload"]["items"]}
    assert len(c)==76 and len({x["check_id"] for x in c})==76

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
