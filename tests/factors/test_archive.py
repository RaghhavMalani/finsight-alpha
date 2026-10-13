import json
from pathlib import Path
import pytest
from scripts.factors_archive import BASE, baseline, verify_freeze, verify_route
ROOT=Path(__file__).resolve().parents[2]

def test_fixed_phase5_archive_and_withdrawals():
    frozen=verify_freeze(ROOT)
    assert frozen['base']==BASE
    assert len(frozen['regime_entries'])==33
    assert '.github/workflows/organs.yml' in frozen['files']
    assert len([p for p in frozen['files'] if p.startswith('data/exports/regimes_v0_1/receipt-')])==4

@pytest.mark.parametrize('route',['/factor-evidence/audit?country=UNKNOWN','/factor-evidence/audit?tenant=other&country=US','/factor-evidence/unknown?country=US','/factor-evidence/audit?country=US&country=INDIA','/regimes/factors?asset=US-MKT'])
def test_delegation_cannot_allow_unknown_routes(route):
    with pytest.raises(ValueError):
        verify_route(route,'factors:audit:'+'0'*64,{'factors:audit:'+'0'*64:{}})

def test_baseline_cannot_advance():
    assert baseline(ROOT)['base']=='5b8591d540288e99aaf6ee69163bd4d5a6c6d147'

@pytest.mark.parametrize('path',['.github/workflows/organs.yml','eval/regimes/v0.1/profile.json','data/exports/regimes_v0_1/receipt.json','src/regimes/factors.py'])
def test_frozen_source_receipt_or_scheduler_mutation_fails(monkeypatch,path):
    original=Path.read_bytes
    def sabotage(target):
        raw=original(target)
        if target==ROOT/path:return raw+b'\nMUTATED\n'
        return raw
    monkeypatch.setattr(Path,'read_bytes',sabotage)
    with pytest.raises(ValueError,match='Frozen evidence mutated'):verify_freeze(ROOT)

def test_false_cannot_alias_zero_in_phase5_entry(monkeypatch):
    original=Path.read_bytes;target=ROOT/'frontend-v2/public/replay-manifest.json'
    def sabotage(path):
        raw=original(path)
        if path==target:
            value=json.loads(raw);key=next(k for k in value['artifacts'] if k.startswith('regimes:'))
            value['artifacts'][key]['bytes']=False
            return json.dumps(value).encode()
        return raw
    monkeypatch.setattr(Path,'read_bytes',sabotage)
    with pytest.raises(ValueError,match='Phase 5 artifact'):verify_freeze(ROOT)


@pytest.mark.parametrize('field,value',[('tenant_id','other'),('provider_rows',[1,2,3]),('reason','{"raw":[1,2,3]}')])
def test_manifest_annotations_cannot_transport_unreviewed_values(field,value):
    from scripts.factors_archive import verify_addition
    manifest=json.loads((ROOT/'frontend-v2/public/replay-manifest.json').read_bytes())
    identity=next(k for k in manifest['artifacts'] if k.startswith('factors:'))
    entry=dict(manifest['artifacts'][identity]);entry[field]=value
    with pytest.raises(ValueError,match='Unknown Phase 6 manifest field'):verify_addition(ROOT/'frontend-v2/public',identity,entry)
