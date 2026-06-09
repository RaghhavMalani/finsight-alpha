import pandas as pd
from typing import Dict, Any
from .regime_labeling import classify_current_regime_risk

def add_regime_features_to_ml_dataset(
    ml_df: pd.DataFrame,
    regime_df: pd.DataFrame,
    date_col: str = "Date"
) -> pd.DataFrame:
    """
    Merge regime features into ML dataset by Date without lookahead bias.
    """
    if ml_df.empty or regime_df.empty or date_col not in ml_df.columns or date_col not in regime_df.columns:
        return ml_df
        
    out = ml_df.copy()
    
    # Select relevant columns from regime_df
    # Assuming regime_label and probability exists
    regime_cols_to_keep = [date_col, "regime_label"]
    
    # Add state and probability if available
    for col in ["hmm_state", "gmm_state", "kmeans_state", "hmm_state_probability", "gmm_state_probability"]:
        if col in regime_df.columns:
            regime_cols_to_keep.append(col)
            
    r_df = regime_df[regime_cols_to_keep].copy()
    
    # Merge left on Date
    out = pd.merge(out, r_df, on=date_col, how="left")
    
    # Standardize column names
    if "hmm_state" in out.columns:
        out["regime_state"] = out["hmm_state"]
    elif "gmm_state" in out.columns:
        out["regime_state"] = out["gmm_state"]
    elif "kmeans_state" in out.columns:
        out["regime_state"] = out["kmeans_state"]
    else:
        out["regime_state"] = -1
        
    if "hmm_state_probability" in out.columns:
        out["regime_probability"] = out["hmm_state_probability"]
    elif "gmm_state_probability" in out.columns:
        out["regime_probability"] = out["gmm_state_probability"]
    else:
        out["regime_probability"] = 1.0
        
    out["regime_label"] = out["regime_label"].fillna("Unknown")
    
    # Encode regime labels numerically as a feature
    # Using simple categorical codes
    out["regime_code"] = out["regime_label"].astype("category").cat.codes
    
    # Add risk level
    def get_risk(label):
        return classify_current_regime_risk(str(label)).get("regime_risk_level", "Unknown")
        
    out["regime_risk_level"] = out["regime_label"].apply(get_risk)
    
    # probability feature
    out["regime_probability_feature"] = out["regime_probability"].fillna(0.0)
    
    return out

def adjust_signal_for_regime(
    institutional_signal: Dict[str, Any],
    current_regime_summary: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Adjust signal confidence based on the current market regime.
    """
    out = institutional_signal.copy()
    
    original_signal = institutional_signal.get("signal", "Neutral")
    original_conf = institutional_signal.get("research_confidence", "Low")
    
    regime = current_regime_summary.get("current_regime", "Unknown")
    risk_info = classify_current_regime_risk(regime)
    adj = risk_info.get("regime_confidence_adjustment", 0.0)
    
    # Base heuristic logic
    adjusted_signal = original_signal
    reason = "No adjustment needed based on current regime."
    
    if regime == "Stress / Selloff":
        if original_signal == "Bullish":
            adjusted_signal = "Neutral"
            reason = "Bullish signal suppressed due to Stress / Selloff regime (High Risk)."
        elif original_signal == "Bearish":
            reason = "Bearish signal aligns with Stress / Selloff regime."
            
    elif regime == "High-Vol Bearish":
        if original_signal == "Bullish":
            reason = "Bullish signal confidence reduced due to High-Vol Bearish regime."
            if original_conf in ["Low", "Medium"]:
                adjusted_signal = "Neutral"
                reason += " Signal downgraded to Neutral."
                
    elif regime == "Low-Vol Bullish":
        if original_signal == "Bullish":
            reason = "Bullish signal supported by Low-Vol Bullish regime."
        elif original_signal == "Bearish":
            reason = "Bearish signal contradicts stable Low-Vol Bullish regime. Exercise caution."
            
    elif regime == "Sideways / Choppy":
        if original_signal != "Neutral":
            reason = "Directional signal confidence reduced due to Sideways / Choppy regime."
            if original_conf == "Low":
                adjusted_signal = "Neutral"
                reason += " Signal downgraded to Neutral."
                
    out["regime_adjusted_signal"] = adjusted_signal
    
    # Simple confidence level downgrade logic if signal was downgraded
    if adjusted_signal == "Neutral" and original_signal != "Neutral":
        out["regime_adjusted_confidence"] = "Low"
    else:
        # Or map numerical probabilities if they exist
        out["regime_adjusted_confidence"] = original_conf
        
    out["regime_adjustment_reason"] = reason
    out["original_signal"] = original_signal
    out["current_regime"] = regime
    
    return out
