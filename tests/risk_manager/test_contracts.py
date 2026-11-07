"""Bounded SYNTHETIC_TEST_ONLY contract sabotage; never production publication."""
from copy import deepcopy
import pytest
from src.risk_manager.contracts import ClaimFlags,Scope,decode,identity,CLAIMS
from src.risk_manager.policy import load

def test_false_flags_do_not_coerce():
    ClaimFlags.model_validate(CLAIMS)
    for flag in CLAIMS:
        for value in [True,0,1,None,"false"]:
            bad=dict(CLAIMS,**{flag:value})
            with pytest.raises(ValueError): ClaimFlags.model_validate(bad)
    with pytest.raises(ValueError): ClaimFlags.model_validate({**CLAIMS,"unknown":False})

def test_duplicates_and_nonfinite_json_rejected():
    for raw in [b'{"a":1,"a":2}',b'{"a":NaN}',b'{"a":Infinity}']:
        with pytest.raises(ValueError): decode(raw)

def test_identity_excludes_mutable_observation_fields():
    o=dict(rule_id="R-MODEL-OOD",rule_version=1,category="MODEL",evidence_class="REAL_RETAINED",
        scope=dict(kind="MODEL",subject_id="US-MKT:hmm2",evidence_family="phase5:hmm2",stable_scope_key="hmm2"))
    baseline=identity(o)
    assert identity({**o,"severity":"CRITICAL","reason":"changed","witnessed_at":"tomorrow","git_head":"unrelated"})==baseline
    other=deepcopy(o); other["scope"]["subject_id"]="IN-MKT:hmm2"
    assert identity(other)!=baseline
    with pytest.raises(ValueError): Scope.model_validate({**o["scope"],"path":"../private"})


def transport_fixture():
    from pathlib import Path
    from src.risk_manager.contracts import decode
    root = Path(__file__).resolve().parents[2]
    manifest = decode((root / 'frontend-v2/public/replay-manifest.json').read_bytes())
    identity = manifest['routes']['/risk-manager/sweep']
    return decode((root / 'frontend-v2/public' / manifest['artifacts'][identity]['url'].lstrip('/')).read_bytes())


def test_receipt_transport_all_retained_roundtrips_and_isolates_references():
    from pathlib import Path
    from src.risk_manager.contracts import canonical, decode, hydrate_sweep, pack_sweep
    root = Path(__file__).resolve().parents[2]
    manifest = decode((root / 'frontend-v2/public/replay-manifest.json').read_bytes())
    for identity, entry in manifest['artifacts'].items():
        if entry['kind'] != 'risk-sweep':
            continue
        original = decode((root / 'frontend-v2/public' / entry['url'].lstrip('/')).read_bytes())
        wire = pack_sweep(original)
        restored = hydrate_sweep(wire)
        assert canonical(restored) == canonical(original)
        assert wire == pack_sweep(original)
    logical = transport_fixture()
    row = logical['payload']['observations'][0]
    row['evidence_refs'] = [deepcopy(row['evidence_refs'][0]), deepcopy(row['evidence_refs'][0])]
    wire = pack_sweep(logical)
    hydrated = hydrate_sweep(wire)
    assert canonical(hydrated) == canonical(logical)
    hydrated['payload']['observations'][0]['evidence_refs'][0]['type'] = 'tampered'
    assert hydrated['payload']['observations'][0]['evidence_refs'][1]['type'] != 'tampered'
    assert wire == pack_sweep(logical)


@pytest.mark.parametrize('index', [0, 1.0, True, None, '', '-0', '+0', '00', '01', '1.0', '1e0', ' 0', '0 ', '0\n', '0\r', '0\u2028', '0\u2029', '1000', '999'])
def test_receipt_transport_rejects_noncanonical_or_out_of_range_indices(index):
    from src.risk_manager.contracts import hydrate_sweep, pack_sweep
    wire = pack_sweep(transport_fixture())
    wire['payload']['observations'][0]['evidence_ref_indices'][0] = index
    with pytest.raises(ValueError):
        hydrate_sweep(wire)


@pytest.mark.parametrize('attack', ['duplicate', 'unused', 'order', 'legacy_field', 'row_version',
                                   'envelope_version', 'unknown', 'empty_table', 'too_many_refs',
                                   'too_many_rows', 'too_many_entries', 'nested_carrier'])
def test_receipt_transport_closed_bounds_and_table_canonicality(attack):
    from src.risk_manager.contracts import hydrate_sweep, pack_sweep
    wire = pack_sweep(transport_fixture())
    payload = wire['payload']; row = payload['observations'][0]; table = payload['evidence_ref_table']
    if attack == 'duplicate': table.append(deepcopy(table[0]))
    elif attack == 'unused':
        extra = deepcopy(table[0]); extra['selector_id'] = 'unreferenced'; table.append(extra)
    elif attack == 'order':
        table[0], table[1] = table[1], table[0]
        for o in payload['observations']:
            o['evidence_ref_indices'] = ['1' if x == '0' else '0' if x == '1' else x for x in o['evidence_ref_indices']]
    elif attack == 'legacy_field': row['evidence_refs'] = [table[0]]
    elif attack == 'row_version': row['schema_version'] = 'risk-observation/1'
    elif attack == 'envelope_version': wire['schema_version'] = 'risk-sweep/3'
    elif attack == 'unknown': payload['unreviewed'] = True
    elif attack == 'empty_table': table.clear()
    elif attack == 'too_many_refs': row['evidence_ref_indices'] = ['0'] * 31
    elif attack == 'too_many_rows': payload['observations'] = [row] * 1001
    elif attack == 'too_many_entries': payload['evidence_ref_table'] = [table[0]] * 1001
    elif attack == 'nested_carrier': table[0]['evidence_ref_indices'] = ['0']
    with pytest.raises(ValueError): hydrate_sweep(wire)
