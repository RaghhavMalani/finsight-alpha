"""Visualization helpers for exploratory financial analysis.

These functions use Plotly (interactive, great for notebooks). Each function
returns the :class:`plotly.graph_objects.Figure` so the caller can ``.show()`` it,
save it, or embed it - the function never forces display side effects.
"""

from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go

from src import config
from src.analytics import metrics


def plot_price_history(
    prices: pd.Series,
    title: str = "Price History",
) -> go.Figure:
    """Plot a price series over time.

    Parameters
    ----------
    prices:
        Price series indexed by date.
    title:
        Chart title (typically the ticker name).

    Returns
    -------
    plotly.graph_objects.Figure
    """
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(x=prices.index, y=prices.values, mode="lines", name="Close")
    )
    fig.update_layout(
        title=title,
        xaxis_title="Date",
        yaxis_title="Price",
        template="plotly_white",
    )
    return fig


def plot_cumulative_returns(
    returns: pd.Series,
    title: str = "Cumulative Returns",
) -> go.Figure:
    """Plot cumulative (compounded) returns as a percentage growth curve.

    Parameters
    ----------
    returns:
        Series of **simple** returns.
    title:
        Chart title.

    Returns
    -------
    plotly.graph_objects.Figure
    """
    cumulative = metrics.calculate_cumulative_returns(returns)
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=cumulative.index,
            y=cumulative.values * 100.0,  # show as a percentage
            mode="lines",
            name="Cumulative Return (%)",
        )
    )
    fig.update_layout(
        title=title,
        xaxis_title="Date",
        yaxis_title="Cumulative Return (%)",
        template="plotly_white",
    )
    return fig


def plot_rolling_volatility(
    returns: pd.Series,
    window: int = config.DEFAULT_VOLATILITY_WINDOW,
    title: str = "Rolling Volatility (Annualized)",
) -> go.Figure:
    """Plot rolling annualised volatility.

    Parameters
    ----------
    returns:
        Series of returns.
    window:
        Rolling window length in trading days.
    title:
        Chart title.

    Returns
    -------
    plotly.graph_objects.Figure
    """
    vol = metrics.calculate_rolling_volatility(returns, window=window)
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=vol.index,
            y=vol.values * 100.0,  # show as a percentage
            mode="lines",
            name=f"{window}-day Volatility (%)",
        )
    )
    fig.update_layout(
        title=title,
        xaxis_title="Date",
        yaxis_title="Annualized Volatility (%)",
        template="plotly_white",
    )
    return fig


def plot_drawdown(
    prices: pd.Series,
    title: str = "Drawdown",
) -> go.Figure:
    """Plot the drawdown curve (decline from running peak) as a filled area.

    Parameters
    ----------
    prices:
        Price series (or equity curve).
    title:
        Chart title.

    Returns
    -------
    plotly.graph_objects.Figure
    """
    drawdown = metrics.calculate_drawdown(prices)
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=drawdown.index,
            y=drawdown.values * 100.0,  # show as a percentage
            mode="lines",
            fill="tozeroy",
            name="Drawdown (%)",
        )
    )
    fig.update_layout(
        title=title,
        xaxis_title="Date",
        yaxis_title="Drawdown (%)",
        template="plotly_white",
    )
    return fig
