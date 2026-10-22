"""Bounded retained-only sweep, real witness clocks, no-op and failure retention."""
from pathlib import Path
from hashlib import sha256
from .contracts import identity, CLAIMS, canonical, decode, digest, now, counts, Issue, Observation
from .policy import load,projection
from .evidence import EvidenceReaders,freeze_inventory,forbidden_calls
from .rules import evaluate
from .monitoring import monitoring_operation
from .reducer import reduce,observation_ref
from .publication import LICENCE,publish,read_artifact,writer_lock,validate_public,source_observation,validate_observation_sources

ROOT=Path(__file__).resolve().parents[2]
SOURCE_FILES=("src/risk_manager/contracts.py","src/risk_manager/policy.py","src/risk_manager/evidence.py",
              "src/risk_manager/rules.py","src/risk_manager/reducer.py","src/risk_manager/sweep.py",
              "src/risk_manager/publication.py","src/risk_manager/monitoring.py")
OPERATIONS=("provider_captures","model_runs","plugin_runs","series_runs","factor_fits","research_attempts",
            "holdout_openings","simulator_runs")

def evaluator_hash(root):
    return digest({p:sha256((Path(root)/p).read_bytes().replace(b"\r\n",b"\n")).hexdigest() for p in SOURCE_FILES})

def envelope(kind,payload,p, fingerprint, published_at):
    return dict(schema_version=kind+"/1",kind=kind,input_hash=fingerprint,evidence_cutoff=p["evaluation_cutoff"],
        published_at=published_at,scope="RETAINED_RISK_EVIDENCE",sources=["project:risk-manager-evidence"],
        licence=LICENCE,claim_flags=dict(CLAIMS),payload=payload)

def previous(root, manifest):
    sid=manifest["routes"].get("/risk-manager/state")
    rid=manifest["routes"].get("/risk-manager/sweep")
    state=read_artifact(root,manifest,sid) if sid else None
    receipt=read_artifact(root,manifest,rid) if rid else None
    observations={}
    receipts=[]
    cursor=rid
    visited=set()
    while cursor:
        if cursor in visited:
            raise ValueError("Risk history cycle")
        visited.add(cursor)
        receipt_value=read_artifact(root,manifest,cursor)
        receipts.append(receipt_value)
        r=receipt_value["payload"]
        for o in r["observations"]:
            observations.setdefault(o["observation_id"],o)
        cursor=r["prior_sweep_ref"]
    # A failed attempt is a witnessed System incident, even though it cannot
    # replace the successful state. Keep it until a positive repair observation.
    issues={i["issue_id"]:dict(i) for i in state["payload"]["issues"]} if state else {}
    if state and any(ref["type"]=="RISK_OBSERVATION" for i in issues.values() for ref in i["evidence_refs"]):
        validate_observation_sources(receipts)
        owners=[r for r in receipts if r["payload"]["status"]!="FAILED" and r["payload"]["state_ref"]==sid
                and (r["payload"]["fingerprint"],r["evidence_cutoff"],r["published_at"])==
                    (state["payload"]["sweep_fingerprint"],state["evidence_cutoff"],state["published_at"])]
        if len(owners)!=1:
            raise ValueError("Compact Issue owning receipt missing or substituted")
        for issue in issues.values():
            source=source_observation(issue,owners[0])
            if source:
                issue["evidence_refs"]=[dict(ref) for ref in source["evidence_refs"]]
    cursor=rid
    while cursor:
        r=read_artifact(root,manifest,cursor)["payload"]
        if r["failure"]:
            issue=r["failure"]["issue"]
            issues.setdefault(issue["issue_id"],issue)
        cursor=r["prior_sweep_ref"]
    if issues:
        state=dict(state or {},payload=dict((state or {}).get("payload",{}),issues=[issues[k] for k in sorted(issues)]))
    return sid,rid,state,receipt,list(observations.values())

