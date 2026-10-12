"""Fixed Phase 5 byte boundary plus exact Phase 6 metadata delegation."""
import hashlib
import json
import re
import subprocess
from pathlib import Path
from functools import lru_cache

BASE = '5b8591d540288e99aaf6ee69163bd4d5a6c6d147'
PUBLIC = 'frontend-v2/public'
IDENTITY = re.compile(r'factors:(catalog|audit|ledger|lineage):([a-f0-9]{64})')

def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root)

def same(left,right):
    return json.dumps(left,sort_keys=True,allow_nan=False)==json.dumps(right,sort_keys=True,allow_nan=False)

def protected(path):
    return (path.startswith(('src/', 'finsight/', 'docs/screenshots/', 'data/exports/regimes_v0_1/',
                             'data/exports/nervous_system_v0_1/', 'data/exports/research_os_v0_1/',
                             'data/exports/research_os_v0_1_1/', 'eval/regimes/', 'eval/plugins/'))
            or path in ('.github/workflows/organs.yml', 'backend/routes/factors.py',
                        'frontend-v2/src/app/shell/ForgeShell.tsx', 'frontend-v2/src/replay/client.ts',
                        'frontend-v2/src/replay/contracts.ts', 'frontend-v2/src/markets/queries.ts')
            or path.startswith(PUBLIC + '/artifacts/'))

@lru_cache(maxsize=4)
def baseline(root):
    files = {}
    paths = [p for p in git(root, 'ls-tree', '-r', '--name-only', BASE).decode().splitlines() if protected(p)]
    batch = subprocess.check_output(['git','cat-file','--batch'], cwd=root,
                                    input=''.join(BASE+':'+p+'\n' for p in paths).encode())
    cursor = 0
    for path in paths:
            end = batch.index(b'\n', cursor)
            size = int(batch[cursor:end].split()[-1])
            raw = batch[end+1:end+1+size]
            cursor = end+size+2
            # Sources are compared in canonical newline form; sealed evidence is raw.
            mode = 'canonical_text' if path.endswith(('.py','.tsx','.ts','.yml')) or path.startswith('eval/regimes/') else 'raw'
            value = raw.replace(b'\r\n', b'\n') if mode == 'canonical_text' else raw
            files[path] = {'sha256': hashlib.sha256(value).hexdigest(), 'mode': mode}
    manifest = json.loads(git(root, 'show', BASE + ':' + PUBLIC + '/replay-manifest.json'))
    return {'schema_version': 'factors-freeze/1', 'base': BASE, 'files': files,
            'regime_entries': {k:v for k,v in manifest['artifacts'].items() if k.startswith('regimes:')},
            'regime_routes': {k:v for k,v in manifest['routes'].items() if k.startswith('/regimes/')}}

def verify_freeze(root):
    root = Path(root)
    frozen = json.loads((root / 'eval/factors/v0.1/phase5-freeze.json').read_bytes())
    if not same(frozen,baseline(root)):
        raise ValueError('Fixed baseline inventory changed')
    for path, seal in frozen['files'].items():
        target = root / path
        if not target.is_file():
            raise ValueError('Frozen evidence removed: ' + path)
        raw = target.read_bytes()
        if seal['mode'] == 'canonical_text':
            raw = raw.replace(b'\r\n', b'\n')
        if hashlib.sha256(raw).hexdigest() != seal['sha256']:
            raise ValueError('Frozen evidence mutated: ' + path)
    manifest = json.loads((root / PUBLIC / 'replay-manifest.json').read_bytes())
    if not same({k:v for k,v in manifest['artifacts'].items() if k.startswith('regimes:')},frozen['regime_entries']):
        raise ValueError('Phase 5 artifact mutated or republished')
    if not same({k:v for k,v in manifest['routes'].items() if k.startswith('/regimes/')},frozen['regime_routes']):
        raise ValueError('Phase 5 route mutated')
    from scripts.correct_regime_factors import verify_corrections
    verify_corrections(root / PUBLIC, root / 'data/exports/regimes_v0_1')
    return frozen

