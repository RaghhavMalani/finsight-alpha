from __future__ import annotations

from src.prediction_markets.contracts import EventQuote


def inventory_skew_quotes(fair_probability: float, inventory: float, risk_per_contract: float, spread: float) -> EventQuote:
    if risk_per_contract < 0 or spread < 0:
        raise ValueError("risk_per_contract and spread must be non-negative")
    reservation = min(1.0, max(0.0, fair_probability - risk_per_contract * inventory))
    half = spread / 2.0
    return EventQuote(
        fair_probability=fair_probability,
        reservation_probability=reservation,
        bid=max(0.0, reservation - half),
        ask=min(1.0, reservation + half),
    )
