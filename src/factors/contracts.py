"""Four recursively closed metadata schemas; numbers are coverage metadata only."""
import json
import re
from datetime import datetime

KINDS=('catalog','audit','ledger','lineage')
COUNTRIES={'US':'US-MKT','INDIA':'IN-MKT'}
SCHEMA='factors-evidence/1'
CLAIMS={k:False for k in ('inference_certified','market_claim_eligible','causal_claim_eligible','validated_alpha','trusted_graph','precise_edge_confidence')}

def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()

def clock(value):
    if not isinstance(value,str) or not value.endswith('Z'):
        raise ValueError('Explicit UTC timestamp required')
    return datetime.fromisoformat(value.replace('Z','+00:00'))

def validate_schema(value,schema,path='root'):
    if 'oneOf' in schema:
        for choice in schema['oneOf']:
            try:
                validate_schema(value,choice,path)
                return
            except ValueError:
                pass
        raise ValueError('Unreviewed metadata union: '+path)
    kind=schema['type']
    if kind=='object':
        if not isinstance(value,dict) or set(value)!=set(schema['properties']):
            raise ValueError('Unknown or missing metadata field: '+path)
        for key,definition in schema['properties'].items():validate_schema(value[key],definition,path+'.'+key)
    elif kind=='array':
        if not isinstance(value,list) or len(value)!=len(schema['prefixItems']):
            raise ValueError('Unknown metadata array length: '+path)
        for i,(item,definition) in enumerate(zip(value,schema['prefixItems'])):validate_schema(item,definition,path+f'[{i}]')
    elif kind=='integer':
        if type(value) is not int or value<0 or value>2**53-1:
            raise ValueError('Only safe coverage/count integers allowed: '+path)
    elif kind=='null':
        if value is not None:raise ValueError('Expected unavailable null: '+path)
    elif kind=='boolean':
        if type(value) is not bool:raise ValueError('Boolean substitution: '+path)
    elif kind=='string':
        if not isinstance(value,str) or len(value)>1200:raise ValueError('Metadata text bound: '+path)
        if 'pattern' in schema and not re.fullmatch(schema['pattern'],value):raise ValueError('Malformed metadata identity: '+path)
    else:raise ValueError('Unknown schema type')
    if 'enum' in schema and canonical(value) not in [canonical(x) for x in schema['enum']]:
        raise ValueError('Unreviewed metadata value: '+path)

def schema_for(samples):
    """Compile reviewed projections once into explicit per-kind positive schemas."""
    signatures={('object',tuple(sorted(v))) if isinstance(v,dict) else ('array',len(v)) if isinstance(v,list) else (type(v).__name__,) for v in samples}
    if len(signatures)>1:
        groups={}
        for value in samples:
            sig=('object',tuple(sorted(value))) if isinstance(value,dict) else ('array',len(value)) if isinstance(value,list) else (type(value).__name__,)
            groups.setdefault(sig,[]).append(value)
        return {'oneOf':[schema_for(values) for values in groups.values()]}
    value=samples[0]
    if isinstance(value,dict):return {'type':'object','properties':{k:schema_for([v[k] for v in samples]) for k in sorted(value)}}
    if isinstance(value,list):return {'type':'array','prefixItems':[schema_for([v[i] for v in samples]) for i in range(len(value))]}
    if type(value) is float:raise ValueError('Numerical diagnostics cannot enter metadata schema')
    kind='null' if value is None else 'boolean' if type(value) is bool else 'integer' if type(value) is int else 'string'
    if kind=='string' and re.fullmatch('[a-f0-9]{64}',value):return {'type':'string','pattern':'[a-f0-9]{64}'}
    unique={canonical(v):v for v in samples}
    return {'type':kind,'enum':list(unique.values())}
