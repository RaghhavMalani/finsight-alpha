"""The Overview's candles: one bar series per chart range, labelled, never synthesized."""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException

import backend.routes.quote as quote
from src.data.providers import ProviderError

FETCHED = "2026-10-07T13:00:00+00:00"


class _FrozenDate(date):
    @classmethod
    def today(cls) -> "_FrozenDate":
        return cls(2026, 10, 7)  # a Wednesday


def _daily(start: str = "2021-09-01", end: str = "2026-10-07") -> pd.DataFrame:
    dates = pd.bdate_range(start, end)
    close = 100.0 + 0.1 * np.arange(len(dates))
    return pd.DataFrame(
        {
            "Date": dates,
            "Open": close - 0.05,
            "High": close + 0.5,
            "Low": close - 0.5,
            "Close": close,
            "Volume": 1_000.0,
            "Ticker": "SPY",
            "Provider": "fake",
        }
    )


def _intraday(tz: str = "America/New_York") -> pd.DataFrame:
    times = pd.date_range("2026-10-06 09:30", periods=4, freq="5min", tz=tz)
    return pd.DataFrame(
        {
            "Date": times,
            "Open": [10.0, 11.0, 12.0, 13.0],
            "High": [11.0, 12.0, 13.0, 14.0],
            "Low": [9.0, 10.0, 11.0, 12.0],
            "Close": [11.0, 12.0, 13.0, 13.5],
            "Volume": [100.0, 200.0, np.nan, 400.0],
            "Ticker": "SPY",
            "Provider": "fake",
        }
    )


class _Service:
    """Stands in for MarketDataService; records what the route asked for."""

    calls: list = []
    daily = _daily()
    intraday = _intraday()
    error: Exception | None = None

    def __init__(self, provider: str = "yfinance") -> None:
        self.provider = provider

    @classmethod
    def _answer(cls, frame: pd.DataFrame) -> pd.DataFrame:
        if cls.error:
            raise cls.error
        out = frame.copy()
        out.attrs["fetched_at"] = FETCHED
        return out

    def get_data(self, ticker, start, end):
        type(self).calls.append(("daily", ticker, start, end))
        return self._answer(type(self).daily)

    def get_intraday(self, ticker, period, interval):
        type(self).calls.append(("intraday", ticker, period, interval))
        return self._answer(type(self).intraday)


@pytest.fixture(autouse=True)
def service(monkeypatch):
    monkeypatch.setattr(quote, "MarketDataService", _Service)
    monkeypatch.setattr(quote, "date", _FrozenDate)
    monkeypatch.setattr(_Service, "calls", [])
    monkeypatch.setattr(_Service, "daily", _daily())
    monkeypatch.setattr(_Service, "intraday", _intraday())
    monkeypatch.setattr(_Service, "error", None)
    return _Service


def test_each_range_asks_for_its_interval(service) -> None:
    expected = {"1D": "5m", "5D": "30m", "5Y": "1wk"}
    for range_ in quote.BAR_RANGES:
        payload = quote.get_bars("spy", range_)
        assert payload["ticker"] == "SPY" and payload["range"] == range_
        assert payload["interval"] == expected.get(range_, "1d")
        assert payload["intraday"] is (range_ in ("1D", "5D"))
    intraday_calls = [c for c in service.calls if c[0] == "intraday"]
    assert intraday_calls == [("intraday", "SPY", "1d", "5m"), ("intraday", "SPY", "5d", "30m")]
    # Every daily range reads one five-year frame whose exclusive end keeps today's bar.
    daily_calls = {c for c in service.calls if c[0] == "daily"}
    assert len(daily_calls) == 1
    (_, _, start, end), = daily_calls
    assert end == "2026-10-08"
    assert start <= "2021-09-30"


def test_daily_ranges_trim_to_their_window(service) -> None:
    first = {r: quote.get_bars("SPY", r)["bars"][0]["t"] for r in ("1M", "3M", "6M", "YTD", "1Y")}
    assert first == {
        "1M": "2026-09-07",
        "3M": "2026-07-07",
        "6M": "2026-04-07",
        "YTD": "2026-01-01",
        "1Y": "2025-10-07",
    }
    for r in ("1M", "1Y"):
        assert quote.get_bars("SPY", r)["bars"][-1]["t"] == "2026-10-07"


