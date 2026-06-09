import pandas as pd
import numpy as np
from typing import Dict, Any

def summarize_regime_states(
    df: pd.DataFrame,
    state_col: str,
    return_col: str = "log_return",
    volatility_col: str = "realized_vol_20",
    drawdown_col: str = "drawdown_from_252_high"
) -> pd.DataFrame:
    """Calculate summary statistics for each regime state."""
    if state_col not in df.columns:
        return pd.DataFrame()
        
    summary = []
    
    # We only summarize non-NaN states
    valid_df = df.dropna(subset=[state_col])
    states = valid_df[state_col].unique()
    
    for state in sorted(states):
        state_data = valid_df[valid_df[state_col] == state]
        
        avg_ret = state_data[return_col].mean() if return_col in state_data else np.nan
        ann_ret = avg_ret * 252 if not np.isnan(avg_ret) else np.nan
        
        avg_vol = state_data[volatility_col].mean() if volatility_col in state_data else np.nan
        
        avg_dd = state_data[drawdown_col].mean() if drawdown_col in state_data else np.nan
        worst_dd = state_data[drawdown_col].min() if drawdown_col in state_data else np.nan
        
        if return_col in state_data:
            positive_days = (state_data[return_col] > 0).sum()
            total_days = len(state_data)
            pos_rate = positive_days / total_days if total_days > 0 else 0
        else:
            pos_rate = np.nan
            
        summary.append({
            "state": state,
            "count": len(state_data),
            "average_return": avg_ret,
            "annualized_return": ann_ret,
            "average_volatility": avg_vol,
            "average_drawdown": avg_dd,
            "worst_drawdown": worst_dd,
            "positive_day_rate": pos_rate
        })
        
    return pd.DataFrame(summary)

def label_regime_states(regime_summary: pd.DataFrame) -> Dict[float, str]:
    """
    Assign human-readable labels to states based on their summary statistics.
    Rules:
    - High average return and low/moderate volatility -> Low-Vol Bullish
    - Negative average return and high volatility -> High-Vol Bearish
    - Strong negative drawdown and high volatility -> Stress / Selloff
    - Low return and moderate volatility -> Sideways / Choppy
    - Positive return after high drawdown -> Recovery
    """
    if regime_summary.empty:
        return {}
        
    labels = {}
    
    # Calculate relative rankings
    vol_median = regime_summary["average_volatility"].median()
    ret_median = regime_summary["average_return"].median()
    dd_median = regime_summary["average_drawdown"].median()
    
    for _, row in regime_summary.iterrows():
        state = row["state"]
        ret = row["average_return"]
        vol = row["average_volatility"]
        dd = row["average_drawdown"]
        
        # Simple heuristic assignment
        if dd < dd_median and vol > vol_median and ret < 0:
            labels[state] = "Stress / Selloff"
        elif ret < 0 and vol > vol_median:
            labels[state] = "High-Vol Bearish"
        elif ret > 0 and vol <= vol_median:
            labels[state] = "Low-Vol Bullish"
        elif ret > ret_median and dd < dd_median:
            # high return but still in a relatively deep drawdown bucket
            labels[state] = "Recovery"
        else:
            labels[state] = "Sideways / Choppy"
            
    # Resolve duplicates by appending an index or refining rules, 
    # but for this generic assignment, duplicates are acceptable 
    # (e.g. multiple "Sideways / Choppy" states).
    
    return labels

def map_regime_labels_to_rows(
    df: pd.DataFrame,
    state_col: str,
    label_map: Dict[float, str]
) -> pd.DataFrame:
    """Add regime_label column to dataframe."""
    out = df.copy()
    if state_col in out.columns:
        out["regime_label"] = out[state_col].map(label_map)
        # Handle states not in map or NaN
        out["regime_label"] = out["regime_label"].fillna("Unknown")
    else:
        out["regime_label"] = "Unknown"
    return out

def classify_current_regime_risk(current_regime_label: str) -> Dict[str, Any]:
    """
    Return risk parameters associated with the current regime label.
    Useful for ML signal adjustment.
    """
    if current_regime_label == "Stress / Selloff":
        return {
            "regime_risk_level": "High",
            "regime_confidence_adjustment": -0.15,
            "interpretation": "Market is in a severe drawdown with high volatility. Protective stance recommended."
        }
    elif current_regime_label == "High-Vol Bearish":
        return {
            "regime_risk_level": "High",
            "regime_confidence_adjustment": -0.10,
            "interpretation": "Market is trending downward with elevated volatility. Bullish signals have lower reliability."
        }
    elif current_regime_label == "Low-Vol Bullish":
        return {
            "regime_risk_level": "Low",
            "regime_confidence_adjustment": 0.05,
            "interpretation": "Market is in a stable uptrend. Trend-following signals have higher reliability."
        }
    elif current_regime_label == "Sideways / Choppy":
        return {
            "regime_risk_level": "Medium",
            "regime_confidence_adjustment": -0.05,
            "interpretation": "Market lacks clear direction. Signal confidence is slightly reduced."
        }
    elif current_regime_label == "Recovery":
        return {
            "regime_risk_level": "Medium",
            "regime_confidence_adjustment": 0.00,
            "interpretation": "Market is bouncing from a drawdown. Elevated uncertainty remains."
        }
    else:
        return {
            "regime_risk_level": "Unknown",
            "regime_confidence_adjustment": 0.00,
            "interpretation": "Regime state is unknown or undefined."
        }
