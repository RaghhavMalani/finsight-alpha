import pytest
from src.ml.signal_engine import generate_institutional_signal

def test_generate_institutional_signal_strong():
    result = generate_institutional_signal(
        probability_up=0.60,
        roc_auc=0.65,
        model_edge=0.06
    )
    assert result["is_signal_allowed"] is True
    assert result["signal"] == "Bullish"
    assert result["validation_quality"] == "Strong"

def test_generate_institutional_signal_weak_suppression():
    result = generate_institutional_signal(
        probability_up=0.70,  # High probability
        roc_auc=0.52,         # But poor validation edge
        model_edge=0.01
    )
    assert result["is_signal_allowed"] is False
    assert result["signal"] == "No Edge / Neutral"
    assert "suppressed" in result["explanation"]
    
def test_generate_institutional_signal_neutral():
    result = generate_institutional_signal(
        probability_up=0.50,
        roc_auc=0.60,
        model_edge=0.05
    )
    assert result["is_signal_allowed"] is True
    assert result["signal"] == "Neutral"
