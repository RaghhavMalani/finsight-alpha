"""Tests for the data-provider architecture.

These tests avoid hitting the network. They verify:

* the provider registry / factory works,
* the abstract base cannot be instantiated,
* placeholder providers fail cleanly (no key / not implemented),
* column standardisation produces the canonical schema,
* MarketDataService works against a fake in-memory provider.

Run with::

    pytest -q
"""

from __future__ import annotations

import pandas as pd
import pytest

from src.data.market_data import MarketDataService
from src.data.providers import (
    AVAILABLE_PROVIDERS,
    AlphaVantageProvider,
    MarketDataProvider,
    PolygonProvider,
    ProviderError,
    YFinanceProvider,
    get_provider,
)
from src.data.providers.base import STANDARD_COLUMNS


def test_registry_contains_expected_providers() -> None:
    assert "yfinance" in AVAILABLE_PROVIDERS
    assert "alpha_vantage" in AVAILABLE_PROVIDERS
    assert "polygon" in AVAILABLE_PROVIDERS


def test_get_provider_returns_instances() -> None:
    assert isinstance(get_provider("yfinance"), YFinanceProvider)
    assert isinstance(get_provider("alpha_vantage"), AlphaVantageProvider)
    assert isinstance(get_provider("polygon"), PolygonProvider)


def test_get_provider_unknown_raises() -> None:
    with pytest.raises(ProviderError):
        get_provider("not-a-real-provider")


def test_abstract_base_cannot_be_instantiated() -> None:
    with pytest.raises(TypeError):
        MarketDataProvider()  # type: ignore[abstract]


def test_placeholder_providers_raise_without_key() -> None:
    # Construct with an explicitly empty key so the test is independent of env.
    av = AlphaVantageProvider(api_key="")
    poly = PolygonProvider(api_key="")
    with pytest.raises(ProviderError):
        av.get_historical_data("AAPL")
    with pytest.raises(ProviderError):
        poly.get_historical_data("AAPL")


def test_placeholder_not_implemented_even_with_key() -> None:
    # Even with a (fake) key, the placeholders are not implemented yet.
    av = AlphaVantageProvider(api_key="FAKE")
    with pytest.raises(ProviderError):
        av.get_historical_data("AAPL")


def test_standardize_produces_canonical_schema() -> None:
    raw = pd.DataFrame(
        {
            "Date": pd.to_datetime(["2024-01-02", "2024-01-01"]),
            "Open": [2.0, 1.0],
            "High": [2.0, 1.0],
            "Low": [2.0, 1.0],
            "Close": [2.0, 1.0],
            "Volume": [200, 100],
        }
    )
    out = MarketDataProvider._standardize(raw, "AAPL")
    assert list(out.columns) == STANDARD_COLUMNS
    assert (out["Ticker"] == "AAPL").all()
    # Sorted ascending by Date.
    assert out["Date"].is_monotonic_increasing


def test_validate_ticker_rejects_blank() -> None:
    with pytest.raises(ProviderError):
        MarketDataProvider._validate_ticker("   ")


class _FakeProvider(MarketDataProvider):
    """In-memory provider used to test MarketDataService without networking."""

    name = "fake"

    def get_historical_data(self, ticker, start_date=None, end_date=None):  # type: ignore[override]
        self._validate_ticker(ticker)
        if ticker == "BAD":
            raise ProviderError("simulated failure")
        df = pd.DataFrame(
            {
                "Date": pd.to_datetime(["2024-01-01", "2024-01-02"]),
                "Open": [1.0, 2.0],
                "High": [1.0, 2.0],
                "Low": [1.0, 2.0],
                "Close": [1.0, 2.0],
                "Volume": [100, 200],
            }
        )
        return self._standardize(df, ticker)


def test_market_data_service_single() -> None:
    service = MarketDataService(_FakeProvider())
    df = service.get_data("AAPL")
    # Service adds a Provider column on top of the canonical schema.
    assert list(df.columns) == STANDARD_COLUMNS + ["Provider"]
    assert (df["Provider"] == "fake").all()
    assert len(df) == 2


def test_market_data_service_multiple_skips_errors() -> None:
    service = MarketDataService(_FakeProvider())
    df = service.get_multiple(["AAPL", "BAD", "MSFT"], skip_errors=True)
    # BAD is skipped; AAPL and MSFT remain.
    assert set(df["Ticker"].unique()) == {"AAPL", "MSFT"}
    assert len(df) == 4


def test_market_data_service_multiple_raises_when_not_skipping() -> None:
    service = MarketDataService(_FakeProvider())
    with pytest.raises(ProviderError):
        service.get_multiple(["AAPL", "BAD"], skip_errors=False)


