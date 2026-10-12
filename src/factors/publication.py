"""Metadata-only explicit export. Manifest replacement is the publication commit."""
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlencode
from .contracts import CLAIMS, COUNTRIES, KINDS, canonical, clock, validate_schema
from .evidence import policy
from .service import envelope

LICENSE={'status':'FIRST_PARTY','permitted_uses':['publish_derived'],'dataset_key':'project:factor-evidence','valid_through':None}

def validate_public(value,*,root):
    p=policy(root)
    if not isinstance(value,dict) or value.get('kind') not in KINDS:raise ValueError('Unknown factor metadata kind')
    validate_schema(value,p['schemas'][value['kind']])
    country=value['country'];cutoff=value['evidence_cutoff']
    if country not in COUNTRIES or cutoff not in p['cutoffs']:raise ValueError('Unknown country/cutoff')
    expected=envelope(root,value['kind'],country,cutoff)
    if canonical(value)!=canonical(expected):raise ValueError('Metadata evidence/status/reference substitution')
    if len(canonical(value))>128*1024:raise ValueError('Metadata artifact exceeds reviewed bound')
    return True

def export(root):
    root=Path(root)
    from scripts.factors_archive import verify_freeze
    verify_freeze(root)
    p=policy(root);public=root/'frontend-v2/public'
    pointer=public/'replay-manifest.json';original=pointer.read_bytes();manifest=json.loads(original)
    writes={};routes={};artifacts={}
    for country in COUNTRIES:
        for cutoff in p['cutoffs']:
            for kind in KINDS:
                value=envelope(root,kind,country,cutoff);validate_public(value,root=root)
                raw=canonical(value);digest=sha256(raw).hexdigest();identity='factors:'+kind+':'+digest
                url='/artifacts/replay/'+identity.replace(':','-')+'.json'
                routes['/factor-evidence/'+kind+'?'+urlencode(sorted({'as_of':cutoff,'country':country}.items()))]=identity
                if cutoff==p['cutoffs'][-1]:routes['/factor-evidence/'+kind+'?country='+country]=identity
                artifacts[identity]=(value,raw,url)
                if identity in manifest['artifacts']:
                    entry=manifest['artifacts'][identity]
                    from scripts.factors_archive import verify_addition
                    verify_addition(public,identity,entry)
                    if (public/entry['url'].lstrip('/')).read_bytes()!=raw:raise ValueError('Immutable metadata substitution')
                else:writes[public/url.lstrip('/')]=raw
    signature=sha256(canonical({'artifacts':sorted(artifacts),'routes':routes})).hexdigest()
    directory=root/'data/exports/factors_v0_1';receipt_path=directory/'receipt.json'
    if not writes and all(manifest['routes'].get(k)==v for k,v in routes.items()):
        if not receipt_path.is_file():raise ValueError('Metadata publication without receipt')
        receipt=json.loads(receipt_path.read_bytes())
        if receipt['metadata_identity']!=signature:raise ValueError('Metadata receipt identity mismatch')
        return {'status':'UNCHANGED','artifacts':len(artifacts),'writes':0,'receipt_sha256':sha256(receipt_path.read_bytes()).hexdigest()}
    published=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    if clock(published)<clock(manifest['as_of']):raise ValueError('Clock precedes current publication; no backdating fallback')
    for identity,(value,raw,url) in artifacts.items():
        if identity not in manifest['artifacts']:
            manifest['artifacts'][identity]={'status':'AVAILABLE','kind':'factors-'+value['kind'],'url':url,'sha256':identity.rsplit(':',1)[1],
                 'bytes':len(raw),'sources':value['sources'],'licence':LICENSE,'input_hash':value['input_hash'],'as_of':published,
                 'observed_at':published,'available_at':published,'reason':None,'scope':'READ_ONLY_FACTOR_EVIDENCE'}
    manifest['routes'].update(routes);manifest['as_of']=published
    history=json.loads((root/'data/exports/research_os_v0_1/flagship.json').read_bytes())
    receipt={'schema_version':'factors-receipt/1','metadata_identity':signature,'published_at':published,'phase5_base':p['base'],
        'policy_sha256':sha256((root/'eval/factors/v0.1/policy.json').read_bytes()).hexdigest(),
        'inventory_sha256':sha256((root/'eval/factors/v0.1/output-inventory.json').read_bytes()).hexdigest(),
        'ledger_map_sha256':sha256((root/'eval/factors/v0.1/ledger-map.json').read_bytes()).hexdigest(),
        'execution':{'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
                     'dirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip())},
        'artifacts':sorted(artifacts),'routes':routes,'retained_references':[r for c in p['bundles'].values() for b in c.values() for r in b['refs'].values()],
        'new_model_runs':0,'new_series_computations':0,'new_captures':0,'new_holdout_openings':0,'new_research_attempts':0,
        'historical_phase2_runs':sorted(k for k in manifest['artifacts'] if k.startswith('plugins:run:')),
        'historical_research_os_openings':history['holdout_openings'],'claims':CLAIMS}
    receipt_raw=canonical(receipt);receipt_hash=sha256(receipt_raw).hexdigest()
    writes[directory/('receipt-'+receipt_hash+'.json')]=receipt_raw
    writes[receipt_path]=receipt_raw
    # Preflight is complete. Stage byte-identical files; never call the shared
    # ReplayPublisher.finish(), which would prune unlisted historical files.
    staged=[]
    try:
        for target,raw in writes.items():
            target.parent.mkdir(parents=True,exist_ok=True)
            if target.is_file():
                if target.read_bytes()!=raw:raise ValueError('Existing metadata file differs: '+str(target))
                continue
            fd,name=tempfile.mkstemp(prefix='.factors-stage-',dir=target.parent)
            with os.fdopen(fd,'wb') as out:out.write(raw)
            staged.append((Path(name),target))
        if pointer.read_bytes()!=original:raise ValueError('Manifest changed during export; retain prior evidence')
        for staged_path,target in staged:os.replace(staged_path,target)
        fd,name=tempfile.mkstemp(prefix='.factors-manifest-',dir=public)
        with os.fdopen(fd,'wb') as out:out.write(canonical(manifest))
        os.replace(name,pointer)
    finally:
        for staged_path,_ in staged:
            if staged_path.is_file():staged_path.unlink() # Only owned new staging files.
    return {'status':'PUBLISHED','artifacts':len(artifacts),'writes':len(writes)+1,'receipt_sha256':receipt_hash}
