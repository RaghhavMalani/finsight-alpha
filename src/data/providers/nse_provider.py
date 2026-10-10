"""Bounded local official NSE bhavcopy imports; no network or calendar fallback."""

from pathlib import Path
from io import BytesIO
import pandas as pd
from .base import MarketDataProvider, ProviderError


class NSEProvider(MarketDataProvider):
    name = "nse"

    def __init__(self, path=None, *, calendar=None):
        self.path, self.calendar = Path(path) if path else None, calendar
        self.captured_input = None

    def get_historical_data(self, ticker, start_date, end_date):
        start, end = start_date, end_date
        if self.path is None or self.calendar is None:
            raise ProviderError(
                "UNAVAILABLE: operator bhavcopy and official NSE session evidence required"
            )
        from src.data_organ.calendars import sessions

        try:
            expected = sessions(self.calendar, str(start)[:10], str(end)[:10])
        except ValueError as error:
            raise ProviderError(str(error)) from error
        raw = self.path.read_bytes()
        if len(raw) > 32 * 1024 * 1024:
            raise ProviderError("Bounded import exceeds 32 MiB")
        frame = pd.read_csv(BytesIO(raw))
        if "SERIES" in frame:
            frame = frame[frame.SERIES == "EQ"].copy()
        mapping = {
            "TIMESTAMP": "Date",
            "SYMBOL": "Ticker",
            "OPEN": "Open",
            "HIGH": "High",
            "LOW": "Low",
            "CLOSE": "Close",
            "TOTTRDQTY": "Volume",
        }
        if not set(mapping) <= set(frame):
            raise ProviderError("Unsupported official bhavcopy schema")
        frame = frame.rename(columns=mapping)
        frame.Date = pd.to_datetime(frame.Date, utc=True)
        selected = frame[
            (frame.Ticker == ticker.removesuffix(".NS"))
            & (frame.Date.dt.strftime("%Y-%m-%d").isin(expected))
            & (frame.Date < pd.Timestamp(end, tz="UTC"))
        ].copy()
        self.captured_input = selected.copy(deep=True)
        selected.Ticker = ticker
        return self._standardize(selected, ticker)
