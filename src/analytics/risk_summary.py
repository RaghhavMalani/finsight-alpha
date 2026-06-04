"""Risk analytics.

A lightweight, local-first risk module: it classifies each asset's risk from its
annualized volatility, computes downside deviation (volatility of only the
losing days), and assembles a per-ticker risk summary table.

Advanced tail-risk measures - Value at Risk (VaR), Conditional VaR (CVaR), and
Monte Carlo simulation - are intentionally NOT implemented here. They arrive in
Phase 4; placeholders are surfaced in the dashboard so the roadmap is visible.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src import config
from src.analytics.metrics import (
    calculate_annualized_volatility,
    calculate_downside_deviation,
    calculate_max_drawdown,
    calculate_simple_returns,
)
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

# Volatility thresholds (annualized, decimal) used to bucket risk.
LOW_RISK_THRESHOLD: float = 0.15
HIGH_RISK_THRESHOLD: float = 0.30


def classify_volatility_risk(annualized_volatility: float) -> str:
    """Classify an annualized volatility into a risk bucket.

    Rules
    -----
    * ``< 0.15``        -> ``"Low Risk"``
    * ``0.15 .. 0.30``  -> ``"Medium Risk"``
    * ``> 0.30``        -> ``"High Risk"``

    Parameters
    ----------
    annualized_volatility:
        Annualized volatility as a decimal (e.g. ``0.22`` = 22%).

    Returns
    -------
    str
        ``"Low Risk"``, ``"Medium Risk"``, or ``"High Risk"``.
    """
    if annualized_volatility is None or np.isnan(annualized_volatility):
        return "Unknown"
    if annualized_volatility < LOW_RISK_THRESHOLD:
        return "Low Risk"
    if annualized_volatility <= HIGH_RISK_THRESHOLD:
        return "Medium Risk"
    return "High Risk"


def calculate_risk_summary(df: pd.DataFrame) -> pd.DataFrame:
    """Build a per-ticker risk summary table from a long-format price frame.

    Parameters
    ----------
    df:
        Long-format frame with at least ``Date``, ``Close``, ``Ticker``.

    Returns
    -------
    pandas.DataFrame
        One row per ticker with columns: ``Ticker``, ``Annualized Volatility``,
        ``Downside Deviation``, ``Max Drawdown``, ``Risk Classification``, and
        placeholder ``VaR (95%)`` / ``CVaR (95%)`` columns labelled
        ``"Coming in Phase 4"``. Sorted by volatility (riskiest first). Empty
        frame if there is no usable data.
    """
    if df is None or df.empty or "Ticker" not in df.columns:
        return pd.DataFrame()

    rows: list[dict[str, object]] = []
    for ticker, group in df.groupby("Ticker"):
        prices = group.sort_values("Date")["Close"].dropna()
        if prices.shape[0] < 2:
            logger.warning("Not enough data for risk summary of '%s'; skipping.", ticker)
            continue
        returns = calculate_simple_returns(prices)
        ann_vol = calculate_annualized_volatility(returns)
        rows.append(
            {
                "Ticker": ticker,
                "Annualized Volatility": ann_vol,
                "Downside Deviation": calculate_downside_deviation(returns),
                "Max Drawdown": calculate_max_drawdown(prices),
                "Risk Classification": classify_volatility_risk(ann_vol),
                # Placeholders for advanced tail-risk measures (Phase 4).
                "VaR (95%)": "Coming in Phase 4",
                "CVaR (95%)": "Coming in Phase 4",
            }
        )

    if not rows:
        return pd.DataFrame()

    summary = pd.DataFrame(rows)
    return summary.sort_values("Annualized Volatility", ascending=False).reset_index(drop=True)
