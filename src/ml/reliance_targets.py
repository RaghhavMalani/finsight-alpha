import pandas as pd
import numpy as np

def create_reliance_targets(
    df: pd.DataFrame,
    horizon: int = 1
) -> pd.DataFrame:
    """Create predictive targets for Reliance Signal Research.
    
    Args:
        df: Feature DataFrame.
        horizon: Prediction horizon in days.
        
    Returns:
        DataFrame with new target columns appended.
    """
    df = df.copy()
    if "Close" not in df.columns:
        return df
        
    # Future return over selected horizon
    df[f"target_return_{horizon}d"] = (df["Close"].shift(-horizon) / df["Close"]) - 1
    
    # 1. target_direction: 1 if future return over horizon > 0 else 0
    df["target_direction"] = (df[f"target_return_{horizon}d"] > 0).astype(float)
    
    # 2. target_strong_up: 1 if future return over horizon > +0.75% else 0
    df["target_strong_up"] = (df[f"target_return_{horizon}d"] > 0.0075).astype(float)
    
    # 3. target_strong_down: 1 if future return over horizon < -0.75% else 0
    df["target_strong_down"] = (df[f"target_return_{horizon}d"] < -0.0075).astype(float)
    
    # 4. target_risk_event: 1 if future return over horizon < -1.5% OR future volatility rises sharply else 0
    # Calculate future realized vol over horizon (using past daily returns shifted backwards)
    if "log_return" in df.columns:
        future_vol = df["log_return"].rolling(window=max(5, horizon)).std().shift(-horizon) * np.sqrt(252)
        current_vol = df["log_return"].rolling(window=max(5, horizon)).std() * np.sqrt(252)
        vol_spike = (future_vol > (current_vol * 1.5))
    else:
        vol_spike = False

    risk_drop = df[f"target_return_{horizon}d"] < -0.015
    df["target_risk_event"] = (risk_drop | vol_spike).astype(float)
    
    # NaN out targets for the last 'horizon' rows
    target_cols = [
        f"target_return_{horizon}d", "target_direction", "target_strong_up", 
        "target_strong_down", "target_risk_event"
    ]
    for col in target_cols:
        df.loc[df.index[-horizon:], col] = np.nan
        
    # Drop rows with missing future targets
    df = df.dropna(subset=target_cols).reset_index(drop=True)
    
    return df
