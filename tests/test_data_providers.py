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
