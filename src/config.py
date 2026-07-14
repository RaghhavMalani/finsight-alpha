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

APP_ENV: str = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "development")).strip().lower()
if APP_ENV not in {"development", "test", "production"}:
    raise RuntimeError("APP_ENV must be development, test, or production")

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
    "INFY.NS",
    "HDFCBANK.NS",
    "ICICIBANK.NS",
    "SBIN.NS",
    "BHARTIARTL.NS",
    "ITC.NS",
    "NIFTYBEES.NS",
]

# US equities / ETFs use their plain symbols.
US_TICKERS: list[str] = [
    "AAPL",
    "MSFT",
    "NVDA",
    "GOOGL",
    "AMZN",
    "META",
    "JPM",
    "BLK",
    "SPY",
    "QQQ",
]

# Convenience: the full default universe processed by the pipeline / dashboard.
ALL_TICKERS: list[str] = INDIAN_TICKERS + US_TICKERS

# The default selection shown when the dashboard first loads.
DEFAULT_TICKERS: list[str] = ["AAPL", "MSFT", "NVDA", "RELIANCE.NS", "TCS.NS", "SPY"]

# Example portfolios for Portfolio Optimization Engine (Phase 5)
INDIAN_PORTFOLIO_TICKERS: list[str] = [
    "RELIANCE.NS",
    "TCS.NS",
    "HDFCBANK.NS",
    "INFY.NS",
    "ICICIBANK.NS",
    "NIFTYBEES.NS",
]

US_PORTFOLIO_TICKERS: list[str] = [
    "AAPL",
    "MSFT",
    "NVDA",
    "JPM",
    "BLK",
    "SPY",
    "QQQ",
]

# ---------------------------------------------------------------------------
# Ticker -> sector mapping
# ---------------------------------------------------------------------------
# A simple, hand-maintained classification used by the sector-analysis module.
# Keep it in sync with the ticker universes above. "ETF / Index" groups broad
# market funds that are not a single sector.
TICKER_SECTOR_MAP: dict[str, str] = {
    # India
    "RELIANCE.NS": "Energy",
    "TCS.NS": "Information Technology",
    "INFY.NS": "Information Technology",
    "HDFCBANK.NS": "Financials",
    "ICICIBANK.NS": "Financials",
    "SBIN.NS": "Financials",
    "BHARTIARTL.NS": "Communication Services",
    "ITC.NS": "Consumer Staples",
    "NIFTYBEES.NS": "ETF / Index",
    # US
    "AAPL": "Information Technology",
    "MSFT": "Information Technology",
    "NVDA": "Information Technology",
    "GOOGL": "Communication Services",
    "AMZN": "Consumer Discretionary",
    "META": "Communication Services",
    "JPM": "Financials",
    "BLK": "Financials",
    "SPY": "ETF / Index",
    "QQQ": "ETF / Index",
}

# ---------------------------------------------------------------------------
# Ticker -> human-readable display name
# ---------------------------------------------------------------------------
# Used in dashboard labels/tables so users see "Apple" instead of just "AAPL".
TICKER_DISPLAY_NAMES: dict[str, str] = {
    # India
    "RELIANCE.NS": "Reliance Industries",
    "TCS.NS": "Tata Consultancy Services",
    "INFY.NS": "Infosys",
    "HDFCBANK.NS": "HDFC Bank",
    "ICICIBANK.NS": "ICICI Bank",
    "SBIN.NS": "State Bank of India",
    "BHARTIARTL.NS": "Bharti Airtel",
    "ITC.NS": "ITC Ltd",
    "NIFTYBEES.NS": "Nippon India ETF Nifty BeES",
    # US
    "AAPL": "Apple",
    "MSFT": "Microsoft",
    "NVDA": "NVIDIA",
    "GOOGL": "Alphabet (Google)",
    "AMZN": "Amazon",
    "META": "Meta Platforms",
    "JPM": "JPMorgan Chase",
    "BLK": "BlackRock",
    "SPY": "SPDR S&P 500 ETF",
    "QQQ": "Invesco QQQ (Nasdaq 100)",
}


