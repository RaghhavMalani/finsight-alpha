import pytest
import pandas as pd
import numpy as np
from src.regime.hmm_regime import run_hmm_regime_detection, is_hmmlearn_available
from src.regime.clustering_regime import run_gmm_regime_detection, run_kmeans_regime_detection

@pytest.fixture
def dummy_features():
    np.random.seed(42)
    dates = pd.date_range("2022-01-01", periods=100, freq="B")
    
    df = pd.DataFrame({
        "Date": dates,
        "log_return": np.random.normal(0, 0.01, 100),
        "realized_vol_20": np.random.uniform(0.1, 0.3, 100),
        "drawdown_from_252_high": np.random.uniform(-0.2, 0, 100)
    })
    df.set_index("Date", drop=False, inplace=True)
    return df

def test_run_gmm_regime_detection(dummy_features):
    cols = ["log_return", "realized_vol_20", "drawdown_from_252_high"]
    res = run_gmm_regime_detection(dummy_features, cols, n_states=3)
    
    assert "gmm_state" in res.columns
    assert "gmm_state_probability" in res.columns
    assert "gmm_state_0_prob" in res.columns
    
    # State should not be nan
    assert res["gmm_state"].isna().sum() == 0

def test_run_kmeans_regime_detection(dummy_features):
    cols = ["log_return", "realized_vol_20", "drawdown_from_252_high"]
    res = run_kmeans_regime_detection(dummy_features, cols, n_states=3)
    
    assert "kmeans_state" in res.columns
    assert res["kmeans_state"].isna().sum() == 0

@pytest.mark.skipif(not is_hmmlearn_available(), reason="hmmlearn is not installed")
def test_run_hmm_regime_detection(dummy_features):
    cols = ["log_return", "realized_vol_20", "drawdown_from_252_high"]
    res = run_hmm_regime_detection(dummy_features, cols, n_states=3)
    
    assert "hmm_state" in res.columns
    assert "hmm_state_probability" in res.columns
    assert res["hmm_state"].isna().sum() == 0
