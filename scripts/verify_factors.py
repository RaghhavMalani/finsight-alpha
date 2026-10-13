"""Read-only Phase 6 publication, eligibility, licence, lineage and freeze audit."""
import json
import sys
from collections import Counter
from hashlib import sha256
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

def verify(root=ROOT):
    from scripts.factors_archive import verify as archive
    from scripts.research_archive import verify_shared_history
    from scripts.data_archive import verify as data_archive
    from scripts.regimes_archive import verify as regimes_archive
    from src.factors.inventory import verify_inventory
    from src.factors.contracts import CLAIMS, canonical, clock
    from src.factors.publication import validate_public
    root=Path(root);result=archive(root)
    verify_shared_history(root);data_archive(root);regimes_archive(root)
    inventory=verify_inventory(root);manifest=json.loads((root/'frontend-v2/public/replay-manifest.json').read_bytes())
    ids={i for i in manifest['artifacts'] if i.startswith('factors:')}
    raw=(root/'data/exports/factors_v0_1/receipt.json').read_bytes();receipt=json.loads(raw)
    if set(receipt['artifacts'])!=ids or len(ids)!=24:raise ValueError('Receipt/manifest metadata inventory differs')
    if (root/'data/exports/factors_v0_1'/('receipt-'+sha256(raw).hexdigest()+'.json')).read_bytes()!=raw:raise ValueError('Metadata receipt not retained')
    if canonical(receipt['claims'])!=canonical(CLAIMS) or any(type(receipt[k]) is not int or receipt[k]!=0 for k in ('new_model_runs','new_series_computations','new_captures','new_holdout_openings','new_research_attempts')):raise ValueError('Execution or claim boundary violated')
    from src.factors.evidence import policy, BASE
    p=policy(root)
    history=json.loads((root/'data/exports/research_os_v0_1/flagship.json').read_bytes())
    expected_refs=[ref for countries in p['bundles'].values() for bundle in countries.values() for ref in bundle['refs'].values()]
    if p['base']!=BASE or receipt['phase5_base']!=BASE:raise ValueError('Phase 5 receipt base moved')
    if receipt['historical_phase2_runs']!=sorted(k for k in manifest['artifacts'] if k.startswith('plugins:run:')) or receipt['historical_research_os_openings']!=history['holdout_openings']:raise ValueError('Historical opening evidence changed')
    if canonical(receipt['retained_references'])!=canonical(expected_refs):raise ValueError('Receipt retained reference substitution')
    if receipt['metadata_identity']!=sha256(canonical({'artifacts':sorted(ids),'routes':receipt['routes']})).hexdigest():raise ValueError('Receipt metadata identity changed')
    for identity in ids:
        if any(manifest['artifacts'][identity][key]!=receipt['published_at'] for key in ('as_of','observed_at','available_at')):raise ValueError('First metadata publication clock changed')
    for name,path in [('policy_sha256','policy.json'),('inventory_sha256','output-inventory.json'),('ledger_map_sha256','ledger-map.json')]:
        if receipt[name]!=sha256((root/'eval/factors/v0.1'/path).read_bytes()).hexdigest():raise ValueError('Metadata declaration receipt changed')
    for route,identity in receipt['routes'].items():
        if manifest['routes'].get(route)!=identity:raise ValueError('Metadata historical route changed')
    for identity in ids:
        entry=manifest['artifacts'][identity]
        if not clock(entry['observed_at'])<=clock(entry['available_at'])<=clock(entry['as_of'])<=clock(manifest['as_of']):raise ValueError('Metadata publication was backdated')
        value=json.loads((root/'frontend-v2/public'/entry['url'].lstrip('/')).read_bytes());validate_public(value,root=root)
    result.update({'definitions':len(inventory['declarations']['definitions']),'current_outputs':55,'derived_channels':9,
                   'eligibility_counts':dict(Counter(x['eligibility_status'] for x in inventory['audit'])),
                   'metadata_artifacts':len(ids),'receipt_sha256':sha256(raw).hexdigest(),
                   'new_model_runs':0,'new_captures':0,'new_holdout_openings':0,'d6':'DISABLED / DEFERRED'})
    return result
if __name__=='__main__':print(json.dumps(verify(),sort_keys=True))
