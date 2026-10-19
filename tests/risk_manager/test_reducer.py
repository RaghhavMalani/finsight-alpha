from copy import deepcopy
from pathlib import Path
from src.risk_manager.evidence import EvidenceReaders
from src.risk_manager.rules import evaluate
from src.risk_manager.contracts import digest,identity,now,clock
from datetime import timedelta

def later(value,days=1):
    return (clock(value)+timedelta(days=days)).isoformat().replace("+00:00","Z")
from src.risk_manager.reducer import reduce

def sample():
    e=EvidenceReaders(Path(__file__).resolve().parents[2]).read()
    observations,_=evaluate(e,later(e.cutoff))
    return next(o for o in observations if o["rule_id"]=="R-MODEL-AGE" and o["asset"]=="IN-MKT")

def revision(o,**updates):
    out=deepcopy(o); out.update(updates)
    relevant={k:v for k,v in out.items() if k not in {"observation_id","fingerprint","witnessed_at","previous_observation_id"}}
    out["fingerprint"]=digest(relevant); out["observation_id"]=digest(["risk-observation/1",out["issue_id"],out["fingerprint"]])
    return out

def test_repeat_preserves_first_seen_occurrences_and_identity():
    o=sample(); i,t=reduce([],[o],"a"*64)
    same=revision(o,witnessed_at=later(o["witnessed_at"]))
    again,trans=reduce(i,[same],"b"*64,[o])
    assert again==i and trans[0]["transition"]=="UNCHANGED"

def test_missing_evidence_and_policy_change_never_resolve():
    o=sample(); i,_=reduce([],[o],"a"*64)
    missing=revision(o,outcome="NOT_EVALUATED",currency="UNCONFIRMED",availability="UNAVAILABLE")
    same,t=reduce(i,[missing],"b"*64,[o])
    assert same==i and t[0]["transition"]=="UNCHANGED"
    changed=revision(o,outcome="CLEAR",reason_code=None,policy_sha256="b"*64)
    changed["evidence_refs"][0]["sha256"]="b"*64
    same,t=reduce(i,[changed],"b"*64,[o])
    assert same[0]["status"]=="OPEN" and t[0]["transition"]=="UNCHANGED"

def test_positive_changed_evidence_resolves_and_same_identity_reopens():
    o=sample(); i,_=reduce([],[o],"a"*64)
    clear=revision(o,outcome="CLEAR",reason_code=None,witnessed_at=later(o["witnessed_at"]))
    clear["evidence_refs"][0]["sha256"]="b"*64
    clear=revision(clear)
    closed,t=reduce(i,[clear],"b"*64,[o])
    assert closed[0]["status"]=="RESOLVED" and t[0]["transition"]=="RESOLVED"
    reopen=revision(o,witnessed_at=later(o["witnessed_at"],2))
    reopen["evidence_refs"][0]["sha256"]="c"*64
    reopen=revision(reopen)
    opened,t=reduce(closed,[reopen],"c"*64,[clear])
    assert opened[0]["status"]=="OPEN" and opened[0]["issue_id"]==i[0]["issue_id"]
    assert opened[0]["first_seen_at"]==i[0]["first_seen_at"] and opened[0]["occurrences"]==2
