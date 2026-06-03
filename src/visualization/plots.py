"""Plotly charts for the FinSight Alpha dashboard.

Every function returns a styled :class:`plotly.graph_objects.Figure` (using the
dark theme in :mod:`src.visualization.theme`) so the dashboard stays clean and
consistent. Functions that operate on a single asset accept the long-format
multi-ticker frame plus a ``ticker`` and extract the relevant series internally.
"""

from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go

from src import config
from src.analytics import metrics
from src.visualization.theme import COLORS, apply_plotly_theme


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _price_series(df: pd.DataFrame, ticker: str) -> pd.Series:
    """Extract a date-indexed Close price Series for one ticker from a long frame."""
    sub = df[df["Ticker"] == ticker].sort_values("Date")
    return pd.Series(
        sub["Close"].to_numpy(),
        index=pd.to_datetime(sub["Date"]),
        name=str(ticker),
    )


def _empty_figure(message: str) -> go.Figure:
    """Return a styled empty figure carrying an explanatory message."""
    fig = go.Figure()
    fig.add_annotation(
        text=message,
        showarrow=False,
        font={"color": COLORS["text_muted"], "size": 14},
        xref="paper",
        yref="paper",
        x=0.5,
        y=0.5,
    )
    return apply_plotly_theme(fig, title="")


def _label(ticker: str) -> str:
    """Compose a ``Name (TICKER)`` label for chart titles."""
    name = config.get_display_name(ticker)
    return f"{name} ({ticker})" if name != ticker else str(ticker)


# ---------------------------------------------------------------------------
# Single-asset charts
# ---------------------------------------------------------------------------
def plot_price_chart(df: pd.DataFrame, ticker: str) -> go.Figure:
    """Line chart of a single ticker's closing price over time."""
    prices = _price_series(df, ticker)
    if prices.dropna().empty:
        return _empty_figure(f"No price data for {ticker}.")

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=prices.index,
            y=prices.values,
            mode="lines",
            name="Close",
            line={"color": COLORS["accent"], "width": 2},
            hovertemplate="%{x|%Y-%m-%d}<br>Close: %{y:.2f}<extra></extra>",
        )
    )
    return apply_plotly_theme(
        fig, title=f"{_label(ticker)} - Price History",
        yaxis={"title": "Price", "gridcolor": COLORS["grid"]},
    )


def plot_daily_returns(df: pd.DataFrame, ticker: str) -> go.Figure:
    """Bar chart of a single ticker's daily simple returns (green up / red down)."""
    prices = _price_series(df, ticker)
    returns = metrics.calculate_simple_returns(prices).dropna()
    if returns.empty:
        return _empty_figure(f"No returns to show for {ticker}.")

    bar_colors = [COLORS["positive"] if r >= 0 else COLORS["negative"] for r in returns.values]
    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            x=returns.index,
            y=returns.values * 100.0,
            marker_color=bar_colors,
            name="Daily Return (%)",
            hovertemplate="%{x|%Y-%m-%d}<br>Return: %{y:.2f}%<extra></extra>",
        )
    )
    return apply_plotly_theme(
        fig, title=f"{_label(ticker)} - Daily Returns",
        yaxis={"title": "Daily Return (%)", "gridcolor": COLORS["grid"]},
        hovermode="closest",
    )


def plot_cumulative_returns(df: pd.DataFrame, ticker: str) -> go.Figure:
    """Area/line chart of a single ticker's cumulative (compounded) return."""
    prices = _price_series(df, ticker)
    returns = metrics.calculate_simple_returns(prices)
    cumulative = metrics.calculate_cumulative_returns(returns)
    if cumulative.dropna().empty:
        return _empty_figure(f"No cumulative return for {ticker}.")

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=cumulative.index,
            y=cumulative.values * 100.0,
            mode="lines",
            name="Cumulative Return (%)",
            line={"color": COLORS["positive"], "width": 2},
            fill="tozeroy",
            fillcolor="rgba(38, 194, 129, 0.12)",
            hovertemplate="%{x|%Y-%m-%d}<br>Cumulative: %{y:.2f}%<extra></extra>",
        )
    )
    return apply_plotly_theme(
        fig, title=f"{_label(ticker)} - Cumulative Returns",
        yaxis={"title": "Cumulative Return (%)", "gridcolor": COLORS["grid"]},
    )


