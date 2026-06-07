"""Black-Scholes-Merton option pricing engine.

Provides pricing, Greeks, and implied volatility calculations for European options.
Inputs should be provided in annualized decimal form.
"""

from __future__ import annotations

import numpy as np
import scipy.stats as stats
import scipy.optimize as optimize


def _validate_inputs(S: float, K: float, T: float, sigma: float, option_type: str = "call") -> None:
    """Validate common Black-Scholes inputs."""
    if S <= 0:
        raise ValueError(f"Spot price S must be strictly positive, got {S}")
    if K <= 0:
        raise ValueError(f"Strike price K must be strictly positive, got {K}")
    if T <= 0:
        raise ValueError(f"Time to maturity T must be strictly positive, got {T}")
    if sigma <= 0:
        raise ValueError(f"Volatility sigma must be strictly positive, got {sigma}")
    if option_type not in ["call", "put"]:
        raise ValueError(f"option_type must be 'call' or 'put', got {option_type}")


def calculate_d1(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate d1 in the Black-Scholes model.
    
    Formula:
    d1 = [ln(S/K) + (r - q + 0.5 * sigma^2) * T] / [sigma * sqrt(T)]
    """
    _validate_inputs(S, K, T, sigma)
    return (np.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))


def calculate_d2(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate d2 in the Black-Scholes model.
    
    Formula:
    d2 = d1 - sigma * sqrt(T)
    """
    d1 = calculate_d1(S, K, T, r, sigma, q)
    return d1 - sigma * np.sqrt(T)


def black_scholes_call_price(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate the Black-Scholes price for a European call option.
    
    Formula:
    C = S * exp(-qT) * N(d1) - K * exp(-rT) * N(d2)
    """
    d1 = calculate_d1(S, K, T, r, sigma, q)
    d2 = calculate_d2(S, K, T, r, sigma, q)
    return S * np.exp(-q * T) * stats.norm.cdf(d1) - K * np.exp(-r * T) * stats.norm.cdf(d2)


def black_scholes_put_price(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate the Black-Scholes price for a European put option.
    
    Formula:
    P = K * exp(-rT) * N(-d2) - S * exp(-qT) * N(-d1)
    """
    d1 = calculate_d1(S, K, T, r, sigma, q)
    d2 = calculate_d2(S, K, T, r, sigma, q)
    return K * np.exp(-r * T) * stats.norm.cdf(-d2) - S * np.exp(-q * T) * stats.norm.cdf(-d1)


def calculate_option_price(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0, option_type: str = "call") -> float:
    """Calculate the Black-Scholes option price for a call or put."""
    _validate_inputs(S, K, T, sigma, option_type)
    if option_type == "call":
        return black_scholes_call_price(S, K, T, r, sigma, q)
    else:
        return black_scholes_put_price(S, K, T, r, sigma, q)


def calculate_delta(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0, option_type: str = "call") -> float:
    """Calculate Delta for an option.
    
    Formula:
    Delta_call = exp(-qT) * N(d1)
    Delta_put = exp(-qT) * [N(d1) - 1]
    """
    _validate_inputs(S, K, T, sigma, option_type)
    d1 = calculate_d1(S, K, T, r, sigma, q)
    if option_type == "call":
        return np.exp(-q * T) * stats.norm.cdf(d1)
    else:
        return np.exp(-q * T) * (stats.norm.cdf(d1) - 1.0)


def calculate_gamma(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0, option_type: str = "call") -> float:
    """Calculate Gamma for an option.
    
    Formula:
    Gamma = exp(-qT) * N'(d1) / [S * sigma * sqrt(T)]
    Note: Gamma is identical for both calls and puts.
    """
    _validate_inputs(S, K, T, sigma, option_type)
    d1 = calculate_d1(S, K, T, r, sigma, q)
    return np.exp(-q * T) * stats.norm.pdf(d1) / (S * sigma * np.sqrt(T))


def calculate_vega(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0, option_type: str = "call") -> float:
    """Calculate Vega for an option.
    
    Formula:
    Vega = S * exp(-qT) * N'(d1) * sqrt(T)
    Note: Vega is identical for both calls and puts.
    """
    _validate_inputs(S, K, T, sigma, option_type)
    d1 = calculate_d1(S, K, T, r, sigma, q)
    return S * np.exp(-q * T) * stats.norm.pdf(d1) * np.sqrt(T)


def calculate_theta(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0, option_type: str = "call") -> float:
    """Calculate Theta for an option.
    
    Formula:
    Theta_call = -[S * exp(-qT) * N'(d1) * sigma] / [2 * sqrt(T)] - rK * exp(-rT) * N(d2) + qS * exp(-qT) * N(d1)
    Theta_put = -[S * exp(-qT) * N'(d1) * sigma] / [2 * sqrt(T)] + rK * exp(-rT) * N(-d2) - qS * exp(-qT) * N(-d1)
    """
    _validate_inputs(S, K, T, sigma, option_type)
    d1 = calculate_d1(S, K, T, r, sigma, q)
    d2 = calculate_d2(S, K, T, r, sigma, q)
    
    term1 = -(S * np.exp(-q * T) * stats.norm.pdf(d1) * sigma) / (2.0 * np.sqrt(T))
    
    if option_type == "call":
        return term1 - r * K * np.exp(-r * T) * stats.norm.cdf(d2) + q * S * np.exp(-q * T) * stats.norm.cdf(d1)
    else:
        return term1 + r * K * np.exp(-r * T) * stats.norm.cdf(-d2) - q * S * np.exp(-q * T) * stats.norm.cdf(-d1)


def calculate_rho(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0, option_type: str = "call") -> float:
    """Calculate Rho for an option.
    
    Formula:
    Rho_call = K * T * exp(-rT) * N(d2)
    Rho_put = -K * T * exp(-rT) * N(-d2)
    """
    _validate_inputs(S, K, T, sigma, option_type)
    d2 = calculate_d2(S, K, T, r, sigma, q)
    if option_type == "call":
        return K * T * np.exp(-r * T) * stats.norm.cdf(d2)
    else:
        return -K * T * np.exp(-r * T) * stats.norm.cdf(-d2)


def calculate_all_greeks(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0, option_type: str = "call") -> dict[str, float]:
    """Calculate all standard Greeks for an option and return them in a dictionary.
    
    Returns standard raw forms of Greeks. Also calculates user-friendly scaled versions.
    """
    delta = calculate_delta(S, K, T, r, sigma, q, option_type)
    gamma = calculate_gamma(S, K, T, r, sigma, q, option_type)
    vega = calculate_vega(S, K, T, r, sigma, q, option_type)
    theta = calculate_theta(S, K, T, r, sigma, q, option_type)
    rho = calculate_rho(S, K, T, r, sigma, q, option_type)
    
    return {
        "delta": delta,
        "gamma": gamma,
        "vega": vega,
        "theta": theta,
        "rho": rho,
        "vega_per_1_pct": vega / 100.0,
        "theta_per_day": theta / 365.0,
        "rho_per_1_pct": rho / 100.0
    }


def calculate_implied_volatility(
    market_price: float,
    S: float,
    K: float,
    T: float,
    r: float,
    q: float = 0.0,
    option_type: str = "call",
    lower_bound: float = 0.0001,
    upper_bound: float = 5.0
) -> float:
    """Calculate the implied volatility given a market option price.
    
    Uses Brent's method to find the volatility that makes the Black-Scholes
    theoretical price equal to the market price.
    """
    if market_price <= 0:
        return np.nan
        
    try:
        _validate_inputs(S, K, T, 0.1, option_type) # Arbitrary sigma just to pass initial validation
    except ValueError:
        return np.nan

    def objective_function(sigma: float) -> float:
        return calculate_option_price(S, K, T, r, sigma, q, option_type) - market_price

    try:
        implied_vol = optimize.brentq(objective_function, a=lower_bound, b=upper_bound)
        return float(implied_vol)
    except (ValueError, RuntimeError):
        # brentq raises ValueError if root is not bracketed.
        return np.nan
