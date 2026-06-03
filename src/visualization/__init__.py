"""Visualization subpackage.

Exposes the dashboard theme and all Plotly chart builders.
"""

from .plots import (
    plot_correlation_heatmap,
    plot_cumulative_return_comparison,
    plot_cumulative_returns,
    plot_daily_returns,
    plot_data_quality_bar,
    plot_drawdown,
    plot_normalized_price_comparison,
    plot_price_chart,
    plot_risk_return_scatter,
    plot_rolling_volatility,
    plot_sector_drawdown_bar,
    plot_sector_return_bar,
    plot_sector_volatility_bar,
)
from .theme import (
    COLORS,
    apply_plotly_theme,
    apply_streamlit_theme,
    plotly_layout,
)

__all__ = [
    # theme
    "COLORS",
    "apply_streamlit_theme",
    "apply_plotly_theme",
    "plotly_layout",
    # single-asset
    "plot_price_chart",
    "plot_daily_returns",
    "plot_cumulative_returns",
    "plot_rolling_volatility",
    "plot_drawdown",
    # multi-asset
    "plot_normalized_price_comparison",
    "plot_cumulative_return_comparison",
    "plot_risk_return_scatter",
    # correlation / sector / quality
    "plot_correlation_heatmap",
    "plot_sector_return_bar",
    "plot_sector_volatility_bar",
    "plot_sector_drawdown_bar",
    "plot_data_quality_bar",
]
