"""Unit tests for src.analytics.data_quality.

Offline tests using small hardcoded frames - no internet required.

Run with::

    pytest -q
"""

from __future__ import annotations

import pandas as pd
import pytest

from src.analytics import data_quality


@pytest.fixture
def sample_df() -> pd.DataFrame:
    """Two tickers; AAPL has a missing Close, MSFT has a duplicate date."""
    return pd.DataFrame(
        {
            "Date": pd.to_datetime(
                [
                    "2024-01-01", "2024-01-02", "2024-01-03",  # AAPL
                    "2024-01-01", "2024-01-02", "2024-01-02",  # MSFT (dup date)
                ]
            ),
            "Open": [100.0, 101.0, 102.0, 200.0, 201.0, 201.0],
            "High": [101.0, 102.0, 103.0, 201.0, 202.0, 202.0],
            "Low": [99.0, 100.0, 101.0, 199.0, 200.0, 200.0],
            "Close": [100.5, None, 102.5, 200.5, 201.5, 201.5],  # one missing
            "Volume": [10, 11, 12, 20, 21, 21],
            "Ticker": ["AAPL", "AAPL", "AAPL", "MSFT", "MSFT", "MSFT"],
        }
    )


def test_missing_values(sample_df: pd.DataFrame) -> None:
    missing = data_quality.calculate_missing_values(sample_df)
    # Exactly one missing Close value.
    assert missing["Close"] == 1
    assert missing["Open"] == 0


def test_missing_values_empty() -> None:
    assert data_quality.calculate_missing_values(pd.DataFrame()).empty


def test_duplicate_rows(sample_df: pd.DataFrame) -> None:
    # MSFT has a duplicated (Date, Ticker) pair on 2024-01-02.
    assert data_quality.calculate_duplicate_rows(sample_df) == 1


def test_duplicate_rows_empty() -> None:
    assert data_quality.calculate_duplicate_rows(pd.DataFrame()) == 0


def test_rows_per_ticker(sample_df: pd.DataFrame) -> None:
    counts = data_quality.calculate_rows_per_ticker(sample_df)
    assert counts["AAPL"] == 3
    assert counts["MSFT"] == 3


def test_date_coverage(sample_df: pd.DataFrame) -> None:
    coverage = data_quality.calculate_date_coverage(sample_df).set_index("Ticker")
    assert str(coverage.loc["AAPL", "First Date"].date()) == "2024-01-01"
    assert str(coverage.loc["AAPL", "Last Date"].date()) == "2024-01-03"


def test_data_quality_report(sample_df: pd.DataFrame) -> None:
    report = data_quality.calculate_data_quality_report(sample_df).set_index("Ticker")

    assert report.loc["AAPL", "Row Count"] == 3
    assert report.loc["AAPL", "Missing Values"] == 1
    assert report.loc["MSFT", "Duplicate Rows"] == 1
    # AAPL: 3 rows * 5 OHLCV cols = 15 cells, 1 missing -> 14/15 = 93.33%.
    assert report.loc["AAPL", "Completeness %"] == pytest.approx(93.33, abs=0.01)
    # MSFT has no missing values -> 100% complete.
    assert report.loc["MSFT", "Completeness %"] == pytest.approx(100.0)


def test_data_quality_report_empty() -> None:
    assert data_quality.calculate_data_quality_report(pd.DataFrame()).empty
