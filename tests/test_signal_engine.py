import pytest
from src.ml import signal_engine

def test_generate_trading_signal_bullish():
    res = signal_engine.generate_trading_signal(
        probability_up=0.60,
        bullish_threshold=0.57,
        bearish_threshold=0.43
    )
    assert res["signal"] == "Bullish"
    assert res["signal_strength"] == "Moderate"

def test_generate_trading_signal_strong_bullish():
    res = signal_engine.generate_trading_signal(
        probability_up=0.80,
        bullish_threshold=0.57,
        bearish_threshold=0.43
    )
    assert res["signal"] == "Bullish"
    assert res["signal_strength"] == "High"

def test_generate_trading_signal_bearish():
    res = signal_engine.generate_trading_signal(
        probability_up=0.40,
        bullish_threshold=0.57,
        bearish_threshold=0.43
    )
    assert res["signal"] == "Bearish"
    assert res["signal_strength"] == "Moderate"

def test_generate_trading_signal_strong_bearish():
    res = signal_engine.generate_trading_signal(
        probability_up=0.20,
        bullish_threshold=0.57,
        bearish_threshold=0.43
    )
    assert res["signal"] == "Bearish"
    assert res["signal_strength"] == "High"

def test_generate_trading_signal_neutral():
    res = signal_engine.generate_trading_signal(
        probability_up=0.50,
        bullish_threshold=0.57,
        bearish_threshold=0.43
    )
    assert res["signal"] == "Neutral"
    assert res["signal_strength"] == "Low"
