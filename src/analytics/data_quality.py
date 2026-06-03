"""Data-quality analytics.

Before trusting any analytics, you should trust the data. This module reports on
the integrity of a long-format market-data frame: missing values, duplicate
rows, date coverage per ticker, and an overall completeness percentage.
"""

from __future__ import annotations

import pandas as pd

from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

# OHLCV columns we expect to be populated for a healthy dataset.
OHLCV_COLUMNS: list[str] = ["Open", "High", "Low", "Close", "Volume"]


def calculate_missing_values(df: pd.DataFrame) -> pd.Series:
    """Count missing (NaN) values per column.

    Returns a Series indexed by column name. Empty Series if ``df`` is empty.
    """
    if df is None or df.empty:
        return pd.Series(dtype="int64")
    return df.isna().sum()


def calculate_duplicate_rows(df: pd.DataFrame) -> int:
    """Count fully-duplicated rows in the frame.

    When ``Date`` and ``Ticker`` are present, duplicates are judged on that pair
    (the same ticker should not have two rows for one date). Otherwise full-row
    duplication is used.
    """
    if df is None or df.empty:
        return 0
    if {"Date", "Ticker"}.issubset(df.columns):
        return int(df.duplicated(subset=["Date", "Ticker"]).sum())
    return int(df.duplicated().sum())


def calculate_date_coverage(df: pd.DataFrame) -> pd.DataFrame:
    """Report the first and last available date per ticker.

    Returns a frame with columns ``Ticker``, ``First Date``, ``Last Date``.
    Empty frame if the required columns are missing.
    """
    if df is None or df.empty or not {"Date", "Ticker"}.issubset(df.columns):
        return pd.DataFrame(columns=["Ticker", "First Date", "Last Date"])

    dates = pd.to_datetime(df["Date"], errors="coerce")
    work = df.assign(_Date=dates)
    grouped = work.groupby("Ticker")["_Date"].agg(["min", "max"]).reset_index()
    grouped.columns = ["Ticker", "First Date", "Last Date"]
    return grouped


def calculate_rows_per_ticker(df: pd.DataFrame) -> pd.Series:
    """Count the number of rows per ticker.

    Returns a Series indexed by ticker. Empty Series if there is no ``Ticker``
    column or no data.
    """
    if df is None or df.empty or "Ticker" not in df.columns:
        return pd.Series(dtype="int64")
    return df.groupby("Ticker").size()


def calculate_data_quality_report(df: pd.DataFrame) -> pd.DataFrame:
    """Assemble a per-ticker data-quality report.

    Parameters
    ----------
    df:
        Long-format frame with at least ``Date`` and ``Ticker`` (OHLCV columns
        improve the completeness check).

    Returns
    -------
    pandas.DataFrame
        One row per ticker with columns: ``Ticker``, ``Row Count``,
        ``First Date``, ``Last Date``, ``Missing Values``, ``Duplicate Rows``,
        ``Completeness %``. Empty frame if there is no usable data.
    """
    if df is None or df.empty or not {"Date", "Ticker"}.issubset(df.columns):
        return pd.DataFrame()

    present_ohlcv = [c for c in OHLCV_COLUMNS if c in df.columns]
    coverage = calculate_date_coverage(df).set_index("Ticker")

    rows: list[dict[str, object]] = []
    for ticker, group in df.groupby("Ticker"):
        row_count = int(len(group))

        # Missing values across the OHLCV columns we actually have.
        missing = int(group[present_ohlcv].isna().sum().sum()) if present_ohlcv else 0

        # Duplicate dates for this ticker.
        duplicates = int(group.duplicated(subset=["Date"]).sum())

        # Completeness: fraction of expected OHLCV cells that are populated.
        if present_ohlcv and row_count > 0:
            total_cells = row_count * len(present_ohlcv)
            completeness = round(100.0 * (total_cells - missing) / total_cells, 2)
        else:
            completeness = 100.0

        first_date = coverage.loc[ticker, "First Date"] if ticker in coverage.index else pd.NaT
        last_date = coverage.loc[ticker, "Last Date"] if ticker in coverage.index else pd.NaT

        rows.append(
            {
                "Ticker": ticker,
                "Row Count": row_count,
                "First Date": first_date,
                "Last Date": last_date,
                "Missing Values": missing,
                "Duplicate Rows": duplicates,
                "Completeness %": completeness,
            }
        )

    return pd.DataFrame(rows).sort_values("Ticker").reset_index(drop=True)
