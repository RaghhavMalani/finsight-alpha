"""Monte Carlo Simulation module using Geometric Brownian Motion."""

from __future__ import annotations

import numpy as np
import pandas as pd


def simulate_gbm_paths(
    S0: float,
    mu: float,
    sigma: float,
    T: float,
    steps: int = 252,
    n_simulations: int = 10000,
    random_seed: int | None = None
) -> pd.DataFrame:
    """Simulate asset price paths using Geometric Brownian Motion (GBM).
    
    Formula:
    S_{t+1} = S_t * exp((mu - 0.5 * sigma^2) * dt + sigma * sqrt(dt) * Z)
    """
    if S0 <= 0:
        raise ValueError(f"Initial price S0 must be strictly positive, got {S0}")
    if sigma < 0:
        raise ValueError(f"Volatility sigma cannot be negative, got {sigma}")
    if T <= 0:
        raise ValueError(f"Time horizon T must be strictly positive, got {T}")
    if steps <= 0:
        raise ValueError(f"Number of steps must be strictly positive, got {steps}")
    if n_simulations <= 0:
        raise ValueError(f"Number of simulations must be strictly positive, got {n_simulations}")

    if random_seed is not None:
        np.random.seed(random_seed)

    dt = T / steps
    
    # Generate random shocks Z ~ N(0, 1)
    # Shape: (steps, n_simulations)
    Z = np.random.standard_normal((steps, n_simulations))
    
    # Pre-calculate the drift part
    drift = (mu - 0.5 * sigma**2) * dt
    
    # Calculate daily returns: exp(drift + shock)
    daily_returns = np.exp(drift + sigma * np.sqrt(dt) * Z)
    
    # Create the paths matrix where row 0 is S0
    paths = np.zeros((steps + 1, n_simulations))
    paths[0] = S0
    
    # We can use cumulative product across rows instead of a slow loop
    paths[1:] = S0 * np.cumprod(daily_returns, axis=0)
    
    # Create column names Sim_1, Sim_2, etc.
    cols = [f"Sim_{i+1}" for i in range(n_simulations)]
    return pd.DataFrame(paths, columns=cols)


def calculate_final_prices(paths: pd.DataFrame) -> pd.Series:
    """Return the last row of simulated prices."""
    return paths.iloc[-1]


def calculate_simulated_returns(final_prices: pd.Series, initial_price: float) -> pd.Series:
    """Calculate the total percentage return for each simulated path."""
    return (final_prices / initial_price) - 1.0


def calculate_probability_of_loss(simulated_returns: pd.Series) -> float:
    """Calculate the probability of loss (return < 0)."""
    return float(np.sum(simulated_returns < 0) / len(simulated_returns))


def calculate_simulation_summary(paths: pd.DataFrame, initial_price: float) -> dict:
    """Generate a summary of the simulation results."""
    final_prices = calculate_final_prices(paths)
    returns = calculate_simulated_returns(final_prices, initial_price)
    
    return {
        "initial_price": initial_price,
        "expected_final_price": final_prices.mean(),
        "median_final_price": final_prices.median(),
        "min_final_price": final_prices.min(),
        "max_final_price": final_prices.max(),
        "probability_of_loss": calculate_probability_of_loss(returns),
        "expected_return": returns.mean(),
        "median_return": returns.median(),
        "worst_return": returns.min(),
        "best_return": returns.max(),
        "num_simulations": paths.shape[1],
        "num_steps": paths.shape[0] - 1
    }
