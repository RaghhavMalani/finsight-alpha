"""Provider interface for market data.

Every concrete data source (yfinance, Alpha Vantage, Polygon, future NSE/BSE
feeds) implements the same :class:`MarketDataProvider` interface. Code that
consumes market data depends only on this abstraction, so swapping or adding a
provider never requires changes downstream (the Dependency Inversion Principle).

The canonical output schema returned by every provider is::

    Date | Open | High | Low | Close | Volume | Ticker
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd

from src import config

# The single source of truth for the standardised column order/names.
STANDARD_COLUMNS: list[str] = [
    "Date",
    "Open",
    "High",
    "Low",
    "Close",
    "Volume",
    "Ticker",
]


class ProviderError(RuntimeError):
    """Raised when a provider cannot return valid data.

    A single, uniform error type lets callers handle failures from *any*
    provider in the same way.
    """


class MarketDataProvider(ABC):
    """Abstract base class defining the market-data provider contract.

    Subclasses must implement :meth:`get_historical_data`. Helper methods for
    validation and column standardisation are provided so concrete providers
    stay small and consistent.
    """

    #: Human-readable provider name, overridden by subclasses.
    name: str = "base"

    @abstractmethod
    def get_historical_data(
        self,
        ticker: str,
        start_date: str = config.DEFAULT_START_DATE,
        end_date: str = config.DEFAULT_END_DATE,
    ) -> pd.DataFrame:
        """Return cleaned historical OHLCV data for a single ticker.

        Parameters
        ----------
        ticker:
            The symbol to fetch (provider-specific format).
        start_date:
            Inclusive ISO start date ``"YYYY-MM-DD"``.
        end_date:
            Exclusive ISO end date ``"YYYY-MM-DD"``.

        Returns
        -------
        pandas.DataFrame
            A frame with exactly :data:`STANDARD_COLUMNS`.

        Raises
        ------
        ProviderError
            If the data cannot be fetched or is empty/invalid.
        """
        raise NotImplementedError

    # -- shared helpers ----------------------------------------------------
    @staticmethod
    def _standardize(df: pd.DataFrame, ticker: str) -> pd.DataFrame:
        """Coerce a raw frame into the canonical :data:`STANDARD_COLUMNS` schema.

        Adds the ``Ticker`` column, keeps only known columns in canonical order,
        drops rows without a ``Close``, and sorts by ``Date``.
        """
        out = df.copy()
        out["Ticker"] = ticker
        available = [c for c in STANDARD_COLUMNS if c in out.columns]
        out = out[available]
        if "Close" in out.columns:
            out = out.dropna(subset=["Close"])
        if "Date" in out.columns:
            out = out.sort_values("Date")
        return out.reset_index(drop=True)

    @staticmethod
    def _validate_ticker(ticker: str) -> None:
        """Raise :class:`ProviderError` if the ticker is empty/blank."""
        if not ticker or not str(ticker).strip():
            raise ProviderError("Ticker must be a non-empty string.")
