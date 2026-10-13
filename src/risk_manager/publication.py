"""Two positive publication schemas, exact references, atomic manifest commit."""
from __future__ import annotations
from contextlib import contextmanager
from hashlib import sha256
from pathlib import Path
import os
import re
from .contracts import StateEnvelope,SweepEnvelope,canonical,decode,digest,counts,CLAIMS,identity,clock
from .policy import load,validate_rule

LICENCE=dict(status="FIRST_PARTY",permitted_uses=["publish_derived"],dataset_key="project:risk-manager-evidence",valid_through=None)
KINDS={"risk-state":StateEnvelope,"risk-sweep":SweepEnvelope}
LIMIT=128*1024

def safe_payload(value):
    forbidden={"price","prices","rawprices","rawprice","lastprice","prevclose","adjclose","adjustedclose",
        "spot","ohlc","ohlcv","candles","bars","open","close","volume","mark","entryprice","last","bid","ask",
        "high","low","credentials","database","modelobject","providerrows","executiontapes","rawholdings"}
    if isinstance(value,dict):
        for k,v in value.items():
            if re.sub(r"[_ -]","",k.lower()) in forbidden:
                raise ValueError("Forbidden public field")
            safe_payload(v)
    elif isinstance(value,list):
        for v in value:
            safe_payload(v)
    elif isinstance(value,str):
        if re.search(r'(?:https?://|file:|data:|[A-Z]:[\\/]|\.\./)',value):
            raise ValueError("Arbitrary public URL/path/payload")
        if re.search(r'(?:raw_prices|last_price|adj_close|ohlcv)\s*["\x27]?\s*[:=]',value,re.I):
            raise ValueError("Encoded provider payload")
        if re.search(r'(?:api[_-]?key|password|authorization|secret|token)\s*[:=]\s*\S+',value,re.I):
            raise ValueError("Credential carrier")
        if len(value)>80 and re.fullmatch(r"[A-Za-z0-9+/]+={0,2}",value):
            raise ValueError("Encoded payload carrier")

def validate_refs(refs, root, staged=None):
    root=Path(root)
    evidence=decode((root/"eval/risk_manager/v0.1/evidence-map.json").read_bytes())
    policy=load(root)
    artifacts={s["artifact_id"]:s["entry"] for s in evidence["artifacts"].values()}
    artifacts.update(evidence["health_history"])
    selectors=set(evidence["artifacts"])|{"health_history_"+i.rsplit(":",1)[-1] for i in evidence["health_history"]}
    for r in refs:
        if r["type"]=="REPLAY_ARTIFACT" and r["selector_id"]=="risk_coverage":
            identity=r["artifact_id"]
            if not re.fullmatch(r"risk:state:[a-f0-9]{64}",identity) or r["kind"]!="risk-state" or r["run_id"] is not None:
                raise ValueError("Invalid coverage page reference")
            if staged and identity in staged:
                page,raw=staged[identity]
            else:
                path=root/"frontend-v2/public/artifacts/replay"/(identity.replace(":","-")+".json")
                raw=path.read_bytes(); page=decode(raw)
            if r["sha256"]!=sha256(raw).hexdigest() or r["bytes"]!=len(raw) or identity.rsplit(":",1)[-1]!=r["sha256"]:
                raise ValueError("Coverage page bytes mismatch")
            if page["payload"]["issues"] or page["payload"]["evidence_index"] and any(x.get("selector_id")=="risk_coverage" for x in page["payload"]["evidence_index"]):
                raise ValueError("Coverage page is not a bounded leaf")
            validate_public(page,root,staged=staged)
        elif r["type"]=="REPLAY_ARTIFACT":
            if r["artifact_id"] not in artifacts or r["selector_id"] not in selectors:
                raise ValueError("Unreviewed artifact/selector")
            e=artifacts[r["artifact_id"]]
            expected=[e["sha256"],e["bytes"],e["kind"],e["as_of"],e["available_at"],e["sources"]]
            actual=[r["sha256"],r["bytes"],r["kind"],r["as_of"],r["available_at"],r["source_ids"]]
            if canonical(actual)!=canonical(expected):
                raise ValueError("Reference binding substitution")
            assigned=evidence["artifacts"].get(r["selector_id"])
            if assigned and assigned["artifact_id"]!=r["artifact_id"]:
                raise ValueError("Reference selector/subject substitution")
        elif r["type"]=="FROZEN_FILE":
            s=evidence["files"].get(r["path_id"])
            if not s or r["selector_id"]!=r["path_id"] or r["assertion_id"]!=r["path_id"] or r["commit"]!=evidence["base"]:
                raise ValueError("Unreviewed file assertion")
            if (r["sha256"],r["bytes"])!=(s["sha256"],s["bytes"]):
                raise ValueError("Frozen file reference substitution")
        elif r["type"]=="POLICY_ASSERTION":
            if r["policy_sha256"]!=policy["sha256"]:
                raise ValueError("Policy assertion substitution")

