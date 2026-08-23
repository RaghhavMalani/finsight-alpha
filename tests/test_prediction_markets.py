from __future__ import annotations

import pytest

from src.prediction_markets import (
    CauchyDistribution,
    EventBand,
    NormalDistribution,
    StudentTDistribution,
    avellaneda_stoikov_quotes,
    band_probability,
    fair_contract_value,
    glft_quotes,
    inventory_skew_quotes,
    symmetric_quotes,
)


@pytest.mark.parametrize(
    "distribution",
    [
        NormalDistribution(5_000.0, 25.0),
        StudentTDistribution(5_000.0, 25.0, 4.0),
        CauchyDistribution(5_000.0, 25.0),
    ],
)
def test_band_probability_is_cdf_difference(distribution) -> None:
    band = EventBand(4_975.0, 5_025.0)
    probability = band_probability(band, distribution)
    assert probability == pytest.approx(distribution.cdf(5_025.0) - distribution.cdf(4_975.0))
    assert fair_contract_value(band, distribution) == pytest.approx(probability)


def test_event_settlement_uses_open_lower_closed_upper_band() -> None:
    band = EventBand(100.0, 110.0)
    assert not band.settles(100.0)
    assert band.settles(110.0)
    assert not band.settles(110.01)


def test_inventory_control_moves_reservation_away_from_inventory() -> None:
    symmetric = symmetric_quotes(0.6, 0.04)
    skewed = inventory_skew_quotes(0.6, inventory=5, risk_per_contract=0.01, spread=0.04)
    avellaneda = avellaneda_stoikov_quotes(0.6, 5, 0.1, 0.02, 0.5, 10.0)
    glft = glft_quotes(0.6, 5, 0.1, 0.2, 20.0, 8.0)

    assert symmetric.reservation_probability == 0.6
    assert skewed.reservation_probability < symmetric.reservation_probability
    assert avellaneda.reservation_probability < symmetric.reservation_probability
    assert glft.reservation_probability < symmetric.reservation_probability
    assert all(0.0 <= quote.bid <= quote.ask <= 1.0 for quote in (symmetric, skewed, avellaneda, glft))
