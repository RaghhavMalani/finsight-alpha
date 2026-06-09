"""Portfolio optimization visualizations using Plotly.

Provides charts for the efficient frontier, asset allocations, risk
contributions, and portfolio comparisons.
"""

import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from src.visualization.theme import plotly_layout

def plot_efficient_frontier(
    frontier_df: pd.DataFrame,
    min_var_portfolio: dict | None = None,
    max_sharpe_portfolio: dict | None = None
) -> go.Figure:
    """Plot the efficient frontier line with optimal portfolios marked.

    Args:
        frontier_df: DataFrame containing target_return, volatility, sharpe_ratio.
        min_var_portfolio: Dictionary with 'volatility' and 'expected_return' keys.
        max_sharpe_portfolio: Dictionary with 'volatility' and 'expected_return' keys.

    Returns:
        go.Figure: Plotly figure.
    """
    fig = go.Figure()

    # The frontier line
    fig.add_trace(
        go.Scatter(
            x=frontier_df["volatility"],
            y=frontier_df["target_return"],
            mode="lines+markers",
            marker=dict(
                size=6,
                color=frontier_df["sharpe_ratio"],
                colorscale="Viridis",
                showscale=True,
                colorbar=dict(title="Sharpe Ratio")
            ),
            line=dict(width=2, color="rgba(100, 100, 100, 0.5)"),
            name="Efficient Frontier",
            customdata=frontier_df["sharpe_ratio"],
            hovertemplate=(
                "Volatility: %{x:.2%}<br>"
                "Return: %{y:.2%}<br>"
                "Sharpe: %{customdata:.2f}<extra></extra>"
            )
        )
    )

    if min_var_portfolio and not np.isnan(min_var_portfolio.get("volatility", np.nan)):
        fig.add_trace(
            go.Scatter(
                x=[min_var_portfolio["volatility"]],
                y=[min_var_portfolio["expected_return"]],
                mode="markers",
                marker=dict(size=14, color="green", symbol="star"),
                name="Min Variance",
                hovertemplate=(
                    "Volatility: %{x:.2%}<br>"
                    "Return: %{y:.2%}<extra>Min Variance</extra>"
                )
            )
        )

    if max_sharpe_portfolio and not np.isnan(max_sharpe_portfolio.get("volatility", np.nan)):
        fig.add_trace(
            go.Scatter(
                x=[max_sharpe_portfolio["volatility"]],
                y=[max_sharpe_portfolio["expected_return"]],
                mode="markers",
                marker=dict(size=14, color="red", symbol="star"),
                name="Max Sharpe",
                hovertemplate=(
                    "Volatility: %{x:.2%}<br>"
                    "Return: %{y:.2%}<extra>Max Sharpe</extra>"
                )
            )
        )

    fig.update_layout(
        title="Efficient Frontier",
        xaxis_title="Annualized Volatility (Risk)",
        yaxis_title="Expected Return",
        xaxis_tickformat=".1%",
        yaxis_tickformat=".1%",
        **plotly_layout(),
        hovermode="closest"
    )

    return fig

def plot_portfolio_weights(weights: pd.Series, title: str) -> go.Figure:
    """Plot asset weights as a bar chart.

    Args:
        weights: Series of asset weights.
        title: Chart title.

    Returns:
        go.Figure: Plotly figure.
    """
    df = weights.reset_index()
    df.columns = ["Asset", "Weight"]
    df = df[df["Weight"] > 0.001].sort_values("Weight", ascending=True)

    fig = px.bar(
        df,
        x="Weight",
        y="Asset",
        orientation="h",
        title=title,
        labels={"Weight": "Allocation Weight", "Asset": ""}
    )

    fig.update_layout(
        xaxis_tickformat=".1%",
        **plotly_layout()
    )

    return fig

