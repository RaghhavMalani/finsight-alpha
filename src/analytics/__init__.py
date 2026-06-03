"""Analytics subpackage.

Exposes the financial metric calculations, correlation helpers, sector analysis,
risk summary, and data-quality checks used across FinSight Alpha.
"""

from .correlation import (
    build_returns_pivot,
    calculate_correlation_matrix,
    create_returns_pivot,
    find_highest_correlation_pair,
    find_lowest_correlation_pair,
)
from .data_quality import (
    calculate_data_quality_report,
    calculate_date_coverage,
    calculate_duplicate_rows,
    calculate_missing_values,
    calculate_rows_per_ticker,
)
from .metrics import (
    calculate_annualized_volatility,
    calculate_average_daily_return,
    calculate_best_day,
    calculate_cumulative_returns,
    calculate_drawdown,
    calculate_log_returns,
    calculate_max_drawdown,
    calculate_rolling_volatility,
    calculate_simple_returns,
    calculate_summary_statistics,
    calculate_total_return,
    calculate_worst_day,
)
from .risk_summary import (
    calculate_downside_deviation,
    calculate_risk_summary,
    classify_volatility_risk,
)
from .sector_analysis import (
    add_sector_column,
    calculate_sector_rankings,
    calculate_sector_summary,
)

__all__ = [
    # metrics
    "calculate_simple_returns",
    "calculate_log_returns",
    "calculate_cumulative_returns",
    "calculate_rolling_volatility",
    "calculate_drawdown",
    "calculate_max_drawdown",
    "calculate_annualized_volatility",
    "calculate_total_return",
    "calculate_average_daily_return",
    "calculate_best_day",
    "calculate_worst_day",
    "calculate_summary_statistics",
    # correlation
    "build_returns_pivot",
    "create_returns_pivot",
    "calculate_correlation_matrix",
    "find_highest_correlation_pair",
    "find_lowest_correlation_pair",
    # sector
    "add_sector_column",
    "calculate_sector_summary",
    "calculate_sector_rankings",
    # risk
    "classify_volatility_risk",
    "calculate_downside_deviation",
    "calculate_risk_summary",
    # data quality
    "calculate_missing_values",
    "calculate_duplicate_rows",
    "calculate_date_coverage",
    "calculate_rows_per_ticker",
    "calculate_data_quality_report",
]