def get_sector(ticker: str) -> str:
    """Return the sector label for a ticker, or ``"Unknown"`` if unmapped."""
    return TICKER_SECTOR_MAP.get(ticker, "Unknown")


def get_display_name(ticker: str) -> str:
    """Return a human-readable name for a ticker, or the ticker itself if unmapped."""
    return TICKER_DISPLAY_NAMES.get(ticker, ticker)


# ---------------------------------------------------------------------------
# Benchmarks (for beta / CAPM)
# ---------------------------------------------------------------------------
# Default market benchmark per region. Beta and CAPM measure an asset against
# "the market"; we proxy the Indian market with the Nifty ETF and the US market
# with the S&P 500 ETF.
BENCHMARK_INDIA: str = "NIFTYBEES.NS"
BENCHMARK_US: str = "SPY"


DEFAULT_BENCHMARKS = {
    "INDIA": "NIFTYBEES.NS",
    "US": "SPY"
}
    

def get_default_benchmark(ticker: str) -> str:
    """Return the default market benchmark ticker for a given symbol."""
    if str(ticker).upper().endswith(".NS"):
        return DEFAULT_BENCHMARKS["INDIA"]
    return DEFAULT_BENCHMARKS["US"]


def get_default_benchmark_for_ticker(ticker: str) -> str:
    """Return the default market benchmark ticker for a given symbol."""
    return get_default_benchmark(ticker)


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

# Vercel Functions ship application files on a read-only filesystem. Keep the
# zero-config SQLite/cache fallback usable there by moving runtime data under
# /tmp; production deployments should still set DATABASE_URL for durable auth.
_DEFAULT_DATA_DIR = Path("/tmp/finsight-alpha") if os.getenv("VERCEL") else PROJECT_ROOT / "data"
_CONFIGURED_DATA_DIR = Path(os.getenv("FINSIGHT_DATA_DIR", str(_DEFAULT_DATA_DIR))).expanduser()
DATA_DIR: Path = (
    _CONFIGURED_DATA_DIR
    if _CONFIGURED_DATA_DIR.is_absolute()
    else PROJECT_ROOT / _CONFIGURED_DATA_DIR
)
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
# Default deployment region (Mumbai). Used as the BigQuery dataset location.
REGION: str = os.getenv("REGION", "asia-south1")
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
CORS_ORIGINS: list[str] = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://localhost:8080").split(",")
    if origin.strip()
]
SENTRY_DSN: str | None = os.getenv("SENTRY_DSN") or None
DEFAULT_ORGANIZATION_SLUG: str | None = os.getenv("DEFAULT_ORGANIZATION_SLUG") or None

# Application metadata.
APP_NAME: str = "FinSight Alpha API"
APP_VERSION: str = "0.1.0"


def validate_runtime_config() -> None:
    """Fail closed when production durability or security is not configured."""
    if APP_ENV != "production":
        return
    errors: list[str] = []
    if not DATABASE_URL:
        errors.append("DATABASE_URL is required")
    elif not DATABASE_URL.startswith(("postgresql://", "postgresql+", "postgres://")):
        errors.append("DATABASE_URL must use PostgreSQL")
    secret = os.getenv("FINSIGHT_SECRET_KEY", "")
    if len(secret) < 32:
        errors.append("FINSIGHT_SECRET_KEY must be at least 32 characters")
    if not CORS_ORIGINS or any(origin == "*" for origin in CORS_ORIGINS):
        errors.append("CORS_ORIGINS must contain explicit trusted origins")
    if not DEFAULT_ORGANIZATION_SLUG:
        errors.append("DEFAULT_ORGANIZATION_SLUG is required until the frontend provides tenant selection")
    if errors:
        raise RuntimeError("Invalid production configuration: " + "; ".join(errors))

def ensure_data_dirs() -> None:
    """Create the raw, processed, and exports directories if they do not exist.

    Calling this at the start of any pipeline guarantees the output folders are
    present even on a fresh checkout, avoiding ``FileNotFoundError`` on save.
    """
    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