def validate_public(value, root, staged=None):
    if value.get("kind") not in KINDS:
        raise ValueError("Unapproved risk kind")
    model=KINDS[value["kind"]].model_validate(value)
    parsed=model.model_dump(mode="json")
    safe_payload(parsed)
    policy=load(root)
    if parsed["claim_flags"]!=CLAIMS or parsed["licence"]!=LICENCE:
        raise ValueError("Claim/licence promotion")
    if parsed["evidence_cutoff"]!=policy["evaluation_cutoff"] or clock(parsed["published_at"])<clock(parsed["evidence_cutoff"]):
        raise ValueError("Publication/cutoff substitution")
    p=parsed["payload"]
    refs=[]
    if parsed["kind"]=="risk-state":
        if p["counts"]!=counts(p["issues"]) or p["policy"]["sha256"]!=policy["sha256"] or p["policy"]["rules"]!=policy["rules"]:
            raise ValueError("Counts/policy substitution")
        if len({i["issue_id"] for i in p["issues"]})!=len(p["issues"]):
            raise ValueError("Duplicate Issue identity")
        for i in p["issues"]:
            validate_rule(i,policy)
            if i["issue_id"]!=identity(i):
                raise ValueError("Issue identity substitution")
            if i["evidence_class"] not in {"REAL_RETAINED","UNAVAILABLE","RETAINED_SYNTHETIC"}:
                raise ValueError("Private/example/test evidence in production")
            refs.extend(i["evidence_refs"])
        refs.extend(p["evidence_index"])
        for c in p["coverage"]:
            refs.extend(c["evidence_refs"])
            if c["availability"]=="UNAVAILABLE" and c["outcome"]!="NOT_EVALUATED":
                raise ValueError("Missing check presented healthy")
        bare={k:v for k,v in p.items() if k!="state_id"}
        if digest(bare)!=p["state_id"]:
            raise ValueError("State identity substitution")
    else:
        if p["policy_sha256"]!=policy["sha256"]:
            raise ValueError("Sweep policy substitution")
        for o in p["observations"]:
            validate_rule(o,policy)
            if o["issue_id"]!=identity(o):
                raise ValueError("Observation identity substitution")
            refs.extend(o["evidence_refs"])
        if p["failure"]:
            validate_rule(p["failure"]["issue"],policy)
            refs.extend(p["failure"]["issue"]["evidence_refs"])
        actual={k:sum(t["transition"]==k.upper() for t in p["transitions"]) for k in ("new","unchanged","updated","resolved")}
        if actual!=p["transition_counts"]:
            raise ValueError("Transition count substitution")
        if parsed["published_at"]!=p["published_at"]:
            raise ValueError("Receipt publication clock mismatch")
    validate_refs(refs,root,staged=staged)
    raw=canonical(parsed)+b"\n"
    if len(raw)>LIMIT:
        raise ValueError("Risk artifact exceeds 128 KiB budget")
    return parsed,raw

@contextmanager
def writer_lock(root):
    path=Path(root)/"data/exports/risk_manager_v0_1/.publication-lock"
    path.parent.mkdir(parents=True,exist_ok=True)
    try:
        fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    except FileExistsError as exc:
        raise RuntimeError("Risk publication already in progress") from exc
    try:
        os.write(fd,str(os.getpid()).encode()); os.close(fd)
        yield
    finally:
        path.unlink(missing_ok=True)

