"""Unit tests for Black-Scholes option pricing engine."""

from __future__ import annotations

import numpy as np
import pytest

from src.pricing import black_scholes


def test_call_price_is_positive() -> None:
    price = black_scholes.calculate_option_price(S=100.0, K=100.0, T=1.0, r=0.05, sigma=0.20, q=0.0, option_type="call")
    assert price > 0


def test_put_price_is_positive() -> None:
    price = black_scholes.calculate_option_price(S=100.0, K=100.0, T=1.0, r=0.05, sigma=0.20, q=0.0, option_type="put")
    assert price > 0


def test_call_delta_bounds() -> None:
    delta = black_scholes.calculate_delta(S=100.0, K=100.0, T=1.0, r=0.05, sigma=0.20, q=0.0, option_type="call")
    assert 0.0 < delta < 1.0


def test_put_delta_bounds() -> None:
    delta = black_scholes.calculate_delta(S=100.0, K=100.0, T=1.0, r=0.05, sigma=0.20, q=0.0, option_type="put")
    assert -1.0 < delta < 0.0


def test_gamma_is_positive() -> None:
    gamma = black_scholes.calculate_gamma(S=100.0, K=100.0, T=1.0, r=0.05, sigma=0.20, q=0.0, option_type="call")
    assert gamma > 0


def test_vega_is_positive() -> None:
    vega = black_scholes.calculate_vega(S=100.0, K=100.0, T=1.0, r=0.05, sigma=0.20, q=0.0, option_type="call")
    assert vega > 0


def test_implied_volatility_recovers_sigma() -> None:
    original_sigma = 0.20
    call_price = black_scholes.calculate_option_price(S=100.0, K=100.0, T=1.0, r=0.05, sigma=original_sigma, q=0.0, option_type="call")
    
    implied_vol = black_scholes.calculate_implied_volatility(
        market_price=call_price,
        S=100.0,
        K=100.0,
        T=1.0,
        r=0.05,
        q=0.0,
        option_type="call"
    )
    
    assert np.isclose(implied_vol, original_sigma, rtol=1e-4)


def test_input_validation() -> None:
    with pytest.raises(ValueError):
        black_scholes.calculate_option_price(S=-100.0, K=100.0, T=1.0, r=0.05, sigma=0.20, option_type="call")
    with pytest.raises(ValueError):
        black_scholes.calculate_option_price(S=100.0, K=-100.0, T=1.0, r=0.05, sigma=0.20, option_type="call")
    with pytest.raises(ValueError):
        black_scholes.calculate_option_price(S=100.0, K=100.0, T=-1.0, r=0.05, sigma=0.20, option_type="call")
    with pytest.raises(ValueError):
        black_scholes.calculate_option_price(S=100.0, K=100.0, T=1.0, r=0.05, sigma=-0.20, option_type="call")
    with pytest.raises(ValueError):
        black_scholes.calculate_option_price(S=100.0, K=100.0, T=1.0, r=0.05, sigma=0.20, option_type="invalid_type")