def plot_rolling_volatility(
    df: pd.DataFrame,
    ticker: str,
    window: int = config.DEFAULT_VOLATILITY_WINDOW,
) -> go.Figure:
    """Line chart of a single ticker's rolling annualized volatility."""
    prices = _price_series(df, ticker)
    returns = metrics.calculate_simple_returns(prices)
    vol = metrics.calculate_rolling_volatility(returns, window=window)
    if vol.dropna().empty:
        return _empty_figure(f"Not enough data for {window}-day volatility of {ticker}.")

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=vol.index,
            y=vol.values * 100.0,
            mode="lines",
            name=f"{window}-day Volatility (%)",
            line={"color": COLORS["accent"], "width": 2},
            hovertemplate="%{x|%Y-%m-%d}<br>Volatility: %{y:.2f}%<extra></extra>",
        )
    )
    return apply_plotly_theme(
        fig, title=f"{_label(ticker)} - Rolling Volatility ({window}d, Annualized)",
        yaxis={"title": "Annualized Volatility (%)", "gridcolor": COLORS["grid"]},
    )


def plot_drawdown(df: pd.DataFrame, ticker: str) -> go.Figure:
    """Filled area chart of a single ticker's drawdown from its running peak."""
    prices = _price_series(df, ticker)
    drawdown = metrics.calculate_drawdown(prices)
    if drawdown.dropna().empty:
        return _empty_figure(f"No drawdown data for {ticker}.")

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=drawdown.index,
            y=drawdown.values * 100.0,
            mode="lines",
            name="Drawdown (%)",
            line={"color": COLORS["negative"], "width": 1.5},
            fill="tozeroy",
            fillcolor="rgba(239, 83, 80, 0.15)",
            hovertemplate="%{x|%Y-%m-%d}<br>Drawdown: %{y:.2f}%<extra></extra>",
        )
    )
    return apply_plotly_theme(
        fig, title=f"{_label(ticker)} - Drawdown",
        yaxis={"title": "Drawdown (%)", "gridcolor": COLORS["grid"]},
    )


# ---------------------------------------------------------------------------
# Multi-asset comparison charts
# ---------------------------------------------------------------------------
def plot_normalized_price_comparison(df: pd.DataFrame) -> go.Figure:
    """Compare tickers by rebasing every price series to 100 at the start.

    Normalizing removes price-level differences so growth is directly comparable.
    """
    if df is None or df.empty or "Ticker" not in df.columns:
        return _empty_figure("No data to compare.")

    fig = go.Figure()
    plotted = 0
    for ticker in sorted(df["Ticker"].unique()):
        prices = _price_series(df, ticker).dropna()
        if prices.shape[0] < 2:
            continue
        normalized = prices / prices.iloc[0] * 100.0
        fig.add_trace(
            go.Scatter(
                x=normalized.index,
                y=normalized.values,
                mode="lines",
                name=str(ticker),
                hovertemplate="%{x|%Y-%m-%d}<br>" + str(ticker) + ": %{y:.1f}<extra></extra>",
            )
        )
        plotted += 1

    if plotted == 0:
        return _empty_figure("No data to compare.")
    return apply_plotly_theme(
        fig, title="Normalized Price Comparison (rebased to 100)",
        yaxis={"title": "Index (start = 100)", "gridcolor": COLORS["grid"]},
    )


def plot_cumulative_return_comparison(df: pd.DataFrame) -> go.Figure:
    """Compare tickers by cumulative (compounded) return over the window."""
    if df is None or df.empty or "Ticker" not in df.columns:
        return _empty_figure("No data to compare.")

    fig = go.Figure()
    plotted = 0
    for ticker in sorted(df["Ticker"].unique()):
        prices = _price_series(df, ticker).dropna()
        if prices.shape[0] < 2:
            continue
        returns = metrics.calculate_simple_returns(prices)
        cumulative = metrics.calculate_cumulative_returns(returns) * 100.0
        fig.add_trace(
            go.Scatter(
                x=cumulative.index,
                y=cumulative.values,
                mode="lines",
                name=str(ticker),
                hovertemplate="%{x|%Y-%m-%d}<br>" + str(ticker) + ": %{y:.2f}%<extra></extra>",
            )
        )
        plotted += 1

    if plotted == 0:
        return _empty_figure("No data to compare.")
    return apply_plotly_theme(
        fig, title="Cumulative Return Comparison",
        yaxis={"title": "Cumulative Return (%)", "gridcolor": COLORS["grid"]},
    )


