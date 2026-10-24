"""Bounded SYNTHETIC_TEST_ONLY contract sabotage; never production publication."""
from copy import deepcopy
import pytest
from src.risk_manager.contracts import ClaimFlags,Scope,decode,identity,CLAIMS
from src.risk_manager.policy import load

def test_false_flags_do_not_coerce():
    ClaimFlags.model_validate(CLAIMS)
    for flag in CLAIMS:
        for value in [True,0,1,None,"false"]:
            bad=dict(CLAIMS,**{flag:value})
            with pytest.raises(ValueError): ClaimFlags.model_validate(bad)
    with pytest.raises(ValueError): ClaimFlags.model_validate({**CLAIMS,"unknown":False})

def test_duplicates_and_nonfinite_json_rejected():
    for raw in [b'{"a":1,"a":2}',b'{"a":NaN}',b'{"a":Infinity}']:
        with pytest.raises(ValueError): decode(raw)

def test_identity_excludes_mutable_observation_fields():
    o=dict(rule_id="R-MODEL-OOD",rule_version=1,category="MODEL",evidence_class="REAL_RETAINED",
        scope=dict(kind="MODEL",subject_id="US-MKT:hmm2",evidence_family="phase5:hmm2",stable_scope_key="hmm2"))
    baseline=identity(o)
    assert identity({**o,"severity":"CRITICAL","reason":"changed","witnessed_at":"tomorrow","git_head":"unrelated"})==baseline
    other=deepcopy(o); other["scope"]["subject_id"]="IN-MKT:hmm2"
    assert identity(other)!=baseline
    with pytest.raises(ValueError): Scope.model_validate({**o["scope"],"path":"../private"})
