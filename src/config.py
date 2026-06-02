"""Central configuration for FinSight Alpha.

Everything that is "tunable" across the project lives here so the rest of the
code stays declarative and easy to read. Dates, ticker universes, trading-day
conventions, and on-disk paths are all defined in one place.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

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

# Convenience: the full default universe processed by main.py.
ALL_TICKERS: list[str] = INDIAN_TICKERS + US_TICKERS

# ---------------------------------------------------------------------------
# Financial conventions
# ---------------------------------------------------------------------------
# Number of trading days in a year - used to annualise returns and volatility.
TRADING_DAYS_PER_YEAR: int = 252

# Default rolling window (in trading days) for rolling volatility (~1 month).
DEFAULT_VOLATILITY_WINDOW: int = 21

# Risk-free rate (annualised, decimal) used for the Sharpe ratio. 0.0 keeps the
# Phase 1 summary simple; later phases can wire in a live rate.
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


def ensure_data_dirs() -> None:
    """Create the raw and processed data directories if they do not exist.

    Calling this at the start of the pipeline guarantees the output folders are
    present even on a fresh checkout, avoiding ``FileNotFoundError`` on save.
    """
    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
