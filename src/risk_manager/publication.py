"""Two positive publication schemas, exact references, atomic manifest commit."""
from __future__ import annotations
from contextlib import contextmanager
from hashlib import sha256
from pathlib import Path
import os
import base64
import json
import re
from .contracts import StateEnvelope,SweepEnvelope,canonical,decode,digest,counts,CLAIMS,identity,clock
from .policy import load,projection,validate_rule
from .reducer import lifecycle_history,checked_lifecycle_ids
from .monitoring import ALIASES, bundle_at, monitoring_catalog, monitoring_operation

LICENCE=dict(status="FIRST_PARTY",permitted_uses=["publish_derived"],dataset_key="project:risk-manager-evidence",valid_through=None)
KINDS={"risk-state":StateEnvelope,"risk-sweep":SweepEnvelope}
LIMIT=128*1024
CATEGORIES={"DATA","MODEL","RESEARCH_HYGIENE","PORTFOLIO","SIMULATOR","SYSTEM"}

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
        if chr(92) in value:
            raise ValueError("Backslash path/escape carrier")
        candidates=[]
        if len(value)>=4 and len(value)%4==0 and re.fullmatch(r"[A-Za-z0-9+/]+={0,2}",value):
            try:
                candidates.append(base64.b64decode(value,validate=True).decode("utf-8"))
            except (ValueError,UnicodeError):
                pass
        if len(value)>=4 and len(value)%2==0 and re.fullmatch(r"[a-fA-F0-9]+",value):
            try:
                candidates.append(bytes.fromhex(value).decode("utf-8"))
            except (ValueError,UnicodeError):
                pass
        for decoded in candidates:
            try:
                payload=json.loads(decoded)
            except (ValueError,TypeError):
                payload=None
            if isinstance(payload,(dict,list)):
                raise ValueError("Encoded JSON payload carrier")
            safe_payload(decoded)
        if re.search(r'(?:[A-Za-z][A-Za-z0-9+.-]*://|(?:file|data|mailto|tel|blob|javascript):|[A-Za-z]:[\\/]|\.\./|(?<![A-Za-z0-9_.])/(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+)',value,re.I):
            raise ValueError("Arbitrary public URL/path/payload")
        if re.search(r'(?:raw_prices|last_price|adj_close|ohlcv)\s*["\x27]?\s*[:=]',value,re.I):
            raise ValueError("Encoded provider payload")
        if re.search(r'(?:api[_-]?key|password|authorization|secret|token)\s*[:=]\s*\S+',value,re.I):
            raise ValueError("Credential carrier")
        if len(value)>80 and re.fullmatch(r"[A-Za-z0-9+/]+={0,2}",value):
            raise ValueError("Encoded payload carrier")

def validate_refs(refs, root, staged=None, *, cutoff=None, catalog=None):
    root=Path(root)
    evidence=decode((root/"eval/risk_manager/v0.1/evidence-map.json").read_bytes())
    policy=load(root)
    bundle=bundle_at(root,cutoff or policy["evaluation_cutoff"],catalog=catalog)
    assigned_artifacts={**evidence["artifacts"],**bundle["artifacts"]}
    artifacts={s["artifact_id"]:s["entry"] for s in assigned_artifacts.values()}
    artifacts.update(bundle["health_history"])
    selectors=set(assigned_artifacts)|{"health_history_"+i.rsplit(":",1)[-1] for i in bundle["health_history"]}
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
            if (r["as_of"],r["available_at"],r["source_ids"])!=(page["published_at"],page["published_at"],page["sources"]):
                raise ValueError("Coverage page clock/source substitution")
            validate_public(page,root,staged=staged,catalog=catalog)
        elif r["type"]=="REPLAY_ARTIFACT":
            if r["run_id"] is not None:
                raise ValueError("Container has no singular producing run")
            if r["artifact_id"] not in artifacts or r["selector_id"] not in selectors:
                raise ValueError("Unreviewed artifact/selector")
            e=artifacts[r["artifact_id"]]
            expected=[e["sha256"],e["bytes"],e["kind"],e["as_of"],e["available_at"],e["sources"]]
            actual=[r["sha256"],r["bytes"],r["kind"],r["as_of"],r["available_at"],r["source_ids"]]
            if canonical(actual)!=canonical(expected):
                raise ValueError("Reference binding substitution")
            assigned=assigned_artifacts.get(r["selector_id"])
            if assigned and assigned["artifact_id"]!=r["artifact_id"]:
                raise ValueError("Reference selector/subject substitution")
        elif r["type"]=="FROZEN_FILE":
            s=evidence["files"].get(r["path_id"])
            if not s or r["selector_id"]!=r["path_id"] or r["assertion_id"]!=r["path_id"] or r["commit"]!=evidence["base"]:
                raise ValueError("Unreviewed file assertion")
            if (r["sha256"],r["bytes"])!=(s["sha256"],s["bytes"]):
                raise ValueError("Frozen file reference substitution")
        elif r["type"]=="POLICY_ASSERTION":
            if r["policy_sha256"]!=policy["sha256"] or not any(r["check_id"].startswith(rule["check_id"]+":") for rule in policy["rules"]):
                raise ValueError("Policy assertion substitution")

