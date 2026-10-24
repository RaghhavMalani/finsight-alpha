from pathlib import Path
from copy import deepcopy
import shutil
import pytest
from src.risk_manager.evidence import EvidenceReaders,freeze_inventory,forbidden_calls
ROOT=Path(__file__).resolve().parents[2]

def test_retained_reader_and_freeze_have_no_scientific_calls():
    before=freeze_inventory(ROOT)
    with forbidden_calls(): e=EvidenceReaders(ROOT).read()
    assert len(e.inputs)==len(e.monitoring["inputs"]) and len(e.inputs)>30
    assert e.cutoff==e.manifest["artifacts"][e.manifest["routes"]["/data/issues"]]["as_of"]
    assert freeze_inventory(ROOT)==before
    assert e.values["research_flagship"]["holdout_openings"]==46
    assert e.values["research_repeat"]["holdout_openings_after_repeat"]==48

def test_forbidden_call_guard_instrumented():
    namespace={"__name__":"src.regimes.test_sabotage"}
    exec("def fit(): return 'must not run'",namespace)
    with pytest.raises(RuntimeError), forbidden_calls(): namespace["fit"]()

def test_map_path_and_country_substitution_rejected():
    e=EvidenceReaders(ROOT)
    e.map=deepcopy(e.map); e.map["files"]["research_flagship"]["path"]="../private"
    with pytest.raises(ValueError): e.file("research_flagship")
    e=EvidenceReaders(ROOT)
    e.map=deepcopy(e.map); e.map["artifacts"]["model_US"]["entry"]["sources"]=["iima:daily-factors"]
    with pytest.raises(ValueError): e.artifact("model_US")


@pytest.mark.parametrize("module", [
    "src.ml.models", "src.dynamics.hawkes_boundary", "src.regime_intelligence.collector",
    "src.factors.service", "finsight.plugins.model", "finsight.plugins.engines",
    "sklearn.linear_model._base", "statsmodels.regression.linear_model",
    "scipy.stats._distn_infrastructure", "torch.nn.modules.module",
])
def test_every_scientific_runtime_namespace_is_instrumented(module):
    namespace = {"__name__": module}
    exec("def fit(): raise AssertionError('Scientific fixture executed')", namespace)
    with pytest.raises(RuntimeError), forbidden_calls():
        namespace["fit"]()
