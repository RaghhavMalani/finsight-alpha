import pytest
import pandas as pd
import numpy as np
from src.regime.regime_labeling import (
    summarize_regime_states,
    label_regime_states,
    map_regime_labels_to_rows
)

def test_summarize_regime_states():
    df = pd.DataFrame({
        "state": [0, 0, 1, 1],
        "log_return": [0.01, 0.02, -0.01, -0.02],
        "realized_vol_20": [0.1, 0.1, 0.3, 0.3],
        "drawdown_from_252_high": [0.0, -0.01, -0.1, -0.2]
    })
    
    summary = summarize_regime_states(
        df, 
        state_col="state", 
        return_col="log_return", 
        volatility_col="realized_vol_20", 
        drawdown_col="drawdown_from_252_high"
    )
    
    assert len(summary) == 2
    assert "average_return" in summary.columns
    assert "average_volatility" in summary.columns
    
def test_label_regime_states():
    summary = pd.DataFrame({
        "state": [0, 1, 2],
        "average_return": [0.001, -0.002, 0.0005],
        "average_volatility": [0.10, 0.40, 0.15],
        "average_drawdown": [-0.02, -0.30, -0.05]
    })
    
    labels = label_regime_states(summary)
    
    assert isinstance(labels, dict)
    assert len(labels) == 3
    # State 1 has negative return, high vol, deep drawdown -> Stress / Selloff or High-Vol Bearish
    assert labels[1] in ["Stress / Selloff", "High-Vol Bearish"]
    
def test_map_regime_labels_to_rows():
    df = pd.DataFrame({
        "state": [0, 1, 0, 2]
    })
    
    labels = {0: "Low-Vol Bullish", 1: "Stress / Selloff"}
    mapped = map_regime_labels_to_rows(df, "state", labels)
    
    assert "regime_label" in mapped.columns
    assert mapped["regime_label"].iloc[0] == "Low-Vol Bullish"
    assert mapped["regime_label"].iloc[3] == "Unknown" # Not in map
