"""Value-at-Risk (VaR) and Conditional Value-at-Risk (CVaR) Risk Engine."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm


def calculate_historical_var(returns: pd.Series, confidence_level: float = 0.95) -> float:
    """Calculate Historical Value-at-Risk.
    
    Returns are assumed to be a pandas Series of percentage returns (decimals).
    Output is a positive float representing the tail loss.
    """
    returns = returns.dropna()
    if len(returns) == 0:
        return np.nan
        
    alpha = 1.0 - confidence_level
    percentile_return = returns.quantile(alpha)
    
    # Return positive value representing loss
    return max(0.0, -percentile_return)


def calculate_historical_cvar(returns: pd.Series, confidence_level: float = 0.95) -> float:
    """Calculate Historical Conditional Value-at-Risk (Expected Shortfall).
    
    Output is a positive float representing the average loss of the tail.
    """
    returns = returns.dropna()
    if len(returns) == 0:
        return np.nan
        
    alpha = 1.0 - confidence_level
    percentile_return = returns.quantile(alpha)
    
    # Tail losses are returns <= percentile_return
    tail_losses = returns[returns <= percentile_return]
    
    if len(tail_losses) == 0:
        return np.nan
        
    cvar = tail_losses.mean()
    
    # Return positive value representing expected shortfall
    return max(0.0, -cvar)


def calculate_parametric_var(returns: pd.Series, confidence_level: float = 0.95) -> float:
    """Calculate Parametric (Normal) Value-at-Risk.
    
    Formula: VaR = -(mean_return + z_alpha * std_return)
    Output is a positive float representing the loss.
    """
    returns = returns.dropna()
    if len(returns) == 0:
        return np.nan
        
    mean_return = returns.mean()
    std_return = returns.std()
    
    alpha = 1.0 - confidence_level
    z_alpha = norm.ppf(alpha)
    
    var = -(mean_return + z_alpha * std_return)
    return max(0.0, float(var))


def calculate_parametric_cvar(returns: pd.Series, confidence_level: float = 0.95) -> float:
    """Calculate Parametric (Normal) Conditional Value-at-Risk (Expected Shortfall).
    
    Formula: CVaR = -(mean_return - std_return * norm.pdf(z_alpha) / alpha)
    Output is a positive float representing the loss.
    """
    returns = returns.dropna()
    if len(returns) == 0:
        return np.nan
        
    mean_return = returns.mean()
    std_return = returns.std()
    
    alpha = 1.0 - confidence_level
    z_alpha = norm.ppf(alpha)
    
    cvar = -(mean_return - std_return * norm.pdf(z_alpha) / alpha)
    return max(0.0, float(cvar))


def calculate_monte_carlo_var(simulated_returns: pd.Series, confidence_level: float = 0.95) -> float:
    """Calculate Monte Carlo Value-at-Risk."""
    return calculate_historical_var(simulated_returns, confidence_level)


def calculate_monte_carlo_cvar(simulated_returns: pd.Series, confidence_level: float = 0.95) -> float:
    """Calculate Monte Carlo Conditional Value-at-Risk."""
    return calculate_historical_cvar(simulated_returns, confidence_level)


def calculate_var_cvar_summary(
    historical_returns: pd.Series | None = None,
    simulated_returns: pd.Series | None = None,
    confidence_level: float = 0.95
) -> dict:
    """Generate a summary dictionary of all VaR and CVaR calculations."""
    
    hist_var = np.nan
    hist_cvar = np.nan
    param_var = np.nan
    param_cvar = np.nan
    mc_var = np.nan
    mc_cvar = np.nan
    
    if historical_returns is not None and not historical_returns.empty:
        hist_var = calculate_historical_var(historical_returns, confidence_level)
        hist_cvar = calculate_historical_cvar(historical_returns, confidence_level)
        param_var = calculate_parametric_var(historical_returns, confidence_level)
        param_cvar = calculate_parametric_cvar(historical_returns, confidence_level)
        
    if simulated_returns is not None and not simulated_returns.empty:
        mc_var = calculate_monte_carlo_var(simulated_returns, confidence_level)
        mc_cvar = calculate_monte_carlo_cvar(simulated_returns, confidence_level)

    return {
        "confidence_level": confidence_level,
        "historical_var": hist_var,
        "historical_cvar": hist_cvar,
        "parametric_var": param_var,
        "parametric_cvar": param_cvar,
        "monte_carlo_var": mc_var,
        "monte_carlo_cvar": mc_cvar
    }
