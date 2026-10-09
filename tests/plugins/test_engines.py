"""Real adapter calls and future-row sabotage; scientific implementations stay intact."""

import json
import numpy as np
import pandas as pd
import pytest
from finsight.plugins import PluginCatalog, SignalType
from finsight.plugins.engines import (
    ENGINES,
    HMM,
    GBMSuite,
    MLP,
    VolatilityClustering,
    MonteCarloVaR,
    Hawkes,
    RegimeD042,
)
from finsight.plugins.contracts import validate_outputs
from src.dynamics.market_regime_fixture import demo_world


def rows(n=120):
    rng = np.random.default_rng(1701)
    clock = pd.date_range("2024-01-01", periods=n, tz="UTC")
    return pd.DataFrame(
        {
            "market_return": rng.normal(0, 0.01, n),
            "volatility": rng.uniform(0.01, 0.03, n),
            "decision_at": clock,
            "information_at": clock,
        }
    )


@pytest.mark.parametrize(
    "engine,config",
    [
        (HMM, {"n_states": 2}),
        (GBMSuite, {"model_name": "gradient_boosting"}),
        (MLP, {"epochs": 5, "hidden": [4]}),
        (VolatilityClustering, {}),
        (MonteCarloVaR, {"simulations": 128}),
    ],
)
def test_real_engine_outputs_and_future_append_invariance(engine, config):
    frame = rows()
    model = engine(seed=7, **config)
    train = frame.iloc[:90].copy()
    if engine.task == "classification":
        train["target"] = (train.market_return > 0).astype(float)
    model.fit(train)
    short = frame.iloc[90:100][[*engine.inputs, "decision_at", "information_at"]].copy()
    long = frame.iloc[90:][[*engine.inputs, "decision_at", "information_at"]].copy()
    before = validate_outputs(model.predict(short), short, engine.declarations()[1])
    long.loc[long.index[-1], "market_return"] = 1000.0
    after = validate_outputs(model.predict(long), long, engine.declarations()[1]).loc[
        short.index
    ]
    pd.testing.assert_frame_equal(before, after)
    assert model.trace()["engine"]


def event_payload(end="2024-04-01T00:00:00Z"):
    return json.dumps(
        {
            "start_at": "2024-01-01T00:00:00Z",
            "end_at": end,
            "events": pd.date_range("2024-01-02", periods=50, freq="36h", tz="UTC")
            .astype(str)
            .tolist(),
        }
    )


def test_hawkes_preserved_fit_and_nested_clock_sabotage():
    frame = pd.DataFrame(
        {
            "event_history": [event_payload()],
            "information_at": pd.to_datetime(["2024-04-02T00:00:00Z"]),
            "decision_at": pd.to_datetime(["2024-04-02T00:00:00Z"]),
        }
    )
    model = Hawkes()
    model.fit(frame)
    assert np.isfinite(model.predict(frame).iloc[0, 0])
    future = frame.copy()
    future.event_history = event_payload("2025-01-01T00:00:00Z")
    with pytest.raises(ValueError, match="cutoff"):
        model.predict(future)


def test_d042_preserved_compile_partial_coverage_and_nested_clock_sabotage():
    world = demo_world(sparse=True, sessions=5)
    last = max(b.available_at for b in world.daily)
    frame = pd.DataFrame(
        {
            "regime_world": [json.dumps(world.payload())],
            "decision_at": [last],
            "information_at": [last],
        }
    )
    model = RegimeD042()
    model.fit(frame)
    output = model.predict(frame)
    assert output.iloc[0].to_dict() == {
        "regime": "UNRESOLVED",
        "vector_complete": False,
    }
    assert model.trace()["states"][0]["fracture"]["score"] is None
    future = frame.copy()
    future.information_at = world.daily[0].available_at
    with pytest.raises(ValueError, match="cutoff"):
        model.fit(future)


def test_catalog_requires_declared_plugins_and_has_no_fallback():
    catalog = PluginCatalog()
    assert set(ENGINES) == {
        "hmm",
        "gbm-suite",
        "mlp",
        "hawkes",
        "volatility-clustering",
        "monte-carlo-var",
        "d0.4.2",
    }
    for name, engine in ENGINES.items():
        assert catalog.resolve(name) is engine
        assert not engine.capability.inference_certified
    with pytest.raises(ValueError):
        catalog.resolve("imaginary")
    with pytest.raises(TypeError):
        catalog.register("bad", object)


def test_structured_signal_is_immutable_canonical_json_and_rejects_nonfinite():
    spec = SignalType("event_history", "json")
    assert spec.validate('{"b":2, "a":1}') == '{"a":1,"b":2}'
    for raw in ('{"a":NaN}', "[1,2]", "null"):
        with pytest.raises((ValueError, TypeError)):
            spec.validate(raw)
