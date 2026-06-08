"""Plotly visualizations for Monte Carlo simulation and risk."""

import numpy as np
import pandas as pd
import plotly.graph_objects as go

from src.visualization.theme import apply_plotly_theme


def plot_monte_carlo_paths(paths: pd.DataFrame, max_paths: int = 100) -> go.Figure:
    """Plot Monte Carlo simulation paths.
    
    Limits to max_paths to avoid clutter and performance issues.
    """
    fig = go.Figure()
    
    # Select a subset if paths exceed max_paths
    cols_to_plot = paths.columns[:max_paths]
    
    for col in cols_to_plot:
        fig.add_trace(go.Scatter(
            y=paths[col],
            mode="lines",
            line=dict(width=1, color="rgba(31, 119, 180, 0.1)"),
            showlegend=False,
            hoverinfo="skip"
        ))
        
    return apply_plotly_theme(
        fig,
        title=f"Monte Carlo Simulated Paths ({len(cols_to_plot)} displayed)",
        xaxis_title="Time Steps",
        yaxis_title="Asset Price"
    )


def plot_final_price_distribution(final_prices: pd.Series) -> go.Figure:
    """Plot a histogram of the final simulated prices."""
    fig = go.Figure()
    
    fig.add_trace(go.Histogram(
        x=final_prices,
        nbinsx=50,
        marker_color="#1f77b4",
        opacity=0.7,
        name="Final Prices"
    ))
    
    mean_price = final_prices.mean()
    median_price = final_prices.median()
    
    fig.add_vline(x=mean_price, line_dash="dash", line_color="green", annotation_text="Mean")
    fig.add_vline(x=median_price, line_dash="dot", line_color="yellow", annotation_text="Median")
    
    return apply_plotly_theme(
        fig,
        title="Final Price Distribution",
        xaxis_title="Price",
        yaxis_title="Frequency"
    )


def plot_simulated_return_distribution(simulated_returns: pd.Series) -> go.Figure:
    """Plot a histogram of simulated returns."""
    fig = go.Figure()
    
    fig.add_trace(go.Histogram(
        x=simulated_returns,
        nbinsx=50,
        marker_color="#ff7f0e",
        opacity=0.7,
        name="Simulated Returns"
    ))
    
    fig.update_layout(xaxis_tickformat=".1%")
    
    return apply_plotly_theme(
        fig,
        title="Simulated Returns Distribution",
        xaxis_title="Return",
        yaxis_title="Frequency"
    )


def plot_var_cvar_histogram(
    simulated_returns: pd.Series,
    var_value: float,
    cvar_value: float,
    confidence_level: float = 0.95
) -> go.Figure:
    """Plot simulated returns histogram highlighting VaR and CVaR cutoffs."""
    fig = go.Figure()
    
    # Histogram
    fig.add_trace(go.Histogram(
        x=simulated_returns,
        nbinsx=50,
        marker_color="gray",
        opacity=0.6,
        name="Returns"
    ))
    
    # Note: VaR and CVaR are passed as positive loss numbers. We plot them as negative returns.
    var_threshold = -var_value
    cvar_threshold = -cvar_value
    
    fig.add_vline(
        x=var_threshold, 
        line_dash="dash", 
        line_color="red", 
        annotation_text=f"VaR ({confidence_level*100:.0f}%)"
    )
    
    fig.add_vline(
        x=cvar_threshold, 
        line_dash="solid", 
        line_color="darkred", 
        annotation_text=f"CVaR ({confidence_level*100:.0f}%)"
    )
    
    fig.update_layout(xaxis_tickformat=".1%")
    
    return apply_plotly_theme(
        fig,
        title="Tail Risk: VaR and CVaR",
        xaxis_title="Return",
        yaxis_title="Frequency"
    )


def plot_percentile_fan_chart(paths: pd.DataFrame) -> go.Figure:
    """Plot a fan chart of simulation percentiles across time."""
    fig = go.Figure()
    
    # Calculate percentiles across rows (time steps)
    p05 = paths.quantile(0.05, axis=1)
    p25 = paths.quantile(0.25, axis=1)
    p50 = paths.quantile(0.50, axis=1)
    p75 = paths.quantile(0.75, axis=1)
    p95 = paths.quantile(0.95, axis=1)
    
    time_steps = paths.index.tolist()
    time_steps_rev = time_steps[::-1]
    
    # Plot outer band (5% to 95%)
    fig.add_trace(go.Scatter(
        x=time_steps + time_steps_rev,
        y=p95.tolist() + p05.tolist()[::-1],
        fill='toself',
        fillcolor='rgba(31, 119, 180, 0.1)',
        line=dict(color='rgba(255,255,255,0)'),
        name='5%-95% Range',
        showlegend=True
    ))
    
    # Plot inner band (25% to 75%)
    fig.add_trace(go.Scatter(
        x=time_steps + time_steps_rev,
        y=p75.tolist() + p25.tolist()[::-1],
        fill='toself',
        fillcolor='rgba(31, 119, 180, 0.3)',
        line=dict(color='rgba(255,255,255,0)'),
        name='25%-75% Range',
        showlegend=True
    ))
    
    # Plot Median
    fig.add_trace(go.Scatter(
        x=time_steps,
        y=p50.tolist(),
        line=dict(color='white', width=2),
        name='Median (50%)'
    ))
    
    return apply_plotly_theme(
        fig,
        title="Simulation Percentile Fan Chart",
        xaxis_title="Time Steps",
        yaxis_title="Asset Price"
    )