def entry(identity, value, raw):
    return dict(status="AVAILABLE",kind=value["kind"],url="/artifacts/replay/"+identity.replace(":","-")+".json",
        sha256=sha256(raw).hexdigest(),bytes=len(raw),sources=value["sources"],licence=LICENCE,
        input_hash=value["input_hash"],as_of=value["published_at"],observed_at=value["published_at"],
        available_at=value["published_at"],reason=None,scope="RETAINED_RISK_EVIDENCE")

def publish(root, state, sweep, *, expected_manifest, interrupt=None, extra_states=()):
    root=Path(root); public=root/"frontend-v2/public"; exports=root/"data/exports/risk_manager_v0_1"
    values=list(extra_states)+([state,sweep] if state else [sweep])
    prepared=[]
    staged={}
    for value in values:
        checked,raw=validate_public(value,root,staged=staged)
        kind="state" if checked["kind"]=="risk-state" else "sweep"
        ident="risk:"+kind+":"+sha256(raw).hexdigest()
        prepared.append((ident,checked,raw))
        staged[ident]=(checked,raw)
    manifest_path=public/"replay-manifest.json"
    if manifest_path.read_bytes()!=expected_manifest:
        raise ValueError("Manifest moved during sweep")
    m=decode(expected_manifest); owned=[]
    try:
        for ident,value,raw in prepared:
            paths=[public/"artifacts/replay"/(ident.replace(":","-")+".json"),
                   exports/(ident.split(":")[1]+"-"+ident.split(":")[2]+".json")]
            for path in paths:
                if path.exists():
                    if path.read_bytes()!=raw:
                        raise ValueError("Immutable risk bytes replaced")
                else:
                    path.parent.mkdir(parents=True,exist_ok=True)
                    path.write_bytes(raw); owned.append(path)
            m["artifacts"][ident]=entry(ident,value,raw)
            if value["kind"]=="risk-state" and value is not None and checked_primary(value,state):
                m["routes"]["/risk-manager/state"]=ident
                m["routes"]["/risk-manager/state?sweep_id="+sweep["payload"]["sweep_id"]]=ident
            elif value["kind"]=="risk-sweep":
                m["routes"]["/risk-manager/sweep"]=ident
                m["routes"]["/risk-manager/sweep?sweep_id="+value["payload"]["sweep_id"]]=ident
        if interrupt:
            interrupt()
        # Manifest is the sole visibility/commit point. No cyclic state/receipt hash.
        m["as_of"]=max(m["as_of"],sweep["published_at"])
        if manifest_path.read_bytes()!=expected_manifest:
            raise ValueError("Concurrent manifest writer")
        temporary=manifest_path.with_name("replay-manifest.risk-pending")
        temporary.write_bytes(canonical(m)+b"\n")
        os.replace(temporary,manifest_path)
        pointer=exports/"manifest.json"
        pointer.write_bytes(canonical({"schema_version":"risk-publication/1","latest_sweep":prepared[-1][0],
            "latest_state":m["routes"].get("/risk-manager/state")})+b"\n")
    except BaseException:
        # If manifest committed, those content-addressed files are now owned history.
        current=decode(manifest_path.read_bytes())
        for path in owned:
            if not any(path.name==i.replace(":","-")+".json" or path.name==i.split(":")[1]+"-"+i.split(":")[2]+".json"
                       for i in current["artifacts"] if i.startswith("risk:")):
                path.unlink(missing_ok=True)
        manifest_path.with_name("replay-manifest.risk-pending").unlink(missing_ok=True)
        raise
    return {"state_ref":m["routes"].get("/risk-manager/state"),"sweep_ref":prepared[-1][0],
            "writes":len(owned)+2}

def read_artifact(root, manifest, identity):
    e=manifest["artifacts"].get(identity)
    if not e or not re.fullmatch(r"risk:(state|sweep):[a-f0-9]{64}",identity):
        raise ValueError("Unknown risk artifact")
    raw=(Path(root)/"frontend-v2/public"/e["url"].lstrip("/")).read_bytes()
    if len(raw)!=e["bytes"] or sha256(raw).hexdigest()!=e["sha256"] or e["sha256"]!=identity.rsplit(":",1)[-1]:
        raise ValueError("Risk bytes mismatch")
    value=decode(raw)
    validate_public(value,root)
    if entry(identity,value,raw)!=e:
        raise ValueError("Risk manifest entry substitution")
    return value


def checked_primary(value,state):
    return state is not None and value["payload"]["state_id"]==state["payload"]["state_id"]
