import json
from pathlib import Path
import pytest
from src.research_os.contracts import Preregistration
from src.research_os.service import require_supported_protocol

ROOT=Path(__file__).resolve().parents[2]


def test_narrow_adapter_accepts_actual_frozen_protocol():
    spec=Preregistration.model_validate_json((ROOT/"data/exports/research_os_v0_1/preregistration.json").read_bytes())
    require_supported_protocol(ROOT,spec)


@pytest.mark.parametrize("mutation",["dependent","feature_formula","test_alpha","parameters"])
def test_narrow_adapter_rejects_mislabelled_computation(mutation):
    raw=json.loads((ROOT/"data/exports/research_os_v0_1/preregistration.json").read_text())
    if mutation=="dependent": raw["hypothesis"]["dependent"]="earnings_growth"
    if mutation=="feature_formula": raw["features"][0]["formula"]="Use current month return"
    if mutation=="test_alpha": raw["tests"][0]["alpha"]=.1
    if mutation=="parameters": raw["parameters"]["hmm_seed"]=99
    spec=Preregistration.model_validate(raw)
    with pytest.raises(ValueError,match="Unsupported"):
        require_supported_protocol(ROOT,spec)
