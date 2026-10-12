from pathlib import Path
from src.factors.service import payload
from src.factors.evidence import policy
ROOT=Path(__file__).resolve().parents[2]

def test_no_funnel_and_partial_does_not_mean_pass():
    p=payload(ROOT,'ledger','US',policy(ROOT)['cutoffs'][-1])
    for candidate in p['candidates']:
        for stage in candidate['stages'].values():
            assert stage['status'] not in ('PASS','SIGNIFICANT','SURVIVED')
            if stage['status'] in ('VERIFIED','PARTIAL'):assert stage['evidence_refs']
    raw=p['candidates'][0]['stages']['RAW_TEST']
    assert raw['status']=='PARTIAL' and raw['underlying_verdict']=='NOT_CALIBRATED'
    assert raw['reason_code']=='DIAGNOSTIC_ASYMPTOTIC'
    assert p['claim_boundaries']['research_os']=='NOT_CALIBRATED / CLOSED'
    assert p['claim_boundaries']['replacement']=='NOT_CONFIRMED'
    assert p['candidates'][0]['stages']['COSTS']['status']=='UNAVAILABLE'
