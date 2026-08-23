from __future__ import annotations

import math

from src.prediction_markets.contracts import EventQuote


def glft_quotes(
    fair_probability: float,
    inventory: float,
    risk_aversion: float,
    volatility: float,
    arrival_intensity: float,
    arrival_decay: float,
) -> EventQuote:
    """Finite-inventory GLFT-style approximation for bounded event prices."""

    if min(risk_aversion, volatility, arrival_intensity, arrival_decay) <= 0:
        raise ValueError("model parameters must be positive")
    inventory_penalty = risk_aversion * volatility * volatility / (2.0 * arrival_intensity * arrival_decay)
    reservation = fair_probability - inventory * inventory_penalty
    half_spread = math.log1p(risk_aversion / arrival_decay) / risk_aversion + inventory_penalty
    reservation = min(1.0, max(0.0, reservation))
    return EventQuote(
        fair_probability=fair_probability,
        reservation_probability=reservation,
        bid=max(0.0, reservation - half_spread),
        ask=min(1.0, reservation + half_spread),
    )
