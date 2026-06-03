"""Pydantic models for the analytics endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field

from src import config


class SummaryStatsResponse(BaseModel):
    """Response for ``GET /analytics/summary/{ticker}``."""

    ticker: str
    latest_close: float
    total_return: float
    annualized_volatility: float
    max_drawdown: float
    average_daily_return: float
    observations: int


class CorrelationRequest(BaseModel):
    """Body for ``POST /analytics/correlation``."""

    tickers: list[str] = Field(..., description="At least two symbols.")
    start_date: str = Field(config.DEFAULT_START_DATE, description="ISO start date.")
    end_date: str = Field(config.DEFAULT_END_DATE, description="ISO end date.")

    model_config = {
        "json_schema_extra": {
            "example": {
                "tickers": ["AAPL", "MSFT", "SPY"],
                "start_date": "2023-01-01",
                "end_date": "2024-01-01",
            }
        }
    }


class CorrelationResponse(BaseModel):
    """Response for ``POST /analytics/correlation``.

    ``matrix`` is a nested dict: ``{ticker_a: {ticker_b: corr, ...}, ...}``.
    """

    tickers: list[str]
    matrix: dict[str, dict[str, float]]


class SectorMetrics(BaseModel):
    """Per-sector aggregated metrics."""

    sector: str
    avg_total_return: float
    avg_annualized_volatility: float
    avg_max_drawdown: float
    num_tickers: int


class SectorComparisonResponse(BaseModel):
    """Response for ``GET /analytics/sector-comparison``."""

    sectors: list[SectorMetrics]
