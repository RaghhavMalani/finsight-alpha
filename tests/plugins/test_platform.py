"""PIT metamorphic and sabotage contracts for the public Plugin SDK."""

from datetime import timedelta
from pathlib import Path
import json
import sqlite3
import numpy as np
import pandas as pd
import pytest
from finsight.plugins import (
    Model,
    Signal,
    SignalType,
    SignalStore,
    RunRegistry,
    Runner,
    InferenceCapability,
)
from finsight.plugins.contracts import validate_inputs, validate_outputs
from src.data.as_of import AsOfViolation

ROOT = Path(__file__).resolve().parents[2]


class MeanModel(Model):
    inputs = ["market_return", "volatility"]
    outputs = ["momentum_signal"]

    def fit(self, train):
        self.mean = float(train.target.mean()) + float(self.config.get("offset", 0))

    def predict(self, rows):
        return pd.DataFrame({"momentum_signal": self.mean}, index=rows.index)


def inputs(count=120, tenant="a", asset="SPY"):
    clocks = pd.date_range("2020-01-01", periods=count, freq="D", tz="UTC")
    rows = []
    for i, clock in enumerate(clocks):
        for name, value in (
            ("market_return", float(np.sin(i / 7) * 0.01)),
            ("volatility", 0.02),
        ):
            rows.append(
                Signal(
                    tenant,
                    name,
                    asset,
                    value,
                    clock.to_pydatetime(),
                    clock.to_pydatetime(),
                    "project:unit-fixture",
                    "FIRST_PARTY",
                    "v1",
                )
            )
    return clocks, rows


@pytest.fixture
def platform(tmp_path):
    store = SignalStore(tmp_path / "store")
    registry = RunRegistry(tmp_path / "registry.sqlite")
    clocks, signals = inputs()
    store.append("a", signals)
    runner = Runner(store, registry, root=ROOT)
    kwargs = dict(
        tenant_id="a",
        asset="SPY",
        decisions=clocks.to_list(),
        as_of=clocks[-1] + timedelta(days=2),
        targets=(np.cos(np.arange(len(clocks)) / 7) * 0.01).tolist(),
        target_information_at=(clocks + timedelta(days=1)).to_list(),
    )
    return store, registry, runner, kwargs


def test_store_real_parquet_and_idempotent_append(tmp_path):
    store = SignalStore(tmp_path)
    clocks, rows = inputs(8)
    assert store.append("a", rows) == 16
    assert store.append("a", rows) == 0
    assert list(tmp_path.glob("parquet/*/*.parquet"))
    assert len(store.history("a", as_of=clocks[-1])) == 16


def test_computation_adapter_uses_boundaries_without_inventing_labels(platform):
    from finsight.plugins.engines import MonteCarloVaR

    _, registry, runner, kwargs = platform
    kwargs.pop("targets")
    kwargs.pop("target_information_at")
    result = runner.run(MonteCarloVaR, **kwargs, candidates=[{"simulations": 128}])
    assert result["metrics"]["status"] == "UNAVAILABLE"
    assert result["contract"]["target_hash"] is None
    assert result["honesty"]["planted_effect"]["status"] == "UNAVAILABLE"
    assert registry.opening_count("a") == 1
    assert not result["claims"]["inference_certified"]


@pytest.mark.parametrize("mutation", ["value", "type", "unit"])
def test_existing_signal_identity_and_schema_are_immutable(tmp_path, mutation):
    store = SignalStore(tmp_path)
    clock = pd.Timestamp("2020-01-01", tz="UTC").to_pydatetime()
    row = Signal(
        "a",
        "market_return",
        "SPY",
        0.1,
        clock,
        clock,
        "project:fixture",
        "FIRST_PARTY",
        "1",
    )
    store.append("a", [row])
    data = row.payload()
    if mutation == "value":
        data["value"] = 0.2
    elif mutation == "type":
        data.update(kind="int", value=1, version="2")
    else:
        data.update(unit="percent", version="2")
    with pytest.raises((ValueError, TypeError)):
        store.append("a", [Signal(**data)])
    assert store.read("a", "market_return", "SPY", as_of=clock).value == 0.1


def test_future_append_and_late_revision_invariance(platform):
    store, registry, runner, kwargs = platform
    specs = MeanModel.declarations()[0]
    before, _ = store.frame(
        "a", "SPY", specs, kwargs["decisions"], as_of=kwargs["as_of"]
    )
    old = store.read("a", "market_return", "SPY", as_of=kwargs["decisions"][30])
    revised = Signal(
        **{
            **old.payload(),
            "value": 9.0,
            "version": "v2",
            "available_at": kwargs["as_of"] + timedelta(days=1),
        }
    )
    future = Signal(
        **{
            **old.payload(),
            "value": 8.0,
            "version": "v3",
            "observed_at": kwargs["as_of"] + timedelta(days=3),
            "available_at": kwargs["as_of"] + timedelta(days=3),
        }
    )
    store.append("a", [revised, future])
    after, _ = store.frame(
        "a",
        "SPY",
        specs,
        kwargs["decisions"],
        as_of=kwargs["as_of"] + timedelta(days=10),
    )
    pd.testing.assert_frame_equal(before, after)


