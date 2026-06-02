"""Analytics subpackage.

Exposes the financial metric calculations, correlation helpers, and sector
analysis used across FinSight Alpha.
"""

from .correlation import build_returns_pivot, calculate_correlation_matrix
from .metrics import (
    calculate_annualized_volatility,
    calculate_cumulative_returns,
    calculate_drawdown,
    calculate_log_returns,
    calculate_max_drawdown,
    calculate_rolling_volatility,
    calculate_simple_returns,
    calculate_summary_statistics,
    calculate_total_return,
)
from .sector_analysis import calculate_sector_summary

__all__ = [
    "calculate_simple_returns",
    "calculate_log_returns",
    "calculate_cumulative_returns",
    "calculate_rolling_volatility",
    "calculate_drawdown",
    "calculate_max_drawdown",
    "calculate_annualized_volatility",
    "calculate_total_return",
    "calculate_summary_statistics",
    "build_returns_pivot",
    "calculate_correlation_matrix",
    "calculate_sector_summary",
]