def verify_addition(public, identity, entry):
    from src.factors.publication import validate_public
    public = Path(public)
    fields={'status','kind','url','sha256','bytes','sources','licence','input_hash','as_of','observed_at','available_at','reason','scope'}
    if not isinstance(entry,dict) or set(entry)!=fields or entry['reason'] is not None:raise ValueError('Unknown Phase 6 manifest field')
    match = IDENTITY.fullmatch(identity)
    if not match:
        raise ValueError('Unreviewed Phase 6 namespace')
    name = '/artifacts/replay/' + identity.replace(':', '-') + '.json'
    raw = (public / name.lstrip('/')).read_bytes()
    value = json.loads(raw)
    if (entry.get('url') != name or entry.get('sha256') != match[2] or hashlib.sha256(raw).hexdigest() != match[2]
        or entry.get('bytes') != len(raw) or entry.get('kind') != 'factors-' + match[1]
        or entry.get('scope') != 'READ_ONLY_FACTOR_EVIDENCE' or entry.get('status') != 'AVAILABLE'
        or entry.get('input_hash') != value.get('input_hash') or entry.get('sources') != value.get('sources')
        or entry.get('licence') != {'status':'FIRST_PARTY','permitted_uses':['publish_derived'],
                                  'dataset_key':'project:factor-evidence','valid_through':None}):
        raise ValueError('Phase 6 metadata identity/permission substitution')
    validate_public(value, root=public.parents[1])
    return PUBLIC + name

def verify_route(route, identity, artifacts, root=None):
    from urllib.parse import parse_qs, urlsplit, urlencode
    parts = urlsplit(route)
    if parts.scheme or parts.netloc or parts.fragment or parts.path not in ['/factor-evidence/'+k for k in ('catalog','audit','ledger','lineage')]:
        raise ValueError('Unreviewed Phase 6 route')
    query = parse_qs(parts.query, strict_parsing=True)
    if set(query) not in ({'country'}, {'as_of','country'}) or any(len(v)!=1 for v in query.values()) or query['country'][0] not in ('US','INDIA'):
        raise ValueError('Invalid factor route selection')
    if route != parts.path + '?' + urlencode(sorted((k,v[0]) for k,v in query.items())):
        raise ValueError('Noncanonical factor route')
    if identity not in artifacts or not identity.startswith('factors:' + parts.path.rsplit('/',1)[1] + ':'):
        raise ValueError('Factor route kind substitution')
    from src.factors.service import envelope
    from src.factors.evidence import policy
    root=Path(root) if root is not None else Path(__file__).resolve().parents[1]
    cutoff=query.get('as_of',[policy(root)['cutoffs'][-1]])[0]
    country=query['country'][0]
    expected=envelope(root,parts.path.rsplit('/',1)[1],country,cutoff)
    from src.factors.contracts import canonical
    if identity!='factors:'+expected['kind']+':'+hashlib.sha256(canonical(expected)).hexdigest():
        raise ValueError('Route country/cutoff/reference substitution')
    return True

def verify(root):
    root = Path(root)
    frozen = verify_freeze(root)
    from src.factors.inventory import verify_inventory
    verify_inventory(root)
    manifest = json.loads((root / PUBLIC / 'replay-manifest.json').read_bytes())
    for identity, entry in manifest['artifacts'].items():
        if identity.startswith('factors:'):
            verify_addition(root / PUBLIC, identity, entry)
    for route, identity in manifest['routes'].items():
        if route.startswith('/factor-evidence/'):
            verify_route(route, identity, manifest['artifacts'],root=root)
    allowed = {entry['url'].lstrip('/') for identity,entry in manifest['artifacts'].items() if identity.startswith('factors:')}
    for path in (root / PUBLIC / 'artifacts/replay').glob('factors-*.json'):
        if path.relative_to(root / PUBLIC).as_posix() not in allowed:
            raise ValueError('Orphan factor metadata file')
    return {'status':'VERIFIED','frozen_files':len(frozen['files']),'phase5_artifacts':len(frozen['regime_entries'])}
