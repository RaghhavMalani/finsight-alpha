"""Read-only published risk selection; no runtime discovery or sweep execution."""
from pathlib import Path
import re
from .contracts import decode
from .publication import read_artifact

def read(root,kind,sweep_id=None):
    if kind not in {"state","sweep"}:
        raise LookupError("UNAVAILABLE: unapproved risk selection")
    if sweep_id is not None and not re.fullmatch("[a-f0-9]{64}",sweep_id):
        raise LookupError("UNAVAILABLE: unknown retained sweep")
    m=decode((Path(root)/"frontend-v2/public/replay-manifest.json").read_bytes())
    suffix="?sweep_id="+sweep_id if sweep_id is not None else ""
    receipt_id=m["routes"].get("/risk-manager/sweep"+suffix)
    if receipt_id is None:
        raise LookupError("UNAVAILABLE: no checked risk publication for this selection")
    receipt=read_artifact(root,m,receipt_id)
    if receipt["kind"]!="risk-sweep" or (sweep_id is not None and receipt["payload"]["sweep_id"]!=sweep_id):
        raise ValueError("Receipt selector substitution")
    p=receipt["payload"]
    if p["state_ref"]:
        state=read_artifact(root,m,p["state_ref"])
        if state["kind"]!="risk-state":
            raise ValueError("Receipt state kind substitution")
        if p["status"]!="FAILED" and (
            state["input_hash"]!=receipt["input_hash"] or state["evidence_cutoff"]!=receipt["evidence_cutoff"]
            or state["published_at"]!=receipt["published_at"] or state["payload"]["policy"]["sha256"]!=p["policy_sha256"]
        ):
            raise ValueError("State/receipt pair substitution")
        route_state=m["routes"].get("/risk-manager/state"+suffix)
        if (sweep_id is None or route_state is not None) and route_state!=p["state_ref"]:
            raise ValueError("State route/receipt substitution")
    else:
        state=None
    if kind=="sweep":
        return receipt
    if state is None:
        raise LookupError("UNAVAILABLE: no successful retained state exists")
    return state
