import ast
from hashlib import sha256
from pathlib import Path
from src.factors.contracts import canonical
from src.factors.evidence import policy
from src.factors.service import envelope
ROOT=Path(__file__).resolve().parents[2]

def test_metadata_paths_do_not_execute_or_fetch(monkeypatch):
    def forbidden(*args,**kwargs):raise AssertionError('Implicit execution or vendor traffic')
    from finsight.plugins.runner import Runner
    from finsight.plugins.series import SeriesRunner
    from src.regimes.service import Pipeline
    import requests
    monkeypatch.setattr(Runner,'run',forbidden)
    monkeypatch.setattr(SeriesRunner,'compute',forbidden)
    monkeypatch.setattr(Pipeline,'run_market',forbidden)
    monkeypatch.setattr(requests,'get',forbidden)
    for kind in ['catalog','audit','ledger','lineage']:
        envelope(ROOT,kind,'US',policy(ROOT)['cutoffs'][-1])

def test_unrelated_head_or_source_metadata_is_not_model_identity(monkeypatch):
    import subprocess
    import src.factors.evidence as evidence
    before=canonical(envelope(ROOT,'audit','US',policy(ROOT)['cutoffs'][-1]))
    original=subprocess.check_output
    def changed_head(args,**kwargs):
        if args[:3]==['git','rev-parse','HEAD']:return b'9'*40+b'\n'
        return original(args,**kwargs)
    monkeypatch.setattr(subprocess,'check_output',changed_head)
    # Data Organ source-only publication cannot enter the fixed Phase 5 bundle.
    original_read=Path.read_bytes
    def changed_source_pointer(path):
        if str(path).endswith('data/exports/data_organ_v0_1/receipt.json'):return b'{"as_of":"later"}'
        return original_read(path)
    monkeypatch.setattr(Path,'read_bytes',changed_source_pointer)
    assert canonical(envelope(ROOT,'audit','US',policy(ROOT)['cutoffs'][-1]))==before
    assert len({r['run_id'] for c in evidence.policy(ROOT)['bundles'].values() for b in c.values() for r in b['refs'].values()})==6

def test_factor_sources_have_no_model_or_capture_interfaces():
    for path in (ROOT/'src/factors').glob('*.py'):
        tree=ast.parse(path.read_bytes())
        for node in ast.walk(tree):
            if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute):
                assert node.func.attr not in ('fit','predict','compute','run_market','open_holdout','capture','collect')
