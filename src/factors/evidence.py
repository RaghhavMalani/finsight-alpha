"""Exact frozen references. No path discovery, providers, databases or runners."""
import json
from hashlib import sha256
from pathlib import Path
from .contracts import COUNTRIES, canonical, clock

BASE='5b8591d540288e99aaf6ee69163bd4d5a6c6d147'
SELECTORS={'factors':'/payload','snapshot':'/payload/current/factors/neutrality','lineage':'/payload/runs/factors'}

def policy(root):
    return json.loads((Path(root)/'eval/factors/v0.1/policy.json').read_bytes())

def bundle(root,country,cutoff=None):
    if country not in COUNTRIES:raise ValueError('Unknown factor country')
    p=policy(root)
    selected=cutoff or p['cutoffs'][-1]
    if selected not in p['cutoffs']:raise LookupError('UNAVAILABLE: unknown retained cutoff')
    return p['bundles'][country][selected]

def resolve_ref(root,ref,country,cutoff):
    root=Path(root);p=policy(root);spec=bundle(root,country,cutoff)
    if not any(canonical(ref)==canonical(x) for x in spec['refs'].values()):
        raise ValueError('Unreviewed reference, selector, country, run or cutoff')
    kind=ref['kind'].removeprefix('regimes-')
    if ref['json_pointer']!=SELECTORS[kind]:raise ValueError('Unsafe numerical selector')
    manifest=json.loads((root/'frontend-v2/public/replay-manifest.json').read_bytes())
    expected=p['original_entries'][ref['artifact_id']]
    if canonical(manifest['artifacts'].get(ref['artifact_id']))!=canonical(expected):
        raise ValueError('Original reference entry/source/licence substituted')
    public=root/'frontend-v2/public';path=public/expected['url'].lstrip('/')
    if path.resolve().parent!=(public/'artifacts/replay').resolve():raise ValueError('Reference path escape')
    raw=path.read_bytes()
    if sha256(raw).hexdigest()!=ref['sha256'] or len(raw)!=ref['bytes']:raise ValueError('Reference bytes changed')
    value=json.loads(raw)
    if (value['as_of']!=cutoff or value['payload']['asset']!=COUNTRIES[country]
        or value['sources']!=ref['source_ids'] or expected['licence']!=p['source_grants'][ref['source_ids'][0]]):
        raise ValueError('Original country/cutoff/licence binding changed')
    if kind=='factors':
        from src.regimes.publication import validate_factors
        validate_factors(value['payload'])
    if kind=='snapshot' and value['payload']['run_ids']['factors']!=ref['run_id']:raise ValueError('Snapshot run substitution')
    if kind=='lineage':
        chain=value['payload']['runs']['factors']
        def check(node):
            if node['status']!='VERIFIED' or node['as_of']!=cutoff:raise ValueError('Stale/unverified lineage')
            for source in node['sources']:
                if source['source']!=ref['source_ids'][0] or clock(source['captured_at'])>clock(cutoff):raise ValueError('Source or availability substitution')
                if source['licence_decision']!={'dataset_key':source['source'],'status':'ACTIVE','permitted_uses':['publish_derived']}:raise ValueError('Lineage licence unavailable')
            for producer in node['producers']:check(producer)
        check(chain)
        if chain['run_id']!=ref['run_id']:raise ValueError('Lineage run substitution')
    return value

def verify_bundle(root,country,cutoff):
    spec=bundle(root,country,cutoff)
    values={k:resolve_ref(root,r,country,cutoff) for k,r in spec['refs'].items()}
    lineage=values['lineage']['payload']['runs']['factors']
    if values['snapshot']['payload']['run_ids']['factors']!=lineage['run_id']:raise ValueError('Broken retained run join')
    return spec,values

def resolve_file_ref(root,ref):
    p=policy(root)
    if not any(canonical(ref)==canonical(x) for x in p['file_refs'].values()):raise ValueError('Unreviewed frozen file reference')
    if ref['commit']!=BASE or ref['json_pointer'] not in ('/claims','/scorecard','/calibration_status','/status','/holdout_openings','/family','/publication_correction','/profile_sha256'):
        raise ValueError('Unreviewed file assertion')
    target=Path(root)/ref['path'];raw=target.read_bytes()
    if sha256(raw).hexdigest()!=ref['sha256']:raise ValueError('Frozen ledger evidence changed')
    value=json.loads(raw);selected=value
    for part in ref['json_pointer'].split('/')[1:]:
        if not isinstance(selected,dict) or part not in selected:raise ValueError('Orphan ledger assertion')
        selected=selected[part]
    if ref['assertion_id'] in ('NOT_CALIBRATED','NOT_CONFIRMED') and selected!=ref['assertion_id']:
        raise ValueError('Frozen inference gate changed')
    return value
