import json
from pathlib import Path
import pytest
from src.factors.inventory import declarations, verify_inventory

ROOT = Path(__file__).resolve().parents[2]

def test_all_registered_channels_are_audited():
    value = verify_inventory(ROOT)
    assert len(value['declarations']['definitions']) == 20
    assert sum(x['output_channel']=='current' for x in value['audit']) == 55
    assert sum(x['output_channel']=='derived' for x in value['audit']) == 9
    eligible = [x for x in value['audit'] if x['eligibility_status']=='ELIGIBLE_RETAINED']
    assert {x['output'] for x in eligible} == {'market_beta','r_squared','intercept','neutrality'}
    assert {x['plugin_id'] for x in eligible} == {'regimes.factors'}

def test_unresolved_registration_cannot_execute(tmp_path):
    from src.factors.inventory import DECLARATIONS
    for p in DECLARATIONS:
        target = tmp_path / p; target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes((ROOT/p).read_bytes())
    with (tmp_path/DECLARATIONS[0]).open('a') as out:
        out.write('\nENGINES = __import__("never_execute_me").register()\n')
    with pytest.raises(ValueError,match='Unresolved registration'):
        declarations(tmp_path)

def test_omitting_a_channel_fails(tmp_path):
    from src.factors.inventory import DECLARATIONS
    for p in DECLARATIONS:
        target = tmp_path/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((ROOT/p).read_bytes())
    p=tmp_path/'eval/factors/v0.1/output-inventory.json';p.parent.mkdir(parents=True)
    v=json.loads((ROOT/'eval/factors/v0.1/output-inventory.json').read_bytes());v['audit'].pop()
    p.write_text(json.dumps(v))
    with pytest.raises(ValueError,match='Every channel'):
        verify_inventory(tmp_path)


@pytest.mark.parametrize('declaration',['ENGINES = __import__("never_execute").register()','class NewModel(SeriesModel): pass'])
def test_new_registration_site_cannot_hide(tmp_path,declaration):
    from src.factors.inventory import DECLARATIONS
    for name in DECLARATIONS:
        target=tmp_path/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((ROOT/name).read_bytes())
    target=tmp_path/'eval/factors/v0.1/output-inventory.json';target.parent.mkdir(parents=True);target.write_bytes((ROOT/'eval/factors/v0.1/output-inventory.json').read_bytes())
    (tmp_path/'src/new_engine.py').write_text(declaration)
    with pytest.raises(ValueError,match='Unreviewed'):verify_inventory(tmp_path)
