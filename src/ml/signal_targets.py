import pandas as pd
import numpy as np

def create_signal_research_targets(
    df: pd.DataFrame,
    horizon: int = 1
) -> pd.DataFrame:
    """Create universal ML targets for signal research."""
    df = df.copy()
    
    if "Close" not in df.columns:
        return pd.DataFrame()
        
    # Future return over selected horizon
    df[f"target_return_{horizon}d"] = df["Close"].shift(-horizon) / df["Close"] - 1
    
    # 1. target_direction: 1 if future return > 0 else 0
    df["target_direction"] = (df[f"target_return_{horizon}d"] > 0).astype(int)
    
    # 2. target_strong_up: 1 if future return > +0.75% else 0
    df["target_strong_up"] = (df[f"target_return_{horizon}d"] > 0.0075).astype(int)
    
    # 3. target_strong_down: 1 if future return < -0.75% else 0
    df["target_strong_down"] = (df[f"target_return_{horizon}d"] < -0.0075).astype(int)
    
    # 4. target_risk_event: 1 if future return < -1.5% OR future volatility rises sharply else 0
    if "realized_vol_5" in df.columns:
        future_vol = df["realized_vol_5"].shift(-horizon)
        current_vol = df["realized_vol_5"]
        vol_spike = future_vol > (current_vol * 1.5)
        df["target_risk_event"] = ((df[f"target_return_{horizon}d"] < -0.015) | vol_spike).astype(int)
    else:
        df["target_risk_event"] = (df[f"target_return_{horizon}d"] < -0.015).astype(int)
        
    # Prevent data leakage / invalid targets by putting NaNs where we lack future data
    is_na = df[f"target_return_{horizon}d"].isna()
    df.loc[is_na, "target_direction"] = np.nan
    df.loc[is_na, "target_strong_up"] = np.nan
    df.loc[is_na, "target_strong_down"] = np.nan
    df.loc[is_na, "target_risk_event"] = np.nan
    
    return df
