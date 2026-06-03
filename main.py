"""FinSight Alpha - Phase 1 end-to-end pipeline.

Run this script to:

1. download historical OHLCV data for the configured ticker universe,
2. save the raw data to ``data/raw/``,
3. compute analytics (returns, volatility, drawdown) and save the enriched data
   to ``data/processed/``,
4. print a tidy summary-statistics table for every ticker.

Usage
-----
From the ``finsight-alpha/`` directory::

    python main.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

# Make sure the project root is importable when running ``python main.py``.
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src import config
from src.analytics import metrics
from src.data.market_data import DataDownloadError, download_stock_data


def _safe_filename(ticker: str) -> str:
    """Turn a ticker into a filesystem-safe filename stem.

    e.g. ``"RELIANCE.NS"`` -> ``"RELIANCE_NS"``.
    """
    return ticker.replace(".", "_").replace("/", "_")


def process_ticker(
    ticker: str,
    start_date: str,
    end_date: str,
) -> tuple[pd.DataFrame, dict[str, float]] | tuple[None, None]:
    """Download, enrich, and persist data for a single ticker.

    Returns
    -------
    (processed_df, summary_stats) on success, or (None, None) if the download
    failed (the error is printed and the pipeline continues with other tickers).
    """
    print(f"  -> Downloading {ticker} ...")
    try:
        raw_df = download_stock_data(ticker, start_date, end_date)
    except DataDownloadError as exc:
        print(f"     [skip] {exc}")
        return None, None

    # --- Save raw data -----------------------------------------------------
    raw_path = config.RAW_DATA_DIR / f"{_safe_filename(ticker)}.csv"
    raw_df.to_csv(raw_path, index=False)

    # --- Compute analytics on the adjusted close --------------------------
    processed = raw_df.copy()
    close = processed["Close"]

    processed["simple_return"] = metrics.calculate_simple_returns(close)
    processed["log_return"] = metrics.calculate_log_returns(close)
    processed["cumulative_return"] = metrics.calculate_cumulative_returns(
        processed["simple_return"]
    )
    processed["rolling_volatility"] = metrics.calculate_rolling_volatility(
        processed["simple_return"]
    )
    processed["drawdown"] = metrics.calculate_drawdown(close)

    # --- Save processed data ----------------------------------------------
    processed_path = config.PROCESSED_DATA_DIR / f"{_safe_filename(ticker)}.csv"
    processed.to_csv(processed_path, index=False)

    summary = metrics.calculate_summary_statistics(close)
    return processed, summary


def main() -> None:
    """Run the Phase 1 pipeline for the full configured ticker universe."""
    config.ensure_data_dirs()

    start_date = config.DEFAULT_START_DATE
    end_date = config.DEFAULT_END_DATE
    tickers = config.ALL_TICKERS

    print("=" * 70)
    print("FinSight Alpha - Phase 1: Market Data Pipeline")
    print(f"Window : {start_date}  ->  {end_date}")
    print(f"Tickers: {', '.join(tickers)}")
    print("=" * 70)

    summary_rows: list[dict[str, float | str]] = []

    for ticker in tickers:
        _, summary = process_ticker(ticker, start_date, end_date)
        if summary is not None:
            row: dict[str, float | str] = {"ticker": ticker}
            row.update(summary)
            summary_rows.append(row)

    if not summary_rows:
        print("\nNo data was successfully downloaded. Check your connection/tickers.")
        return

    # --- Pretty-print the summary table -----------------------------------
    summary_df = pd.DataFrame(summary_rows).set_index("ticker")

    # Format percentage-style columns for readability.
    pct_cols = [
        "total_return",
        "annualized_return",
        "annualized_volatility",
        "max_drawdown",
    ]
    display_df = summary_df.copy()
    for col in pct_cols:
        display_df[col] = (display_df[col] * 100).round(2)
    display_df["sharpe_ratio"] = display_df["sharpe_ratio"].round(2)
    display_df["start_price"] = display_df["start_price"].round(2)
    display_df["end_price"] = display_df["end_price"].round(2)
    display_df["observations"] = display_df["observations"].astype(int)

    print("\n" + "=" * 70)
    print("SUMMARY STATISTICS (returns / volatility / drawdown shown in %)")
    print("=" * 70)
    with pd.option_context("display.max_columns", None, "display.width", 120):
        print(display_df.to_string())

    print("\nRaw data      ->", config.RAW_DATA_DIR)
    print("Processed data ->", config.PROCESSED_DATA_DIR)
    print("Done.")


if __name__ == "__main__":
    main()
