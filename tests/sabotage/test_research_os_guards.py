"""Adversarial boundary probes, independent of the empirical outcome."""
import json
from pathlib import Path
import pytest
from src.research_os.contracts import Preregistration,DatasetSnapshot
from src.research_os.provenance import factor_snapshot
from src.replay.factors import checked_capture

ROOT=Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("mutation",["future_availability","revised_pit","target","cost","split","seed_nan"])
def test_frozen_research_sabotage(mutation):
    raw=json.loads((ROOT/"data/exports/research_os_v0_1/preregistration.json").read_text())
    if mutation=="future_availability": raw["datasets"][0]["source_available_at"]="2030-01-01T00:00:00Z"
    if mutation=="revised_pit": raw["splits"][0]["clock"]="PIT"
    if mutation=="target": raw["features"][0]["sources"]=[raw["hypothesis"]["dependent"]]
    if mutation=="cost": raw["costs"]=[]
    if mutation=="split": raw["splits"][0]["holdout_start"]=raw["splits"][0]["validation_end"]
    if mutation=="seed_nan": raw["parameters"]["hidden_trial"]=float("nan")
    with pytest.raises(ValueError): Preregistration.model_validate(raw)


@pytest.mark.parametrize("mutation",["bytes","url","clock"])
def test_capture_substitution_rejected(tmp_path,mutation):
    import hashlib
    raw=b"source bytes"
    meta={"sha256":hashlib.sha256(raw).hexdigest(),"source_url":"https://source.test/data","captured_at":"2020-01-02T00:00:00Z"}
    if mutation=="bytes": raw=b"different bytes"
    if mutation=="url": meta["source_url"]="https://wrong.test/data"
    if mutation=="clock": meta["captured_at"]="2030-01-01T00:00:00Z"
    (tmp_path/"capture").write_bytes(raw);(tmp_path/"capture.meta.json").write_text(json.dumps(meta))
    with pytest.raises(ValueError): checked_capture(tmp_path,"capture","https://source.test/data","2020-01-03T00:00:00Z")