def test_weekly_bars_aggregate_the_daily_bars() -> None:
    # Monday 2026-09-07 is a holiday, so that week opens on Tuesday.
    days = pd.to_datetime(
        ["2026-09-01", "2026-09-02", "2026-09-04", "2026-09-08", "2026-09-09", "2026-09-11"]
    )
    daily = pd.DataFrame(
        {
            "Date": days,
            "Open": [10.0, 11.0, 12.0, 20.0, 21.0, 22.0],
            "High": [11.0, 15.0, 13.0, 21.0, 25.0, 23.0],
            "Low": [9.0, 10.0, 8.0, 19.0, 18.0, 21.0],
            "Close": [10.5, 12.0, 12.5, 20.5, 22.0, 22.5],
            "Volume": [1.0, 2.0, 3.0, np.nan, np.nan, np.nan],
        }
    )
    weekly = quote.weekly_bars(daily)
    assert weekly["Date"].dt.strftime("%Y-%m-%d").tolist() == ["2026-09-01", "2026-09-08"]
    assert weekly[["Open", "High", "Low", "Close"]].values.tolist() == [
        [10.0, 15.0, 8.0, 12.5],
        [20.0, 25.0, 18.0, 22.5],
    ]
    assert weekly["Volume"].iloc[0] == 6.0
    assert np.isnan(weekly["Volume"].iloc[1]), "no reported volume is missing, not zero"


def test_five_years_of_weeks_has_no_partial_first_week(service) -> None:
    payload = quote.get_bars("SPY", "5Y")
    weeks = pd.to_datetime([bar["t"] for bar in payload["bars"]])
    # The cutoff is Thursday 2021-10-07; the week that began on 2021-10-04 is cut whole.
    assert weeks[0] == pd.Timestamp("2021-10-11")
    assert (weeks.dayofweek == 0).all()
    assert payload["bars"][-1]["t"] == "2026-10-05"
    daily = service.daily.set_index("Date")
    last_week = daily.loc["2026-10-05":"2026-10-07"]
    assert payload["bars"][-1]["c"] == pytest.approx(last_week["Close"].iloc[-1])
    assert payload["bars"][-1]["v"] == pytest.approx(last_week["Volume"].sum())


def test_intraday_bars_keep_the_exchange_timezone(service) -> None:
    service.intraday = _intraday("Asia/Kolkata")
    payload = quote.get_bars("RELIANCE.NS", "1D")
    assert payload["timezone"] == "Asia/Kolkata"
    assert payload["bars"][0]["t"] == "2026-10-06T09:30:00+05:30"
    assert payload["source"] == "FAKE"
    assert payload["fetched_at"] == FETCHED
    assert payload["adjusted"] == "splits_and_dividends"
    assert quote.get_bars("SPY", "1Y")["timezone"] is None, "daily bars are trading dates"


def test_rows_without_prices_are_dropped_and_missing_volume_stays_null(service) -> None:
    frame = _intraday()
    frame.loc[1, "High"] = np.nan
    frame.loc[2, "Close"] = np.inf
    service.intraday = frame
    bars = quote.get_bars("SPY", "1D")["bars"]
    assert [bar["t"][11:16] for bar in bars] == ["09:30", "09:45"]
    assert bars[-1]["v"] == 400.0
    service.intraday = _intraday()
    assert quote.get_bars("SPY", "1D")["bars"][2]["v"] is None


def test_provider_failure_is_a_502_and_no_bars_a_404(service) -> None:
    service.error = ProviderError("yfinance returned no 5m bars for 'SPY'.")
    with pytest.raises(HTTPException) as caught:
        quote.get_bars("SPY", "1D")
    assert caught.value.status_code == 502
    assert "Price bars unavailable" in caught.value.detail

    service.error = None
    service.daily = _daily(end="2026-08-31")  # history stops before the 1M window
    with pytest.raises(HTTPException) as caught:
        quote.get_bars("SPY", "1M")
    assert caught.value.status_code == 404


def test_bad_symbol_and_unknown_range_are_422(service) -> None:
    for ticker, range_ in (("../etc", "1D"), ("SPY,QQQ", "1D"), ("SPY", "2Y")):
        with pytest.raises(HTTPException) as caught:
            quote.get_bars(ticker, range_)
        assert caught.value.status_code == 422
    assert service.calls == [], "nothing is fetched for a request that can't be served"
