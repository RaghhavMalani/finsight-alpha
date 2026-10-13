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


@pytest.fixture(scope='module')
def publication_checkout(tmp_path_factory):
    import shutil
    import subprocess
    target=tmp_path_factory.mktemp('metadata-export')/'repo'
    subprocess.run(['git','clone','--shared','--no-checkout',str(ROOT),str(target)],check=True,capture_output=True)
    shutil.copytree(ROOT,target,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.git','node_modules','.pytest_cache','__pycache__','*.egg-info','.vercel','.output','replay-source'))
    # This isolated transaction fixture starts at the pre-Phase-6 publication.
    import json
    manifest=target/'frontend-v2/public/replay-manifest.json'
    value=json.loads(manifest.read_bytes())
    value['artifacts']={k:v for k,v in value['artifacts'].items() if not k.startswith('factors:')}
    value['routes']={k:v for k,v in value['routes'].items() if not k.startswith('/factor-evidence/')}
    manifest.write_bytes(canonical(value))
    for path in (target/'frontend-v2/public/artifacts/replay').glob('factors-*.json'):path.unlink()
    shutil.rmtree(target/'data/exports/factors_v0_1',ignore_errors=True)
    return target

def test_interrupted_install_retains_previous_manifest_and_no_orphans(publication_checkout,monkeypatch):
    import src.factors.publication as pub
    root=publication_checkout;pointer=root/'frontend-v2/public/replay-manifest.json';before=pointer.read_bytes()
    replace=pub.os.replace;calls=0
    def interrupted(source,target):
        nonlocal calls
        calls+=1
        if calls==3:raise OSError('simulated interruption')
        replace(source,target)
    monkeypatch.setattr(pub.os,'replace',interrupted)
    with pytest.raises(OSError,match='interruption'):pub.export(root)
    assert pointer.read_bytes()==before
    assert not list((root/'frontend-v2/public/artifacts/replay').glob('factors-*.json'))
    assert not list(root.rglob('.factors-*'))

def test_metadata_export_is_idempotent_and_preserves_original_entries(publication_checkout):
    import json
    from src.factors.publication import export
    root=publication_checkout;pointer=root/'frontend-v2/public/replay-manifest.json'
    previous=json.loads(pointer.read_bytes());result=export(root);first=pointer.read_bytes()
    assert result['status']=='PUBLISHED' and result['artifacts']==24
    repeat=export(root)
    assert repeat['status']=='UNCHANGED' and repeat['writes']==0
    assert repeat['receipt_sha256']==result['receipt_sha256'] and pointer.read_bytes()==first
    after=json.loads(first)
    for key,value in previous['artifacts'].items():assert after['artifacts'][key]==value
    for key,value in previous['routes'].items():assert after['routes'][key]==value
    receipt=json.loads((root/'data/exports/factors_v0_1/receipt.json').read_bytes())
    for key in ['new_model_runs','new_series_computations','new_captures','new_holdout_openings','new_research_attempts']:assert receipt[key]==0
