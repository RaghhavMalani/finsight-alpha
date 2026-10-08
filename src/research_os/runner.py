"""Record attempts/openings before calling computation, then bind immutable bytes."""
from __future__ import annotations
import json
from pathlib import Path
import uuid
from src.eval.canonical import canonical_json_bytes,sha256_bytes
from .contracts import Artifact,FreezeReceipt,Preregistration,Run,now,utc
from .registry import Registry
from .provenance import code_identity,environment


def validate_run(spec: Preregistration,receipt: FreezeReceipt,run: Run):
    if run.preregistration_hash!=spec.identity or receipt.preregistration_hash!=spec.identity:
        raise ValueError("Preregistration binding mismatch")
    if run.freeze_receipt_hash!=receipt.identity or run.hypothesis_hash!=spec.hypothesis.identity:
        raise ValueError("Hypothesis/freeze binding mismatch")
    if run.dataset_hashes!=tuple(d.content_sha256 for d in spec.datasets):
        raise ValueError("Dataset substitution")
    if run.split_hashes!=tuple(s.identity for s in spec.splits) or run.test_hashes!=tuple(t.identity for t in spec.tests):
        raise ValueError("Split/test substitution")
    if run.seed not in spec.seeds or run.parameters!=spec.parameters or run.trial_id not in spec.family.trial_ids:
        raise ValueError("Unregistered seed, parameter or trial")
    if utc(receipt.frozen_at)>utc(now()): raise ValueError("Execution before freeze")


def execute(registry: Registry,spec: Preregistration,receipt: FreezeReceipt,root: Path,
            *,trial_id: str,seed: int,compute,holdout=True):
    registered=registry.get(receipt.identity)
    if registered!=receipt or not any(e["kind"]=="FREEZE" and e["payload"]["receipt_hash"]==receipt.identity for e in registry.events()):
        raise ValueError("Freeze lacks server receipt")
    commit,code_hash=code_identity(root)
    run=Run(hypothesis_hash=spec.hypothesis.identity,preregistration_hash=spec.identity,
        freeze_receipt_hash=receipt.identity,code_commit=commit,code_sha256=code_hash,
        dataset_hashes=tuple(d.content_sha256 for d in spec.datasets),
        split_hashes=tuple(s.identity for s in spec.splits),test_hashes=tuple(t.identity for t in spec.tests),
        seed=seed,trial_id=trial_id,parameters=spec.parameters,environment=environment())
    run_hash=registry.put(run);attempt=uuid.uuid4().hex
    registry.append("START",{"run_hash":run_hash,"preregistration_hash":spec.identity},attempt)
    try:
        validate_run(spec,receipt,run)
        if holdout:
            registry.append("HOLDOUT_OPEN",{"preregistration_hash":spec.identity,"trial_id":trial_id},attempt)
        payload=compute(run)
        raw=canonical_json_bytes(payload);payload_hash=sha256_bytes(raw)
        destination=registry.path.parent/"research-artifacts"/payload_hash
        destination.parent.mkdir(parents=True,exist_ok=True)
        try:
            with destination.open("xb") as stream: stream.write(raw)
        except FileExistsError:
            if destination.read_bytes()!=raw: raise ValueError("Artifact identity substitution")
        artifact=Artifact(run_hash=run_hash,payload_sha256=payload_hash,media_type="application/json",
            source_urls=tuple(u for d in spec.datasets for u in d.source_urls),
            licence_status="LOCAL_ONLY",evidence_mode=spec.datasets[0].evidence_mode)
        artifact_hash=registry.put(artifact)
        registry.append("SUCCESS",{"run_hash":run_hash,"artifact_hash":artifact_hash},attempt)
        return {"attempt":attempt,"run_hash":run_hash,"artifact_hash":artifact_hash,
                "artifact":artifact.model_dump(mode="json"),"payload":payload}
    except BaseException as exc:
        registry.append("ABORT" if isinstance(exc,(KeyboardInterrupt,SystemExit)) else "ERROR",
                        {"run_hash":run_hash,"reason":str(exc),"type":type(exc).__name__},attempt)
        raise


def read_artifact(registry: Registry,artifact_hash: str,expected_run: str):
    artifact=registry.get(artifact_hash)
    if not isinstance(artifact,Artifact) or artifact.run_hash!=expected_run:
        raise ValueError("Stale/substituted artifact")
    raw=(registry.path.parent/"research-artifacts"/artifact.payload_sha256).read_bytes()
    if sha256_bytes(raw)!=artifact.payload_sha256: raise ValueError("Artifact bytes changed")
    return json.loads(raw)


def bind_truth_ledger(registry: Registry,*,attempt: str,artifact_hash: str,user_id: int):
    from src.data.as_of import AsOfContext
    from src.truth.contracts import build_computation_contract,EpistemicState
    from src.truth.ledger import record_analysis_run
    artifact=registry.get(artifact_hash);run=registry.get(artifact.run_hash)
    payload=read_artifact(registry,artifact_hash,run.identity)
    events=registry.events()
    if not any(e["attempt"]==attempt and e["kind"]=="SUCCESS" and e["payload"]["artifact_hash"]==artifact_hash for e in events):
        raise ValueError("Truth binding requires a recorded successful attempt")
    spec=registry.get(run.preregistration_hash)
    truth=build_computation_contract(calculation="research_os",calculation_version="research-os/0.1",
        as_of=AsOfContext.bind(max(d.input_cutoff for d in spec.datasets)),
        inputs={"run_hash":run.identity,"artifact_hash":artifact_hash},data_version=spec.identity,state=EpistemicState.DERIVED)
    binding=record_analysis_run(organization_id=registry.organization,user_id=user_id,truth=truth,result=payload)
    registry.append("LEDGER_BIND",{"artifact_hash":artifact_hash,"truth":truth,"binding":binding},attempt)
    return binding
