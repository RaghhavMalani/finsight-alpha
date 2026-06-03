"""Polygon.io market-data provider (placeholder).

Structural stub for Phase 1C. Reads its API key from the environment and
conforms to the :class:`MarketDataProvider` interface. Selecting it without a
key raises a clear, catchable :class:`ProviderError` rather than crashing.
"""

from __future__ import annotations

import pandas as pd

from src import config
from src.utils.logging_utils import get_logger

from .base import MarketDataProvider, ProviderError

logger = get_logger(__name__)


class PolygonProvider(MarketDataProvider):
    """Placeholder provider for Polygon.io (https://polygon.io/)."""

    name = "polygon"

    # Polygon aggregates ("bars") REST base URL (used once implemented).
    BASE_URL = "https://api.polygon.io/v2/aggs/ticker"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or config.POLYGON_API_KEY
        if not self.api_key:
            logger.warning(
                "PolygonProvider created without POLYGON_API_KEY; calls will "
                "fail until a key is provided."
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
        """Fetch OHLCV data from Polygon.io.

        Not yet implemented - raises :class:`ProviderError` so callers can fall
        back to yfinance gracefully.
        """
        self._validate_ticker(ticker)
        if not self.is_configured:
            raise ProviderError(
                "Polygon API key is missing. Set POLYGON_API_KEY in your .env "
                "file, or use the yfinance provider."
            )

        # TODO(Phase 1C): implement the real request.
        #   1. GET {BASE_URL}/{ticker}/range/1/day/{start_date}/{end_date}
        #      with apiKey=self.api_key and adjusted=true (requests.get).
        #   2. Parse the JSON "results" array (keys: t, o, h, l, c, v).
        #   3. Convert epoch-ms "t" -> Date, rename o/h/l/c/v -> OHLCV.
        #   4. Return self._standardize(df, ticker).
        raise ProviderError(
            "PolygonProvider is a Phase 1C placeholder and is not yet "
            "implemented. Use provider='yfinance'."
        )
