"""Market feeds: delayed US quotes (yfinance), IEX latest bars (Alpaca, key-gated), NSE EOD.

None of these is presented as real-time: each carries its delay label on every event.
"""

from __future__ import annotations

import json
import os
from datetime import timedelta
from pathlib import Path

import pandas as pd

from .. import model
from .base import Feed, FeedError, Fetched, http_get

YAHOO_LICENCE = model.licence(
    "UNVERIFIED", "Yahoo Finance via the yfinance library",
    "https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html", "LOCAL_ONLY",
    "Unofficial access; terms restrict redistribution. Local research display only")


def _tickers(env_name: str, default: str) -> list[str]:
    return [t.strip().upper() for t in os.getenv(env_name, default).split(",") if t.strip()]


def bar_observations(feed: Feed, frame: pd.DataFrame, ticker: str, fetched: Fetched, *, now, bar=timedelta(minutes=1)):
    """The latest COMPLETED bar only; a bar still forming is not a fact yet."""
    if frame is None or frame.empty:
        return []
    frame = frame.copy()
    frame["Date"] = pd.to_datetime(frame["Date"], utc=True)
    done = frame[frame["Date"] + bar <= pd.Timestamp(now)]
    if done.empty:
        return []
    row = done.iloc[-1]
    values = {k.lower(): (None if pd.isna(row[k]) else float(row[k]))
              for k in ("Open", "High", "Low", "Close", "Volume") if k in row}
    start = row["Date"].to_pydatetime()
    end = start + bar
    revision = model.sha256_hex(model.canonical(values))[:16]
    return [feed.observation(
        source_id=f"{ticker}:{model.iso(start)}", revision=revision, observed_at=model.iso(end),
        effective_at=None, fetched=fetched,
        payload={"kind": "bar", "ticker": ticker, "interval": "1m", "bar_start": model.iso(start),
                 "bar_end": model.iso(end), **values, "delay": feed.delay},
    )]


class YahooUSQuotes(Feed):
    name = "yfinance_us"
    event_type = "market.tick"
    cadence_s = 120
    min_interval_s = 60
    delay = "DELAYED: Yahoo Finance via yfinance, unofficial; delay not guaranteed (commonly up to 15 min)"
    confidence = "UNOFFICIAL"
    parser = "live-yfinance/1"
    licence = YAHOO_LICENCE

    def __init__(self, tickers: list[str] | None = None):
        self.tickers = tickers or _tickers("FINSIGHT_LIVE_US_TICKERS", "SPY,QQQ,IWM,^VIX,TLT,GLD")
        self.partial_errors: list[str] = []

    def fetch(self):
        from src.data.providers.base import ProviderError
        from src.data.providers.yfinance_provider import YFinanceProvider

        provider, out, self.partial_errors = YFinanceProvider(), [], []
        now = model.utcnow()
        for ticker in self.tickers:
            try:
                frame = provider.get_intraday_data(ticker, "1d", "1m")
            except ProviderError as error:
                self.partial_errors.append(f"{ticker}: {str(error)[:120]}")
                continue
            tail = frame.tail(3)
            fetched = Fetched(tail.to_csv(index=False).encode("utf-8"),
                              f"yfinance:Ticker({ticker}).history(period=1d,interval=1m)",
                              model.iso(now))
            out.extend(bar_observations(self, tail, ticker, fetched, now=now))
        if not out and self.partial_errors:
            raise FeedError("; ".join(self.partial_errors)[:400])
        return out


