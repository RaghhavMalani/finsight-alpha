"""Negative selection, confirmation, world, identity and attempt tests."""
import json
from pathlib import Path
import subprocess
import numpy as np
import pytest
from src.research_os.calibration_v011.protocol import load,seed,PROTOCOL_SHA,METHODS
from src.research_os.calibration_v011.metrics import select,summarize
from src.research_os.calibration_v011.study import read_ledger,ledger,selection_guard,read_npz,write_npz,exclusive_json
from src.research_os.calibration_v011.dgp import generate

ROOT=Path(__file__).resolve().parents[3]


@pytest.fixture
def protocol(): return load(ROOT)


def discovery_fixture(p):
    """Deliberately artificial selector fixture, never evidence or study worlds."""
    row={"worlds":1000,"greater_size":.05,"two_sided_size":.05,"coverage":.95,"standardized_bias":.01,
         "failed_worlds":0,"power":[{"greater":v} for v in (0,.2,.5,.8)]}
    return {m:{s["id"]:json.loads(json.dumps(row)) for s in p["settings"]} for m in METHODS}


def test_protocol_sha_and_seed_domains(protocol):
    assert len(protocol["settings"])==30
    values={seed(protocol,phase,"fixture",w,stream) for phase in ("discovery","confirmation","canary") for w in range(12) for stream in protocol["seed"]["streams"]}
    assert len(values)==108 and min(values)>=2**256
    assert PROTOCOL_SHA=="59c69a7807fb757ace22fca4f20b7c883ea43f48dad30a6eb608c936e35b248e"


@pytest.mark.parametrize("template",["mean_iid","mean_ar08","mean_t5","mean_garch","reg_xhetero"])
def test_fixed_dgp_repeatability_and_labelled_shapes(protocol,template):
    setting=next(s for s in protocol["settings"] if s["id"]==template+"_n120")
    x,y=generate(protocol,"canary",setting,2);xx,yy=generate(protocol,"canary",setting,2)
    np.testing.assert_array_equal(x,xx);np.testing.assert_array_equal(y,yy)
    assert x.shape==(120,3 if setting["controls"] else 1) and y.shape==(120,)
    assert np.isfinite(y).all() and protocol["evidence_mode"]=="SYNTHETIC_CALIBRATION"


def test_selection_uses_declared_order_only_after_ties(protocol):
    fixture=discovery_fixture(protocol)
    assert select(fixture,protocol)["selected"]=="HAC_NORMAL"


def test_selection_prioritizes_violations_over_apparent_power(protocol):
    fixture=discovery_fixture(protocol)
    fixture["HAC_NORMAL"][protocol["settings"][0]["id"]]["greater_size"]=.5
    for r in fixture["STATIONARY_PAIRS_T"].values(): r["power"]=[{"greater":v} for v in (0,.3,.6,.9)]
    assert select(fixture,protocol)["selected"]=="STATIONARY_PAIRS_T"


@pytest.mark.parametrize("mutation",["candidate","setting","worlds"])
def test_selection_rejects_omitted_family_members(protocol,mutation):
    fixture=discovery_fixture(protocol)
    if mutation=="candidate": fixture.pop("HAC_T")
    elif mutation=="setting": fixture["HAC_T"].pop(protocol["settings"][0]["id"])
    else: fixture["HAC_T"][protocol["settings"][0]["id"]]["worlds"]=999
    with pytest.raises(ValueError): select(fixture,protocol)


def test_failed_world_is_not_ignored_in_selection(protocol):
    fixture=discovery_fixture(protocol)
    fixture["HAC_NORMAL"][protocol["settings"][0]["id"]]["failed_worlds"]=1
    assert select(fixture,protocol)["selected"]=="HAC_T"
    for rows in fixture.values(): rows[protocol["settings"][0]["id"]]["failed_worlds"]=1
    assert select(fixture,protocol)["selected"] is None


def test_confirmation_is_closed_without_selection(tmp_path,protocol):
    with pytest.raises(ValueError,match="unopened"): selection_guard(ROOT,tmp_path,protocol)


def test_confirmation_rejects_uncommitted_selection(tmp_path,protocol,monkeypatch):
    exclusive_json(tmp_path/"selection.json",{"fixture":True})
    def unavailable(*args,**kwargs): raise subprocess.CalledProcessError(128,args[0])
    monkeypatch.setattr(subprocess,"check_output",unavailable)
    with pytest.raises(ValueError,match="committed"): selection_guard(ROOT,tmp_path,protocol)


def test_exclusive_json_and_attempt_chain_cannot_be_replaced(tmp_path):
    exclusive_json(tmp_path/"frozen.json",{"a":1})
    with pytest.raises(FileExistsError): exclusive_json(tmp_path/"frozen.json",{"a":2})
    ledger(tmp_path,"START",{"phase":"discovery"});ledger(tmp_path,"ERROR",{"phase":"discovery"})
    assert len(read_ledger(tmp_path))==2
    path=tmp_path/"attempts.jsonl";raw=path.read_text().replace('"ERROR"','"SUCCESS"');path.write_text(raw)
    with pytest.raises(ValueError,match="chain"): read_ledger(tmp_path)


def test_world_payload_substitution_is_detected(tmp_path):
    path=tmp_path/"fixture.npz";a=np.ones((1,4,13));hashes=np.array(["a"*64]*4)
    write_npz(path,a,hashes,{"fixture":True});_,_,meta=read_npz(path)
    with path.open("wb") as f: np.savez_compressed(f,values=a+1,data_hashes=hashes,metadata=np.frombuffer(json.dumps(meta).encode(),np.uint8))
    with pytest.raises(ValueError,match="substitution"): read_npz(path)


def test_missing_nonfinite_or_wrong_width_worlds_cannot_earn_gate(protocol):
    for values in (np.ones((8,12)),np.full((8,13),np.nan)):
        with pytest.raises(ValueError): summarize(values,protocol)


def test_simultaneous_bounds_are_stricter_than_pointwise(protocol):
    # Artificial size/coverage fixture for the confidence-bound rule only.
    rng=np.random.default_rng(128);a=np.zeros((1000,13));a[:,0]=rng.normal(size=1000);a[:,1]=1;a[:,2]=-4;a[:,3]=4;a[:,4]=1;a[:,5:]=.5;a[:50,5]=.01
    simultaneous=summarize(a,protocol);pointwise=summarize(a,protocol,simultaneous=False)
    assert simultaneous["greater_size_upper"]>pointwise["greater_size_upper"]
    assert simultaneous["coverage_lower"]<pointwise["coverage_lower"]
