import json
from pathlib import Path
import pytest
from src.eval.canonical import canonical_sha256
from src.research_os.contracts import Preregistration
from src.research_os.calibration import calibrate

ROOT=Path(__file__).resolve().parents[2]


def test_full_frozen_calibration_retains_failures_and_hashes():
    spec=Preregistration.model_validate_json((ROOT/"data/exports/research_os_v0_1/preregistration.json").read_bytes())
    result=json.loads((ROOT/"data/exports/research_os_v0_1/calibration.json").read_text())
    settings=spec.parameters["calibration"]
    assert result["settings_hash"]==canonical_sha256(settings)
    assert result["preregistration_hash"]==spec.identity
    assert result["worlds_per_case"]==1000
    assert result["total_null_worlds"]==result["total_planted_worlds"]==8000
    failures=[]
    for key,row in result["cases"].items():
        assert len(row["p_values"]["null"])==len(row["p_values"]["planted"])==1000
        accepted=row["null"]["ci_lower"]<=.05<=row["null"]["ci_upper"]
        assert row["null_accepted"]==accepted
        assert row["null"]["successes"]==sum(p<.05 for p in row["p_values"]["null"])
        if not accepted: failures.append(key)
    assert failures==["hac_iid","regression_ar1"]
    assert result["status"]=="NOT_CALIBRATED"  # Fail-closed reporting is acceptance, not empirical repair.


def test_ci_canary_cannot_confer_scientific_acceptance():
    spec=Preregistration.model_validate_json((ROOT/"data/exports/research_os_v0_1/preregistration.json").read_bytes())
    result=calibrate(spec.parameters["calibration"],worlds=32)
    assert result["status"]=="CANARY_ONLY"
    with pytest.raises(ValueError): calibrate(spec.parameters["calibration"],worlds=999)
