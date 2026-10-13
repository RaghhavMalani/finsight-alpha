from pathlib import Path
import pytest
from scripts.risk_archive import verify,verify_route,verify_addition
from src.risk_manager.contracts import decode
ROOT=Path(__file__).resolve().parents[2]
def test_baseline_subsets_and_withdrawals():
    result=verify(ROOT)
    assert result["prior_artifacts"]==221 and result["prior_routes"]==126 and result["withdrawals"]==6
    assert result["d6"]=="DISABLED / DEFERRED"
    frozen=decode((ROOT/"eval/risk_manager/v0.1/phase0-6-freeze.json").read_bytes())
    assert frozen["files"][".github/workflows/organs.yml"]
def test_unreviewed_kind_and_route_rejected():
    for route in ["/risk-manager/unknown","/risk-manager/state?path=secret","//private/risk-manager/state","/risk-manager/state?sweep_id=bad"]:
        with pytest.raises(ValueError): verify_route(route,"risk:state:"+"a"*64,{"risk:state:"+"a"*64:{}})
    with pytest.raises(ValueError): verify_addition(ROOT/"frontend-v2/public","risk:history:"+"a"*64,{})