def source_observation(issue, receipt):
    """Resolve a compact Issue pointer only in its owning sealed receipt."""
    refs=issue["evidence_refs"]
    if not any(ref["type"]=="RISK_OBSERVATION" for ref in refs):
        return None
    if len(refs)!=1:
        raise ValueError("Issue source observation requires one exact pointer")
    ref=refs[0]
    payload=receipt["payload"]
    matches=[o for o in payload["observations"] if o["observation_id"]==ref["observation_id"]]
    if (payload["status"]=="FAILED" or ref["sweep_fingerprint"]!=payload["fingerprint"]
            or ref["observation_id"]!=issue["last_observation_id"] or len(matches)!=1):
        raise ValueError("Issue source observation pointer substituted")
    observation=matches[0]
    if observation["outcome"]=="CLEAR":
        raise ValueError("Clearing observation cannot replace Issue finding sources")
    if (observation["issue_id"]!=issue["issue_id"]
            or observation["evidence_cutoff"]!=issue["evidence_cutoff"]
            or observation["evidence_at"]!=issue["evidence_at"]
            or not clock(payload["started_at"])<=clock(observation["witnessed_at"])<=clock(payload["completed_at"])):
        raise ValueError("Issue source observation subject or clock substituted")
    if any(r["type"]=="RISK_OBSERVATION" and r["sweep_fingerprint"]==payload["fingerprint"]
           for r in observation["evidence_refs"]):
        raise ValueError("Issue source observation cannot reference its own sweep")
    return observation


def validate_observation_sources(receipts):
    """Resolve original observation sources through exact, earlier witnesses."""
    observations={}
    for receipt in receipts:
        payload=receipt["payload"]
        for observation in payload["observations"]:
            observations.setdefault((payload["fingerprint"],observation["observation_id"]),[]).append(observation)
    edges={}
    for pair,witnesses in observations.items():
        edges[pair]=set()
        for observation in witnesses:
            for ref in observation["evidence_refs"]:
                if ref["type"]!="RISK_OBSERVATION":
                    continue
                target=(ref["sweep_fingerprint"],ref["observation_id"])
                candidates=observations.get(target,[])
                if target==pair or not any(o["issue_id"]==observation["issue_id"]
                        and clock(o["witnessed_at"])<clock(observation["witnessed_at"]) for o in candidates):
                    raise ValueError("Observation source is missing, self-referential or incompatible")
                edges[pair].add(target)
    complete=set(); active=set()
    def visit(pair):
        if pair in active:
            raise ValueError("Observation source cycle")
        if pair in complete:
            return
        active.add(pair)
        for target in edges[pair]:
            visit(target)
        active.remove(pair); complete.add(pair)
    for pair in edges:
        visit(pair)


