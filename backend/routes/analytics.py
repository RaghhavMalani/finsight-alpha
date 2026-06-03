"""Analytics routes: summary stats, correlation, and sector comparison.

All endpoints read from locally-stored processed data (written by
``/market-data/fetch``), so they are fast and do not re-download.
"""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, HTTPException

from backend.schemas.analytics_schema import (
    CorrelationRequest,
    CorrelationResponse,
    SectorComparisonResponse,
    SectorMetrics,
    SummaryStatsResponse,
)
from src.analytics import (
    build_returns_pivot,
    calculate_correlation_matrix,
    calculate_sector_summary,
    calculate_simple_returns,
    calculate_summary_statistics,
)
from src.data import storage
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _prices_from_processed(df: pd.DataFrame) -> pd.Series:
    """Build a date-indexed Close price Series from a processed frame."""
    d = df.sort_values("Date")
    return pd.Series(d["Close"].values, index=pd.to_datetime(d["Date"]))


@router.get("/summary/{ticker}", response_model=SummaryStatsResponse)
def summary_for_ticker(ticker: str) -> SummaryStatsResponse:
    """Return headline summary statistics for one ticker from local data."""
    df = storage.load_processed_ticker_data(ticker)
    if df is None or df.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No processed data for '{ticker}'. Fetch it first via /market-data/fetch.",
        )

    prices = _prices_from_processed(df)
    stats = calculate_summary_statistics(prices)
    avg_daily = float(calculate_simple_returns(prices).dropna().mean())

    return SummaryStatsResponse(
        ticker=ticker,
        latest_close=stats["end_price"],
        total_return=stats["total_return"],
        annualized_volatility=stats["annualized_volatility"],
        max_drawdown=stats["max_drawdown"],
        average_daily_return=avg_daily,
        observations=int(stats["observations"]),
    )


@router.post("/correlation", response_model=CorrelationResponse)
def correlation(request: CorrelationRequest) -> CorrelationResponse:
    """Compute the returns correlation matrix across the requested tickers."""
    if len(request.tickers) < 2:
        raise HTTPException(status_code=400, detail="Provide at least two tickers.")

    frames: list[pd.DataFrame] = []
    for ticker in request.tickers:
        df = storage.load_processed_ticker_data(ticker)
        if df is None or df.empty:
            continue
        sub = df[["Date", "Close"]].copy()
        sub["Ticker"] = ticker
        # Filter to the requested date window.
        sub["Date"] = pd.to_datetime(sub["Date"])
        mask = (sub["Date"] >= pd.to_datetime(request.start_date)) & (
            sub["Date"] <= pd.to_datetime(request.end_date)
        )
        frames.append(sub[mask])

    if len(frames) < 2:
        raise HTTPException(
            status_code=404,
            detail="Not enough processed tickers found. Fetch them first.",
        )

    combined = pd.concat(frames, ignore_index=True)
    returns_wide = build_returns_pivot(combined)
    corr = calculate_correlation_matrix(returns_wide)
    if corr.empty:
        raise HTTPException(status_code=422, detail="Could not compute correlation matrix.")

    # Convert to a JSON-serialisable nested dict, rounding for readability.
    matrix = corr.round(6).to_dict()
    return CorrelationResponse(tickers=list(corr.columns), matrix=matrix)


@router.get("/sector-comparison", response_model=SectorComparisonResponse)
def sector_comparison() -> SectorComparisonResponse:
    """Aggregate sector-level metrics across all locally-available processed data."""
    df = storage.load_all_processed_data()
    if df is None or df.empty:
        raise HTTPException(
            status_code=404,
            detail="No processed data available. Fetch some tickers first.",
        )

    summary = calculate_sector_summary(df)
    if summary.empty:
        raise HTTPException(status_code=422, detail="Could not compute sector summary.")

    sectors = [
        SectorMetrics(
            sector=str(idx),
            avg_total_return=float(row["avg_total_return"]),
            avg_annualized_volatility=float(row["avg_annualized_volatility"]),
            avg_max_drawdown=float(row["avg_max_drawdown"]),
            num_tickers=int(row["num_tickers"]),
        )
        for idx, row in summary.iterrows()
    ]
    return SectorComparisonResponse(sectors=sectors)
