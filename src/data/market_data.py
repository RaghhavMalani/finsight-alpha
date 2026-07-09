"""Market data service.

:class:`MarketDataService` is the single entry point the rest of the app uses to
obtain market data. It is provider-agnostic: it delegates the actual download to
whichever :class:`~src.data.providers.base.MarketDataProvider` is selected
(yfinance by default) and adds convenience for fetching many tickers at once.

The function :func:`download_stock_data` is preserved for backwards
compatibility with Phase 1A code and tests.
"""

from __future__ import annotations

import threading
import time

import pandas as pd

from src import config
from src.data.providers import ProviderError, get_provider
from src.data.providers.base import MarketDataProvider
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)


# Re-exported alias so existing imports of DataDownloadError keep working.
DataDownloadError = ProviderError

# ---------------------------------------------------------------------------
# In-process TTL cache for downloaded price frames.
#
# Every API route (quote, tape, backtest, montecarlo, factors, regime, chain,
# analytics, agent tools) funnels through MarketDataService.get_data, so this
# one cache makes repeat requests near-instant and stops hammering yfinance.
# EOD data doesn't change intraday; 15 minutes is a safe freshness window.
# ---------------------------------------------------------------------------
_CACHE_TTL_SECONDS = 900
_cache: dict[tuple, tuple[float, pd.DataFrame]] = {}
_cache_lock = threading.Lock()
_MAX_CACHE_ENTRIES = 256


def clear_price_cache() -> None:
    """Drop all cached frames (mainly for tests)."""
    with _cache_lock:
        _cache.clear()


class MarketDataService:
    """Fetch and combine market data through a pluggable provider.

    Parameters
    ----------
    provider:
        Either a provider name (``"yfinance"``, ``"alpha_vantage"``,
        ``"polygon"``) or an already-constructed
        :class:`MarketDataProvider` instance. Defaults to ``"yfinance"``.
    """

    def __init__(self, provider: str | MarketDataProvider = "yfinance") -> None:
        if isinstance(provider, MarketDataProvider):
            self.provider = provider
        else:
            self.provider = get_provider(provider)
        logger.debug("MarketDataService using provider '%s'", self.provider.name)

    def get_data(
        self,
        ticker: str,
        start_date: str = config.DEFAULT_START_DATE,
        end_date: str = config.DEFAULT_END_DATE,
    ) -> pd.DataFrame:
        """Download cleaned OHLCV data for a single ticker.

        The returned frame includes a ``Provider`` column recording which source
        produced the data (useful for auditing once multiple providers are live).

        Results are cached in-process for 15 minutes per (provider, ticker,
        window), so repeated calls from the terminal are served from memory.
        """
        key = (self.provider.name, ticker.upper(), str(start_date), str(end_date))
        now = time.time()
        with _cache_lock:
            hit = _cache.get(key)
            if hit is not None and now - hit[0] < _CACHE_TTL_SECONDS:
                return hit[1].copy()

        df = self.provider.get_historical_data(ticker, start_date, end_date)
        df = df.copy()
        df["Provider"] = self.provider.name

        with _cache_lock:
            if len(_cache) >= _MAX_CACHE_ENTRIES:  # drop oldest entries
                for old_key, _ in sorted(_cache.items(), key=lambda kv: kv[1][0])[:32]:
                    _cache.pop(old_key, None)
            _cache[key] = (now, df.copy())
        return df

    def get_multiple(
        self,
        tickers: list[str],
        start_date: str = config.DEFAULT_START_DATE,
        end_date: str = config.DEFAULT_END_DATE,
        skip_errors: bool = True,
    ) -> pd.DataFrame:
        """Download several tickers and return one combined, tidy DataFrame.

        Parameters
        ----------
        tickers:
            List of symbols to fetch.
        start_date, end_date:
            ISO date window.
        skip_errors:
            If ``True`` (default), a failed ticker is logged and skipped so one
            bad symbol does not abort the whole batch. If ``False``, the first
            error is re-raised.

        Returns
        -------
        pandas.DataFrame
            Long-format frame (``Date, Open, ..., Ticker``) with all successful
            tickers stacked vertically. Empty frame if nothing succeeded.
        """
        frames: list[pd.DataFrame] = []
        for ticker in tickers:
            try:
                frames.append(self.get_data(ticker, start_date, end_date))
            except ProviderError as exc:
                logger.warning("Skipping '%s': %s", ticker, exc)
                if not skip_errors:
                    raise

        if not frames:
            logger.warning("No data fetched for any of: %s", tickers)
            return pd.DataFrame(
                columns=["Date", "Open", "High", "Low", "Close", "Volume", "Ticker", "Provider"]
            )

        combined = pd.concat(frames, ignore_index=True)
        return combined.sort_values(["Ticker", "Date"]).reset_index(drop=True)


def download_stock_data(
    ticker: str,
    start_date: str = config.DEFAULT_START_DATE,
    end_date: str = config.DEFAULT_END_DATE,
) -> pd.DataFrame:
    """Backwards-compatible single-ticker download (Phase 1A API).

    Delegates to :class:`MarketDataService` with the default yfinance provider.

    Raises
    ------
    DataDownloadError
        If the download fails or returns no rows.
    """
    return MarketDataService("yfinance").get_data(ticker, start_date, end_date)