def _run(root=ROOT, *, clock_fn=now, publish_artifacts=True, failure_sink=None):
    root=Path(root)
    with writer_lock(root):
        manifest_raw=None
        p=None
        sid,rid,old,prior,oldobs=None,None,None,None,[]
        before=None
        started=clock_fn()
        try:
            manifest_raw=(root/"frontend-v2/public/replay-manifest.json").read_bytes()
            manifest=decode(manifest_raw)
            p=load(root)
            sid,rid,old,prior,oldobs=previous(root,manifest)
            before=freeze_inventory(root)
            with forbidden_calls():
                e=EvidenceReaders(root,manifest=manifest,manifest_raw=manifest_raw).read()
                p=e.policy
                inputs=[e.inputs[k] for k in sorted(e.inputs)]
                code_hash=evaluator_hash(root)
                fingerprint=digest(dict(inputs=inputs,evaluation_cutoff=e.cutoff,policy_sha256=p["sha256"],
                                        evaluator_source_hash=code_hash,scope="RETAINED_RISK_EVIDENCE"))
                if prior and prior["payload"]["status"]!="FAILED" and prior["payload"]["fingerprint"]==fingerprint:
                    return dict(status="UNCHANGED",state_ref=sid,sweep_ref=rid,fingerprint=fingerprint,
                        transitions=dict(new=0,updated=0,resolved=0,unchanged=0),new_occurrences=0,writes=0,
                        manifest_rewrite=False,scientific_inventory_sha256=before)
                detected=clock_fn()
                obs,cov=evaluate(e,detected)
                if old:
                    for issue in old["payload"]["issues"]:
                        if issue["category"]=="SYSTEM" and issue["status"]=="OPEN":
                            matching=next((o for o in oldobs if o["observation_id"]==issue["last_observation_id"]),None)
                            # Missing legacy failure evidence is not compatible clearing proof.
                            if matching and issue["policy_sha256"]==p["sha256"]:
                                proof_cursor=rid
                                proof_fingerprint=None
                                while proof_cursor:
                                    proof=read_artifact(root,manifest,proof_cursor)["payload"]
                                    if any(o["observation_id"]==matching["observation_id"] for o in proof["observations"]):
                                        proof_fingerprint=proof["fingerprint"]
                                        break
                                    proof_cursor=proof["prior_sweep_ref"]
                                if proof_fingerprint:
                                    obs.append(repair_observation(issue,matching,p,detected,e,before,proof_fingerprint))
                issues,trans=reduce(old["payload"]["issues"] if old else [],obs,fingerprint,oldobs)
                # Receipt retains incident observations; complete clear checks remain in coverage.
                incident_ids={i["issue_id"] for i in issues}
                retained_obs=[o for o in obs if o["issue_id"] in incident_ids]
                after=freeze_inventory(root)
                finished=clock_fn(); published=clock_fn()
                # Bounded leaf state holds full coverage; primary state retains every Issue.
                # Both remain risk-state, the only approved state kind. No truncated evidence.
                original_refs={digest(r):r for c in cov for r in c["evidence_refs"]}
                projected_cov=[dict(c,evidence_refs=c["evidence_refs"][:1]) for c in cov]
                leaf_payload=dict(state_id="0"*64,sweep_fingerprint=fingerprint,evaluation_cutoff=e.cutoff,
                    policy=projection(p),issues=[],coverage=projected_cov,counts=[],evidence_index=list(original_refs.values()),
                    historical_origin_counts=[],prior_state_ref=None)
                leaf_payload["state_id"]=digest({k:v for k,v in leaf_payload.items() if k!="state_id"})
                leaf=envelope("risk-state",leaf_payload,p,fingerprint,published)
                _,leaf_raw=validate_public(leaf,root)
                leaf_id="risk:state:"+sha256(leaf_raw).hexdigest()
                page_ref=dict(type="REPLAY_ARTIFACT",artifact_id=leaf_id,kind="risk-state",sha256=sha256(leaf_raw).hexdigest(),
                    bytes=len(leaf_raw),as_of=published,available_at=published,selector_id="risk_coverage",
                    source_ids=["project:risk-manager-evidence"],run_id=None)
                staged={leaf_id:(leaf,leaf_raw)}
                by_observation={o["observation_id"]:o for o in retained_obs}
                projected_issues=[]
                for issue in issues:
                    observation=by_observation.get(issue["last_observation_id"])
                    # The owning receipt retains every original source reference.
                    # Carried Issues and resolved findings keep their original sources
                    # when the latest observation has different resolution evidence.
                    refs=([observation_ref(observation,fingerprint)] if observation and observation["issue_id"]==issue["issue_id"]
                          and canonical(observation["evidence_refs"])==canonical(issue["evidence_refs"])
                          else issue["evidence_refs"])
                    projected_issues.append(dict(issue,evidence_refs=refs))
                # The sealed leaf retains every coverage row and complete instructions.
                # Loading those rows on demand avoids duplicating six preview checks here.
                summary=[]
                payload=dict(state_id="0"*64,sweep_fingerprint=fingerprint,evaluation_cutoff=e.cutoff,
                    policy=projection(p),issues=projected_issues,coverage=summary,counts=counts(issues),evidence_index=[page_ref],
                    historical_origin_counts=origin_counts(e.values["data_issues"]["payload"]["items"]),prior_state_ref=sid)
                payload["state_id"]=digest({k:v for k,v in payload.items() if k!="state_id"})
                state=envelope("risk-state",payload,p,fingerprint,published)
                _,raw=validate_public(state,root,staged=staged)
                state_ref="risk:state:"+sha256(raw).hexdigest()
                sweep_id=digest(["risk-sweep/1",fingerprint,started,payload["state_id"]])
                history=[]
                if prior:
                    q=prior["payload"]
                    history=[dict(sweep_id=q["sweep_id"],sweep_ref=rid,state_ref=q["state_ref"],
                        published_at=q["published_at"],status=q["status"])]+q["history_index"][:19]
                proofs=dict.fromkeys(OPERATIONS,0)
                proofs.update(before_inventory_sha256=before,after_inventory_sha256=after,forbidden_call_guard="ENFORCED")
                receipt_payload=dict(sweep_id=sweep_id,fingerprint=fingerprint,status="PARTIAL",
                    prior_sweep_ref=rid,state_ref=state_ref,started_at=started,completed_at=finished,published_at=published,
                    evaluation_cutoff=e.cutoff,inputs=inputs,evaluator_source_hash=code_hash,policy_sha256=p["sha256"],
                    observations=retained_obs,transitions=trans,transition_counts={k:sum(t["transition"]==k.upper() for t in trans)
                        for k in ("new","unchanged","updated","resolved")},operation_proofs=proofs,
                    history_index=history,failure=None)
                receipt=envelope("risk-sweep",receipt_payload,p,fingerprint,published)
                validate_public(receipt,root)
            if publish_artifacts:
                publication=publish(root,state,receipt,expected_manifest=manifest_raw,extra_states=[leaf])
            else:
                publication=dict(state_ref=state_ref,sweep_ref=None,writes=0)
            return dict(status="PARTIAL",**publication,sweep_id=sweep_id,state_id=payload["state_id"],
                fingerprint=fingerprint,policy_sha256=p["sha256"],evidence_cutoff=e.cutoff,published_at=published,
                transitions=receipt_payload["transition_counts"],counts=payload["counts"],
                operation_proofs=proofs,state=state if not publish_artifacts else None,coverage_state=leaf if not publish_artifacts else None,receipt=receipt if not publish_artifacts else None)
        except Exception as exc:
            # No raw exception text is ever exported. Never publish an empty replacement state.
            if p is None:
                # An untrusted policy/manifest cannot authorize public publication.
                # Preserve a bounded independent operational attempt, never raw errors.
                attempt=local_failure(started,clock_fn())
                if failure_sink:
                    failure_sink(attempt)
                if publish_artifacts:
                    retain_local_failure(root,attempt)
                return dict(status="FAILED",state_ref=None,reason_code=attempt["reason_code"],attempt_id=attempt["attempt_id"])
            failure=failed_receipt(root,p,started,sid,rid,prior,before,exc,clock_fn,old=old)
            if failure_sink:
                failure_sink(failure)
            if publish_artifacts:
                try:
                    publish(root,None,failure,expected_manifest=manifest_raw)
                except Exception:
                    # Independently retained local attempt artifact; transport failure cannot be public immediately.
                    retain_local_failure(root,failure)
            return dict(status="FAILED",state_ref=sid,reason_code=failure["payload"]["failure"]["reason_code"],
                        sweep_id=failure["payload"]["sweep_id"])

