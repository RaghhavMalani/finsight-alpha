import pytest
import pandas as pd
import numpy as np
from src.regime.regime_features import (
    create_regime_features,
    get_regime_feature_columns
)

@pytest.fixture
def sample_market_data():
    np.random.seed(42)
    dates = pd.date_range(start="2020-01-01", periods=300, freq="B")
    
    # Generate random walk price
    returns = np.random.normal(0.0005, 0.015, 300)
    prices = 100 * np.exp(np.cumsum(returns))
    volumes = np.random.lognormal(mean=10, sigma=1, size=300)
    
    df = pd.DataFrame({
        "Date": dates,
        "Close": prices,
        "Volume": volumes
    })
    return df

@pytest.fixture
def sample_benchmark_data(sample_market_data):
    df = sample_market_data.copy()
    # Shift returns slightly
    returns = np.random.normal(0.0003, 0.012, 300)
    df["Close"] = 100 * np.exp(np.cumsum(returns))
    return df

def test_create_regime_features(sample_market_data):
    features_df = create_regime_features(sample_market_data)
    assert not features_df.empty
    assert "log_return" in features_df.columns
    assert "realized_vol_20" in features_df.columns
    assert "drawdown_from_252_high" in features_df.columns
    assert "volume_zscore_20" in features_df.columns
    assert features_df.isna().sum().sum() == 0

def test_create_regime_features_with_benchmark(sample_market_data, sample_benchmark_data):
    features_df = create_regime_features(sample_market_data, benchmark_df=sample_benchmark_data)
    assert "benchmark_return" in features_df.columns
    assert "asset_minus_benchmark_return" in features_df.columns
    assert "rolling_beta_60" in features_df.columns
    
def test_get_regime_feature_columns_basic(sample_market_data):
    features_df = create_regime_features(sample_market_data)
    cols = get_regime_feature_columns(features_df, feature_set="Basic")
    assert isinstance(cols, list)
    assert len(cols) == 5
    assert "log_return" in cols
    assert "realized_vol_20" in cols

def test_get_regime_feature_columns_full(sample_market_data, sample_benchmark_data):
    features_df = create_regime_features(sample_market_data, benchmark_df=sample_benchmark_data)
    cols = get_regime_feature_columns(features_df, feature_set="Full")
    assert isinstance(cols, list)
    assert len(cols) > 5  # Should be ~22
    assert "abs_return" in cols
    assert "volatility_ratio_5_20" in cols
    assert "rolling_beta_60" in cols
