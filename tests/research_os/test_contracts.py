import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
import pytest
from pydantic import ValidationError
from src.research_os.contracts import (OBJECT_TYPES, Paper, PaperClaim, Anchor, Preregistration,
    DatasetSnapshot, Scorecard, StatisticalResult)
from src.research_os.registry import Registry
from src.research_os.preregistration import freeze
from src.eval.canonical import canonical_sha256


@pytest.mark.parametrize("kind", list(OBJECT_TYPES))
def test_unknown_fields_rejected(kind):
    with pytest.raises(ValidationError):
        OBJECT_TYPES[kind].model_validate({"invented": True})


@pytest.mark.parametrize("path,value", [
    (("hypothesis","independent"), ["future_return"]),
    (("hypothesis","controls"), ["future_return"]),
    (("features",0,"lag_months"),0),
    (("features",0,"sources"),["future_return"]),
    (("splits",0,"holdout_start"),"2002-12"),
    (("splits",0,"validation_start"),"2002-01"),
    (("datasets",0,"source_available_at"),"2020-01-04T00:00:00Z"),
    (("datasets",0,"input_cutoff"),"2020-01-03"),
    (("datasets",0,"evidence_mode"),"PIT"),
    (("costs",),[]),
    (("family","trial_ids"),["primary","primary"]),
    (("parameters","window"),float("nan")),
    (("minimum_effect",),float("inf")),
])
def test_sabotaged_specs_fail(spec,path,value):
    raw = spec.model_dump(mode="json")
    node=raw
    for key in path[:-1]: node=node[key]
    node[path[-1]]=value
    with pytest.raises((ValidationError,ValueError)):
        Preregistration.model_validate(raw)


def test_capture_only_cannot_use_pit_split(spec):
    raw=spec.model_dump(mode="json")
    raw["datasets"][0]["evidence_mode"]="CAPTURE_ONLY"
    raw["splits"][0]["clock"]="PIT"
    with pytest.raises(ValueError,match="Revised"):
        Preregistration.model_validate(raw)


def test_identity_key_order_and_mutation(spec):
    raw=spec.model_dump(mode="json")
    assert canonical_sha256(raw)==canonical_sha256(dict(reversed(list(raw.items()))))
    raw["parameters"]["window"]=6
    assert Preregistration.model_validate(raw).identity!=spec.identity


def test_registry_scope_revision_and_roundtrip(tmp_path,spec):
    a,b=Registry(tmp_path/"records.db",1),Registry(tmp_path/"records.db",2)
    identity=a.put(spec)
    assert a.get(identity)==spec
    with pytest.raises(ValueError): b.get(identity)
    base=spec.hypothesis
    a.put(base)
    revised=base.model_copy(update={"name":"Revision", "parent":base.identity})
    a.put(revised)
    assert a.get(base.identity)==base
    assert revised.identity!=base.identity


def test_objects_cannot_update_delete(tmp_path,spec):
    registry=Registry(tmp_path/"records.db",1)
    registry.put(spec)
    with registry.connect() as db:
        with pytest.raises(sqlite3.IntegrityError): db.execute("DELETE FROM objects")
        with pytest.raises(sqlite3.IntegrityError): db.execute("UPDATE objects SET payload='{}'")


def test_concurrent_writers_and_attempts_retained(tmp_path,spec):
    registry=Registry(tmp_path/"records.db",1)
    with ThreadPoolExecutor(max_workers=4) as pool:
        hashes=list(pool.map(lambda _:registry.put(spec),range(8)))
    assert set(hashes)=={spec.identity}
    for attempt in ("a","b","c"):
        registry.append("START",{"run_hash":spec.identity},attempt)
        registry.append("HOLDOUT_OPEN",{"preregistration_hash":spec.identity},attempt)
        registry.append({"a":"ERROR","b":"ABORT","c":"SUCCESS"}[attempt],{},attempt)
    assert registry.holdout_openings(spec.identity)==3
    assert len(registry.events())==9
    with pytest.raises(ValueError): registry.append("SUCCESS",{},"a")
    with pytest.raises(ValueError): registry.append("HOLDOUT_OPEN",{},"unknown")


def test_freeze_is_idempotent_not_backdated(tmp_path,spec):
    registry=Registry(tmp_path/"records.db",1)
    receipt=freeze(registry,spec,"a"*40)
    assert freeze(registry,spec,"b"*40)==receipt
    assert receipt.frozen_at>spec.datasets[0].input_cutoff
    assert len(registry.events())==1


def test_paper_anchor_substitution_and_missing_original():
    text="The mean is not reported."
    paper=Paper(title="Fixture",authors=("Author",),source_url="fixture://paper",source_sha256="a"*64,
        extraction_status="EXTRACTED",pages=(text,),claims=(PaperClaim(kind="LIMITATION",
            statement="Mean absent",anchor=Anchor(page=1,start=0,end=len(text),excerpt=text)),))
    assert paper.original_data is paper.original_seed is paper.original_ci is None
    raw=paper.model_dump(mode="json");raw["pages"]=["Different bytes"]
    with pytest.raises(ValueError): Paper.model_validate(raw)
    raw=paper.model_dump(mode="json");raw["claims"][0]["reported_value"]=.42
    with pytest.raises(ValueError): Paper.model_validate(raw)


@pytest.mark.parametrize("state",["SUPPORTED","NOT_SUPPORTED","INCONCLUSIVE","UNAVAILABLE"])
def test_four_verdict_states(state):
    score=Scorecard(STATISTICAL=state,ECONOMIC=state,REGIME_DEPENDENCE=state,CROSS_MARKET=state,reasons=("Evidence",))
    assert score.STATISTICAL.value==state


def test_unavailable_cannot_carry_invented_statistics():
    with pytest.raises(ValueError): StatisticalResult(status="UNAVAILABLE",method="HAC",n=0,
        unit="return",assumptions=(),reason="Missing",estimate=.1)
