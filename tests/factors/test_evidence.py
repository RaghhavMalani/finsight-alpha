import copy
from pathlib import Path
import pytest
from src.factors.evidence import bundle, policy, resolve_ref, verify_bundle, resolve_file_ref
ROOT=Path(__file__).resolve().parents[2]

@pytest.mark.parametrize('country',['US','INDIA'])
def test_all_six_retained_assessments_have_exact_joins(country):
    for at in policy(ROOT)['cutoffs']:
        spec,values=verify_bundle(ROOT,country,at)
        assert values['factors']['payload']['controls']==['mkt','smb','hml']
        assert values['lineage']['payload']['runs']['factors']['run_id']==spec['refs']['factors']['run_id']

@pytest.mark.parametrize('field,value',[('run_id','0'*64),('country','INDIA'),('as_of','2000-01-01T00:00:00Z'),('json_pointer','/payload/factors/decomposition'),('source_ids',['yfinance']),('artifact_id','regimes:snapshot:'+'0'*64)])
def test_reference_substitution_fails(field,value):
    at=policy(ROOT)['cutoffs'][-1];ref=copy.deepcopy(bundle(ROOT,'US',at)['refs']['factors']);ref[field]=value
    with pytest.raises(ValueError,match='Unreviewed reference'):resolve_ref(ROOT,ref,'US',at)

def test_earliest_capture_never_borrows_later_library_coverage():
    p=policy(ROOT)
    for country in ['US','INDIA']:
        assert all(x['observed_coverage'] is None for x in bundle(ROOT,country,p['cutoffs'][0])['catalog'])
        assert all(x['observed_coverage'] is not None for x in bundle(ROOT,country,p['cutoffs'][-1])['catalog'])
        assert bundle(ROOT,country,p['cutoffs'][-1])['catalog'][-1]['analysis_coverage'] is None

def test_no_unknown_cutoff_fallback():
    with pytest.raises(LookupError):bundle(ROOT,'US','2000-01-01T00:00:00Z')

def test_immutable_ledger_pointers_exist():
    for ref in policy(ROOT)['file_refs'].values():resolve_file_ref(ROOT,ref)