def origin_counts(origins):
    from collections import Counter
    counter=Counter(o["severity"] for o in origins)
    return [dict(partition="HISTORICAL",category="DATA",severity=s,count=n) for s,n in sorted(counter.items())]

def seal_observation(o):
    o["issue_id"]=identity(o)
    relevant={k:v for k,v in o.items() if k not in {"observation_id","fingerprint","witnessed_at","previous_observation_id"}}
    o["fingerprint"]=digest(relevant)
    o["observation_id"]=digest(["risk-observation/1",o["issue_id"],o["fingerprint"]])
    return Observation.model_validate(o).model_dump(mode="json")

def repair_observation(issue,last,p,witness,e,before,proof_fingerprint=None):
    # Re-reading every bounded input and verifying the frozen inventory positively
    # witnesses a repaired boundary. The former failed observation is immutable.
    fields={k:issue[k] for k in ("issue_id","rule_id","rule_version","category","severity","scope","country",
        "asset","model","title","evidence_class","origin_records","policy_sha256")}
    refs=[dict(type="RISK_OBSERVATION",observation_id=last["observation_id"],
        sweep_fingerprint=proof_fingerprint or issue["first_seen_ref"]["sweep_fingerprint"]),*e.ref("data_health")]
    return seal_observation(dict(schema_version="risk-observation/1",**fields,
        observation_id="0"*64,fingerprint="0"*64,previous_observation_id=last["observation_id"],
        reason_code=None,reason="All required retained readers and immutable inventory checks passed after the failed attempt.",
        outcome="CLEAR",currency="CURRENT",availability="AVAILABLE",evidence_at=e.cutoff,evidence_cutoff=e.cutoff,witnessed_at=witness,
        evidence_refs=refs,source_quality=dict(clock_quality="NOT_APPLICABLE",lineage_status="VERIFIED",
        permission_status="METADATA_ONLY",limitation_codes=[]),
        remediation=dict(state="INFORMATIONAL",requirement_code="SYSTEM_REPAIR",text="Retained boundary repair witnessed; no science executed.",
            evidence_required=["all_retained"]),
        assertions=[dict(assertion_id="SYSTEM_REPAIR",outcome="CLEAR",unit="status",
            value="VERIFIED",comparison="EXACT",threshold="VERIFIED")]))

