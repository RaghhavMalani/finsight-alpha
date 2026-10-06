"""Neural trace contracts on simulated fixtures; exported scenes use real installed inputs."""
from datetime import datetime, timedelta, timezone
import json
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException

from src.geo import usgs
from src.ml import neural
from src.ml.neural import MLP, Architecture, train
from src.ml.point_in_time_modeling import build_signal_splits
from src.observatory import traces
from src.observatory.evidence import FAMILIES, selection_verdict
from src.observatory.inputs import pit_prices
from src.observatory.neural import (GEO_FAMILY, NEURAL_FAMILIES, neural_family, neural_trace,
                                    parse_families, validation_status)
from src.regime_intelligence.contracts import Observation, PITDataset


@pytest.fixture(scope="module")
def evidence():
    rng = np.random.default_rng(13)
    closes = 100 * np.exp(np.cumsum(rng.normal(.0002, .012, 650)))
    start = datetime(2022, 1, 1, tzinfo=timezone.utc)
    rows = []
    for i, close in enumerate(closes):
        observed = start + timedelta(days=i)
        rows.append(Observation(stream="daily", observed_at=observed,
            available_at=observed + timedelta(minutes=15), as_of=start + timedelta(days=700),
            source="ALPACA_IEX", revision="test", quality="CONSERVATIVE_MARKET_TIME",
            publication_evidence=json.dumps({"snapshot_id": "a" * 64}),
            values=dict(open=close*.999, high=close*1.01, low=close*.99, close=close,
                        volume=int(rng.integers(10000, 20000)))))
    return PITDataset(asset="SPY", price_basis="UNADJUSTED", bucket_minutes=1,
        calendar_note="Simulated contract fixture", definitions={}, observations=rows)


def cutoff(data):
    return data.observations[619].available_at.isoformat()


SMALL = {"hidden": [6, 4], "epochs": 8, "batch_size": 32}


