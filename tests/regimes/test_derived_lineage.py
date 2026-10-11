"""Plugin outputs enter downstream computations only as bound, verified inputs."""

import pytest

from finsight.plugins import SeriesInput, SeriesModel, Signal, SignalType
from finsight.plugins.derived import admit_outputs, output_signals
from src.truth.contracts import canonical_hash
from tests.regimes.conftest import TENANT, admit, series_rows
from tests.regimes.test_series_runner import MeanSeries

CUTOFF = "2022-01-01T00:00:00Z"


class Consumer(SeriesModel):
    name = "test.consumer"
    series_inputs = (
        SeriesInput("mkt", unit="proportional_return", minimum=20),
        SeriesInput("running_mean", minimum=20),
    )
    outputs = (SignalType("last_mean"),)
    calls = 0

    def compute(self, windows, context):
        type(self).calls += 1
        frame = windows["running_mean"]
        return {
            "status": "COMPUTED",
            "state_at": frame.observed_at.iloc[-1].isoformat(),
            "current": {"last_mean": float(frame.value.iloc[-1])},
        }


def produce(store, registry, runner, config=None, as_of=CUTOFF):
    run = runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of=as_of, config=config)
    admit_outputs(store, TENANT, run)
    return run


def test_derived_signals_are_bound_to_the_sealed_producer(series_platform, returns):
    store, registry, runner = series_platform
    admit(store, series_rows(returns))
    producer = produce(store, registry, runner)
    signals, bindings = output_signals(TENANT, producer)
    assert {s.version for s in signals} == {producer["run_id"]}
    assert {str(s.available_at.isoformat()) for s in signals} == {"2022-01-01T00:00:00+00:00"}
    consumer = runner.compute(Consumer, tenant_id=TENANT, asset="US-MKT", as_of=CUTOFF)
    assert consumer["status"] == "COMPUTED"
    assert consumer["contract"]["lineage"]["producer_runs"] == [producer["run_id"]]
    assert consumer["holdout_openings"] == 0 and registry.opening_count(TENANT) == 0


def test_producer_change_changes_consumer_identity(series_platform, returns):
    store, registry, runner = series_platform
    admit(store, series_rows(returns))
    produce(store, registry, runner)
    first = runner.compute(Consumer, tenant_id=TENANT, asset="US-MKT", as_of=CUTOFF)
    later = "2022-01-01T00:00:01Z"
    produce(store, registry, runner, config={"scale": 2.0}, as_of=later)
    second = runner.compute(Consumer, tenant_id=TENANT, asset="US-MKT", as_of=later)
    assert first["run_id"] != second["run_id"]
    assert first["contract"]["lineage"]["producer_runs"] != second["contract"]["lineage"]["producer_runs"]


def test_derived_inputs_are_invisible_before_the_producer_cutoff(series_platform, returns):
    store, registry, runner = series_platform
    admit(store, series_rows(returns))
    produce(store, registry, runner, as_of="2022-06-01T00:00:00Z")
    early = runner.compute(Consumer, tenant_id=TENANT, asset="US-MKT", as_of=CUTOFF)
    assert early["status"] == "UNAVAILABLE"


def test_forged_derived_value_fails_closed(series_platform, returns):
    store, registry, runner = series_platform
    admit(store, series_rows(returns))
    producer = produce(store, registry, runner)
    signals, bindings = output_signals(TENANT, producer)
    forged = Signal(
        TENANT,
        "running_mean",
        "US-MKT",
        123.0,
        "2021-06-05T00:00:00Z",  # a Saturday: no producer output exists there
        CUTOFF,
        "plugin:test.mean",
        "ACTIVE",
        producer["run_id"],
    )
    binding = {
        **bindings[0],
        "signal_id": forged.identity,
        "signal_sha256": canonical_hash(forged.payload()),
    }
    store.append(TENANT, [forged], admissions=[binding])
    with pytest.raises(ValueError, match="differs from its sealed producer"):
        runner.compute(Consumer, tenant_id=TENANT, asset="US-MKT", as_of=CUTOFF)


def test_binding_without_source_or_producer_fails_closed(series_platform, returns):
    store, registry, runner = series_platform
    rows = series_rows(returns)
    bindings = [
        {
            "signal_id": r.identity,
            "signal_sha256": canonical_hash(r.payload()),
            "source_version_id": r.version,
        }
        for r in rows
    ]
    store.append(TENANT, rows, admissions=bindings)
    with pytest.raises(ValueError, match="neither a source nor a plugin output"):
        runner.compute(MeanSeries, tenant_id=TENANT, asset="US-MKT", as_of=CUTOFF)
