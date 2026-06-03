"""Yahoo Finance market-data provider.

The default, no-API-key-required provider. Wraps :mod:`yfinance` and returns
data in the canonical schema defined by :class:`MarketDataProvider`.
"""

from __future__ import annotations

import pandas as pd
import yfinance as yf

from src import config
from src.utils.logging_utils import get_logger

from .base import MarketDataProvider, ProviderError

logger = get_logger(__name__)


class YFinanceProvider(MarketDataProvider):
    """Concrete provider backed by Yahoo Finance via :mod:`yfinance`."""

    name = "yfinance"

    def get_historical_data(
        self,
        ticker: str,
        start_date: str = config.DEFAULT_START_DATE,
        end_date: str = config.DEFAULT_END_DATE,
    ) -> pd.DataFrame:
        """Download and clean OHLCV data for ``ticker`` from Yahoo Finance.

        ``auto_adjust=True`` returns prices already adjusted for splits and
        dividends - the correct series to use for return calculations.

        Raises
        ------
        ProviderError
            On network/library failure, or if no data is returned.
        """
        self._validate_ticker(ticker)
        logger.info("yfinance: downloading %s (%s -> %s)", ticker, start_date, end_date)

        try:
            raw = yf.download(
                tickers=ticker,
                start=start_date,
                end=end_date,
                auto_adjust=True,
                progress=False,
            )
        except Exception as exc:  # uniform error type for all callers
            raise ProviderError(
                f"yfinance failed to download '{ticker}': {exc}"
            ) from exc

        if raw is None or raw.empty:
            raise ProviderError(
                f"yfinance returned no data for '{ticker}' "
                f"between {start_date} and {end_date}."
            )

        df = raw.copy()

        # Newer yfinance versions may return MultiIndex columns even for a single
        # ticker (e.g. ('Close', 'AAPL')). Flatten to simple column names.
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        # Promote the DatetimeIndex to an explicit 'Date' column.
        df = df.reset_index()
        if "Date" not in df.columns:
            df = df.rename(columns={df.columns[0]: "Date"})

        # Standardise to the canonical schema (adds Ticker, sorts, drops bad rows).
        df = self._standardize(df, ticker)

        if df.empty:
            raise ProviderError(
                f"Data for '{ticker}' was empty after cleaning (all rows invalid)."
            )

        logger.info("yfinance: %s rows for %s", len(df), ticker)
        return df
