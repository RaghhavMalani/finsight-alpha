from __future__ import annotations

import math

from src.prediction_markets.contracts import EventQuote


def avellaneda_stoikov_quotes(
    fair_probability: float,
    inventory: float,
    risk_aversion: float,
    variance: float,
    time_remaining: float,
    arrival_decay: float,
) -> EventQuote:
    if min(risk_aversion, variance, time_remaining, arrival_decay) <= 0:
        raise ValueError("model parameters must be positive")
    reservation = fair_probability - inventory * risk_aversion * variance * time_remaining
    spread = risk_aversion * variance * time_remaining + 2.0 * math.log1p(risk_aversion / arrival_decay) / risk_aversion
    reservation = min(1.0, max(0.0, reservation))
    return EventQuote(
        fair_probability=fair_probability,
        reservation_probability=reservation,
        bid=max(0.0, reservation - spread / 2.0),
        ask=min(1.0, reservation + spread / 2.0),
    )
