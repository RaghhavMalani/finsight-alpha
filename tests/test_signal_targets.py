import pytest
import pandas as pd
import numpy as np
from src.ml.signal_targets import create_signal_research_targets

def test_create_signal_research_targets():
    df = pd.DataFrame({
        "Close": [100, 101, 102, 99, 98],
        "realized_vol_5": [0.1, 0.1, 0.15, 0.2, 0.2]
    })
    
    res = create_signal_research_targets(df, horizon=1)
    
    # 100 -> 101: Up
    assert res.loc[0, "target_direction"] == 1
    # 102 -> 99: Down
    assert res.loc[2, "target_direction"] == 0
    # End row should be NaN
    assert pd.isna(res.loc[4, "target_direction"])