def plot_allocation_pie_chart(weights: pd.Series, title: str) -> go.Figure:
    """Plot asset weights as a pie chart.

    Args:
        weights: Series of asset weights.
        title: Chart title.

    Returns:
        go.Figure: Plotly figure.
    """
    df = weights.reset_index()
    df.columns = ["Asset", "Weight"]
    df = df[df["Weight"] > 0.001]

    fig = px.pie(
        df,
        values="Weight",
        names="Asset",
        title=title,
        hole=0.4
    )

    fig.update_traces(textposition='inside', textinfo='percent+label')
    fig.update_layout(**plotly_layout())

    return fig

def plot_portfolio_comparison(comparison_df: pd.DataFrame) -> go.Figure:
    """Plot a comparison of expected return and volatility across portfolios.

    Args:
        comparison_df: DataFrame containing 'portfolio', 'expected_return',
            and 'volatility'.

    Returns:
        go.Figure: Plotly figure.
    """
    df = comparison_df.dropna(subset=["expected_return", "volatility"]).copy()

    fig = px.scatter(
        df,
        x="volatility",
        y="expected_return",
        color="portfolio",
        size="sharpe_ratio",
        text="portfolio",
        title="Portfolio Strategy Comparison",
        labels={
            "volatility": "Annualized Volatility (Risk)",
            "expected_return": "Expected Return",
            "portfolio": "Strategy"
        }
    )

    fig.update_traces(textposition="top center")
    fig.update_layout(
        xaxis_tickformat=".1%",
        yaxis_tickformat=".1%",
        **plotly_layout()
    )

    return fig

def plot_risk_contribution(risk_contribution_df: pd.DataFrame) -> go.Figure:
    """Plot the percentage risk contribution and weight of each asset.

    Args:
        risk_contribution_df: DataFrame with risk contribution metrics.

    Returns:
        go.Figure: Plotly figure.
    """
    df = risk_contribution_df.sort_values("percentage_risk_contribution", ascending=False)
    
    fig = go.Figure()
    
    fig.add_trace(
        go.Bar(
            x=df["asset"],
            y=df["percentage_risk_contribution"],
            name="Risk Contribution",
            marker_color="crimson",
            hovertemplate="Risk Contribution: %{y:.2%}<extra></extra>"
        )
    )
    
    fig.add_trace(
        go.Bar(
            x=df["asset"],
            y=df["weight"],
            name="Allocation Weight",
            marker_color="royalblue",
            hovertemplate="Weight: %{y:.2%}<extra></extra>"
        )
    )
    
    fig.update_layout(
        title="Risk Contribution vs Allocation Weight",
        barmode="group",
        yaxis_title="Percentage",
        yaxis_tickformat=".1%",
        **plotly_layout()
    )
    
    return fig

def plot_risk_return_scatter_assets(
    expected_returns: pd.Series,
    covariance_matrix: pd.DataFrame
) -> go.Figure:
    """Plot individual assets on a risk-return scatter plot.

    Args:
        expected_returns: Series of expected returns.
        covariance_matrix: Annualized covariance matrix.

    Returns:
        go.Figure: Plotly figure.
    """
    vols = pd.Series(np.sqrt(np.diag(covariance_matrix)), index=covariance_matrix.columns)
    
    df = pd.DataFrame({
        "Asset": expected_returns.index,
        "Expected Return": expected_returns.values,
        "Volatility": vols.values
    })
    
    fig = px.scatter(
        df,
        x="Volatility",
        y="Expected Return",
        text="Asset",
        title="Individual Asset Risk-Return Profile",
        labels={
            "Volatility": "Annualized Volatility (Risk)",
            "Expected Return": "Expected Return"
        }
    )
    
    fig.update_traces(
        textposition="top right",
        marker=dict(size=10, color="orange", line=dict(width=1, color="DarkSlateGrey"))
    )
    fig.update_layout(
        xaxis_tickformat=".1%",
        yaxis_tickformat=".1%",
        **plotly_layout()
    )
    
    return fig
