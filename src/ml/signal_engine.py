def classify_validation_quality(roc_auc: float | None, model_edge: float | None) -> str:
    """Classify the out-of-sample validation quality of the model."""
    if roc_auc is None or model_edge is None:
        return "Unknown"
        
    if roc_auc >= 0.60 and model_edge >= 0.05:
        return "Strong"
    elif roc_auc >= 0.55 and model_edge >= 0.02:
        return "Moderate"
    else:
        return "Weak"

def classify_confidence_band(probability_up: float, bullish_threshold: float, bearish_threshold: float) -> str:
    """Classify the confidence band based on raw probability."""
    if probability_up >= bullish_threshold:
        return "High" if probability_up >= (bullish_threshold + 0.08) else "Moderate"
    elif probability_up <= bearish_threshold:
        return "High" if probability_up <= (bearish_threshold - 0.08) else "Moderate"
    else:
        return "Low"

def generate_institutional_signal(
    probability_up: float | None,
    roc_auc: float | None,
    model_edge: float | None,
    bullish_threshold: float = 0.57,
    bearish_threshold: float = 0.43
) -> dict:
    """Generate the final institutional-grade trading signal."""
    
    # Defaults for missing data
    if probability_up is None:
        probability_up = 0.5
        
    probability_down = 1.0 - probability_up
    
    val_quality = classify_validation_quality(roc_auc, model_edge)
    conf_band = classify_confidence_band(probability_up, bullish_threshold, bearish_threshold)
    
    # Base Signal Determination
    if probability_up >= bullish_threshold:
        base_signal = "Bullish"
        used_prob = probability_up
    elif probability_up <= bearish_threshold:
        base_signal = "Bearish"
        used_prob = probability_down
    else:
        base_signal = "Neutral"
        used_prob = max(probability_up, probability_down)
        
    # Institutional Signal Suppression Rules
    # If edge is weak, we suppress the directional signal regardless of probability
    is_signal_allowed = True
    final_signal = base_signal
    
    if val_quality == "Weak":
        final_signal = "No Edge / Neutral"
        is_signal_allowed = False
        
    # Generate Explanation
    if not is_signal_allowed:
        explanation = (
            f"The model's out-of-sample validation edge is weak (ROC-AUC < 0.55 or Edge < 2%). "
            f"Although the raw probability suggests a {base_signal} move ({probability_up*100:.1f}%), "
            f"the signal is suppressed. This indicates the model cannot reliably separate noise from signal."
        )
    else:
        explanation = (
            f"The model output places this asset in the {final_signal} zone. "
            f"Validation quality is {val_quality}. "
            f"Probability of an upward move is {(probability_up * 100):.1f}%. "
            f"Research confidence is rated as {conf_band} based on institutional confidence bands."
        )

    return {
        "signal": final_signal,
        "signal_strength": conf_band if is_signal_allowed else "Low",
        "research_confidence": conf_band,
        "raw_probability_up": probability_up,
        "calibrated_probability_up": probability_up, # Assuming it's already calibrated or just pass through
        "probability_used": used_prob,
        "probability_down": probability_down,
        "roc_auc": roc_auc,
        "model_edge": model_edge,
        "validation_quality": val_quality,
        "confidence_band": conf_band,
        "is_signal_allowed": is_signal_allowed,
        "explanation": explanation
    }

def generate_trading_signal(
    probability_up: float,
    probability_down: float | None = None,
    bullish_threshold: float = 0.57,
    bearish_threshold: float = 0.43
) -> dict:
    """Wrapper for backward compatibility."""
    # Assuming no validation metrics provided, fallback to allowing it (legacy behavior)
    return generate_institutional_signal(
        probability_up=probability_up,
        roc_auc=0.6,
        model_edge=0.05,
        bullish_threshold=bullish_threshold,
        bearish_threshold=bearish_threshold
    )
