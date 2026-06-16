"""Offline tests for the implied volatility surface stack.

No network: everything runs on the synthetic chain generator. The key test is
the *round-trip* - we price options from a known IV model, then check the Brent
solver + surface builder recover that IV closely. That's the property that makes
the surface trustworthy.
"""

from __future__ import annotations

import numpy as np
import pytest

from src.data.options_data import (
    CHAIN_COLUMNS,
    generate_synthetic_chain,
    get_option_chain,
    synthetic_iv,
)
from src.pricing.vol_surface import build_vol_surface, solve_surface_points


# ---------------------------------------------------------------------------
# Synthetic chain / IV model
# ---------------------------------------------------------------------------
def test_synthetic_chain_schema_and_nonempty():
    chain = generate_synthetic_chain(spot=100.0)
    assert chain.source == "synthetic"
    assert list(chain.data.columns) == CHAIN_COLUMNS
    assert len(chain.data) > 0
    assert (chain.data["market_price"] > 0).all()


def test_iv_model_has_equity_skew():
    # Negative skew: downside (m<0) IV richer than equal-distance upside (m>0).
    T = 0.5
    downside = synthetic_iv(-0.10, T)
    upside = synthetic_iv(0.10, T)
    assert downside > upside


def test_iv_model_has_smile():
    # Convexity ("smile") is the curvature that survives once the linear skew
    # cancels: iv(+w) + iv(-w) > 2*iv(0). (Testing a single upside wing > ATM
    # would be wrong, because a realistic negative skew pulls the upside wing
    # *below* ATM.)
    T = 0.5
    w = 0.20
    atm = synthetic_iv(0.0, T)
    up = synthetic_iv(w, T)
    down = synthetic_iv(-w, T)
    assert up + down > 2 * atm
    # And the downside wing is clearly richer than ATM (skew + smile reinforce).
    assert down > atm


# ---------------------------------------------------------------------------
# Round-trip: recover the input IV from priced options
# ---------------------------------------------------------------------------
def test_iv_roundtrip_recovers_model():
    chain = generate_synthetic_chain(spot=100.0, r=0.05, q=0.0, seed=1)
    points = solve_surface_points(chain, r=0.05, q=0.0)
    assert not points.empty

    true_iv = points.apply(
        lambda row: synthetic_iv(row["log_moneyness"], row["T"]), axis=1
    )
    err = (points["iv"] - true_iv).abs()
    # With ~0.5% price noise, median recovery error should be a few vol points.
    assert err.median() < 0.02
    assert err.quantile(0.9) < 0.05


# ---------------------------------------------------------------------------
# Surface construction
# ---------------------------------------------------------------------------
def test_surface_grid_shape_and_finite():
    chain = generate_synthetic_chain(spot=100.0)
    surf = build_vol_surface(chain, n_maturity=20, n_moneyness=30)
    assert surf.iv_grid.shape == (20, 30)
    assert np.isfinite(surf.iv_grid).all()
    assert (surf.iv_grid > 0).all()


def test_surface_helpers():
    chain = generate_synthetic_chain(spot=100.0)
    surf = build_vol_surface(chain)

    ts = surf.atm_term_structure()
    assert {"T", "atm_iv"} <= set(ts.columns)
    assert len(ts) == len(surf.maturities)

    smile = surf.smile(0.5)
    assert {"strike", "iv", "log_moneyness"} <= set(smile.columns)
    # Strike axis should bracket the spot.
    assert smile["strike"].min() < surf.spot < smile["strike"].max()


def test_get_option_chain_synthetic_fallback():
    # prefer_live=False must never hit the network and always returns a chain.
    chain = get_option_chain("ANYTHING", prefer_live=False, spot_hint=250.0)
    assert chain.source == "synthetic"
    assert abs(chain.spot - 250.0) < 1e-9


def test_empty_chain_raises():
    chain = generate_synthetic_chain(spot=100.0)
    chain.data = chain.data.iloc[0:0]  # wipe rows
    with pytest.raises(ValueError):
        build_vol_surface(chain)
