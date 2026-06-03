"""Sector-level analytics.

Aggregates per-ticker metrics into sector averages using the ticker-to-sector
mapping in :mod:`src.config`. Useful for spotting which parts of the market drove
returns or carried the most risk.
"""

from __future__ import annotations

import pandas as pd

from src import config
from src.analytics.metrics import (
    calculate_annualized_volatility,
    calculate_max_drawdown,
    calculate_simple_returns,
    calculate_total_return,
)
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)


def add_sector_column(df: pd.DataFrame, ticker_col: str = "Ticker") -> pd.DataFrame:
    """Return a copy of ``df`` with a ``Sector`` column derived from the ticker.

    Uses the ticker-to-sector mapping in :mod:`src.config`. Unmapped tickers are
    labelled ``"Unknown"``. The input frame is never mutated.
    """
    if df is None or df.empty or ticker_col not in df.columns:
        return df.copy() if df is not None else pd.DataFrame()
    out = df.copy()
    out["Sector"] = out[ticker_col].astype(str).map(config.get_sector)
    return out


def _per_ticker_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Compute total return, annualised volatility, and max drawdown per ticker.

    Parameters
    ----------
    df:
        Long-format price frame (``Date, Close, Ticker`` at minimum).

    Returns
    -------
    pandas.DataFrame
        One row per ticker with columns ``ticker, sector, total_return,
        annualized_volatility, max_drawdown``.
    """
    rows: list[dict[str, object]] = []
    for ticker, group in df.groupby("Ticker"):
        prices = group.sort_values("Date")["Close"].dropna()
        if prices.shape[0] < 2:
            logger.warning("Not enough data to summarise '%s'; skipping.", ticker)
            continue
        returns = calculate_simple_returns(prices)
        rows.append(
            {
                "ticker": ticker,
                "sector": config.get_sector(str(ticker)),
                "total_return": calculate_total_return(prices),
                "annualized_volatility": calculate_annualized_volatility(returns),
                "max_drawdown": calculate_max_drawdown(prices),
            }
        )
    return pd.DataFrame(rows)


def calculate_sector_summary(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate per-ticker metrics into sector-level averages.

    Parameters
    ----------
    df:
        Long-format multi-ticker price frame.

    Returns
    -------
    pandas.DataFrame
        Indexed by ``sector`` with columns:
        ``avg_total_return``, ``avg_annualized_volatility``,
        ``avg_max_drawdown``, ``num_tickers``. Empty frame if no data.
    """
    if df is None or df.empty or "Ticker" not in df.columns:
        return pd.DataFrame()

    per_ticker = _per_ticker_metrics(df)
    if per_ticker.empty:
        return pd.DataFrame()

    grouped = per_ticker.groupby("sector").agg(
        avg_total_return=("total_return", "mean"),
        avg_annualized_volatility=("annualized_volatility", "mean"),
        avg_max_drawdown=("max_drawdown", "mean"),
        num_tickers=("ticker", "count"),
    )
    return grouped.sort_values("avg_total_return", ascending=False)


def calculate_sector_rankings(df: pd.DataFrame) -> pd.DataFrame:
    """Rank sectors by average total return (best first).

    Returns the sector summary with an added integer ``rank`` column and the
    sector promoted to a regular column (so it is easy to display in a table).
    Empty frame if there is no data.
    """
    summary = calculate_sector_summary(df)
    if summary.empty:
        return pd.DataFrame()

    ranked = summary.sort_values("avg_total_return", ascending=False).reset_index()
    ranked.insert(0, "rank", range(1, len(ranked) + 1))
    return ranked