class AlpacaIEX(Feed):
    name = "alpaca_iex"
    event_type = "market.tick"
    cadence_s = 60
    min_interval_s = 30
    delay = "IEX_ONLY: latest minute bar from the IEX venue alone; not consolidated tape or NBBO"
    confidence = "PROVISIONAL"
    parser = "live-alpaca/1"
    url = "https://data.alpaca.markets/v2/stocks/bars/latest"
    required_env = (("APCA_API_KEY_ID", "ALPACA_API_KEY_ID", "ALPACA_API_KEY"),
                    ("APCA_API_SECRET_KEY", "ALPACA_API_SECRET_KEY", "ALPACA_SECRET_KEY"))
    licence = model.licence(
        "LICENSED_LOCAL", "Alpaca Markets; IEX venue data", "https://alpaca.markets/disclosures", "LOCAL_ONLY",
        "Free IEX feed under the operator's Alpaca account; no redistribution")

    def __init__(self, tickers: list[str] | None = None):
        self.tickers = tickers or _tickers("FINSIGHT_LIVE_IEX_TICKERS", "SPY,QQQ,IWM,TLT,GLD")

    def fetch(self):
        headers = {"APCA-API-KEY-ID": self.env(*self.required_env[0]),
                   "APCA-API-SECRET-KEY": self.env(*self.required_env[1])}
        return self.parse(http_get(self.url, params={"symbols": ",".join(self.tickers), "feed": "iex"},
                                   headers=headers))

    def parse(self, fetched: Fetched):
        payload = json.loads(fetched.raw.decode("utf-8"))
        out = []
        for ticker, bar in sorted((payload.get("bars") or {}).items()):
            frame = pd.DataFrame([{"Date": bar["t"], "Open": bar.get("o"), "High": bar.get("h"),
                                   "Low": bar.get("l"), "Close": bar.get("c"), "Volume": bar.get("v")}])
            out.extend(bar_observations(self, frame, ticker, fetched, now=model.parse_iso(fetched.fetched_at)))
        return out


class NSEEndOfDay(Feed):
    """Existing NSE provider: official bhavcopy imported by the operator, never scraped."""

    name = "nse"
    event_type = "market.tick"
    cadence_s = 3600
    min_interval_s = 600
    delay = "END_OF_DAY: official NSE bhavcopy imported by the operator; published after the close"
    confidence = "OFFICIAL"
    parser = "live-nse/1"
    licence = model.licence(
        "UNVERIFIED", "National Stock Exchange of India (bhavcopy)", "https://www.nseindia.com/",
        "LOCAL_ONLY", "No NSE redistribution grant verified")

    def __init__(self):
        self.bhavcopy = os.getenv("FINSIGHT_NSE_BHAVCOPY")
        self.calendar_path = os.getenv("FINSIGHT_NSE_CALENDAR")
        self.tickers = _tickers("FINSIGHT_LIVE_NSE_TICKERS", "RELIANCE.NS,TCS.NS,HDFCBANK.NS,INFY.NS")

    def unavailable_reason(self):
        if not self.bhavcopy or not self.calendar_path:
            return ("UNAVAILABLE: operator bhavcopy and official NSE session evidence required "
                    "(FINSIGHT_NSE_BHAVCOPY, FINSIGHT_NSE_CALENDAR)")
        return None

    def fetch(self):
        from src.data.providers.base import ProviderError
        from src.data.providers.nse_provider import NSEProvider

        raw = Path(self.bhavcopy).read_bytes()
        calendar = json.loads(Path(self.calendar_path).read_text(encoding="utf-8"))
        provider = NSEProvider(self.bhavcopy, calendar=calendar)
        end = (pd.Timestamp(calendar["end"]) + pd.Timedelta(days=1)).date().isoformat()
        start = max(calendar["start"], (pd.Timestamp(calendar["end"]) - pd.Timedelta(days=10)).date().isoformat())
        fetched = Fetched(raw, "file:operator-bhavcopy", model.iso(model.utcnow()))
        out = []
        for ticker in self.tickers:
            try:
                frame = provider.get_historical_data(ticker, start, end)
            except ProviderError as error:
                raise FeedError(str(error)) from None
            if frame.empty:
                continue
            row = frame.iloc[-1]
            day = pd.Timestamp(row["Date"]).date().isoformat()
            values = {"close": float(row["Close"]), "open": float(row["Open"]), "high": float(row["High"]),
                      "low": float(row["Low"]), "volume": float(row["Volume"])}
            out.append(self.observation(
                source_id=f"{ticker}:{day}", revision=model.sha256_hex(model.canonical(values))[:16],
                observed_at=day + "T00:00:00Z", effective_at=None, fetched=fetched,
                payload={"kind": "eod", "ticker": ticker, "session": day,
                         "period_convention": "UTC date-only session", **values, "currency": "INR",
                         "delay": self.delay}))
        return out
