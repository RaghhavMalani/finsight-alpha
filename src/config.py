"""Central configuration for FinSight Alpha.

Everything that is "tunable" across the project lives here so the rest of the
code stays declarative and easy to read. Dates, ticker universes, sector
mappings, trading-day conventions, on-disk paths, and environment-driven secrets
are all defined in one place.
"""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path

# Load variables from a local ``.env`` file (if present) into ``os.environ``.
# python-dotenv is optional at runtime - we degrade gracefully if it is missing.
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is a convenience, not a hard dep
    pass

# ---------------------------------------------------------------------------
# Date range
# ---------------------------------------------------------------------------
# Default historical window used when a caller does not specify start/end.
# A multi-year window gives enough data for stable volatility estimates.
DEFAULT_START_DATE: str = "2018-01-01"

# The end date defaults to "today" so the dataset always extends to the latest
# available bar. yfinance treats ``end`` as exclusive, which is fine for EOD data.
DEFAULT_END_DATE: str = date.today().isoformat()

# ---------------------------------------------------------------------------
# Ticker universes
# ---------------------------------------------------------------------------
# Indian equities use the National Stock Exchange suffix ".NS" on Yahoo Finance.
INDIAN_TICKERS: list[str] = [
    "RELIANCE.NS",
    "TCS.NS",
    "HDFCBANK.NS",
    "INFY.NS",
    "ICICIBANK.NS",
]

# US equities / ETFs use their plain symbols.
US_TICKERS: list[str] = [
    "AAPL",
    "MSFT",
    "JPM",
    "BLK",
    "SPY",
]

# Convenience: the full default universe processed by the pipeline / dashboard.
ALL_TICKERS: list[str] = INDIAN_TICKERS + US_TICKERS

# The default selection shown when the dashboard first loads.
DEFAULT_TICKERS: list[str] = ["AAPL", "MSFT", "RELIANCE.NS", "TCS.NS", "SPY"]

# ---------------------------------------------------------------------------
# Ticker -> sector mapping
# ---------------------------------------------------------------------------
# A simple, hand-maintained classification used by the sector-analysis module.
# Keep it in sync with the ticker universes above. "ETF / Index" groups broad
# market funds that are not a single sector.
TICKER_SECTOR_MAP: dict[str, str] = {
    # India
    "RELIANCE.NS": "Energy / Conglomerate",
    "TCS.NS": "Information Technology",
    "HDFCBANK.NS": "Financials",
    "INFY.NS": "Information Technology",
    "ICICIBANK.NS": "Financials",
    # US
    "AAPL": "Information Technology",
    "MSFT": "Information Technology",
    "JPM": "Financials",
    "BLK": "Financials",
    "SPY": "ETF / Index",
}


def get_sector(ticker: str) -> str:
    """Return the sector label for a ticker, or ``"Unknown"`` if unmapped."""
    return TICKER_SECTOR_MAP.get(ticker, "Unknown")


# ---------------------------------------------------------------------------
# Financial conventions
# ---------------------------------------------------------------------------
# Number of trading days in a year - used to annualise returns and volatility.
TRADING_DAYS_PER_YEAR: int = 252

# Default rolling window (in trading days) for rolling volatility (~1 month).
DEFAULT_VOLATILITY_WINDOW: int = 21

# Risk-free rate (annualised, decimal) used for the Sharpe ratio. 0.0 keeps the
# summary simple; later phases can wire in a live rate.
RISK_FREE_RATE: float = 0.0

# ---------------------------------------------------------------------------
# Filesystem paths
# ---------------------------------------------------------------------------
# Resolve paths relative to the project root (the parent of the ``src`` folder)
# so the code works regardless of the current working directory.
PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent

DATA_DIR: Path = PROJECT_ROOT / "data"
RAW_DATA_DIR: Path = DATA_DIR / "raw"
PROCESSED_DATA_DIR: Path = DATA_DIR / "processed"
EXPORTS_DIR: Path = DATA_DIR / "exports"

# Backwards-compatible aliases (Phase 1A naming).
LOCAL_RAW_DATA_PATH: Path = RAW_DATA_DIR
LOCAL_PROCESSED_DATA_PATH: Path = PROCESSED_DATA_DIR

# ---------------------------------------------------------------------------
# Environment-driven secrets / cloud settings
# ---------------------------------------------------------------------------
# These are read from the environment (populated from ``.env``). They are all
# optional - the app must run without any of them set.

# API / dashboard wiring.
API_BASE_URL: str = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")
MARKET_DATA_PROVIDER: str = os.getenv("MARKET_DATA_PROVIDER", "yfinance")

# Provider API keys.
ALPHA_VANTAGE_API_KEY: str | None = os.getenv("ALPHA_VANTAGE_API_KEY") or None
POLYGON_API_KEY: str | None = os.getenv("POLYGON_API_KEY") or None

# Google Cloud: BigQuery (analytics) + Cloud Storage (raw files).
GCP_PROJECT_ID: str | None = os.getenv("GCP_PROJECT_ID") or None
GCS_BUCKET_NAME: str | None = os.getenv("GCS_BUCKET_NAME") or None
BIGQUERY_DATASET: str = os.getenv("BIGQUERY_DATASET", "finsight_alpha")
BIGQUERY_MARKET_PRICES_TABLE: str = os.getenv(
    "BIGQUERY_MARKET_PRICES_TABLE", "market_prices_daily"
)
BIGQUERY_ANALYTICS_TABLE: str = os.getenv(
    "BIGQUERY_ANALYTICS_TABLE", "market_analytics_daily"
)

# Database: Cloud SQL / PostgreSQL (app metadata).
DATABASE_URL: str | None = os.getenv("DATABASE_URL") or None

# Application metadata.
APP_NAME: str = "FinSight Alpha API"
APP_VERSION: str = "0.1.0"


def ensure_data_dirs() -> None:
    """Create the raw, processed, and exports directories if they do not exist.

    Calling this at the start of any pipeline guarantees the output folders are
    present even on a fresh checkout, avoiding ``FileNotFoundError`` on save.
    """
    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
