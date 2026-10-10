"""Series computations: no target, no split, no holdout; identity and reuse."""

import pandas as pd
import pytest

from finsight.plugins import SeriesInput, SeriesModel, SignalType
from finsight.plugins.series import SeriesUnavailable
from tests.regimes.conftest import TENANT, admit, series_rows


class MeanSeries(SeriesModel):
    name = "test.mean"
    series_inputs = (SeriesInput("mkt", unit="proportional_return", minimum=20),)
    outputs = (SignalType("mean_return"),)
    derived_outputs = (SignalType("running_mean"),)
    config_keys = frozenset({"scale"})
    calls = 0

    def compute(self, windows, context):
        type(self).calls += 1
        frame = windows["mkt"]
        scale = self.config.get("scale", 1.0)
        running = frame.value.expanding().mean() * scale
        return {
            "status": "COMPUTED",
            "state_at": frame.observed_at.iloc[-1].isoformat(),
            "current": {"mean_return": float(running.iloc[-1])},
            "paths": {"n": len(frame)},
            "derived": {
                "running_mean": [
                    [t.isoformat(), float(v)] for t, v in zip(frame.observed_at, running)
                ]
            },
        }


def test_series_run_seals_without_target_split_or_holdout(series_platform, returns):
    store, registry, runner = series_platform
    admit(store, series_rows(returns))
    run = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2022-01-01T00:00:00Z")
    assert run["status"] == "COMPUTED" and run["holdout_openings"] == 0
    assert run["contract"]["schema_version"] == "plugin-series-computation/1"
    assert "splits" not in run["contract"] and "target_hash" not in run["contract"]
    events = [e["event"] for e in registry.events(TENANT)]
    assert "HOLDOUT_OPENED" not in events and registry.opening_count(TENANT) == 0
    assert {"RUN_BOUND", "COMPUTATION_STARTED", "RUN_SEALED", "ATTEMPT_COMPLETED"} <= set(events)
    assert all(v is False for v in run["claims"].values())


def test_identical_request_reuses_sealed_result_without_recompute(series_platform, returns):
    store, registry, runner = series_platform
    admit(store, series_rows(returns))
    MeanSeries.calls = 0
    first = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2022-01-01T00:00:00Z")
    second = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2022-01-01T00:00:00Z")
    assert first == second and MeanSeries.calls == 1
    assert [e["event"] for e in registry.events(TENANT)].count("RESULT_REUSED") == 1


def test_future_append_leaves_old_cutoff_identical(series_platform, returns):
    store, registry, runner = series_platform
    rows = series_rows(returns)
    admit(store, rows[:300])
    cutoff = rows[299].observed_at.isoformat()
    MeanSeries.calls = 0
    before = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of=cutoff)
    admit(store, rows[300:], source_version="later")
    after = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of=cutoff)
    assert before == after and MeanSeries.calls == 1


def test_capture_only_history_is_invisible_before_its_capture_clock(series_platform, returns):
    store, registry, runner = series_platform
    admit(store, series_rows(returns, available="2026-10-10T06:00:00Z"))
    early = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2025-01-01T00:00:00Z")
    assert early["status"] == "UNAVAILABLE" and "Insufficient visible" in early["reason"]
    late = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2026-10-11T00:00:00Z")
    assert late["status"] == "COMPUTED"
    assert registry.opening_count(TENANT) == 0


def test_unmapped_inputs_fail_closed(series_platform, returns):
    store, registry, runner = series_platform
    store.append(TENANT, series_rows(returns))
    with pytest.raises(ValueError, match="LEGACY_UNMAPPED"):
        runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2022-01-01T00:00:00Z")


def test_config_changes_identity_and_unknown_config_is_rejected(series_platform, returns):
    store, registry, runner = series_platform
    admit(store, series_rows(returns))
    a = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2022-01-01T00:00:00Z")
    b = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2022-01-01T00:00:00Z", config={"scale": 2.0})
    assert a["run_id"] != b["run_id"]
    with pytest.raises(ValueError, match="Unknown configuration"):
        runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2022-01-01T00:00:00Z", config={"lookahead": 1})


def test_target_named_input_is_rejected():
    class Leaky(MeanSeries):
        name = "test.leaky"
        series_inputs = (SeriesInput("target_return"),)

    with pytest.raises(ValueError, match="Targets"):
        Leaky.declarations()


def test_row_runner_holdout_is_never_called(series_platform, returns, monkeypatch):
    from finsight.plugins import Runner, RunRegistry

    def forbidden(*args, **kwargs):
        pytest.fail("Series path must not touch the row runner or holdout accounting")

    monkeypatch.setattr(Runner, "run", forbidden)
    monkeypatch.setattr(RunRegistry, "holdout", forbidden)
    store, registry, runner = series_platform
    admit(store, series_rows(returns))
    runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2022-01-01T00:00:00Z")


def test_execution_head_is_outside_identity(series_platform, returns, monkeypatch):
    import finsight.plugins.dependencies as module

    store, registry, runner = series_platform
    admit(store, series_rows(returns))
    first = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2022-01-01T00:00:00Z")
    original = module.execution_provenance
    monkeypatch.setattr(
        module,
        "execution_provenance",
        lambda root, code: {**original(root, code), "commit": "f" * 40},
    )
    second = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of="2022-01-01T00:00:00Z")
    assert first["run_id"] == second["run_id"]
    bound = [e for e in registry.events(TENANT) if e["event"] == "RUN_BOUND"]
    assert bound[-1]["payload"]["execution"]["commit"] == "f" * 40


def test_series_kernel_is_bound_without_changing_row_manifests():
    from finsight.plugins.dependencies import manifest
    from tests.plugins.test_platform import MeanModel, ROOT

    series = manifest(MeanSeries, ROOT)["sources"]
    assert any(k.startswith("finsight/plugins/series.py") for k in series)
    assert any(k.startswith("finsight/plugins/derived.py") for k in series)
    row = manifest(MeanModel, ROOT)["sources"]
    assert not any(k.startswith("finsight/plugins/series.py") for k in row)
