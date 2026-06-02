"""Visualization helpers for exploratory financial analysis.

These functions use Plotly (interactive, great for notebooks). Each function
returns the :class:`plotly.graph_objects.Figure` so the caller can ``.show()`` it,
save it, or embed it - the function never forces display side effects.
"""

from __future__ import annotations

import pandas as pd
import plotly.express as px
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


def plot_daily_returns(
    returns: pd.Series,
    title: str = "Daily Returns",
) -> go.Figure:
    """Plot daily returns as a bar chart (green up / red down).

    Parameters
    ----------
    returns:
        Series of simple returns indexed by date.
    title:
        Chart title.

    Returns
    -------
    plotly.graph_objects.Figure
    """
    clean = returns.dropna()
    colors = ["#2ca02c" if r >= 0 else "#d62728" for r in clean.values]
    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            x=clean.index,
            y=clean.values * 100.0,
            marker_color=colors,
            name="Daily Return (%)",
        )
    )
    fig.update_layout(
        title=title,
        xaxis_title="Date",
        yaxis_title="Daily Return (%)",
        template="plotly_white",
    )
    return fig


def plot_correlation_heatmap(
    corr: pd.DataFrame,
    title: str = "Returns Correlation Heatmap",
) -> go.Figure:
    """Plot a correlation matrix as an annotated heatmap.

    Parameters
    ----------
    corr:
        Square correlation matrix (e.g. from
        :func:`src.analytics.correlation.calculate_correlation_matrix`).
    title:
        Chart title.

    Returns
    -------
    plotly.graph_objects.Figure
    """
    fig = go.Figure(
        data=go.Heatmap(
            z=corr.values,
            x=list(corr.columns),
            y=list(corr.index),
            zmin=-1.0,
            zmax=1.0,
            colorscale="RdBu",
            reversescale=True,
            text=corr.round(2).values,
            texttemplate="%{text}",
            colorbar=dict(title="corr"),
        )
    )
    fig.update_layout(title=title, template="plotly_white")
    return fig


def plot_sector_comparison(
    sector_summary: pd.DataFrame,
    metric: str = "avg_total_return",
    title: str | None = None,
) -> go.Figure:
    """Plot a sector-level metric as a bar chart.

    Parameters
    ----------
    sector_summary:
        Frame indexed by sector (from
        :func:`src.analytics.sector_analysis.calculate_sector_summary`).
    metric:
        Which column to plot (e.g. ``avg_total_return``,
        ``avg_annualized_volatility``, ``avg_max_drawdown``).
    title:
        Optional chart title; a sensible default is derived from ``metric``.

    Returns
    -------
    plotly.graph_objects.Figure
    """
    if metric not in sector_summary.columns:
        raise ValueError(
            f"metric '{metric}' not in sector summary columns: "
            f"{list(sector_summary.columns)}"
        )

    pretty = metric.replace("_", " ").title()
    title = title or f"Sector Comparison - {pretty}"

    # Returns/vol/drawdown are decimals; display as percentages.
    values = sector_summary[metric] * 100.0
    fig = px.bar(
        x=sector_summary.index,
        y=values.values,
        labels={"x": "Sector", "y": f"{pretty} (%)"},
        title=title,
    )
    fig.update_layout(template="plotly_white")
    return fig
