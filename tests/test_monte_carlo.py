"""Unit tests for Monte Carlo simulation engine."""

import pytest
import numpy as np

from src.simulation import monte_carlo


def test_simulate_gbm_paths_shape() -> None:
    paths = monte_carlo.simulate_gbm_paths(
        S0=100.0,
        mu=0.08,
        sigma=0.2,
        T=1.0,
        steps=252,
        n_simulations=100
    )
    
    assert paths.shape == (253, 100)
    assert np.allclose(paths.iloc[0], 100.0)


def test_final_prices() -> None:
    paths = monte_carlo.simulate_gbm_paths(
        S0=100.0,
        mu=0.08,
        sigma=0.2,
        T=1.0,
        steps=10,
        n_simulations=50
    )
    final_prices = monte_carlo.calculate_final_prices(paths)
    assert len(final_prices) == 50


def test_simulated_returns() -> None:
    paths = monte_carlo.simulate_gbm_paths(
        S0=100.0,
        mu=0.08,
        sigma=0.2,
        T=1.0,
        steps=10,
        n_simulations=50
    )
    final_prices = monte_carlo.calculate_final_prices(paths)
    returns = monte_carlo.calculate_simulated_returns(final_prices, 100.0)
    
    assert len(returns) == 50


def test_probability_of_loss_between_0_and_1() -> None:
    paths = monte_carlo.simulate_gbm_paths(
        S0=100.0,
        mu=0.0,
        sigma=0.2,
        T=1.0,
        steps=10,
        n_simulations=50
    )
    final_prices = monte_carlo.calculate_final_prices(paths)
    returns = monte_carlo.calculate_simulated_returns(final_prices, 100.0)
    prob_loss = monte_carlo.calculate_probability_of_loss(returns)
    
    assert 0.0 <= prob_loss <= 1.0


def test_invalid_simulation_inputs() -> None:
    with pytest.raises(ValueError):
        monte_carlo.simulate_gbm_paths(S0=0, mu=0.05, sigma=0.2, T=1)
        
    with pytest.raises(ValueError):
        monte_carlo.simulate_gbm_paths(S0=100, mu=0.05, sigma=-0.2, T=1)
        
    with pytest.raises(ValueError):
        monte_carlo.simulate_gbm_paths(S0=100, mu=0.05, sigma=0.2, T=-1)
        
    with pytest.raises(ValueError):
        monte_carlo.simulate_gbm_paths(S0=100, mu=0.05, sigma=0.2, T=1, steps=-1)
        
    with pytest.raises(ValueError):
        monte_carlo.simulate_gbm_paths(S0=100, mu=0.05, sigma=0.2, T=1, n_simulations=0)
