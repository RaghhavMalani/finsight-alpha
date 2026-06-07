"""Visualizations for Option Pricing.

Plotly charts showing how option prices and Greeks change with underlying variables.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from src.pricing import black_scholes
from src.visualization.theme import apply_plotly_theme


def plot_option_price_vs_spot(
    S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0, option_type: str = "call"
) -> go.Figure:
    """Plot the option price as the spot price changes.
    
    Generates a range of spot prices around the current spot price S (e.g. +/- 50%)
    and calculates the option price for each. Also plots the payoff at expiry.
    """
    spot_range = np.linspace(max(1.0, S * 0.5), S * 1.5, 100)
    prices = [black_scholes.calculate_option_price(spot, K, T, r, sigma, q, option_type) for spot in spot_range]
    
    # Payoff at expiry
    if option_type == "call":
        payoff = np.maximum(spot_range - K, 0)
    else:
        payoff = np.maximum(K - spot_range, 0)
        
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=spot_range, y=prices,
        mode="lines",
        name=f"Price ({T}y to expiry)",
        line=dict(color="#2ca02c", width=3)
    ))
    
    fig.add_trace(go.Scatter(
        x=spot_range, y=payoff,
        mode="lines",
        name="Payoff at Expiry",
        line=dict(color="#7f7f7f", width=2, dash="dash")
    ))
    
    # Mark current spot
    current_price = black_scholes.calculate_option_price(S, K, T, r, sigma, q, option_type)
    fig.add_trace(go.Scatter(
        x=[S], y=[current_price],
        mode="markers",
        name="Current Spot",
        marker=dict(color="red", size=10, symbol="circle")
    ))

    return apply_plotly_theme(
        fig,
        title=f"{option_type.capitalize()} Option Price vs Spot Price",
        xaxis_title="Spot Price",
        yaxis_title="Option Price",
    )


def plot_option_price_vs_volatility(
    S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0, option_type: str = "call"
) -> go.Figure:
    """Plot the option price as implied volatility changes.
    
    Generates a range of volatilities from 1% to 100%.
    """
    vol_range = np.linspace(0.01, 1.0, 100)
    prices = [black_scholes.calculate_option_price(S, K, T, r, v, q, option_type) for v in vol_range]
    
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=vol_range, y=prices,
        mode="lines",
        name="Option Price",
        line=dict(color="#1f77b4", width=3)
    ))
    
    current_price = black_scholes.calculate_option_price(S, K, T, r, sigma, q, option_type)
    fig.add_trace(go.Scatter(
        x=[sigma], y=[current_price],
        mode="markers",
        name="Current Volatility",
        marker=dict(color="red", size=10, symbol="circle")
    ))
    
    fig.update_xaxes(tickformat=".0%")
    return apply_plotly_theme(
        fig,
        title=f"{option_type.capitalize()} Option Price vs Volatility",
        xaxis_title="Volatility (Annualized)",
        yaxis_title="Option Price",
    )


def plot_greeks_vs_spot(
    S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0, option_type: str = "call"
) -> go.Figure:
    """Plot Delta and Gamma as spot price changes."""
    spot_range = np.linspace(max(1.0, S * 0.5), S * 1.5, 100)
    
    deltas = [black_scholes.calculate_delta(spot, K, T, r, sigma, q, option_type) for spot in spot_range]
    gammas = [black_scholes.calculate_gamma(spot, K, T, r, sigma, q, option_type) for spot in spot_range]
    
    from plotly.subplots import make_subplots
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    
    fig.add_trace(
        go.Scatter(x=spot_range, y=deltas, name="Delta", line=dict(color="#1f77b4", width=3)),
        secondary_y=False,
    )
    
    fig.add_trace(
        go.Scatter(x=spot_range, y=gammas, name="Gamma", line=dict(color="#ff7f0e", width=3)),
        secondary_y=True,
    )
    
    fig.update_yaxes(title_text="Delta", secondary_y=False)
    fig.update_yaxes(title_text="Gamma", secondary_y=True)
    
    return apply_plotly_theme(
        fig,
        title=f"Delta and Gamma vs Spot Price ({option_type.capitalize()})",
        xaxis_title="Spot Price",
    )
