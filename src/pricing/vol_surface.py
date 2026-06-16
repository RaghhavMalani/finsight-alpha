"""Implied volatility surface construction.

Turns a normalized option chain (see :mod:`src.data.options_data`) into a clean,
griddable implied-volatility surface:

1. For every quoted option, solve the Black-Scholes implied volatility from its
   market price using the existing Brent solver
   (:func:`src.pricing.black_scholes.calculate_implied_volatility`).
2. Discard non-recoverable / nonsensical points (no root, IV outside a sane band).
3. Interpolate the scattered ``(maturity, log-moneyness) -> IV`` points onto a
   regular grid so it renders as a smooth 3D surface and can be sliced for
   smiles and the ATM term structure.

The output :class:`VolSurface` is a plain data container so the visualization and
dashboard layers stay decoupled from the math.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from src.data.options_data import OptionChain
from src.pricing import black_scholes


@dataclass
class VolSurface:
    """A regular-grid implied volatility surface plus the raw solved points.

    Attributes
    ----------
    ticker, spot, source:
        Provenance carried through from the chain.
    maturities:
        1D array of maturities (years) - the grid's T axis.
    log_moneyness:
        1D array of log-moneyness ln(K/S) - the grid's moneyness axis.
    iv_grid:
        2D array shaped ``(len(maturities), len(log_moneyness))`` of IVs (decimal).
    points:
        The cleaned per-option solved IVs (T, log_moneyness, strike, iv, type).
    """

    ticker: str
    spot: float
    source: str
    maturities: np.ndarray
    log_moneyness: np.ndarray
    iv_grid: np.ndarray
    points: pd.DataFrame = field(default_factory=pd.DataFrame)

    # -- convenience views ---------------------------------------------------
    def strike_axis(self) -> np.ndarray:
        """The moneyness axis expressed as absolute strikes (K = S * e^m)."""
        return self.spot * np.exp(self.log_moneyness)

    def atm_term_structure(self) -> pd.DataFrame:
        """ATM (log-moneyness ~ 0) implied vol as a function of maturity."""
        atm_col = int(np.argmin(np.abs(self.log_moneyness)))
        return pd.DataFrame(
            {"T": self.maturities, "atm_iv": self.iv_grid[:, atm_col]}
        )

    def smile(self, maturity: float) -> pd.DataFrame:
        """The vol smile (IV vs strike) for the grid maturity nearest ``maturity``."""
        row = int(np.argmin(np.abs(self.maturities - maturity)))
        return pd.DataFrame(
            {
                "strike": self.strike_axis(),
                "log_moneyness": self.log_moneyness,
                "iv": self.iv_grid[row, :],
                "maturity": self.maturities[row],
            }
        )


def solve_surface_points(
    chain: OptionChain,
    r: float = 0.05,
    q: float = 0.0,
    iv_floor: float = 0.01,
    iv_cap: float = 3.0,
) -> pd.DataFrame:
    """Solve implied vol for every option in a chain; return the clean points.

    Returns a DataFrame with columns ``T, strike, log_moneyness, option_type,
    iv``. Rows whose IV cannot be recovered (NaN) or falls outside
    ``[iv_floor, iv_cap]`` are dropped.
    """
    df = chain.data
    spot = chain.spot
    recs = []
    for _, row in df.iterrows():
        iv = black_scholes.calculate_implied_volatility(
            market_price=float(row["market_price"]),
            S=spot,
            K=float(row["strike"]),
            T=float(row["T"]),
            r=r,
            q=q,
            option_type=str(row["option_type"]),
        )
        if iv is None or not np.isfinite(iv):
            continue
        if iv < iv_floor or iv > iv_cap:
            continue
        recs.append(
            {
                "T": float(row["T"]),
                "strike": float(row["strike"]),
                "log_moneyness": float(np.log(float(row["strike"]) / spot)),
                "option_type": str(row["option_type"]),
                "iv": float(iv),
            }
        )
    return pd.DataFrame(recs, columns=["T", "strike", "log_moneyness", "option_type", "iv"])


def build_vol_surface(
    chain: OptionChain,
    r: float = 0.05,
    q: float = 0.0,
    n_maturity: int = 25,
    n_moneyness: int = 40,
) -> VolSurface:
    """Build a regular-grid :class:`VolSurface` from an option chain.

    Interpolation uses :func:`scipy.interpolate.griddata` (linear, with a
    nearest-neighbour fill for the convex-hull edges) over the cleaned
    ``(T, log-moneyness)`` points. Falls back gracefully if SciPy is missing or
    there are too few points to triangulate.

    Raises
    ------
    ValueError
        If no implied vols could be recovered from the chain at all.
    """
    points = solve_surface_points(chain, r=r, q=q)
    if points.empty:
        raise ValueError("No implied volatilities could be recovered from this chain.")

    t_min, t_max = points["T"].min(), points["T"].max()
    m_min, m_max = points["log_moneyness"].min(), points["log_moneyness"].max()
    # Guard against degenerate single-value axes.
    if t_max <= t_min:
        t_max = t_min + 1e-6
    if m_max <= m_min:
        m_max = m_min + 1e-6

    maturities = np.linspace(t_min, t_max, n_maturity)
    log_moneyness = np.linspace(m_min, m_max, n_moneyness)
    grid_t, grid_m = np.meshgrid(maturities, log_moneyness, indexing="ij")

    iv_grid = _interpolate_grid(points, grid_t, grid_m)

    return VolSurface(
        ticker=chain.ticker,
        spot=chain.spot,
        source=chain.source,
        maturities=maturities,
        log_moneyness=log_moneyness,
        iv_grid=iv_grid,
        points=points,
    )


def _interpolate_grid(points: pd.DataFrame, grid_t: np.ndarray, grid_m: np.ndarray) -> np.ndarray:
    """Interpolate scattered IV points onto the meshgrid; robust fallbacks."""
    xy = points[["T", "log_moneyness"]].to_numpy()
    z = points["iv"].to_numpy()

    try:
        from scipy.interpolate import griddata

        iv = griddata(xy, z, (grid_t, grid_m), method="linear")
        # Fill NaNs outside the convex hull with nearest-neighbour values.
        if np.any(np.isnan(iv)):
            nearest = griddata(xy, z, (grid_t, grid_m), method="nearest")
            iv = np.where(np.isnan(iv), nearest, iv)
        return iv
    except Exception:
        # Last-resort fallback: per-maturity-row nearest in moneyness.
        return _nearest_fallback(points, grid_t, grid_m)


def _nearest_fallback(points: pd.DataFrame, grid_t: np.ndarray, grid_m: np.ndarray) -> np.ndarray:
    out = np.empty_like(grid_t)
    pts_t = points["T"].to_numpy()
    pts_m = points["log_moneyness"].to_numpy()
    pts_iv = points["iv"].to_numpy()
    for i in range(grid_t.shape[0]):
        for j in range(grid_t.shape[1]):
            d = (pts_t - grid_t[i, j]) ** 2 + (pts_m - grid_m[i, j]) ** 2
            out[i, j] = pts_iv[int(np.argmin(d))]
    return out


def build_surface_for_ticker(
    ticker: str,
    r: float = 0.05,
    q: float = 0.0,
    prefer_live: bool = True,
    spot_hint: Optional[float] = None,
) -> VolSurface:
    """End-to-end helper: get a chain (live or synthetic) and build the surface."""
    from src.data.options_data import get_option_chain

    chain = get_option_chain(ticker, prefer_live=prefer_live, spot_hint=spot_hint)
    return build_vol_surface(chain, r=r, q=q)
