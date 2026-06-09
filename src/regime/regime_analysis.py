import pandas as pd
import numpy as np
from typing import Dict, Any

def calculate_regime_transition_matrix(states: pd.Series) -> pd.DataFrame:
    """
    Calculate transition probability matrix for regime states.
    Rows = current state, Columns = next state.
    """
    if states.empty or states.isna().all():
        return pd.DataFrame()
        
    s = states.dropna().astype(str)
    
    # Create transition counts
    transitions = pd.crosstab(
        pd.Series(s[:-1].values, name="Current State"),
        pd.Series(s[1:].values, name="Next State")
    )
    
    # Normalize to probabilities (rows sum to 1)
    transition_probs = transitions.div(transitions.sum(axis=1), axis=0)
    
    return transition_probs

def calculate_regime_duration(
    df: pd.DataFrame,
    regime_col: str = "regime_label"
) -> pd.DataFrame:
    """
    Calculate consecutive duration of regimes.
    """
    if regime_col not in df.columns or df.empty:
        return pd.DataFrame()
        
    out = df.copy()
    if "Date" not in out.columns:
        out["Date"] = out.index
        
    # Group by consecutive identical regimes
    out["regime_block"] = (out[regime_col] != out[regime_col].shift(1)).cumsum()
    
    duration_df = out.groupby("regime_block").agg({
        regime_col: "first",
        "Date": ["min", "max", "count"]
    })
    
    duration_df.columns = ["regime_label", "start_date", "end_date", "duration_days"]
    duration_df.reset_index(drop=True, inplace=True)
    
    return duration_df

def calculate_current_regime_summary(
    df: pd.DataFrame,
    regime_col: str = "regime_label",
    probability_col: str = "hmm_state_probability"  # Or another appropriate col based on selected model
) -> Dict[str, Any]:
    """
    Summarize the current (latest) regime state.
    """
    if df.empty or regime_col not in df.columns:
        return {}
        
    latest_row = df.iloc[-1]
    current_regime = latest_row.get(regime_col, "Unknown")
    prob = latest_row.get(probability_col, np.nan)
    
    # Calculate duration
    duration_df = calculate_regime_duration(df, regime_col=regime_col)
    if not duration_df.empty:
        current_duration = int(duration_df.iloc[-1]["duration_days"])
    else:
        current_duration = 0
        
    from .regime_labeling import classify_current_regime_risk
    risk_info = classify_current_regime_risk(str(current_regime))
    
    latest_date = latest_row.get("Date", df.index[-1])
    
    return {
        "current_regime": current_regime,
        "current_regime_probability": prob,
        "current_regime_duration": current_duration,
        "current_regime_risk_level": risk_info.get("regime_risk_level", "Unknown"),
        "latest_date": latest_date
    }

def calculate_regime_performance_summary(
    df: pd.DataFrame,
    regime_col: str = "regime_label",
    return_col: str = "log_return"
) -> pd.DataFrame:
    """
    Calculate performance metrics grouped by regime label.
    """
    if regime_col not in df.columns or return_col not in df.columns or df.empty:
        return pd.DataFrame()
        
    summary = []
    
    for regime, group in df.groupby(regime_col):
        count = len(group)
        if count == 0:
            continue
            
        avg_ret = group[return_col].mean()
        ann_ret = avg_ret * 252
        
        vol = group[return_col].std() * np.sqrt(252)
        
        sharpe = ann_ret / vol if vol > 0 else 0
        
        # Max drawdown in this regime (simplified as min of rolling drawdown if present, 
        # or simple approximation using returns)
        if "drawdown_from_252_high" in group.columns:
            max_dd = group["drawdown_from_252_high"].min()
        else:
            # Approx
            cum_rets = (1 + group[return_col]).cumprod()
            rolling_max = cum_rets.cummax()
            drawdown = (cum_rets / rolling_max) - 1
            max_dd = drawdown.min()
            
        pos_rate = (group[return_col] > 0).mean()
        
        summary.append({
            "regime_label": regime,
            "count": count,
            "average_daily_return": avg_ret,
            "annualized_return": ann_ret,
            "annualized_volatility": vol,
            "sharpe_like_ratio": sharpe,
            "max_drawdown": max_dd,
            "positive_day_rate": pos_rate
        })
        
    return pd.DataFrame(summary)
