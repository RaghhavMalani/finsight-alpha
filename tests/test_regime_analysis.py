import pytest
import pandas as pd
import numpy as np
from src.regime.regime_analysis import (
    calculate_current_regime_summary,
    analyze_transition_matrix,
    calculate_regime_transition_matrix
)

def test_calculate_current_regime_summary_stability():
    df = pd.DataFrame({
        "Date": pd.date_range("2023-01-01", periods=30),
        "regime_label": ["Low-Vol Bullish"] * 25 + ["High-Vol Bearish"] * 5,
        "hmm_state_probability": [0.95] * 30
    })
    
    summary = calculate_current_regime_summary(df)
    assert summary["current_regime"] == "High-Vol Bearish"
    assert summary["regime_stability"] in ["High", "Medium", "Low"]
    assert summary["recent_switches_20d"] == 1
    assert summary["regime_confidence_quality"] == "Medium"  # Duration is only 5 days, so it fails High but prob is 0.95 so Medium

def test_analyze_transition_matrix():
    states = pd.Series(["A", "A", "B", "B", "B", "A", "A"])
    trans_mat = calculate_regime_transition_matrix(states)
    
    analysis = analyze_transition_matrix(trans_mat, "A")
    assert "most_stable_regime" in analysis
    assert analysis["current_regime_stay_probability"] > 0
    assert analysis["most_likely_next_regime"] == "B"
