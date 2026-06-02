"""Market-data routes: trigger downloads and read processed data."""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from backend.schemas.market_data_schema import (
    MarketDataFetchRequest,
    MarketDataFetchResponse,
)
from src import config
from src.analytics import (
    calculate_cumulative_returns,
    calculate_drawdown,
    calculate_log_returns,
    calculate_rolling_volatility,
    calculate_simple_returns,
)
from src.data import storage
from src.data.bigquery_client import BigQueryClient
from src.data.market_data import MarketDataService
from src.data.providers import ProviderError
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/market-data", tags=["market-data"])


def _enrich_with_analytics(df: pd.DataFrame) -> pd.DataFrame:
    """Add per-ticker analytics columns to a long-format OHLCV frame.

    Columns added: ``simple_return``, ``log_return``, ``cumulative_return``,
    ``rolling_volatility``, ``drawdown``. Computed per ticker so series do not
    bleed across symbols.
    """
    parts: list[pd.DataFrame] = []
    for _, group in df.groupby("Ticker", sort=False):
        g = group.sort_values("Date").copy()
        close = g["Close"]
        g["simple_return"] = calculate_simple_returns(close)
        # Log returns require strictly positive prices; guard defensively.
        try:
            g["log_return"] = calculate_log_returns(close)
        except ValueError:
            g["log_return"] = pd.NA
        g["cumulative_return"] = calculate_cumulative_returns(g["simple_return"])
        g["rolling_volatility"] = calculate_rolling_volatility(g["simple_return"])
        g["drawdown"] = calculate_drawdown(close)
        parts.append(g)
    return pd.concat(parts, ignore_index=True)


@router.post("/fetch", response_model=MarketDataFetchResponse)
def fetch_market_data(request: MarketDataFetchRequest) -> MarketDataFetchResponse:
    """Download data for the requested tickers, compute analytics, and persist.

    Steps:
      1. Download via :class:`MarketDataService` (chosen provider).
      2. Enrich with analytics columns.
      3. Optionally save raw + processed CSV/Parquet locally.
      4. Optionally upload to BigQuery (no-op without GCP config).
    """
    if not request.tickers:
        raise HTTPException(status_code=400, detail="No tickers provided.")

    try:
        service = MarketDataService(request.provider)
        raw = service.get_multiple(
            request.tickers, request.start_date, request.end_date, skip_errors=True
        )
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if raw.empty:
        return MarketDataFetchResponse(
            tickers=request.tickers,
            rows_downloaded=0,
            start_date=request.start_date,
            end_date=request.end_date,
            provider=request.provider,
            status="empty",
            message="No data returned for the requested tickers/date range.",
        )

    processed = _enrich_with_analytics(raw)

    saved_tickers: list[str] = []
    if request.save_local:
        for ticker, group in processed.groupby("Ticker", sort=False):
            raw_group = raw[raw["Ticker"] == ticker]
            storage.save_raw_csv(raw_group, str(ticker))
            storage.save_processed_dataframe(group, str(ticker))
            storage.save_dataframe_parquet(
                group, config.EXPORTS_DIR / f"{storage.safe_ticker_stem(str(ticker))}.parquet"
            )
            saved_tickers.append(str(ticker))

    bq_message = ""
    if request.upload_bigquery:
        client = BigQueryClient()
        ok_prices = client.upload_dataframe(raw, config.BIGQUERY_MARKET_PRICES_TABLE)
        ok_analytics = client.upload_dataframe(processed, config.BIGQUERY_ANALYTICS_TABLE)
        bq_message = (
            " BigQuery upload attempted."
            if (ok_prices or ok_analytics)
            else " BigQuery not configured; upload skipped."
        )

    fetched_tickers = sorted(processed["Ticker"].unique().tolist())
    return MarketDataFetchResponse(
        tickers=fetched_tickers,
        rows_downloaded=int(len(processed)),
        start_date=request.start_date,
        end_date=request.end_date,
        provider=request.provider,
        status="success",
        message=f"Fetched {len(fetched_tickers)} ticker(s)." + bq_message,
    )


@router.get("/{ticker}")
def get_market_data(
    ticker: str,
    limit: int = Query(100, ge=1, le=10000, description="Max recent rows to return."),
) -> dict[str, object]:
    """Return the most recent processed rows for ``ticker`` from local storage.

    Raises 404 if no processed data exists yet (call ``/market-data/fetch`` first).
    """
    df = storage.load_processed_ticker_data(ticker)
    if df is None or df.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No processed data for '{ticker}'. Fetch it first via /market-data/fetch.",
        )

    df = df.sort_values("Date").tail(limit).copy()
    df["Date"] = df["Date"].astype(str)
    # Replace NaN with None so the JSON is valid.
    records = df.where(pd.notna(df), None).to_dict(orient="records")
    return {"ticker": ticker, "rows": len(records), "data": records}
