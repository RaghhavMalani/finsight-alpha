"""Reference-data route: supported assets and sector mapping."""

from __future__ import annotations

from fastapi import APIRouter

from src import config
from src.data.providers import AVAILABLE_PROVIDERS

router = APIRouter(tags=["reference"])


@router.get("/assets")
def list_assets() -> dict[str, object]:
    """Return the supported tickers grouped by region, plus the sector map.

    Useful for populating dashboard dropdowns from a single source of truth.
    """
    return {
        "indian": config.INDIAN_TICKERS,
        "us": config.US_TICKERS,
        "all": config.ALL_TICKERS,
        "default": config.DEFAULT_TICKERS,
        "sectors": config.TICKER_SECTOR_MAP,
        "providers": AVAILABLE_PROVIDERS,
    }
