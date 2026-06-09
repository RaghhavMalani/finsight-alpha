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
    # Action
    features_df = create_regime_features(sample_market_data)
    
    # Assert
    assert not features_df.empty
    # Expect roughly 252 days lost due to max rolling window (if using 252 max, actually our max is 252 for drawdown)
    # The max rolling window used in features is 252 (rolling_max_252).
    # Since we drop missing values only after all features are created, 
    # we might lose up to 251 rows, leaving ~49 rows.
    # Actually rolling max min_periods=1, but SMA 200 drops 199.
    
    assert "log_return" in features_df.columns
    assert "realized_vol_20" in features_df.columns
    assert "drawdown_from_252_high" in features_df.columns
    assert "volume_zscore_20" in features_df.columns
    
    # Ensure no NAs in final set
    assert features_df.isna().sum().sum() == 0

def test_create_regime_features_with_benchmark(sample_market_data, sample_benchmark_data):
    features_df = create_regime_features(sample_market_data, benchmark_df=sample_benchmark_data)
    
    assert "benchmark_return" in features_df.columns
    assert "asset_minus_benchmark_return" in features_df.columns
    assert "rolling_beta_60" in features_df.columns
    
def test_get_regime_feature_columns(sample_market_data):
    features_df = create_regime_features(sample_market_data)
    cols = get_regime_feature_columns(features_df)
    
    assert isinstance(cols, list)
    assert len(cols) > 0
    assert "log_return" in cols
    assert "realized_vol_20" in cols