@pytest.fixture(scope="module")
def catalog():
    rng = np.random.default_rng(5)
    start = datetime(2021, 11, 1, tzinfo=timezone.utc)
    events = []
    for i in range(900):
        lat, lon = (35.6, 139.7) if i % 9 == 0 else (rng.uniform(-60, 60), rng.uniform(-180, 180))
        events.append({"type": "Feature", "id": f"us{i:05d}",
                       "properties": {"mag": float(np.round(rng.uniform(4.5, 7.2), 1)),
                                      "time": int((start + timedelta(hours=19 * i)).timestamp() * 1000)},
                       "geometry": {"coordinates": [lon, lat, 10.0]}})
    payload = usgs.build_catalog_payload(events, query="fixture", min_magnitude=4.5,
                                         retrieved_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    return usgs.parse_catalog(json.dumps(payload).encode())


@pytest.mark.parametrize("activation", neural.ACTIVATIONS)
def test_backprop_matches_numerical_gradient(activation):
    rng = np.random.default_rng(3)
    x, y = rng.normal(size=(12, 5)), rng.integers(0, 2, 12).astype(float)
    model = MLP(Architecture(hidden=(4, 3), activation=activation, dropout=0.0), 5)
    p, cache = model.forward(x)
    grads_w, grads_b, grad_x = model.backward(cache, (p - y) / len(y))

    def loss():
        q, _ = model.forward(x)
        q = np.clip(q, 1e-12, 1 - 1e-12)
        return -np.mean(y * np.log(q) + (1 - y) * np.log(1 - q))

    eps = 1e-6
    for params, grads in ((model.weights, grads_w), (model.biases, grads_b)):
        for w, g in zip(params, grads):
            for index in [(0,) * w.ndim, tuple(s - 1 for s in w.shape)]:
                old = w[index]
                w[index] = old + eps
                up = loss()
                w[index] = old - eps
                down = loss()
                w[index] = old
                assert abs((up - down) / (2 * eps) - g[index]) < 1e-6
    # Input gradients: ∂(mean BCE)/∂x for one cell.
    old = x[2, 1]
    x[2, 1] = old + eps
    up = loss()
    x[2, 1] = old - eps
    down = loss()
    x[2, 1] = old
    assert abs((up - down) / (2 * eps) - grad_x[2, 1]) < 1e-6


def test_architecture_bounds_fail_loudly():
    assert Architecture.parse(None) == Architecture()
    assert Architecture.parse({"hidden": [8]}).hidden == (8,)
    for bad in ({"hidden": []}, {"hidden": [8] * 5}, {"hidden": [65]}, {"hidden": [True]},
                {"activation": "softmax"}, {"epochs": 4}, {"epochs": 60.5}, {"dropout": 0.9},
                {"learning_rate": True}, {"l2": float("nan")}, {"seed": -1}, {"momentum": 0.9}):
        with pytest.raises(ValueError):
            Architecture.parse(bad)


def test_network_learns_a_planted_rule_and_stays_at_chance_on_noise():
    rng = np.random.default_rng(7)
    x = rng.normal(size=(1400, 6))
    planted = (np.tanh(x[:, 0] * x[:, 1]) + 0.25 * rng.normal(size=1400) > 0).astype(float)
    noise = rng.integers(0, 2, 1400).astype(float)
    arch = Architecture(hidden=(16, 8), epochs=60, dropout=0.0)
    for y, low, high in ((planted, 0.85, 1.0), (noise, 0.4, 0.6)):
        model, scaler, record = train(arch, x[:1000], y[:1000], x[1000:], y[1000:])
        assert low <= record["epochs"][-1]["val_auc"] <= high
    assert len(record["snapshots"]) == len(neural.snapshot_epochs(60)) == 25
    assert record["snapshots"][0]["epoch"] == 0 and record["snapshots"][-1]["epoch"] == 60


def test_trace_is_deterministic_future_append_invariant_and_on_production_splits(evidence):
    prefix = evidence.model_copy(update={"observations": evidence.observations[:620]})
    trace = neural_trace("SPY", cutoff(evidence), "real", SMALL, dataset=prefix, horizon=3, embargo=2)
    assert trace == neural_trace("SPY", cutoff(evidence), "real", SMALL, dataset=evidence,
                                 horizon=3, embargo=2)
    prices, _ = pit_prices("SPY", cutoff(evidence), "real", dataset=prefix)
    frame, columns, _ = traces.signal_inputs(prices, prices, "SPY", 3)
    split = build_signal_splits(frame, columns, "target_direction", horizon=3, embargo=2)
    assert trace["fit"]["fit_indices"] == list(split["X_fit"].index)
    assert trace["validation"]["indices"] == list(split["X_validation"].index)
    assert trace["holdout"]["indices"] == list(split["X_test"].index)
    assert not set(trace["fit"]["fit_indices"] + trace["validation"]["indices"]) & set(trace["holdout"]["indices"])
    assert pd.Timestamp(trace["fit"]["training_target_information_end"]) < pd.Timestamp(trace["validation"]["feature_start"])
    assert trace["kind"] == "neural" and trace["schema_version"] == "model-observatory/2"
    assert trace["layer_sizes"] == [len(columns), 6, 4, 1]
    assert trace["parameter_count"] == len(columns) * 6 + 6 + 6 * 4 + 4 + 4 + 1
    assert trace["families"] == list(FAMILIES)
    assert trace["family"] == [neural_family(c) for c in trace["feature_names"]]
    assert abs(sum(trace["attribution"]) - 1) < 1e-4
    assert abs(sum(trace["family_attribution"].values()) - 1) < 1e-4
    assert [e["epoch"] for e in trace["epochs"]] == list(range(1, 9))
    assert [s["epoch"] for s in trace["snapshots"]] == trace["snapshot_epochs"]
    snapshot = trace["snapshots"][-1]
    assert [np.shape(w) for w in snapshot["weights"]] == [(len(columns), 6), (6, 4), (4, 1)]
    assert [len(a) for a in snapshot["mean_activation"]] == [6, 4]
    assert not trace["probe"]["included_in_labeled_rows"]
    assert all(v is False for v in trace["claims"].values())


def test_holdout_is_sealed_unless_the_exporter_evaluates_the_preregistered_network(evidence):
    sealed = neural_trace("SPY", cutoff(evidence), "real", SMALL, dataset=evidence)
    assert sealed["holdout"]["sealed"] and sealed["holdout"]["auc"] is None
    assert sealed["holdout"]["verdict"] is None and "validation only" in sealed["holdout"]["note"]
    assert sealed["validation"]["status"] == validation_status(sealed["validation"]["auc_ci95"])
    opened = neural_trace("SPY", cutoff(evidence), "real", SMALL, dataset=evidence, evaluate_holdout=True)
    holdout = opened["holdout"]
    assert not holdout["sealed"] and holdout["auc"] is not None
    assert (holdout["verdict"], holdout["verdict_reason"]) == selection_verdict(
        holdout["auc_ci95"], [opened["validation"]["auc"]])
    # Opening the holdout changes nothing the network was trained or validated on.
    assert opened["epochs"] == sealed["epochs"] and opened["snapshots"] == sealed["snapshots"]


def test_family_choice_and_geo_inputs(evidence, catalog):
    assert parse_families(None) == list(FAMILIES)
    assert parse_families([GEO_FAMILY, "Volume"]) == ["Volume", GEO_FAMILY]
    for bad in ([], ["Volume", "Volume"], ["Weather"]):
        with pytest.raises(ValueError):
            parse_families(bad)
    with pytest.raises(ValueError, match="USGS catalog"):
        neural_trace("SPY", cutoff(evidence), "real", SMALL, families=list(NEURAL_FAMILIES), dataset=evidence)
    trace = neural_trace("SPY", cutoff(evidence), "real", SMALL, families=["Volatility", GEO_FAMILY],
                         dataset=evidence, catalog=catalog)
    assert trace["families"] == ["Volatility", GEO_FAMILY]
    assert trace["feature_names"][-4:] == list(usgs.FEATURES)
    assert trace["geo_provenance"]["quality"] == usgs.QUALITY == "RETROSPECTIVE_CATALOG"
    assert trace["provenance"]["geo_catalog_hash"] == catalog.sha256
    assert set(trace["family_attribution"]) == {"Volatility", GEO_FAMILY}


def test_geo_features_admit_events_only_after_the_lag(catalog):
    first = catalog.events["time"].min()
    at = pd.Series(pd.to_datetime([first + timedelta(days=40), first + timedelta(days=40, hours=1)]))
    features = usgs.geo_features(at, catalog)
    events = catalog.events
    window = events[(events["time"] + usgs.LAG <= at[0]) & (events["time"] + usgs.LAG > at[0] - timedelta(days=7))]
    assert features.iloc[0]["geo_quake_count_m5_7d"] == (window["mag"] >= 5).sum()
    assert features.iloc[0]["geo_quake_max_mag_7d"] == window["mag"].max()
    month = events[(events["time"] + usgs.LAG <= at[0]) & (events["time"] + usgs.LAG > at[0] - timedelta(days=30))]
    assert features.iloc[0]["geo_quake_near_hub_30d"] == usgs.near_hub(month).sum()
    assert np.isclose(features.iloc[0]["geo_quake_energy_log_30d"],
                      np.log10(usgs.seismic_energy_joules(month["mag"]).sum() + 1))
    # An event inside the lag is invisible; moving the row past its lag admits it.
    late = catalog.events.iloc[[0]].copy()
    late["time"] = at[0] - timedelta(hours=12)
    late["mag"] = 9.5
    shifted = usgs.Catalog(pd.concat([events, late]).sort_values("time").reset_index(drop=True),
                           catalog.source, catalog.query, catalog.retrieved_at, catalog.sha256, 4.5)
    assert usgs.geo_features(at.iloc[:1], shifted).iloc[0]["geo_quake_max_mag_7d"] < 9.5
    later = pd.Series([at[0] + timedelta(hours=13)])
    assert usgs.geo_features(later, shifted).iloc[0]["geo_quake_max_mag_7d"] == 9.5
    # Before 30 days of coverage the features are missing, not zero.
    early = usgs.geo_features(pd.Series([first + timedelta(days=3)]), catalog)
    assert early.isna().all(axis=None)


def test_catalog_rejects_malformed_events():
    good = usgs.build_catalog_payload(
        [{"id": "a", "properties": {"mag": 5.0, "time": 1_700_000_000_000}, "geometry": {"coordinates": [1, 2]}}],
        query="q", min_magnitude=4.5)
    assert len(usgs.parse_catalog(json.dumps(good).encode()).events) == 1
    for change in ({"lat": 95}, {"mag": float("nan")}, {"id": ""}):
        bad = json.loads(json.dumps(good))
        bad["events"][0].update(change)
        with pytest.raises(ValueError):
            usgs.parse_catalog(json.dumps(bad, allow_nan=True).encode())
    duplicate = json.loads(json.dumps(good))
    duplicate["events"].append(duplicate["events"][0])
    with pytest.raises(ValueError):
        usgs.parse_catalog(json.dumps(duplicate).encode())


def test_neural_endpoint_contract(evidence, monkeypatch):
    from backend.main import app
    from backend.routes.ml import NeuralTraceRequest, neural_training_trace
    from src.regime_intelligence import service
    assert "post" in app.openapi()["paths"]["/ml/neural/trace"]
    monkeypatch.setattr(service, "load_dataset", lambda ticker: evidence)
    request = SimpleNamespace(state=SimpleNamespace(organization_id="neural-test"))
    body = NeuralTraceRequest(ticker="spy", as_of=cutoff(evidence), source="real", architecture=SMALL)
    trace = neural_training_trace(request, body)
    assert trace["kind"] == "neural" and trace["holdout"]["sealed"]
    for bad in (dict(source="yfinance"), dict(architecture={"hidden": [128]}),
                dict(families=["Weather"])):
        with pytest.raises(HTTPException) as error:
            neural_training_trace(request, body.model_copy(update=bad))
        assert error.value.status_code == 422


def _shape(value):
    if isinstance(value, dict):
        return {k: _shape(v) for k, v in value.items()}
    if isinstance(value, list):
        return [len(value), _shape(value[0]) if value else None]
    return type(value).__name__ if value is not None else None


def test_frontend_contract_fixture_matches_the_trace_shape(evidence):
    """frontend-v2/scripts/verify-neural.mjs validates this fixture; keep it the trace's shape."""
    from pathlib import Path
    fixture = json.loads((Path(__file__).resolve().parents[1] / "frontend-v2/scripts/fixtures/neural-trace.simulated.json").read_text())
    trace = neural_trace("SPY", cutoff(evidence), "real", {"hidden": [6, 4], "epochs": 8, "batch_size": 32},
                         dataset=evidence, evaluate_holdout=True)
    trace = json.loads(json.dumps(trace))
    for volatile in ("disclosure",):
        fixture["provenance"].pop(volatile)
        trace["provenance"].pop(volatile)
    assert _shape(fixture) == _shape(trace)
    assert fixture["claims"] == trace["claims"] and fixture["layer_sizes"] == trace["layer_sizes"]
