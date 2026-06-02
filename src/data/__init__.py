"""Data ingestion subpackage.

Exposes helpers for downloading and shaping raw market data.
"""

from .market_data import download_stock_data

__all__ = ["download_stock_data"]
