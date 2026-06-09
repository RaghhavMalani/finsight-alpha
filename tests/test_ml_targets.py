import pandas as pd
import numpy as np
import pytest
from src.ml import targets

@pytest.fixture
def sample_df():
    dates = pd.date_range("2024-01-01", periods=80)
    prices = np.linspace(100, 150, 80) + np.random.normal(0, 1, 80)
    df = pd.DataFrame({
        "Date": dates,
        "Close": prices
    })
    df["log_return"] = np.log(df["Close"] / df["Close"].shift(1))
    return df

def test_create_direction_target(sample_df):
    res = targets.create_direction_target(sample_df, horizon=1)
    assert "target_direction" in res.columns
    # Last row should be NA since there's no future data
    assert pd.isna(res.iloc[-1]["target_direction"])
    # Values should be 0 or 1 where not NA
    valid_vals = res["target_direction"].dropna().unique()
    assert set(valid_vals).issubset({0.0, 1.0})

def test_create_future_return_target(sample_df):
    res = targets.create_future_return_target(sample_df, horizon=5)
    assert "target_return_5d" in res.columns
    assert pd.isna(res.iloc[-1]["target_return_5d"])

def test_create_future_volatility_target(sample_df):
    res = targets.create_future_volatility_target(sample_df, horizon=5)
    assert "target_volatility_5d" in res.columns
    assert pd.isna(res.iloc[-1]["target_volatility_5d"])

def test_create_all_targets(sample_df):
    res = targets.create_all_targets(sample_df)
    assert "target_direction" in res.columns
    assert "target_return_5d" in res.columns
    assert "target_volatility_5d" in res.columns
    target_cols = ["target_direction", "target_return_5d", "target_volatility_5d"]
    assert res[target_cols].isna().sum().sum() == 0
