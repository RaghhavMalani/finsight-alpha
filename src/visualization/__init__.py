"""Visualization subpackage.

Exposes plotting helpers for exploratory financial analysis and the dashboard.
"""

from .plots import (
    plot_correlation_heatmap,
    plot_cumulative_returns,
    plot_daily_returns,
    plot_drawdown,
    plot_price_history,
    plot_rolling_volatility,
    plot_sector_comparison,
)

__all__ = [
    "plot_price_history",
    "plot_cumulative_returns",
    "plot_rolling_volatility",
    "plot_drawdown",
    "plot_daily_returns",
    "plot_correlation_heatmap",
    "plot_sector_comparison",
]
