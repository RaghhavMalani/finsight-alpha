"""Settlement and fair-value mathematics for event bands."""

from __future__ import annotations

from src.prediction_markets.contracts import EventBand, ProbabilityDistribution


def band_probability(band: EventBand, distribution: ProbabilityDistribution) -> float:
    probability = distribution.cdf(band.upper_inclusive) - distribution.cdf(band.lower_exclusive)
    if probability < -1e-12 or probability > 1.0 + 1e-12:
        raise ValueError("distribution produced an invalid band probability")
    return min(1.0, max(0.0, probability))


def fair_contract_value(band: EventBand, distribution: ProbabilityDistribution) -> float:
    return band.payout * band_probability(band, distribution)
