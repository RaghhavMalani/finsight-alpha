import pytest
import pandas as pd
import numpy as np
from src.ml.signal_features import create_signal_research_features

def test_create_signal_research_features():
    dates = pd.date_range("2020-01-01", periods=100)
    df = pd.DataFrame({
        "Date": dates,
        "Open": np.random.uniform(100, 110, 100),
        "High": np.random.uniform(110, 115, 100),
        "Low": np.random.uniform(95, 100, 100),
        "Close": np.random.uniform(100, 110, 100),
        "Volume": np.random.randint(1000, 5000, 100)
    })
    
    benchmark_df = pd.DataFrame({
        "Date": dates,
        "Close": np.random.uniform(200, 220, 100),
    })
    
    feat_df = create_signal_research_features(df, benchmark_df, "TEST")
    
    assert "simple_return" in feat_df.columns
    assert "realized_vol_20" in feat_df.columns
    assert "rsi_14" in feat_df.columns
    assert "rolling_beta_30" in feat_df.columns
    assert not feat_df.empty
