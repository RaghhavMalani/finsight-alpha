import pandas as pd
import numpy as np
import pytest
from src.ml import reliance_features

@pytest.fixture
def sample_reliance_data():
    dates = pd.date_range("2023-01-01", periods=300)
    prices = np.linspace(2500, 3000, 300) + np.random.normal(0, 20, 300)
    df = pd.DataFrame({
        "Date": dates,
        "Ticker": "RELIANCE.NS",
        "Open": prices - 10,
        "High": prices + 20,
        "Low": prices - 20,
        "Close": prices,
        "Volume": np.random.randint(1000000, 5000000, 300)
    })
    return df

@pytest.fixture
def sample_benchmark_data():
    dates = pd.date_range("2023-01-01", periods=300)
    prices = np.linspace(200, 250, 300) + np.random.normal(0, 2, 300)
    df = pd.DataFrame({
        "Date": dates,
        "Ticker": "NIFTYBEES.NS",
        "Open": prices - 1,
        "High": prices + 2,
        "Low": prices - 2,
        "Close": prices,
        "Volume": np.random.randint(50000, 150000, 300)
    })
    return df

def test_reliance_features_without_benchmark(sample_reliance_data):
    feat_df = reliance_features.create_reliance_signal_features(sample_reliance_data)
    
    assert not feat_df.empty
    assert "log_return" in feat_df.columns
    assert "sma_50" in feat_df.columns
    assert "rsi_14" in feat_df.columns
    
    # Check that there's no missing data in the final df
    assert feat_df.isna().sum().sum() == 0

def test_reliance_features_with_benchmark(sample_reliance_data, sample_benchmark_data):
    feat_df = reliance_features.create_reliance_signal_features(
        sample_reliance_data, benchmark_df=sample_benchmark_data
    )
    
    assert not feat_df.empty
    assert "reliance_minus_benchmark_return" in feat_df.columns
    assert "rolling_beta_30" in feat_df.columns
    assert "rolling_corr_60" in feat_df.columns
    
    assert feat_df.isna().sum().sum() == 0
