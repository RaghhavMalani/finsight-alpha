import pytest
import pandas as pd
from src.regime.regime_integration import (
    add_regime_features_to_ml_dataset,
    adjust_signal_for_regime
)

def test_add_regime_features_to_ml_dataset():
    ml_df = pd.DataFrame({
        "Date": ["2022-01-01", "2022-01-02", "2022-01-03"],
        "feature_1": [1, 2, 3]
    })
    
    regime_df = pd.DataFrame({
        "Date": ["2022-01-01", "2022-01-02", "2022-01-03"],
        "gmm_state": [0, 0, 1],
        "gmm_state_probability": [0.9, 0.8, 0.7],
        "regime_label": ["Low-Vol Bullish", "Low-Vol Bullish", "High-Vol Bearish"]
    })
    
    merged = add_regime_features_to_ml_dataset(ml_df, regime_df)
    
    assert "regime_state" in merged.columns
    assert "regime_probability" in merged.columns
    assert "regime_label" in merged.columns
    assert "regime_risk_level" in merged.columns
    assert "regime_code" in merged.columns
    assert "regime_risk_level_code" in merged.columns
    assert "regime_duration" in merged.columns
    assert "current_regime_flag" in merged.columns
    
    assert merged["regime_label"].iloc[0] == "Low-Vol Bullish"
    assert merged["regime_risk_level"].iloc[2] == "High"

def test_adjust_signal_for_regime():
    signal = {
        "signal": "Bullish",
        "research_confidence": "Medium"
    }
    
    regime_summary = {
        "current_regime": "Stress / Selloff"
    }
    
    adjusted = adjust_signal_for_regime(signal, regime_summary)
    
    assert adjusted["regime_adjusted_signal"] == "Neutral"
    assert adjusted["regime_adjusted_confidence"] == "Low"
    assert "Stress / Selloff" in adjusted["regime_adjustment_reason"]

def test_adjust_signal_no_edge():
    signal = {
        "signal": "Neutral",
        "research_confidence": "Low"
    }
    
    regime_summary = {
        "current_regime": "Low-Vol Bullish"
    }
    
    adjusted = adjust_signal_for_regime(signal, regime_summary)
    
    # Should not turn a neutral signal into Bullish just because of regime
    assert adjusted["regime_adjusted_signal"] == "Neutral"
