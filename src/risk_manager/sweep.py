"""Bounded retained-only sweep, real witness clocks, no-op and failure retention."""
from pathlib import Path
from hashlib import sha256
from .contracts import CLAIMS, canonical, decode, digest, now, counts, Issue
from .policy import load,projection
from .evidence import EvidenceReaders,freeze_inventory,forbidden_calls
from .rules import evaluate
from .reducer import reduce
from .publication import LICENCE,publish,read_artifact,writer_lock,validate_public

ROOT=Path(__file__).resolve().parents[2]
SOURCE_FILES=("src/risk_manager/contracts.py","src/risk_manager/policy.py","src/risk_manager/evidence.py",
              "src/risk_manager/rules.py","src/risk_manager/reducer.py","src/risk_manager/sweep.py",
              "src/risk_manager/publication.py")
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
    cursor=rid
    visited=set()
    while cursor:
        if cursor in visited:
            raise ValueError("Risk history cycle")
        visited.add(cursor)
        r=read_artifact(root,manifest,cursor)["payload"]
        for o in r["observations"]:
            observations.setdefault(o["observation_id"],o)
        cursor=r["prior_sweep_ref"]
    return sid,rid,state,receipt,list(observations.values())

def _run(root=ROOT, *, clock_fn=now, publish_artifacts=True, failure_sink=None):
    root=Path(root)
    with writer_lock(root):
        manifest_raw=(root/"frontend-v2/public/replay-manifest.json").read_bytes()
        manifest=decode(manifest_raw)
        p=load(root)
        sid,rid,old,prior,oldobs=None,None,None,None,[]
        before=None
        started=clock_fn()
        try:
            sid,rid,old,prior,oldobs=previous(root,manifest)
            before=freeze_inventory(root)
            with forbidden_calls():
                e=EvidenceReaders(root).read()
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
                projected_issues=[dict(i,evidence_refs=i["evidence_refs"][:1]) for i in issues]
                summary=[]
                for cat in ("DATA","MODEL","RESEARCH_HYGIENE","PORTFOLIO","SIMULATOR","SYSTEM"):
                    rows=[c for c in projected_cov if c["category"]==cat]
                    summary.append(next((c for c in rows if c["availability"]=="UNAVAILABLE"),rows[0]))
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
            failure=failed_receipt(root,p,started,sid,rid,prior,before,exc,clock_fn)
            if failure_sink:
                failure_sink(failure)
            if publish_artifacts:
                try:
                    publish(root,None,failure,expected_manifest=manifest_raw)
                except Exception:
                    # Independently retained local attempt artifact; transport failure cannot be public immediately.
                    attempt=root/"data/exports/risk_manager_v0_1/failures"/(failure["payload"]["sweep_id"]+".json")
                    attempt.parent.mkdir(parents=True,exist_ok=True)
                    attempt.write_bytes(canonical(failure)+b"\n")
            return dict(status="FAILED",state_ref=sid,reason_code=failure["payload"]["failure"]["reason_code"],
                        sweep_id=failure["payload"]["sweep_id"])

def origin_counts(origins):
    from collections import Counter
    counter=Counter(o["severity"] for o in origins)
    return [dict(partition="HISTORICAL",category="DATA",severity=s,count=n) for s,n in sorted(counter.items())]

def failed_receipt(root,p,started,sid,rid,prior,before,exc,clock_fn):
    code="ARTIFACT_INTEGRITY_BREACH" if isinstance(exc,ValueError) else "REQUIRED_READER_FAILED"
    fingerprint=digest(["risk-failure/1",code,p["sha256"],sid])
    witness=clock_fn()
    check="SYSTEM_SWEEP:risk-workspace:failure"
    scope=dict(kind="PUBLIC_PLATFORM",subject_id="risk-workspace",evidence_family="R-SYSTEM-SWEEP",stable_scope_key="retained-reader")
    from .contracts import identity
    rule="R-SYSTEM-INTEGRITY" if code=="ARTIFACT_INTEGRITY_BREACH" else "R-SYSTEM-SWEEP"
    base=dict(rule_id=rule,rule_version=1,category="SYSTEM",scope=scope,evidence_class="REAL_RETAINED")
    iid=identity(base); oid=digest([iid,fingerprint])
    ref=dict(type="RISK_OBSERVATION",observation_id=oid,sweep_fingerprint=fingerprint)
    earlier=prior["payload"]["failure"]["issue"] if prior and prior["payload"]["failure"] else None
    issue=dict(schema_version="risk-issue/1",issue_id=iid,rule_id=rule,rule_version=1,category="SYSTEM",
        severity="CRITICAL" if code=="ARTIFACT_INTEGRITY_BREACH" else "HIGH",status="OPEN",currency="CURRENT",
        availability="UNAVAILABLE",evidence_class="REAL_RETAINED",scope=scope,country="NONE",asset=None,model=None,
        title="Risk sweep failed Ãƒâ€šÃ‚Â· last valid state retained",reason_code=code,
        reason="Required retained-evidence evaluation failed. No prior Issue is resolved and no empty state is published.",
        first_seen_at=earlier["first_seen_at"] if earlier and earlier["issue_id"]==iid else witness,
        first_seen_ref=earlier["first_seen_ref"] if earlier and earlier["issue_id"]==iid else ref,
        evidence_at=witness,evidence_cutoff=witness,resolved_at=None,resolution_ref=None,
        occurrences=earlier["occurrences"] if earlier and earlier["issue_id"]==iid else 1,
        observation_ids=[oid],evidence_refs=[dict(type="POLICY_ASSERTION",policy_sha256=p["sha256"],check_id=check)],
        source_quality=dict(clock_quality="NOT_APPLICABLE",lineage_status="UNAVAILABLE",permission_status="METADATA_ONLY",
                            limitation_codes=[code]),
        remediation=dict(state="REQUIRED",requirement_code=code,text="Repair the retained reader or publication boundary and rerun manually.",
                         evidence_required=["all_retained"]),claim_flags=dict(CLAIMS),origin_records=[],
        last_observation_id=oid,policy_sha256=p["sha256"])
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
        inputs=[],evaluator_source_hash=evaluator_hash(root),policy_sha256=p["sha256"],observations=[],transitions=[],
        transition_counts=dict(new=0,unchanged=0,updated=0,resolved=0),operation_proofs=proofs,history_index=[],
        failure=dict(reason_code=code,subsystem="retained-reader",issue=issue,last_valid_state_ref=sid,attempt_id=digest([started,code])))
    return envelope("risk-sweep",sp,p,fingerprint,end)


def run(root=ROOT, **kwargs):
    with forbidden_calls():
        return _run(root, **kwargs)
