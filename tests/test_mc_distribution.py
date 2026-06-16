"""Offline tests for the Monte Carlo probability surface (no plotting)."""

from __future__ import annotations

import numpy as np
import pytest

from src.simulation.mc_distribution import build_probability_surface
from src.simulation.monte_carlo import simulate_gbm_paths


@pytest.fixture()
def paths():
    return simulate_gbm_paths(
        S0=100.0, mu=0.08, sigma=0.2, T=1.0, steps=252, n_simulations=2000, random_seed=1
    )


def test_surface_shapes(paths):
    surf = build_probability_surface(paths, horizon_years=1.0, n_time=25, n_price=40)
    assert surf.density.shape == (len(surf.times), len(surf.prices))
    assert surf.density.shape[1] == 40
    assert len(surf.times) <= 25
    assert np.isfinite(surf.density).all()
    assert (surf.density >= 0).all()


def test_percentile_bands_are_monotonic_and_widen(paths):
    surf = build_probability_surface(paths, n_time=20, percentiles=(5, 50, 95))
    p5, p50, p95 = surf.percentiles[5], surf.percentiles[50], surf.percentiles[95]
    # At every horizon, p5 <= p50 <= p95.
    assert np.all(p5 <= p50 + 1e-9) and np.all(p50 <= p95 + 1e-9)
    # The cone widens: spread at the end exceeds spread near the start.
    assert (p95[-1] - p5[-1]) > (p95[1] - p5[1])


def test_starts_at_spot(paths):
    surf = build_probability_surface(paths)
    assert abs(surf.S0 - 100.0) < 1e-9
    # First sampled time is t=0 where every path equals S0.
    assert abs(surf.percentiles[50][0] - 100.0) < 1e-6


def test_accepts_numpy_array():
    arr = simulate_gbm_paths(S0=50, mu=0.05, sigma=0.3, T=0.5, steps=60,
                             n_simulations=500, random_seed=2).to_numpy()
    surf = build_probability_surface(arr, horizon_years=0.5, n_price=30)
    assert surf.density.shape[1] == 30


def test_rejects_bad_input():
    with pytest.raises(ValueError):
        build_probability_surface(np.array([1.0, 2.0, 3.0]))  # 1D, invalid
