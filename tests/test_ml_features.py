import pandas as pd
import numpy as np
import pytest
from src.ml import features

@pytest.fixture
def sample_df():
    dates = pd.date_range("2024-01-01", periods=80)
    # Generate some simple non-constant price data
    prices = np.linspace(100, 150, 80) + np.random.normal(0, 1, 80)
    df = pd.DataFrame({
        "Date": dates,
        "Ticker": "TEST",
        "Open": prices - 1,
        "High": prices + 1,
        "Low": prices - 2,
        "Close": prices,
        "Volume": np.random.randint(1000, 5000, 80)
    })
    return df

def test_add_return_features(sample_df):
    res = features.add_return_features(sample_df)
    assert "simple_return" in res.columns
    assert "log_return" in res.columns
    assert "volume_change" in res.columns

def test_add_lag_features(sample_df):
    sample_df["test_col"] = np.random.randn(80)
    res = features.add_lag_features(sample_df, columns=["test_col"], lags=[1, 2])
    assert "test_col_lag_1" in res.columns
    assert "test_col_lag_2" in res.columns
    
def test_add_rolling_features(sample_df):
    res = features.add_rolling_features(sample_df, windows=[5])
    assert "rolling_mean_5" in res.columns
    assert "rolling_std_5" in res.columns
    assert "price_to_ma_5" in res.columns

def test_create_ml_feature_dataset(sample_df):
    res = features.create_ml_feature_dataset(sample_df)
    assert not res.empty
    # The length will be smaller because of NA drops from rolling windows and lags
    assert len(res) < len(sample_df)
    # Ensure no NA
    assert res.isna().sum().sum() == 0
    # Check that some feature columns exist
    feat_cols = features.get_feature_columns(res)
    assert len(feat_cols) > 0
    assert "simple_return" in feat_cols
    assert "rsi_14" in feat_cols
