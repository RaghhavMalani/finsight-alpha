def generate_trading_signal(
    probability_up: float,
    probability_down: float | None = None,
    bullish_threshold: float = 0.57,
    bearish_threshold: float = 0.43
) -> dict:
    """Generate a professional trading signal based on model probability.
    
    Args:
        probability_up: Predicted probability of positive class (Up).
        probability_down: Optional predicted probability of negative class (Down).
        bullish_threshold: Threshold above which signal is Bullish.
        bearish_threshold: Threshold below which signal is Bearish.
        
    Returns:
        Dictionary with signal, strength, probabilities, confidence band, and explanation.
    """
    if probability_down is None:
        probability_down = 1.0 - probability_up

    # Determine Signal and Strength
    if probability_up >= bullish_threshold:
        signal = "Bullish"
        signal_strength = "High" if probability_up >= 0.65 else "Moderate"
        confidence_band = f"{(probability_up * 100):.1f}%"
    elif probability_up <= bearish_threshold:
        signal = "Bearish"
        signal_strength = "High" if probability_up <= 0.35 else "Moderate"
        # For bearish, the model's confidence in the downward move is (1 - prob_up)
        confidence_band = f"{(probability_down * 100):.1f}%"
    else:
        signal = "Neutral"
        signal_strength = "Low"
        # Confidence is just the highest of the two, but within neutral zone
        max_prob = max(probability_up, probability_down)
        confidence_band = f"{(max_prob * 100):.1f}%"

    # Generate Professional Explanation
    explanation = (
        f"The model output places this asset in the {signal} zone. "
        f"Probability of an upward move is {(probability_up * 100):.1f}%. "
        f"Signal strength is rated as {signal_strength} based on standard institutional confidence bands."
    )

    return {
        "signal": signal,
        "signal_strength": signal_strength,
        "probability_up": probability_up,
        "probability_down": probability_down,
        "confidence_band": confidence_band,
        "explanation": explanation
    }
