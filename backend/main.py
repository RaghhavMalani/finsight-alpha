"""FinSight Alpha - FastAPI backend (Phase 1C skeleton).

This API will eventually serve market data and analytics to a richer front-end
(e.g. a React app) and to other services. It is structured now so the contract
is stable, but most endpoints are placeholders that will be fleshed out in
Phase 1C.

Run locally from the project root:

    uvicorn backend.main:app --reload
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make the project root importable when launched via uvicorn from anywhere.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI, HTTPException, Query

from src import config
from src.analytics import calculate_summary_statistics, calculate_simple_returns
from src.data.market_data import MarketDataService
from src.data.providers import AVAILABLE_PROVIDERS, ProviderError
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title="FinSight Alpha API",
    description="Market data and analytics API (Phase 1C skeleton).",
    version="0.2.0",
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run / load balancers."""
    return {"status": "ok", "service": "finsight-alpha-api"}


@app.get("/tickers", tags=["reference"])
def list_tickers() -> dict[str, object]:
    """Return the configured ticker universe and provider list."""
    return {
        "all": config.ALL_TICKERS,
        "indian": config.INDIAN_TICKERS,
        "us": config.US_TICKERS,
        "providers": AVAILABLE_PROVIDERS,
        "sectors": config.TICKER_SECTOR_MAP,
    }


@app.get("/market-data", tags=["data"])
def market_data(
    ticker: str = Query(..., description="Symbol, e.g. AAPL or RELIANCE.NS"),
    start_date: str = Query(config.DEFAULT_START_DATE),
    end_date: str = Query(config.DEFAULT_END_DATE),
    provider: str = Query("yfinance"),
) -> dict[str, object]:
    """Return OHLCV rows for a single ticker.

    Fully functional even in the skeleton because it reuses
    :class:`MarketDataService`. Phase 1C will add caching and BigQuery-backed
    reads for scale.
    """
    try:
        service = MarketDataService(provider)
        df = service.get_data(ticker, start_date, end_date)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Serialise dates to ISO strings for clean JSON output.
    df = df.copy()
    df["Date"] = df["Date"].astype(str)
    return {
        "ticker": ticker,
        "provider": provider,
        "rows": len(df),
        "data": df.to_dict(orient="records"),
    }


@app.get("/summary", tags=["analytics"])
def summary(
    ticker: str = Query(..., description="Symbol, e.g. AAPL or RELIANCE.NS"),
    start_date: str = Query(config.DEFAULT_START_DATE),
    end_date: str = Query(config.DEFAULT_END_DATE),
    provider: str = Query("yfinance"),
) -> dict[str, object]:
    """Return summary statistics for a single ticker.

    Placeholder-grade for now (computes on demand). Phase 1C will precompute and
    cache these, and add multi-ticker / portfolio summaries.
    """
    try:
        service = MarketDataService(provider)
        df = service.get_data(ticker, start_date, end_date)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    import pandas as pd

    prices = pd.Series(df["Close"].values, index=pd.to_datetime(df["Date"]))
    stats = calculate_summary_statistics(prices)
    # Touch returns so the import is meaningful and ready for future endpoints.
    _ = calculate_simple_returns(prices)
    return {"ticker": ticker, "provider": provider, "summary": stats}


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    """Friendly root pointing to the interactive docs."""
    return {"message": "FinSight Alpha API. See /docs for interactive documentation."}
