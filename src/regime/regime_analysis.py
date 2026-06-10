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
    
    # Calculate Regime Stability (switches in the last 20 days)
    # We find how many times the regime changed in the last 20 rows
    if len(df) >= 20:
        recent_regimes = df.iloc[-20:][regime_col]
        switches = (recent_regimes != recent_regimes.shift(1)).sum() - 1  # -1 because first row is technically a switch from NaN
        if switches < 0: switches = 0
    else:
        switches = 0
        
    stability = "High" if switches <= 2 else ("Medium" if switches <= 4 else "Low")
    
    # Calculate Confidence Quality
    if prob >= 0.90 and current_duration >= 20:
        confidence_quality = "High"
    elif prob >= 0.70:
        confidence_quality = "Medium"
    else:
        confidence_quality = "Low"
    
    return {
        "current_regime": current_regime,
        "current_regime_probability": prob,
        "current_regime_duration": current_duration,
        "current_regime_risk_level": risk_info.get("regime_risk_level", "Unknown"),
        "regime_confidence_quality": confidence_quality,
        "regime_stability": stability,
        "recent_switches_20d": switches,
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

def generate_regime_interpretation(
    current_regime_summary: Dict[str, Any],
    regime_performance_df: pd.DataFrame,
    transition_matrix: pd.DataFrame,
    asset_name: str = "asset"
) -> str:
    """Generate a professional text interpretation of the current market regime."""
    regime = current_regime_summary.get("current_regime", "Unknown")
    prob = current_regime_summary.get("current_regime_probability", 0)
    duration = current_regime_summary.get("current_regime_duration", 0)
    
    # Find historical performance for this regime
    perf = {}
    if not regime_performance_df.empty and regime in regime_performance_df["regime_label"].values:
        perf_row = regime_performance_df[regime_performance_df["regime_label"] == regime].iloc[0]
        perf = {
            "ann_ret": perf_row.get("annualized_return", 0),
            "vol": perf_row.get("annualized_volatility", 0),
            "pos_rate": perf_row.get("positive_day_rate", 0)
        }
        
    prob_text = "high assignment probability" if prob >= 0.8 else ("moderate assignment probability" if prob >= 0.5 else "low assignment probability")
    
    base_text = f"The {asset_name} is currently classified as **{regime}** with {prob_text} and a {duration}-day regime duration. "
    
    if perf:
        ret_desc = "positive" if perf["ann_ret"] > 0 else "negative"
        vol_desc = "high" if perf["vol"] > 0.25 else ("moderate" if perf["vol"] > 0.12 else "low")
        base_text += f"Historically, this regime has shown {ret_desc} annualized returns ({perf['ann_ret']:.1%}), {vol_desc} volatility ({perf['vol']:.1%}), and a {perf['pos_rate']:.1%} positive-day rate. "
        
    # Regime-specific commentary
    if regime == "Stress / Selloff":
        base_text += "This indicates elevated volatility and severe drawdown risk. Directional long signals are generally suppressed or downgraded in this environment."
    elif regime == "Sideways / Choppy":
        base_text += "This indicates weaker directional signal reliability. Mean-reversion strategies may perform better than trend-following."
    elif regime == "Recovery":
        base_text += "This indicates improving returns after a selloff, but uncertainty typically remains elevated."
    elif regime == "High-Vol Bearish":
        base_text += "This indicates a downward trend with high volatility. Caution is advised for long positions."
    elif regime == "Low-Vol Bullish":
        base_text += "This indicates a stable, upward-trending environment where bullish signals have higher historical reliability."
        
    warning = " *However, regime labels are statistical approximations and should be used as context rather than standalone trading signals.*"
    return base_text + warning

def analyze_transition_matrix(
    transition_matrix: pd.DataFrame,
    current_regime: str
) -> Dict[str, Any]:
    """Analyze the transition matrix to extract key stability metrics."""
    if transition_matrix.empty:
        return {}
        
    # Probabilities of staying in the same regime (diagonal)
    diagonal = pd.Series(np.diag(transition_matrix), index=transition_matrix.index)
    
    most_stable = diagonal.idxmax()
    most_stable_prob = diagonal.max()
    
    least_stable = diagonal.idxmin()
    least_stable_prob = diagonal.min()
    
    stay_prob = 0.0
    if current_regime in diagonal:
        stay_prob = diagonal[current_regime]
        
    # Find most likely next regime from current (excluding staying)
    most_likely_next = "Unknown"
    most_likely_next_prob = 0.0
    
    if current_regime in transition_matrix.index:
        row = transition_matrix.loc[current_regime].copy()
        if current_regime in row:
            row.drop(current_regime, inplace=True)
            
        if not row.empty:
            most_likely_next = row.idxmax()
            most_likely_next_prob = row.max()
            
    interpretation = f"The most stable market environment is {most_stable} ({most_stable_prob:.1%} chance to remain). "
    if current_regime != "Unknown":
        interpretation += f"Currently in {current_regime}, there is a {stay_prob:.1%} probability of staying in this state tomorrow, and a {most_likely_next_prob:.1%} probability of transitioning to {most_likely_next}."
        
    return {
        "most_stable_regime": most_stable,
        "most_stable_probability": most_stable_prob,
        "least_stable_regime": least_stable,
        "least_stable_probability": least_stable_prob,
        "current_regime_stay_probability": stay_prob,
        "most_likely_next_regime": most_likely_next,
        "most_likely_next_probability": most_likely_next_prob,
        "interpretation": interpretation
    }