def test_revision_predecessor_respects_both_clocks(tmp_path):
    store = SignalStore(tmp_path)
    clock = pd.Timestamp("2020-01-01", tz="UTC").to_pydatetime()
    row = Signal(
        "a",
        "market_return",
        "SPY",
        0.1,
        clock,
        clock + timedelta(days=1),
        "project:fixture",
        "FIRST_PARTY",
        "1",
    )
    revision = Signal(
        **{
            **row.payload(),
            "value": 0.2,
            "available_at": clock + timedelta(days=4),
            "version": "2",
        }
    )
    store.append("a", [row, revision])
    assert store.read("a", "market_return", "SPY", as_of=clock) is None
    assert (
        store.read("a", "market_return", "SPY", as_of=clock + timedelta(days=3)).value
        == 0.1
    )
    assert (
        store.read("a", "market_return", "SPY", as_of=clock + timedelta(days=5)).value
        == 0.2
    )


def test_tenant_isolation_for_store_registry_and_attempts(platform):
    store, registry, runner, kwargs = platform
    assert store.history("b", as_of=kwargs["as_of"]) == []
    result = runner.run(MeanModel, **kwargs)
    assert registry.read("b", result["run_id"]) is None
    assert registry.events("b") == [] and registry.opening_count("b") == 0
    with pytest.raises(PermissionError):
        store.append("b", inputs(4)[1])


def test_asset_rename_preserves_numeric_predictions(tmp_path):
    clocks, rows = inputs()
    store = SignalStore(tmp_path / "store")
    store.append("a", rows)
    renamed = [Signal(**{**r.payload(), "asset": "RENAMED"}) for r in rows]
    store.append("a", renamed)
    specs = MeanModel.declarations()[0]
    original, _ = store.frame("a", "SPY", specs, clocks.to_list(), as_of=clocks[-1])
    other, _ = store.frame("a", "RENAMED", specs, clocks.to_list(), as_of=clocks[-1])
    pd.testing.assert_frame_equal(original, other)
    model = MeanModel()
    train = original.copy()
    train["target"] = np.arange(len(train))
    model.fit(train)
    pd.testing.assert_frame_equal(model.predict(original), model.predict(other))


@pytest.mark.parametrize(
    "kind,value",
    [
        ("float", True),
        ("float", float("nan")),
        ("float", float("inf")),
        ("int", 0.1),
        ("bool", 1),
        ("category", ""),
    ],
)
def test_scalar_type_enforcement(kind, value):
    with pytest.raises(TypeError):
        SignalType("signal", kind).validate(value)


def test_future_feature_and_target_leakage_accounted(platform):
    store, registry, runner, kwargs = platform
    with pytest.raises(AsOfViolation):
        runner.run(
            MeanModel,
            **{
                **kwargs,
                "target_information_at": [kwargs["as_of"] + timedelta(days=3)] * 120,
            },
        )
    assert registry.events("a")[-1]["event"] == "ATTEMPT_FAILED"
    assert registry.opening_count("a") == 0
    clocks, rows = inputs(3)
    frame = pd.DataFrame(
        {
            "market_return": [0.0] * 3,
            "volatility": [0.1] * 3,
            "decision_at": clocks,
            "information_at": clocks + timedelta(days=1),
        }
    )
    with pytest.raises(AsOfViolation):
        validate_inputs(frame, MeanModel.declarations()[0])

    class Leaky(MeanModel):
        inputs = ["target"]

    with pytest.raises(ValueError):
        runner.run(Leaky, **kwargs)
    assert registry.events("a")[-1]["event"] == "ATTEMPT_FAILED"


def test_nested_boundaries_deterministic_identity_and_single_holdout(platform):
    store, registry, runner, kwargs = platform
    first = runner.run(MeanModel, **kwargs, candidates=[{"offset": 0}, {"offset": 1}])
    second = runner.run(MeanModel, **kwargs, candidates=[{"offset": 0}, {"offset": 1}])
    assert first == second and first["status"] == "COMPUTED"
    assert first["arena"]["selected"]["candidate"] == 0
    assert registry.opening_count("a") == 1
    events = registry.events("a")
    assert sum(e["event"] == "CANDIDATE_STARTED" for e in events) == 2
    assert events[-1]["event"] == "RESULT_REUSED"
    assert all(v is False for v in first["claims"].values())
    splits = first["contract"]["splits"]
    assert splits["fit_information_end"] < splits["validation_start"]
    assert splits["development_information_end"] < splits["holdout_start"]
    assert first["honesty"]["leakage_sabotage"]["status"] == "REJECTED_AS_REQUIRED"
    assert first["honesty"]["null_world"]["worlds"] == 1
    assert first["honesty"]["null_world"]["type_i_error_estimated"] is False


