"""Clean-room prediction-market research pack; no unlicensed Kalshi code."""

from .contracts import EventBand, EventQuote, ProbabilityDistribution
from .market_making import (
    avellaneda_stoikov_quotes,
    glft_quotes,
    inventory_skew_quotes,
    symmetric_quotes,
)
from .probability import CauchyDistribution, NormalDistribution, StudentTDistribution
from .settlement import band_probability, fair_contract_value

__all__ = [
    "CauchyDistribution", "EventBand", "EventQuote", "NormalDistribution",
    "ProbabilityDistribution", "StudentTDistribution", "avellaneda_stoikov_quotes",
    "band_probability", "fair_contract_value", "glft_quotes",
    "inventory_skew_quotes", "symmetric_quotes",
]