def _validate_public(value, root, staged=None, *, catalog=None):
    if value.get("kind") not in KINDS:
        raise ValueError("Unapproved risk kind")
    model=KINDS[value["kind"]].model_validate(value)
    parsed=model.model_dump(mode="json")
    safe_payload(parsed)
    policy=load(root)
    if parsed["claim_flags"]!=CLAIMS or parsed["licence"]!=LICENCE:
        raise ValueError("Claim/licence promotion")
    catalog=catalog or monitoring_catalog(root)
    bundle=bundle_at(root,parsed["evidence_cutoff"],catalog=catalog)
    if clock(parsed["published_at"])<clock(parsed["evidence_cutoff"]):
        raise ValueError("Publication/cutoff substitution")
    p=parsed["payload"]
    refs=[]
    fingerprint=p.get("sweep_fingerprint",p.get("fingerprint"))
    if parsed["input_hash"]!=fingerprint or p["evaluation_cutoff"]!=parsed["evidence_cutoff"]:
        raise ValueError("Envelope/payload fingerprint or cutoff substitution")
    if parsed["sources"]!=["project:risk-manager-evidence"]:
        raise ValueError("Unreviewed publication source")
    if parsed["kind"]=="risk-state":
        pages=[ref for ref in p["evidence_index"] if ref.get("selector_id")=="risk_coverage"]
        full_policy=projection(policy)
        compact_policy=dict(full_policy,rules=[])
        # Only a primary with an exact bound coverage leaf can omit duplicate rules.
        # The identity and the complete rules in that leaf remain mandatory.
        if (p["counts"]!=counts(p["issues"]) or p["policy"] not in (full_policy,compact_policy)
                or (p["policy"]==compact_policy and not pages)):
            raise ValueError("Counts/policy substitution")
        if len({i["issue_id"] for i in p["issues"]})!=len(p["issues"]):
            raise ValueError("Duplicate Issue identity")
        for i in p["issues"]:
            validate_rule(i,policy)
            if i["issue_id"]!=identity(i):
                raise ValueError("Issue identity substitution")
            if i["evidence_class"] not in {"REAL_RETAINED","UNAVAILABLE","RETAINED_SYNTHETIC"}:
                raise ValueError("Private/example/test evidence in production")
            if i["last_observation_id"] not in i["observation_ids"] or i["first_seen_ref"]["observation_id"] not in i["observation_ids"]:
                raise ValueError("Issue lifecycle observation substitution")
            if clock(i["first_seen_at"])>clock(parsed["published_at"]) or (i["resolved_at"] and clock(i["resolved_at"])>clock(parsed["published_at"])):
                raise ValueError("Future lifecycle witness")
            if i["resolution_ref"] and i["resolution_ref"]["observation_id"] not in i["observation_ids"]:
                raise ValueError("Missing resolution observation")
            for ref in i["evidence_refs"]:
                if ref["type"]=="REPLAY_ARTIFACT" and clock(ref["available_at"])>clock(i["evidence_cutoff"]):
                    raise ValueError("Issue reference available after cutoff")
            validate_refs(i["evidence_refs"],root,staged=staged,cutoff=i["evidence_cutoff"],catalog=catalog)
        refs.extend(p["evidence_index"])
        if pages:
            if len(pages)!=1 or len(p["evidence_index"])!=1:
                raise ValueError("Primary coverage leaf substituted")
            if p["coverage"] and (len(p["coverage"])!=6 or {row["category"] for row in p["coverage"]}!=CATEGORIES):
                raise ValueError("Primary category coverage missing or duplicated")
            ref=pages[0]
            page=(staged[ref["artifact_id"]][0] if staged and ref["artifact_id"] in staged else
                decode((Path(root)/"frontend-v2/public/artifacts/replay"/(ref["artifact_id"].replace(":","-")+".json")).read_bytes()))
            if page["payload"]["policy"]!=full_policy:
                raise ValueError("Coverage leaf omitted or substituted full policy")
            if (page["input_hash"],page["evidence_cutoff"])!=(parsed["input_hash"],parsed["evidence_cutoff"]):
                raise ValueError("Coverage page fingerprint/cutoff substitution")
            if any(row not in page["payload"]["coverage"] for row in p["coverage"]):
                raise ValueError("Primary category preview substituted")
        else:
            if p["issues"] or p["prior_state_ref"] or p["historical_origin_counts"]:
                raise ValueError("Coverage leaf is not bounded metadata")
            if {row["category"] for row in p["coverage"]}!=CATEGORIES:
                raise ValueError("Sealed leaf category coverage missing")
            if len({row["check_id"] for row in p["coverage"]})!=len(p["coverage"]):
                raise ValueError("Duplicate coverage check")
        for c in p["coverage"]:
            if c["evidence_class"] not in {"REAL_RETAINED","UNAVAILABLE","RETAINED_SYNTHETIC"}:
                raise ValueError("Private/example/test coverage in production")
            if not clock(p["evaluation_cutoff"])<=clock(c["evaluated_at"])<=clock(parsed["published_at"]):
                raise ValueError("Coverage witness outside publication chronology")
            if c["evidence_at"] and clock(c["evidence_at"])>clock(c["evaluated_at"]):
                raise ValueError("Future coverage evidence")
            refs.extend(c["evidence_refs"])
            if c["availability"]=="UNAVAILABLE" and c["outcome"]!="NOT_EVALUATED":
                raise ValueError("Missing check presented healthy")
        bare={k:v for k,v in p.items() if k!="state_id"}
        if digest(bare)!=p["state_id"]:
            raise ValueError("State identity substitution")
    else:
        if p["policy_sha256"]!=policy["sha256"]:
            raise ValueError("Sweep policy substitution")
        if p["status"]!="FAILED":
            if p["inputs"]!=bundle["inputs"]:
                raise ValueError("Sweep reviewed input inventory substitution")
            expected=digest(dict(inputs=p["inputs"],evaluation_cutoff=p["evaluation_cutoff"],policy_sha256=p["policy_sha256"],
                evaluator_source_hash=p["evaluator_source_hash"],scope="RETAINED_RISK_EVIDENCE"))
            if p["fingerprint"]!=expected:
                raise ValueError("Sweep fingerprint derivation substitution")
        if len({o["observation_id"] for o in p["observations"]})!=len(p["observations"]):
            raise ValueError("Duplicate sweep observation")
        for o in p["observations"]:
            if o["evidence_class"] not in {"REAL_RETAINED","UNAVAILABLE","RETAINED_SYNTHETIC"}:
                raise ValueError("Private/example/test observation in production")
            validate_rule(o,policy)
            if o["issue_id"]!=identity(o):
                raise ValueError("Observation identity substitution")
            relevant={k:v for k,v in o.items() if k not in {"observation_id","fingerprint","witnessed_at","previous_observation_id"}}
            if o["fingerprint"]!=digest(relevant) or o["observation_id"]!=digest(["risk-observation/1",o["issue_id"],o["fingerprint"]]):
                raise ValueError("Observation derivation substitution")
            if not clock(p["started_at"])<=clock(o["witnessed_at"])<=clock(p["completed_at"]):
                raise ValueError("Observation witness outside sweep chronology")
            refs.extend(o["evidence_refs"])
        if p["failure"]:
            if p["failure"]["issue"]["evidence_class"]!="REAL_RETAINED":
                raise ValueError("Unwitnessed public System failure")
            validate_rule(p["failure"]["issue"],policy)
            refs.extend(p["failure"]["issue"]["evidence_refs"])
        by_observation={o["observation_id"]:o for o in p["observations"]}
        if len({t["issue_id"] for t in p["transitions"]})!=len(p["transitions"]):
            raise ValueError("Duplicate Issue transition")
        for t in p["transitions"]:
            observation=by_observation.get(t["observation_id"])
            if not observation or observation["issue_id"]!=t["issue_id"] or observation["witnessed_at"]!=t["at"]:
                raise ValueError("Transition/observation substitution")
            if t["transition"]=="RESOLVED" and (observation["outcome"]!="CLEAR" or observation["availability"]!="AVAILABLE"):
                raise ValueError("Resolution without positive complete observation")
        if p["failure"] and (p["state_ref"]!=p["failure"]["last_valid_state_ref"] or p["transitions"]):
            raise ValueError("Failed receipt changed successful state or transitions")
        actual={k:sum(t["transition"]==k.upper() for t in p["transitions"]) for k in ("new","unchanged","updated","resolved")}
        if actual!=p["transition_counts"]:
            raise ValueError("Transition count substitution")
        if parsed["published_at"]!=p["published_at"]:
            raise ValueError("Receipt publication clock mismatch")
    validate_refs(refs,root,staged=staged,cutoff=parsed["evidence_cutoff"],catalog=catalog)
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


