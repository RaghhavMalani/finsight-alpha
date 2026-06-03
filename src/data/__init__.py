"""Data subpackage.

Exposes the market-data service, the backwards-compatible download helper, and
storage utilities.
"""

from .market_data import DataDownloadError, MarketDataService, download_stock_data

__all__ = [
    "MarketDataService",
    "download_stock_data",
    "DataDownloadError",
]
