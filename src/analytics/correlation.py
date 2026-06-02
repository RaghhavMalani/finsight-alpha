"""Correlation analytics.

Tools to turn a long-format, multi-ticker price frame into a returns pivot table
and a correlation matrix. Correlation of *returns* (not prices) is the
meaningful quantity for diversification and portfolio construction.
"""

from __future__ import annotations

import pandas as pd

from src.analytics.metrics import calculate_simple_returns
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)


def build_returns_pivot(
    df: pd.DataFrame,
    price_col: str = "Close",
    date_col: str = "Date",
    ticker_col: str = "Ticker",
) -> pd.DataFrame:
    """Pivot a long-format price frame into a wide returns table.

    Input is the long format produced by :class:`MarketDataService.get_multiple`
    (one row per date-ticker). Output is a wide frame indexed by ``Date`` with one
    column of daily simple returns per ticker.

    Parameters
    ----------
    df:
        Long-format frame containing ``date_col``, ``ticker_col``, ``price_col``.
    price_col, date_col, ticker_col:
        Column names to use.

    Returns
    -------
    pandas.DataFrame
        Wide returns table (rows = dates, columns = tickers). Empty frame if the
        input is empty.
    """
    required = {date_col, ticker_col, price_col}
    if df is None or df.empty:
        return pd.DataFrame()
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Input frame is missing columns: {sorted(missing)}.")

    # Pivot prices to wide form: index=Date, columns=Ticker, values=Close.
    price_wide = df.pivot_table(
        index=date_col, columns=ticker_col, values=price_col, aggfunc="last"
    ).sort_index()

    # Compute per-column simple returns. apply keeps it vectorised per ticker.
    returns_wide = price_wide.apply(calculate_simple_returns)
    return returns_wide


def calculate_correlation_matrix(
    returns_wide: pd.DataFrame,
    min_periods: int = 2,
) -> pd.DataFrame:
    """Pearson correlation matrix of a wide returns table.

    Missing values are handled by pandas' pairwise correlation (it uses the
    overlapping non-NaN observations for each pair), and we drop columns that are
    entirely empty first so a dead ticker cannot poison the matrix.

    Parameters
    ----------
    returns_wide:
        Wide returns table from :func:`build_returns_pivot`.
    min_periods:
        Minimum overlapping observations required per pair.

    Returns
    -------
    pandas.DataFrame
        Square correlation matrix (values in ``[-1, 1]``).
    """
    if returns_wide is None or returns_wide.empty:
        return pd.DataFrame()

    # Drop tickers that are all-NaN (e.g. failed download) to avoid empty columns.
    cleaned = returns_wide.dropna(axis=1, how="all")
    if cleaned.shape[1] == 0:
        return pd.DataFrame()

    return cleaned.corr(method="pearson", min_periods=min_periods)
