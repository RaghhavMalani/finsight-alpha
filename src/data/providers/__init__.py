"""Market-data provider subpackage.

Exposes the provider interface, concrete/placeholder providers, and a small
registry/factory so callers can fetch a provider by name.
"""

from __future__ import annotations

from .alpha_vantage_provider import AlphaVantageProvider
from .base import MarketDataProvider, ProviderError, STANDARD_COLUMNS
from .polygon_provider import PolygonProvider
from .yfinance_provider import YFinanceProvider

# Registry mapping provider name -> class. New providers (NSE/BSE) plug in here.
PROVIDER_REGISTRY: dict[str, type[MarketDataProvider]] = {
    YFinanceProvider.name: YFinanceProvider,
    AlphaVantageProvider.name: AlphaVantageProvider,
    PolygonProvider.name: PolygonProvider,
}

# Names safe to show in a UI dropdown (ordered, default first).
AVAILABLE_PROVIDERS: list[str] = list(PROVIDER_REGISTRY.keys())


def get_provider(name: str = "yfinance") -> MarketDataProvider:
    """Instantiate a provider by its registered ``name``.

    Parameters
    ----------
    name:
        One of :data:`AVAILABLE_PROVIDERS`.

    Returns
    -------
    MarketDataProvider
        A ready-to-use provider instance.

    Raises
    ------
    ProviderError
        If ``name`` is not a registered provider.
    """
    key = (name or "").strip().lower()
    if key not in PROVIDER_REGISTRY:
        raise ProviderError(
            f"Unknown provider '{name}'. Available: {', '.join(AVAILABLE_PROVIDERS)}."
        )
    return PROVIDER_REGISTRY[key]()


__all__ = [
    "MarketDataProvider",
    "ProviderError",
    "STANDARD_COLUMNS",
    "YFinanceProvider",
    "AlphaVantageProvider",
    "PolygonProvider",
    "PROVIDER_REGISTRY",
    "AVAILABLE_PROVIDERS",
    "get_provider",
]