def test_concurrent_yfinance_downloads_keep_their_own_window(monkeypatch) -> None:
    """yf.download shares module state, so overlapping calls must not interleave."""
    import threading
    import time
    from concurrent.futures import ThreadPoolExecutor

    from src.data.providers import yfinance_provider

    shared = {}  # stands in for yfinance.shared, reset by every download

    def fake_download(tickers, start, end, auto_adjust, progress):
        shared.clear()
        shared[tickers] = start
        time.sleep(0.02)  # another thread's download would reset `shared` here
        dates = pd.bdate_range(shared.get(tickers, "2000-01-03"), periods=5)
        return pd.DataFrame(
            {"Open": 1.0, "High": 1.0, "Low": 1.0, "Close": 1.0, "Volume": 1.0}, index=dates
        ).rename_axis("Date")

    monkeypatch.setattr(yfinance_provider.yf, "download", fake_download)
    provider = yfinance_provider.YFinanceProvider()
    starts = ["2018-01-02", "2024-06-03"] * 6
    barrier = threading.Barrier(len(starts))

    def fetch(start):
        barrier.wait()
        return start, provider.get_historical_data("SPY", start, None)["Date"].min()

    with ThreadPoolExecutor(len(starts)) as pool:
        for start, first in pool.map(fetch, starts):
            assert first == pd.Timestamp(start)


def test_default_end_date_is_read_on_each_call(monkeypatch) -> None:
    """A server left running must not keep asking for data up to the day it started."""
    import src.data.market_data as market_data

    seen = []

    class _Recording(_FakeProvider):
        def get_historical_data(self, ticker, start_date=None, end_date=None):  # type: ignore[override]
            seen.append(end_date)
            return super().get_historical_data(ticker, start_date, end_date)

    market_data.clear_price_cache()
    service = MarketDataService(_Recording())
    for day in ("2026-10-06", "2026-10-07"):
        monkeypatch.setattr(market_data, "_today", lambda day=day: day)
        service.get_data("ENDT")
        service.get_multiple(["ENDT"])  # served from the cache for the same day
    assert seen == ["2026-10-06", "2026-10-07"]
    market_data.clear_price_cache()


def test_providers_without_intraday_bars_say_so() -> None:
    with pytest.raises(ProviderError, match="intraday"):
        _FakeProvider().get_intraday_data("AAPL", "1d", "5m")


def test_yfinance_intraday_bars_take_the_download_lock(monkeypatch) -> None:
    """Ticker.history writes the shared state yf.download resets, so it is serialized too."""
    from src.data.providers import yfinance_provider

    calls = []

    class _Ticker:
        def __init__(self, symbol):
            self.symbol = symbol

        def history(self, period, interval, auto_adjust, prepost):
            calls.append((self.symbol, period, interval, auto_adjust, prepost))
            assert yfinance_provider._DOWNLOAD_LOCK.locked(), "history ran outside the lock"
            index = pd.date_range(
                "2026-10-06 09:30", periods=3, freq="5min", tz="America/New_York"
            ).rename("Datetime")
            return pd.DataFrame(
                {
                    "Open": [1.0, 2.0, 3.0],
                    "High": [1.5, 2.5, 3.5],
                    "Low": [0.5, 1.5, 2.5],
                    "Close": [1.2, None, 3.2],
                    "Volume": [10, 20, 30],
                    "Dividends": 0.0,
                    "Stock Splits": 0.0,
                },
                index=index,
            )

    monkeypatch.setattr(yfinance_provider.yf, "Ticker", _Ticker)
    df = yfinance_provider.YFinanceProvider().get_intraday_data("SPY", "1d", "5m")

    assert calls == [("SPY", "1d", "5m", True, False)]
    assert list(df.columns) == STANDARD_COLUMNS
    assert len(df) == 2, "a bar without a close is dropped"
    assert str(df["Date"].dt.tz) == "America/New_York"


def test_yfinance_intraday_without_bars_raises(monkeypatch) -> None:
    from src.data.providers import yfinance_provider

    class _Empty:
        def __init__(self, symbol):
            pass

        def history(self, **kwargs):
            return pd.DataFrame()

    monkeypatch.setattr(yfinance_provider.yf, "Ticker", _Empty)
    with pytest.raises(ProviderError, match="no 5m bars"):
        yfinance_provider.YFinanceProvider().get_intraday_data("ZZZZ", "1d", "5m")


def test_intraday_bars_are_cached_for_a_minute(monkeypatch) -> None:
    import src.data.market_data as market_data

    calls = []

    class _Intraday(_FakeProvider):
        def get_intraday_data(self, ticker, period, interval):
            calls.append((ticker, period, interval))
            return self.get_historical_data(ticker)

    from types import SimpleNamespace

    clock = [1_000.0]
    monkeypatch.setattr(market_data, "time", SimpleNamespace(time=lambda: clock[0]))
    market_data.clear_price_cache()
    service = MarketDataService(_Intraday())

    first = service.get_intraday("INTR", "1d", "5m")
    clock[0] += 59
    service.get_intraday("INTR", "1d", "5m")
    service.get_intraday("INTR", "5d", "30m")  # a different window is its own entry
    clock[0] += 2
    service.get_intraday("INTR", "1d", "5m")

    assert calls == [("INTR", "1d", "5m"), ("INTR", "5d", "30m"), ("INTR", "1d", "5m")]
    assert (first["Provider"] == "fake").all()
    market_data.clear_price_cache()