def test_failed_prediction_preserves_holdout_opening(platform):
    store, registry, runner, kwargs = platform

    class Failure(MeanModel):
        def fit(self, train):
            self.final = len(train) > 80

        def predict(self, rows):
            if self.final:
                raise RuntimeError("intentional held-out prediction failure")
            return pd.DataFrame({"momentum_signal": 0.0}, index=rows.index)

    with pytest.raises(RuntimeError):
        runner.run(Failure, **kwargs)
    assert registry.opening_count("a") == 1
    assert registry.events("a")[-1]["payload"]["holdout_opened"] is True
    result = runner.run(Failure, **kwargs)
    assert result["status"] == "UNAVAILABLE" and registry.opening_count("a") == 1


def test_changed_configuration_keeps_all_attempts_and_openings(platform):
    store, registry, runner, kwargs = platform
    a = runner.run(MeanModel, **kwargs)
    b = runner.run(MeanModel, **kwargs, candidates=[{"offset": 0.1}])
    assert a["run_id"] != b["run_id"] and registry.opening_count("a") == 2
    assert any(i["kind"] == "REPEATED_HOLDOUT_OPENING" for i in b["issues"])


def test_immutable_run_and_attempt_substitution_rejected(platform):
    store, registry, runner, kwargs = platform
    result = runner.run(MeanModel, **kwargs)
    with pytest.raises(ValueError):
        registry.seal("a", result["run_id"], {**result, "status": "CERTIFIED"})
    with sqlite3.connect(registry.path) as db:
        db.execute("UPDATE events SET event='FAKE' WHERE sequence=0 AND tenant='a'")
    with pytest.raises(ValueError):
        registry.events("a")


def test_output_row_and_type_sabotage(platform):
    store, registry, runner, kwargs = platform

    class Wrong(MeanModel):
        def predict(self, rows):
            return pd.DataFrame(
                {"momentum_signal": [True] * len(rows)}, index=rows.index
            )

    with pytest.raises(TypeError):
        runner.run(Wrong, **kwargs)
    assert registry.opening_count("a") == 0
    assert registry.events("a")[-1]["event"] == "ATTEMPT_FAILED"


def test_reopen_rejection_is_itself_accounted(platform):
    store, registry, runner, kwargs = platform
    result = runner.run(MeanModel, **kwargs)
    attempt = registry.begin("a", {"fixture": "reopen"})
    with pytest.raises(PermissionError):
        registry.holdout("a", result["run_id"], "fixture", attempt)
    assert registry.events("a")[-1]["event"] == "HOLDOUT_REOPEN_REJECTED"


def test_no_retroactive_certificate_for_descriptive_settings():
    capability = InferenceCapability(
        method="NULL_MBB_T",
        confirmation_status="NOT_CONFIRMED",
        descriptive_only_settings=("mean_iid_n480", "reg_xhetero_n480"),
    )
    assert not capability.inference_certified and not capability.supported_domains
    with pytest.raises(ValueError):
        InferenceCapability(inference_certified=True)


def test_price_scaling_and_future_append_invariance_for_return_signals():
    from finsight.plugins.signals import return_signals

    clocks = pd.date_range("2020-01-01", periods=40, tz="UTC")
    frame = pd.DataFrame(
        {
            "Date": clocks,
            "available_at": clocks + timedelta(minutes=10),
            "Close": 100 * np.exp(np.arange(40) * 0.001),
        }
    )
    kwargs = dict(
        tenant_id="a",
        asset="SPY",
        source="project:unit-fixture",
        licence="FIRST_PARTY",
        version="1",
    )
    original = return_signals(frame, **kwargs)
    scaled = return_signals(frame.assign(Close=frame.Close * 137), **kwargs)
    np.testing.assert_allclose(
        [r.value for r in original], [r.value for r in scaled], atol=1e-15, rtol=0
    )
    prefix = return_signals(frame.iloc[:20], **kwargs)
    assert prefix == original[:19]


def test_historical_guard_rejects_changed_confirmation_identity():
    from scripts.research_archive import historical_guard, verify_closed_history

    folder = ROOT / "data/exports/research_os_v0_1_1"
    original = json.loads((folder / "discovery.json").read_bytes())["execution"]
    confirmation = json.loads((folder / "confirmation.json").read_bytes())["execution"]
    assert verify_closed_history(ROOT)
    with pytest.raises(ValueError):
        historical_guard(ROOT, original, {**confirmation, "code_commit": "HEAD"})
