import copy
from pathlib import Path
import pytest
from src.factors.contracts import KINDS, canonical, validate_schema
from src.factors.evidence import policy
from src.factors.publication import validate_public
from src.factors.service import envelope
ROOT=Path(__file__).resolve().parents[2]

@pytest.mark.parametrize('kind',KINDS)
def test_every_new_kind_is_metadata_only(kind):
    for country in ['US','INDIA']:
        v=envelope(ROOT,kind,country,policy(ROOT)['cutoffs'][-1]);assert validate_public(v,root=ROOT)
        def walk(x):
            if isinstance(x,dict):
                for item in x.values():walk(item)
            elif isinstance(x,list):
                for item in x:walk(item)
            else:assert type(x) is not float
        walk(v)

@pytest.mark.parametrize('kind',KINDS)
@pytest.mark.parametrize('key',['raw','target','fitted','residual','provider_rows','observations_raw','signal_value','predictions','p_values','tenant_id','unknown'])
def test_nested_unknown_or_reconstructable_fields_fail(kind,key):
    v=envelope(ROOT,kind,'US',policy(ROOT)['cutoffs'][-1]);v['payload'][key]=[1,2,3]
    with pytest.raises(ValueError):validate_public(v,root=ROOT)

@pytest.mark.parametrize('kind',KINDS)
def test_claim_zero_cannot_alias_false(kind):
    v=envelope(ROOT,kind,'US',policy(ROOT)['cutoffs'][-1]);v['claims']['validated_alpha']=0
    with pytest.raises(ValueError):validate_public(v,root=ROOT)

@pytest.mark.parametrize('kind',KINDS)
@pytest.mark.parametrize('field,replacement',[('country','INDIA'),('evidence_cutoff','2000-01-01T00:00:00Z'),('schema_version','factors-evidence/999'),('sources',['alpaca'])])
def test_cross_selection_promotion_fails(kind,field,replacement):
    v=envelope(ROOT,kind,'US',policy(ROOT)['cutoffs'][-1]);v[field]=replacement
    with pytest.raises((ValueError,LookupError)):validate_public(v,root=ROOT)

def test_reviewed_text_cannot_smuggle_json():
    v=envelope(ROOT,'audit','US',policy(ROOT)['cutoffs'][-1]);v['payload']['items'][0]['reason']='{"provider_rows":[123.0]}'
    with pytest.raises(ValueError):validate_public(v,root=ROOT)
