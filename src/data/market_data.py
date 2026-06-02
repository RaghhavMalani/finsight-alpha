"""Market data ingestion.

A thin, defensive wrapper around :mod:`yfinance` that downloads historical OHLCV
data and returns it as a clean, tidy :class:`pandas.DataFrame`.

"Clean" here means:

* a proper ``Date`` column (not a hidden DatetimeIndex),
* a ``Ticker`` column so multiple assets can be concatenated unambiguously,
* validated, non-empty data,
* consistent column names.
"""

from __future__ import annotations

import pandas as pd
import yfinance as yf

from src import config


class DataDownloadError(RuntimeError):
    """Raised when market data cannot be downloaded or is empty/invalid."""


def download_stock_data(
    ticker: str,
    start_date: str = config.DEFAULT_START_DATE,
    end_date: str = config.DEFAULT_END_DATE,
) -> pd.DataFrame:
    """Download and clean historical OHLCV data for a single ticker.

    Parameters
    ----------
    ticker:
        The Yahoo Finance symbol, e.g. ``"AAPL"`` or ``"RELIANCE.NS"``.
    start_date:
        Inclusive start date as an ISO string ``"YYYY-MM-DD"``.
    end_date:
        Exclusive end date as an ISO string ``"YYYY-MM-DD"``.

    Returns
    -------
    pandas.DataFrame
        A tidy frame with columns:
        ``[Date, Open, High, Low, Close, Volume, Ticker]``,
        sorted by ``Date`` ascending and using a clean ``RangeIndex``.

    Raises
    ------
    DataDownloadError
        If the download fails or returns no rows for the ticker.

    Notes
    -----
    ``auto_adjust=True`` makes yfinance return prices already adjusted for splits
    and dividends. The adjusted price is what you should use for return
    calculations, because it reflects the true economic value to an investor.
    """
    if not ticker or not str(ticker).strip():
        raise DataDownloadError("Ticker must be a non-empty string.")

    try:
        # progress=False keeps console output clean when looping over tickers.
        raw = yf.download(
            tickers=ticker,
            start=start_date,
            end=end_date,
            auto_adjust=True,
            progress=False,
        )
    except Exception as exc:  # network / library errors -> uniform error type
        raise DataDownloadError(
            f"Failed to download data for '{ticker}': {exc}"
        ) from exc

    # yfinance returns an empty frame (not an error) for bad symbols / no data.
    if raw is None or raw.empty:
        raise DataDownloadError(
            f"No data returned for '{ticker}' between {start_date} and {end_date}."
        )

    df = raw.copy()

    # When a single ticker is requested newer yfinance versions may still return
    # a MultiIndex column structure (e.g. ('Close', 'AAPL')). Flatten it so we
    # always work with simple, predictable column names.
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # Move the DatetimeIndex into an explicit 'Date' column and reset to a clean
    # integer index. This makes the frame easy to save to / load from CSV.
    df = df.reset_index()

    # yfinance names the index 'Date' for daily data; normalise just in case.
    if "Date" not in df.columns:
        df = df.rename(columns={df.columns[0]: "Date"})

    # Tag every row with its ticker so several assets can be safely concatenated.
    df["Ticker"] = ticker

    # Keep only the canonical columns, in a predictable order, when present.
    expected_cols = ["Date", "Open", "High", "Low", "Close", "Volume", "Ticker"]
    available = [c for c in expected_cols if c in df.columns]
    df = df[available]

    # Drop rows with no Close price (occasional holidays / bad bars) and sort.
    df = df.dropna(subset=["Close"]).sort_values("Date").reset_index(drop=True)

    if df.empty:
        raise DataDownloadError(
            f"Data for '{ticker}' was empty after cleaning (all rows invalid)."
        )

    return df
