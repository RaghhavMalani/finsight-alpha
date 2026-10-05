"""Simulated fixtures test leakage and trace contracts; exported scenes use real inputs."""
from datetime import datetime, timedelta, timezone
import json
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException

from src.dynamics.market_regime_inputs import digest
from src.ml import models
from src.ml.point_in_time_modeling import build_signal_splits
from src.ml.walk_forward import time_series_train_test_split
from src.observatory import traces
from src.observatory.adapters import adapter_for
from src.observatory.inputs import pit_prices
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


@pytest.fixture(autouse=True)
def optional_families(monkeypatch):
    monkeypatch.setattr(models, "HAS_XGB", False)
    monkeypatch.setattr(models, "HAS_LGB", False)


def cutoff(data):
    return data.observations[619].available_at.isoformat()


def test_hmm_shape_seed_and_future_append(evidence):
    prefix = evidence.model_copy(update={"observations": evidence.observations[:620]})
    first = traces.hmm_trace("SPY", cutoff(evidence), 3, "real", dataset=prefix, max_iter=4)
    second = traces.hmm_trace("SPY", cutoff(evidence), 3, "real", dataset=evidence, max_iter=4)
    assert first == second
    assert first["provenance"]["latest_availability"] <= first["as_of"]
    assert first["seed"] == 42 and len(first["frames"]) == 4
    frame = first["frames"][-1]
    assert np.shape(frame["posterior_tail"]) == (250, 3)
    np.testing.assert_allclose(np.sum(frame["posterior_tail"], axis=1), 1)
    np.testing.assert_allclose(np.sum(frame["transmat"], axis=1), 1)
    assert len(frame["covariance_diagonal"]) == 3
    assert first["scaler_hash"] == digest(first["scaler"])


def test_signal_trace_exact_splits_stage_importance_and_future_append(evidence):
    prefix = evidence.model_copy(update={"observations": evidence.observations[:620]})
    trace = traces.signal_trace("SPY", cutoff(evidence), "real", dataset=prefix, horizon=3, embargo=2, fold_count=2)
    assert trace == traces.signal_trace("SPY", cutoff(evidence), "real", dataset=evidence,
                                       horizon=3, embargo=2, fold_count=2)
    prices, _ = pit_prices("SPY", cutoff(evidence), "real", dataset=prefix)
    frame, columns, _ = traces.signal_inputs(prices, prices, "SPY", 3)
    split = build_signal_splits(frame, columns, "target_direction", horizon=3, embargo=2)
    outer = time_series_train_test_split(frame, columns, "target_direction", test_size=.2,
                                         target_horizon=3, embargo=2)
    assert split["X_train"].index.equals(outer[0].index)
    assert trace["holdout"]["indices"] == list(outer[1].index)
    final_fold = trace["folds"][-1]
    assert final_fold["fit_indices"] == list(split["X_fit"].index)
    assert final_fold["validation_indices"] == list(split["X_validation"].index)
    for fold in trace["folds"]:
        assert pd.Timestamp(fold["training_target_information_end"]) < pd.Timestamp(fold["validation_feature_start"])
        assert not set(fold["fit_indices"] + fold["validation_indices"]) & set(trace["holdout"]["indices"])
        assert len(fold["frames"]) == 100
        assert fold["frames"][0]["feature_importance"] != fold["frames"][-1]["feature_importance"]
    assert not trace["inference"]["included_in_labeled_rows"]
    assert pd.Timestamp(trace["holdout"]["training_target_information_end"]) < pd.Timestamp(trace["holdout"]["feature_start"])
    assert adapter_for("xgboost") is None and adapter_for("lightgbm") is None


def test_sabotage_training_information_cannot_enter_validation(evidence):
    prices, _ = pit_prices("SPY", cutoff(evidence), "real", dataset=evidence)
    frame, columns, _ = traces.signal_inputs(prices, prices, "SPY", 3)
    split = build_signal_splits(frame, columns, "target_direction", horizon=3)
    frame.loc[split["X_fit"].index[-1], "target_information_at"] = frame.loc[split["X_validation"].index[0], "available_at"]
    with pytest.raises(ValueError, match="crosses"):
        traces.split_evidence(frame, split["X_fit"], split["X_validation"])


def test_endpoints_require_cutoff_and_use_installed_pit(evidence, monkeypatch):
    from backend.main import app
    from backend.routes.regime import hmm_optimization_trace
    from backend.routes.ml import signal_optimization_trace
    from src.regime_intelligence import service
    paths = app.openapi()["paths"]
    for path in ("/regime/hmm/trace", "/ml/trace"):
        fields = {p["name"]: p for p in paths[path]["get"]["parameters"]}
        assert all(fields[k]["required"] for k in ("ticker", "as_of", "source"))
    assert paths["/regime/hmm/trace"]["get"]["parameters"][2]["required"]
    monkeypatch.setattr(service, "load_dataset", lambda ticker: evidence)
    request = SimpleNamespace(state=SimpleNamespace(organization_id="trace-test"))
    hmm = hmm_optimization_trace(request, "SPY", cutoff(evidence), 3, "real")
    signal = signal_optimization_trace(request, "SPY", cutoff(evidence), "real", 1, 0)
    assert hmm["kind"] == "hmm" and signal["kind"] == "signal"
    with pytest.raises(HTTPException) as error:
        hmm_optimization_trace(request, "SPY", cutoff(evidence), 3, "yfinance")
    assert error.value.status_code == 422
