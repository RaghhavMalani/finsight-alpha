"""Alpha Vantage market-data provider (placeholder).

This is a structural stub for Phase 1C. It reads the API key from the
environment and conforms to the :class:`MarketDataProvider` interface, but the
network call is not yet implemented. The app must never crash just because this
provider is selected without a key - we raise a clear, catchable
:class:`ProviderError` instead.
"""

from __future__ import annotations

import pandas as pd

from src import config
from src.utils.logging_utils import get_logger

from .base import MarketDataProvider, ProviderError

logger = get_logger(__name__)


class AlphaVantageProvider(MarketDataProvider):
    """Placeholder provider for Alpha Vantage (https://www.alphavantage.co/)."""

    name = "alpha_vantage"

    # Alpha Vantage REST base URL (used once implemented).
    BASE_URL = "https://www.alphavantage.co/query"

    def __init__(self, api_key: str | None = None) -> None:
        # Prefer an explicit key, else fall back to the environment/config.
        self.api_key = api_key or config.ALPHA_VANTAGE_API_KEY
        if not self.api_key:
            # Not fatal at construction time - only fetching requires the key.
            logger.warning(
                "AlphaVantageProvider created without ALPHA_VANTAGE_API_KEY; "
                "calls will fail until a key is provided."
            )

    @property
    def is_configured(self) -> bool:
        """Whether an API key is available."""
        return bool(self.api_key)

    def get_historical_data(
        self,
        ticker: str,
        start_date: str = config.DEFAULT_START_DATE,
        end_date: str = config.DEFAULT_END_DATE,
    ) -> pd.DataFrame:
        """Fetch OHLCV data from Alpha Vantage.

        Not yet implemented - raises :class:`ProviderError` so the dashboard can
        show a friendly message and fall back to yfinance.
        """
        self._validate_ticker(ticker)
        if not self.is_configured:
            raise ProviderError(
                "Alpha Vantage API key is missing. Set ALPHA_VANTAGE_API_KEY in "
                "your .env file, or use the yfinance provider."
            )

        # TODO(Phase 1C): implement the real request.
        #   1. Call TIME_SERIES_DAILY_ADJUSTED with self.api_key (requests.get).
        #   2. Parse the JSON "Time Series (Daily)" object into a DataFrame.
        #   3. Rename columns to Open/High/Low/Close/Volume and parse Date.
        #   4. Filter rows to [start_date, end_date).
        #   5. Return self._standardize(df, ticker).
        #   Remember Alpha Vantage free tier rate limits (~5 req/min).
        raise ProviderError(
            "AlphaVantageProvider is a Phase 1C placeholder and is not yet "
            "implemented. Use provider='yfinance'."
        )
