"""Turn Monte Carlo GBM paths into a price-distribution surface over time.

The classic 2D fan chart shows percentile bands; this goes one dimension further
and reconstructs the *full distribution* of the simulated price at each point in
the horizon, producing a surface (time x price -> probability density) - the
"probability cone". It's the most information-dense way to see how uncertainty
fans out, and it's a genuinely meaningful 3D view (not 3D for decoration).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Tuple

import numpy as np
import pandas as pd


@dataclass
class MCProbabilitySurface:
    """A (time x price) probability-density surface plus percentile bands."""

    times: np.ndarray                       # horizon axis (years), length n_time
    prices: np.ndarray                      # price-bin centers, length n_price
    density: np.ndarray                     # (n_time, n_price) per-time densities
    percentiles: Dict[int, np.ndarray] = field(default_factory=dict)  # p -> over times
    S0: float = 0.0
    horizon_years: float = 1.0


def build_probability_surface(
    paths: pd.DataFrame | np.ndarray,
    horizon_years: float = 1.0,
    n_time: int = 30,
    n_price: int = 60,
    clip_pct: Tuple[float, float] = (1.0, 99.0),
    percentiles: Tuple[int, ...] = (5, 50, 95),
) -> MCProbabilitySurface:
    """Build a probability-density surface from simulated price paths.

    Parameters
    ----------
    paths:
        ``(steps+1, n_sims)`` matrix from :func:`simulate_gbm_paths` (row 0 = S0).
    horizon_years:
        Total simulated horizon, used only to label the time axis.
    n_time, n_price:
        Resolution of the surface grid.
    clip_pct:
        Percentile clip on the price axis so a few extreme GBM tails don't stretch
        the whole surface flat.
    percentiles:
        Percentile bands to also return as line series over time.
    """
    arr = paths.to_numpy() if isinstance(paths, pd.DataFrame) else np.asarray(paths)
    if arr.ndim != 2 or arr.shape[0] < 2:
        raise ValueError("paths must be a 2D (steps+1, n_sims) array with >= 2 rows.")

    n_steps = arr.shape[0] - 1
    t_idx = np.unique(np.linspace(0, n_steps, n_time).astype(int))
    times = t_idx / n_steps * horizon_years

    # Price axis from clipped percentiles across the sampled times.
    sample = arr[t_idx, :]
    lo, hi = np.percentile(sample, clip_pct[0]), np.percentile(sample, clip_pct[1])
    if hi <= lo:
        hi = lo + max(1e-6, abs(lo) * 0.01)
    edges = np.linspace(lo, hi, n_price + 1)
    centers = 0.5 * (edges[:-1] + edges[1:])

    density = np.zeros((len(t_idx), n_price))
    for i, ti in enumerate(t_idx):
        hist, _ = np.histogram(arr[ti, :], bins=edges, density=True)
        density[i] = hist

    perc = {int(p): np.percentile(arr[t_idx, :], p, axis=1) for p in percentiles}

    return MCProbabilitySurface(
        times=times, prices=centers, density=density,
        percentiles=perc, S0=float(arr[0, 0]), horizon_years=horizon_years,
    )
