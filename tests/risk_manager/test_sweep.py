from pathlib import Path
from copy import deepcopy
import pytest
from src.risk_manager.sweep import run
from src.risk_manager.evidence import freeze_inventory
from src.risk_manager.contracts import decode,CLAIMS

ROOT=Path(__file__).resolve().parents[2]
def test_preproduction_has_no_artifact_writes():
    before=(ROOT/"frontend-v2/public/replay-manifest.json").read_bytes()
    snapshot=freeze_inventory(ROOT)
    result=run(ROOT,publish_artifacts=False)
    assert result["status"]=="PARTIAL"
    assert result["writes"]==0 and (ROOT/"frontend-v2/public/replay-manifest.json").read_bytes()==before
    assert freeze_inventory(ROOT)==snapshot
    assert result["operation_proofs"]["before_inventory_sha256"]==result["operation_proofs"]["after_inventory_sha256"]
    assert all(result["operation_proofs"][x]==0 for x in ["provider_captures","model_runs","plugin_runs","series_runs",
        "factor_fits","research_attempts","holdout_openings","simulator_runs"])

def test_failed_sweep_retains_state_without_empty_success(monkeypatch):
    import src.risk_manager.sweep as s
    def fail(_): raise FileNotFoundError("synthetic fixture reader failure")
    monkeypatch.setattr(s,"freeze_inventory",fail)
    failures=[]
    r=s.run(ROOT,publish_artifacts=False,failure_sink=failures.append)
    assert r["status"]=="FAILED"
    f=failures[0]["payload"]
    assert f["failure"]["issue"]["status"]=="OPEN" and f["transition_counts"]["resolved"]==0
    assert f["state_ref"]==r["state_ref"] and f["status"]=="FAILED"
    assert f["failure"]["issue"]["claim_flags"]==CLAIMS