def local_failure(started,completed):
    return dict(schema_version="risk-local-failure/1",status="FAILED",
        reason_code="ARTIFACT_INTEGRITY_BREACH",subsystem="policy-or-manifest",
        attempt_id=digest(["risk-local-failure/1",started,completed]),started_at=started,completed_at=completed,
        public_publication="UNAVAILABLE",last_valid_state_ref=None,claim_flags=dict(CLAIMS))

def retain_local_failure(root,value):
    identity=value.get("attempt_id") or value["payload"]["sweep_id"]
    attempt=Path(root)/"data/exports/risk_manager_v0_1/failures"/(identity+".json")
    attempt.parent.mkdir(parents=True,exist_ok=True)
    # Append-only attempt evidence; no replacement of any public state or receipt.
    with attempt.open("xb") as stream:
        stream.write(canonical(value)+b"\n")

def failed_receipt(root,p,started,sid,rid,prior,before,exc,clock_fn,old=None):
    code="ARTIFACT_INTEGRITY_BREACH" if isinstance(exc,ValueError) else "REQUIRED_READER_FAILED"
    fingerprint=digest(["risk-failure/1",code,p["sha256"],sid])
    witness=clock_fn()
    check="SYSTEM_SWEEP:risk-workspace:failure"
    scope=dict(kind="PUBLIC_PLATFORM",subject_id="risk-workspace",evidence_family="R-SYSTEM-SWEEP",stable_scope_key="retained-reader")
    rule="R-SYSTEM-INTEGRITY" if code=="ARTIFACT_INTEGRITY_BREACH" else "R-SYSTEM-SWEEP"
    observation=seal_observation(dict(schema_version="risk-observation/1",observation_id="0"*64,issue_id="pending",
        rule_id=rule,rule_version=1,category="SYSTEM",severity="CRITICAL" if code=="ARTIFACT_INTEGRITY_BREACH" else "HIGH",
        scope=scope,country="NONE",asset=None,model=None,title="Risk sweep failed; last valid state retained",
        reason_code=code,reason="Required retained-evidence evaluation failed. No prior Issue is resolved and no empty state is published.",
        outcome="FINDING",currency="CURRENT",availability="UNAVAILABLE",evidence_class="REAL_RETAINED",
        evidence_at=witness,evidence_cutoff=witness,witnessed_at=witness,policy_sha256=p["sha256"],
        fingerprint="0"*64,previous_observation_id=None,
        evidence_refs=[dict(type="POLICY_ASSERTION",policy_sha256=p["sha256"],check_id=check)],
        source_quality=dict(clock_quality="NOT_APPLICABLE",lineage_status="UNAVAILABLE",permission_status="METADATA_ONLY",
                            limitation_codes=[code]),
        remediation=dict(state="REQUIRED",requirement_code=code,text="Repair the retained reader or publication boundary and rerun manually.",
                         evidence_required=["all_retained"]),origin_records=[],
        assertions=[dict(assertion_id=check,outcome="FINDING",unit="status",value="FAILED",comparison="EXACT",threshold="VERIFIED")]))
    earlier=prior["payload"]["failure"]["issue"] if prior and prior["payload"]["failure"] else None
    if not earlier and old:
        earlier=next((i for i in old["payload"]["issues"] if i["issue_id"]==observation["issue_id"]),None)
    fields={k:observation[k] for k in ("issue_id","rule_id","rule_version","category","severity","scope","country","asset","model",
        "title","reason_code","reason","currency","availability","evidence_class","evidence_at","evidence_cutoff","policy_sha256",
        "evidence_refs","source_quality","remediation","origin_records")}
    same=earlier and earlier["issue_id"]==observation["issue_id"]
    ref=dict(type="RISK_OBSERVATION",observation_id=observation["observation_id"],sweep_fingerprint=fingerprint)
    previous_ids=earlier["observation_ids"] if same else []
    observation_ids=list(dict.fromkeys([*previous_ids,observation["observation_id"]]))
    issue=dict(schema_version="risk-issue/1",**fields,status="OPEN",claim_flags=dict(CLAIMS),
        first_seen_at=earlier["first_seen_at"] if same else witness,first_seen_ref=earlier["first_seen_ref"] if same else ref,
        resolved_at=None,resolution_ref=None,occurrences=(earlier["occurrences"]+int(observation["observation_id"] not in previous_ids)) if same else 1,
        observation_ids=observation_ids,last_observation_id=observation["observation_id"])
    Issue.model_validate(issue)
    end=clock_fn()
    try:
        after=freeze_inventory(root)
    except Exception:
        after=None
    proofs=dict.fromkeys(OPERATIONS,0); proofs.update(before_inventory_sha256=before,
        after_inventory_sha256=after,forbidden_call_guard="ENFORCED")
    sp=dict(sweep_id=digest([fingerprint,started]),fingerprint=fingerprint,status="FAILED",prior_sweep_ref=rid,
        state_ref=sid,started_at=started,completed_at=end,published_at=end,evaluation_cutoff=p["evaluation_cutoff"],
        inputs=[],evaluator_source_hash=evaluator_hash(root),policy_sha256=p["sha256"],observations=[observation],transitions=[],
        transition_counts=dict(new=0,unchanged=0,updated=0,resolved=0),operation_proofs=proofs,history_index=[],
        failure=dict(reason_code=code,subsystem="retained-reader",issue=issue,last_valid_state_ref=sid,attempt_id=digest([started,code])))
    return envelope("risk-sweep",sp,p,fingerprint,end)


def run(root=ROOT, **kwargs):
    with monitoring_operation(), forbidden_calls():
        return _run(root, **kwargs)
