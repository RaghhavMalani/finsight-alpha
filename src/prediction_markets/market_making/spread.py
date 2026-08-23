from __future__ import annotations

from src.prediction_markets.contracts import EventQuote


def symmetric_quotes(fair_probability: float, spread: float) -> EventQuote:
    if not 0.0 <= fair_probability <= 1.0:
        raise ValueError("fair_probability must be between zero and one")
    if spread < 0:
        raise ValueError("spread must be non-negative")
    half = spread / 2.0
    return EventQuote(
        fair_probability=fair_probability,
        reservation_probability=fair_probability,
        bid=max(0.0, fair_probability - half),
        ask=min(1.0, fair_probability + half),
    )
