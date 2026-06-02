"""Pydantic models for the market-data endpoints.

These models define the request/response *contract* of the API. FastAPI uses
them for validation, serialization, and the auto-generated OpenAPI docs.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from src import config


class MarketDataFetchRequest(BaseModel):
    """Body for ``POST /market-data/fetch``."""

    tickers: list[str] = Field(..., description="Symbols to fetch, e.g. ['AAPL'].")
    start_date: str = Field(config.DEFAULT_START_DATE, description="ISO start date.")
    end_date: str = Field(config.DEFAULT_END_DATE, description="ISO end date.")
    provider: str = Field("yfinance", description="Data provider name.")
    save_local: bool = Field(True, description="Save raw + processed CSV locally.")
    upload_bigquery: bool = Field(
        False, description="Also upload to BigQuery (no-op if GCP not configured)."
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "tickers": ["AAPL", "MSFT"],
                "start_date": "2023-01-01",
                "end_date": "2024-01-01",
                "provider": "yfinance",
                "save_local": True,
                "upload_bigquery": False,
            }
        }
    }


class MarketDataFetchResponse(BaseModel):
    """Response for ``POST /market-data/fetch``."""

    tickers: list[str]
    rows_downloaded: int
    start_date: str
    end_date: str
    provider: str
    status: str
    message: str


class MarketDataPoint(BaseModel):
    """A single OHLCV row returned by ``GET /market-data/{ticker}``."""

    Date: str
    Open: float | None = None
    High: float | None = None
    Low: float | None = None
    Close: float | None = None
    Volume: float | None = None
    Ticker: str | None = None
