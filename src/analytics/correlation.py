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


def create_returns_pivot(
    df: pd.DataFrame,
    price_col: str = "Close",
    date_col: str = "Date",
    ticker_col: str = "Ticker",
) -> pd.DataFrame:
    """Alias of :func:`build_returns_pivot` (preferred public name).

    Pivots a long-format price frame into a wide table of daily simple returns
    (one column per ticker, indexed by date).
    """
    return build_returns_pivot(df, price_col=price_col, date_col=date_col, ticker_col=ticker_col)


def _extreme_correlation_pair(
    correlation_matrix: pd.DataFrame, highest: bool
) -> tuple[str, str, float] | None:
    """Return the most/least correlated off-diagonal ticker pair.

    Parameters
    ----------
    correlation_matrix:
        Square correlation matrix.
    highest:
        If ``True`` find the maximum off-diagonal correlation, else the minimum.

    Returns
    -------
    tuple[str, str, float] | None
        ``(ticker_a, ticker_b, correlation)``, or ``None`` if there are fewer
        than two tickers / no valid pairs.
    """
    if correlation_matrix is None or correlation_matrix.empty:
        return None
    if correlation_matrix.shape[0] < 2:
        return None

    best_pair: tuple[str, str, float] | None = None
    cols = list(correlation_matrix.columns)
    # Only scan the upper triangle (i < j) to avoid duplicates and the diagonal.
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            value = correlation_matrix.iloc[i, j]
            if pd.isna(value):
                continue
            value = float(value)
            if best_pair is None:
                best_pair = (cols[i], cols[j], value)
            elif highest and value > best_pair[2]:
                best_pair = (cols[i], cols[j], value)
            elif not highest and value < best_pair[2]:
                best_pair = (cols[i], cols[j], value)
    return best_pair


def find_highest_correlation_pair(
    correlation_matrix: pd.DataFrame,
) -> tuple[str, str, float] | None:
    """Find the most positively correlated pair of tickers.

    Returns ``(ticker_a, ticker_b, correlation)`` or ``None`` if not computable.
    A high value (near +1) means the two assets tend to move together - they add
    little diversification to each other.
    """
    return _extreme_correlation_pair(correlation_matrix, highest=True)


def find_lowest_correlation_pair(
    correlation_matrix: pd.DataFrame,
) -> tuple[str, str, float] | None:
    """Find the least correlated (or most negatively correlated) pair of tickers.

    Returns ``(ticker_a, ticker_b, correlation)`` or ``None`` if not computable.
    A low value (near 0 or negative) means the two assets diversify each other.
    """
    return _extreme_correlation_pair(correlation_matrix, highest=False)
