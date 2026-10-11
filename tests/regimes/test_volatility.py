"""Family E (descriptive volatility) and Module 1 -> 3 coupling through the SDK."""

import json
import shutil

import numpy as np
import pytest

from finsight.plugins.derived import admit_outputs
from src.regimes.plugins import RegimeHMM2, RegimeHMM4, VolatilityDiagnostics
from src.regimes.profile import run_context
from src.regimes.volatility import describe
from tests.regimes.conftest import TENANT, admit, series_rows
from tests.regimes.fixtures import garch_returns

SETTINGS = {"garch": {"minimum": 500}, "arch_lm": {"lags": 5, "minimum": 100}}


def frame_of(values):
    import pandas as pd

    return pd.DataFrame(
        {"observed_at": pd.bdate_range("2005-01-03", periods=len(values), tz="UTC"), "value": values}
    )


def test_constant_series_has_no_nan_and_no_invented_state():
    result = describe(frame_of(np.full(200, 0.001)), settings=SETTINGS)
    json.dumps(result, allow_nan=False)
    assert result["garch"]["status"] == "UNAVAILABLE"
    assert result["current"]["state"] in {"UNRESOLVED", "NORMAL"}


def test_shock_after_calm_is_a_vol_shock_and_realized_vol_is_per_observation():
    rng = np.random.default_rng(2)
    values = np.concatenate([rng.normal(0, 0.004, 300), [0.08]])
    result = describe(frame_of(values), settings=SETTINGS)
    assert result["current"]["state"] == "VOL_SHOCK"
    expected = np.sqrt(np.mean(values[-20:] ** 2))
    assert result["current"]["components"]["rv_20"] == pytest.approx(expected, rel=1e-8)


def test_garch_world_reports_clustering_diagnostics():
    values = garch_returns(1200, seed=33) / 100
    result = describe(frame_of(values), settings=SETTINGS)
    assert result["garch"]["fit_status"] == "CONVERGED"
    assert result["arch_lm"]["lm_pvalue"] < 0.01 and result["arch_lm"]["inference"] == "DIAGNOSTIC_ASYMPTOTIC"
    assert len(result["garch_conditional"]) == len(values)


@pytest.fixture
def market(series_platform):
    store, registry, runner = series_platform
    values = garch_returns(800, seed=44) / 100
    admit(store, series_rows(values, start="2010-01-04", available="2026-10-10T06:00:00Z"))
    return store, registry, runner


CUTOFF = "2026-10-11T00:00:00Z"


def chain(store, registry, runner, asset="US-MKT", cutoff=CUTOFF):
    context = run_context(asset)
    vol = runner.compute(VolatilityDiagnostics, tenant_id=TENANT, asset=asset, as_of=cutoff, context=context)
    admit_outputs(store, TENANT, vol)
    two = runner.compute(RegimeHMM2, tenant_id=TENANT, asset=asset, as_of=cutoff, context=context)
    four = runner.compute(RegimeHMM4, tenant_id=TENANT, asset=asset, as_of=cutoff, context=context)
    return vol, two, four


def test_volatility_feeds_hmm_only_through_declared_bound_inputs(market):
    store, registry, runner = market
    vol, two, four = chain(store, registry, runner)
    assert vol["status"] in {"COMPUTED", "PARTIAL"} and two["status"] == four["status"] == "COMPUTED"
    assert two["contract"]["lineage"]["producer_runs"] == [vol["run_id"]]
    assert four["contract"]["lineage"]["producer_runs"] == []
    assert two["current"]["hmm_state"].startswith("VOL_RANK_")
    assert registry.opening_count(TENANT) == 0
    json.dumps([vol, two, four], allow_nan=False)


def test_future_rows_leave_historical_hmm_identical(market):
    store, registry, runner = market
    _, two, _ = chain(store, registry, runner)
    later = garch_returns(60, seed=45) / 100
    admit(store, series_rows(later, start="2013-01-01", available="2026-12-01T00:00:00Z", version="capture-2"))
    _, again, _ = chain(store, registry, runner)
    assert again == two


def test_changed_volatility_implementation_changes_hmm_identity(market):
    store, registry, runner = market
    _, two, _ = chain(store, registry, runner)

    class VolatilityV2(VolatilityDiagnostics):
        version = "2"

        def compute(self, windows, context):
            return super().compute(windows, context)

    context = run_context("US-MKT")
    later = "2026-10-12T00:00:00Z"
    vol2 = runner.compute(VolatilityV2, tenant_id=TENANT, asset="US-MKT", as_of=later, context=context)
    admit_outputs(store, TENANT, vol2)
    changed = runner.compute(RegimeHMM2, tenant_id=TENANT, asset="US-MKT", as_of=later, context=context)
    assert changed["contract"]["lineage"]["producer_runs"] == [vol2["run_id"]]
    assert changed["run_id"] != two["run_id"]


def test_unrelated_data_organ_or_ui_change_keeps_plugin_identity(tmp_path, monkeypatch):
    import finsight.plugins.dependencies as module
    from finsight.plugins.dependencies import manifest
    from tests.regimes.conftest import ROOT

    for plugin in (VolatilityDiagnostics, RegimeHMM2, RegimeHMM4):
        original = manifest(plugin, ROOT)
        for name in original["sources"]:
            source = ROOT / name.split("#")[0]
            target = tmp_path / source.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        monkeypatch.setattr(module.inspect, "getfile", lambda _: str(tmp_path / "src/regimes/plugins.py"))
        before = manifest(plugin, tmp_path)
        for unrelated in ("src/data_organ/service.py", "frontend-v2/src/regimes/RegimeIntelligence.tsx", "src/regimes/publication.py"):
            path = tmp_path / unrelated
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("changed = True\n")
        assert manifest(plugin, tmp_path) == before
        assert not any(k.startswith(("src/data_organ", "frontend-v2", "backend")) for k in before["sources"])
        monkeypatch.undo()


def test_calendar_evidence_change_changes_identity(market):
    store, registry, runner = market
    base = run_context("US-MKT", {"unit": "session", "identity": "a" * 64})
    other = run_context("US-MKT", {"unit": "session", "identity": "b" * 64})
    first = runner.compute(VolatilityDiagnostics, tenant_id=TENANT, asset="US-MKT", as_of=CUTOFF, context=base)
    second = runner.compute(VolatilityDiagnostics, tenant_id=TENANT, asset="US-MKT", as_of=CUTOFF, context=other)
    assert first["run_id"] != second["run_id"]


def test_india_context_is_observation_semantics_without_annualisation():
    context = run_context("IN-MKT")
    assert context["observation_unit"] == "observation" and context["annualization"] == 1
    assert "CALENDAR_UNAVAILABLE" in context["badges"]
    assert context["label"] == "INDIA MARKET-FACTOR REGIME"