def validate_public(value, root, staged=None, *, catalog=None):
    with monitoring_operation():
        return _validate_public(value, root, staged=staged, catalog=catalog)

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
    checked_sweep=prepared[-1][1]
    sp=checked_sweep["payload"]
    from .sweep import evaluator_hash
    if sp["evaluator_source_hash"]!=evaluator_hash(root):
        raise ValueError("Unreviewed publication evaluator hash")
    if checked_sweep["kind"]!="risk-sweep" or any(v["kind"]!="risk-state" for _,v,_ in prepared[:-1]):
        raise ValueError("Unapproved publication order/kind")
    if state is not None:
        state_ref,checked_state,_=prepared[-2]
        if sp["status"]=="FAILED" or sp["state_ref"]!=state_ref or checked_state["input_hash"]!=checked_sweep["input_hash"] or checked_state["published_at"]!=checked_sweep["published_at"]:
            raise ValueError("State/sweep pair substitution")
        if sp["sweep_id"]!=digest(["risk-sweep/1",sp["fingerprint"],sp["started_at"],checked_state["payload"]["state_id"]]):
            raise ValueError("Sweep identity substitution")
        if (checked_state["evidence_cutoff"],checked_state["payload"]["evaluation_cutoff"])!=(checked_sweep["evidence_cutoff"],sp["evaluation_cutoff"]):
            raise ValueError("State/sweep evidence clock substitution")
        for issue in checked_state["payload"]["issues"]:
            source_observation(issue,checked_sweep)
    elif sp["status"]!="FAILED":
        raise ValueError("Successful publication omitted its state")
    elif sp["state_ref"]:
        existing=decode(expected_manifest)
        prior_state=read_artifact(root,existing,sp["state_ref"])
        if prior_state["kind"]!="risk-state" or existing["routes"].get("/risk-manager/state")!=sp["state_ref"]:
            raise ValueError("Failure last-valid-state substitution")
    existing=decode(expected_manifest)
    receipts=[checked_sweep]
    cursor=sp["prior_sweep_ref"]; visited=set()
    while cursor:
        if cursor in visited:
            raise ValueError("Risk history cycle")
        visited.add(cursor)
        prior_receipt=read_artifact(root,existing,cursor)
        if prior_receipt["kind"]!="risk-sweep":
            raise ValueError("Prior sweep kind substituted")
        receipts.append(prior_receipt)
        cursor=prior_receipt["payload"]["prior_sweep_ref"]
    validate_observation_sources(receipts)
    history=lifecycle_history(receipts)
    if state is not None:
        for issue in checked_state["payload"]["issues"]:
            checked_lifecycle_ids(issue,history)
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
    expected_url="/artifacts/replay/"+identity.replace(":","-")+".json"
    if e.get("url")!=expected_url:
        raise ValueError("Risk manifest path substitution")
    raw=(Path(root)/"frontend-v2/public"/expected_url.lstrip("/")).read_bytes()
    if len(raw)!=e["bytes"] or sha256(raw).hexdigest()!=e["sha256"] or e["sha256"]!=identity.rsplit(":",1)[-1]:
        raise ValueError("Risk bytes mismatch")
    value=decode(raw)
    validate_public(value,root)
    if entry(identity,value,raw)!=e:
        raise ValueError("Risk manifest entry substitution")
    return value


def checked_primary(value,state):
    return state is not None and value["payload"]["state_id"]==state["payload"]["state_id"]
