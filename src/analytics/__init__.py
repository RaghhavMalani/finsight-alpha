"""Analytics subpackage.

Exposes the financial metric calculations used across FinSight Alpha.
"""

from .metrics import (
    calculate_simple_returns,
    calculate_log_returns,
    calculate_cumulative_returns,
    calculate_rolling_volatility,
    calculate_drawdown,
    calculate_max_drawdown,
    calculate_summary_statistics,
)

__all__ = [
    "calculate_simple_returns",
    "calculate_log_returns",
    "calculate_cumulative_returns",
    "calculate_rolling_volatility",
    "calculate_drawdown",
    "calculate_max_drawdown",
    "calculate_summary_statistics",
]
