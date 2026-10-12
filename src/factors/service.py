"""Assemble metadata from verified retained evidence. Never calculate a diagnostic."""
import copy
import json
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from .contracts import CLAIMS, COUNTRIES, SCHEMA, canonical
from .evidence import bundle, policy, resolve_file_ref, verify_bundle
from .inventory import verify_inventory

def payload(root,kind,country,cutoff):
    p=policy(root);spec,values=verify_bundle(root,country,cutoff)
    if kind=='catalog':return {'items':copy.deepcopy(spec['catalog']), 'unavailable_analytics':p['unavailable_analytics']}
    if kind=='audit':
        inventory=verify_inventory(root);rows=copy.deepcopy(inventory['audit'])
        for row in rows:
            if row['evidence_class']=='RETAINED_REAL':row['source_lineage_ref']=spec['refs']['lineage']
            if row['eligibility_status']=='ELIGIBLE_RETAINED':row['retained_diagnostic_refs']=[spec['refs'][k] for k in ('factors','snapshot','lineage')]
        return {'inventory_commit':p['base'],'definitions':inventory['declarations']['definitions'],'items':rows,'exclusions':inventory['declarations']['exclusions']}
    if kind=='ledger':
        stages=('DEFINITION','RAW_TEST','MULTIPLE_TESTING','OUT_OF_SAMPLE','COSTS','REGIME_ROBUSTNESS','CROSS_MARKET','CLAIM_STATUS')
        def stage(status,reason,refs=(),verdict=None):return {'status':status,'reason_code':reason,'reason':p['ledger_reasons'][reason],'evidence_refs':list(refs),'underlying_verdict':verdict}
        real={k:stage('UNAVAILABLE','NO_APPROVED_CONTRACT') for k in stages}
        real['DEFINITION']=stage('VERIFIED','RETAINED_DEFINITION',[spec['refs']['lineage']])
        real['RAW_TEST']=stage('PARTIAL','DIAGNOSTIC_ASYMPTOTIC',[spec['refs']['factors']],'NOT_CALIBRATED')
        real['CLAIM_STATUS']=stage('BLOCKED','NO_INFERENCE_CERTIFICATION',[spec['refs']['factors']],'NOT_CALIBRATED')
        mapping=json.loads((Path(root)/'eval/factors/v0.1/ledger-map.json').read_bytes())
        for ref in p['file_refs'].values():resolve_file_ref(root,ref)
        real['COSTS']=stage('UNAVAILABLE','COSTS_UNAVAILABLE',[p['file_refs']['illustrative_cost']],'ECONOMIC_UNAVAILABLE')
        prior={k:stage(v['status'],v['reason_code'],[p['file_refs'][name] for name in v['evidence_keys']],v['underlying_verdict']) for k,v in mapping['research_stages'].items()}
        fixture={k:stage('NOT_APPLICABLE','ENGINEERING_ONLY') for k in stages}
        return {'candidates':[{'candidate_id':country+':retained-mom','label':'Retained MOM factor assessment','country':country,'evidence_class':'RETAINED_REAL','family_ref':None,'stages':real},
                              {'candidate_id':'research-os:closed-momentum','label':'Frozen Research OS momentum study','country':'CROSS_MARKET','evidence_class':'FROZEN_PRIOR','family_ref':p['file_refs']['preregistration'],'stages':prior},
                              {'candidate_id':'fixture:momentum','label':'Synthetic SDK fixture — engineering only','country':'NONE','evidence_class':'SYNTHETIC_TEST_ONLY','family_ref':None,'stages':fixture}],
                'claim_boundaries':{'research_os':'NOT_CALIBRATED / CLOSED','replacement':'NOT_CONFIRMED','d6':'DISABLED / DEFERRED','new_model_runs':0,'new_holdout_openings':0,'new_captures':0,'new_research_attempts':0,'claims':CLAIMS}}
    if kind=='lineage':
        chain=values['lineage']['payload']['runs']['factors'];ref=spec['refs']['lineage']
        nodes=[{'id':chain['run_id'],'kind':'SEALED_FACTOR_RUN','status':'VERIFIED','ref':ref,'reason_code':'EXISTING_PHASE5_RUN'}];edges=[]
        seen={chain['run_id']}
        def visit(node):
            for producer in node['producers']:
                if producer['run_id'] not in seen:
                    seen.add(producer['run_id']);nodes.append({'id':producer['run_id'],'kind':'SEALED_PRODUCER','status':'VERIFIED','ref':ref,'reason_code':'EXISTING_PHASE5_RUN'})
                edges.append({'from':node['run_id'],'to':producer['run_id'],'relationship':'DECLARED_PRODUCER'})
                visit(producer)
            for source in node['sources']:
                for identity,k in [(source['source_version_id'],'SOURCE_VERSION'),(source['capture_sha256'],'CAPTURE_SHA'),*[(a,'ADMISSION') for a in source['admissions']]]:
                    if identity not in seen:
                        seen.add(identity);nodes.append({'id':identity,'kind':k,'status':'CAPTURE_ONLY','ref':ref,'reason_code':'NO_RAW_SOURCE_VALUES'})
                    edges.append({'from':node['run_id'],'to':identity,'relationship':k})
        visit(chain)
        return {'nodes':nodes,'edges':edges,'withdrawals':p['withdrawals'],'source_values':'LOCAL_ONLY'}
    raise ValueError('Unknown factor metadata kind')

def envelope(root,kind,country,cutoff):
    value=payload(root,kind,country,cutoff)
    digest=sha256(canonical({'policy':policy(root),'inventory':verify_inventory(root),
                             'ledger':json.loads((Path(root)/'eval/factors/v0.1/ledger-map.json').read_bytes()),'payload':value})).hexdigest()
    return {'schema_version':SCHEMA,'kind':kind,'scope':'READ_ONLY_FACTOR_EVIDENCE','country':country,
            'asset_scope':[COUNTRIES[country]],'evidence_cutoff':cutoff,'input_hash':digest,
            'sources':[bundle(root,country,cutoff)['source']],'claims':dict(CLAIMS),'payload':value}