def plot_risk_return_scatter(summary_df: pd.DataFrame) -> go.Figure:
    """Scatter of annualized volatility (x) vs total return (y) per ticker.

    Expects columns ``Ticker``, ``annualized_volatility``, ``total_return``
    (decimals). The classic risk-return view: up and to the left is better
    (higher return for less risk).
    """
    required = {"Ticker", "annualized_volatility", "total_return"}
    if summary_df is None or summary_df.empty or not required.issubset(summary_df.columns):
        return _empty_figure("No risk-return data available.")

    x = summary_df["annualized_volatility"] * 100.0
    y = summary_df["total_return"] * 100.0
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=x,
            y=y,
            mode="markers+text",
            text=summary_df["Ticker"],
            textposition="top center",
            textfont={"color": COLORS["text_muted"], "size": 10},
            marker={
                "size": 13,
                "color": y,
                "colorscale": "RdYlGn",
                "line": {"width": 1, "color": COLORS["border"]},
            },
            hovertemplate="%{text}<br>Volatility: %{x:.1f}%<br>Total Return: %{y:.1f}%<extra></extra>",
        )
    )
    return apply_plotly_theme(
        fig, title="Risk vs Return",
        xaxis={"title": "Annualized Volatility (%)", "gridcolor": COLORS["grid"]},
        yaxis={"title": "Total Return (%)", "gridcolor": COLORS["grid"]},
        hovermode="closest",
    )


# ---------------------------------------------------------------------------
# Correlation
# ---------------------------------------------------------------------------
def plot_correlation_heatmap(correlation_matrix: pd.DataFrame) -> go.Figure:
    """Annotated heatmap of a returns correlation matrix."""
    if correlation_matrix is None or correlation_matrix.empty:
        return _empty_figure("Select at least two tickers to compute correlations.")

    fig = go.Figure(
        data=go.Heatmap(
            z=correlation_matrix.values,
            x=list(correlation_matrix.columns),
            y=list(correlation_matrix.index),
            zmin=-1.0,
            zmax=1.0,
            colorscale="RdBu",
            reversescale=True,
            text=correlation_matrix.round(2).values,
            texttemplate="%{text}",
            textfont={"size": 11},
            colorbar={"title": "corr"},
            hovertemplate="%{y} vs %{x}<br>corr: %{z:.2f}<extra></extra>",
        )
    )
    return apply_plotly_theme(fig, title="Returns Correlation Heatmap")


# ---------------------------------------------------------------------------
# Sector charts
# ---------------------------------------------------------------------------
def _sector_bar(
    sector_df: pd.DataFrame,
    column: str,
    title: str,
    yaxis_title: str,
    color: str,
) -> go.Figure:
    """Shared helper to render a sector-level metric as a percentage bar chart."""
    if sector_df is None or sector_df.empty or column not in sector_df.columns:
        return _empty_figure("No sector data available.")

    sectors = list(sector_df.index)
    values = sector_df[column] * 100.0
    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            x=sectors,
            y=values.values,
            marker_color=color,
            hovertemplate="%{x}<br>" + yaxis_title + ": %{y:.2f}%<extra></extra>",
        )
    )
    return apply_plotly_theme(
        fig, title=title,
        yaxis={"title": yaxis_title, "gridcolor": COLORS["grid"]},
        hovermode="closest",
    )


def plot_sector_return_bar(sector_df: pd.DataFrame) -> go.Figure:
    """Bar chart of average total return by sector."""
    return _sector_bar(
        sector_df, "avg_total_return",
        "Average Total Return by Sector", "Avg Total Return (%)", COLORS["accent"],
    )


def plot_sector_volatility_bar(sector_df: pd.DataFrame) -> go.Figure:
    """Bar chart of average annualized volatility by sector."""
    return _sector_bar(
        sector_df, "avg_annualized_volatility",
        "Average Volatility by Sector", "Avg Annualized Volatility (%)", "#f5a623",
    )


def plot_sector_drawdown_bar(sector_df: pd.DataFrame) -> go.Figure:
    """Bar chart of average max drawdown by sector."""
    return _sector_bar(
        sector_df, "avg_max_drawdown",
        "Average Max Drawdown by Sector", "Avg Max Drawdown (%)", COLORS["negative"],
    )


# ---------------------------------------------------------------------------
# Data quality
# ---------------------------------------------------------------------------
def plot_data_quality_bar(quality_df: pd.DataFrame) -> go.Figure:
    """Bar chart of data completeness (%) per ticker."""
    if quality_df is None or quality_df.empty or "Completeness %" not in quality_df.columns:
        return _empty_figure("No data-quality data available.")

    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            x=quality_df["Ticker"],
            y=quality_df["Completeness %"],
            marker_color=COLORS["positive"],
            hovertemplate="%{x}<br>Completeness: %{y:.2f}%<extra></extra>",
        )
    )
    fig.update_yaxes(range=[0, 100])
    return apply_plotly_theme(
        fig, title="Data Completeness by Ticker",
        yaxis={"title": "Completeness (%)", "gridcolor": COLORS["grid"]},
        hovermode="closest",
    )
