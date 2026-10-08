"""What a signal trace supports: feature families, fold stability, holdout CI and the verdict.

Everything the Observatory says about predictive edge is computed here, from the trace's own
numbers, so the frontend never guesses a family or hard-codes a conclusion.
"""
from __future__ import annotations

import re

import numpy as np
from scipy.stats import rankdata, spearmanr

FAMILIES = ("Returns & momentum", "Trend & levels", "Volatility", "Volume", "Cross-asset")
# First match wins: relative_momentum is cross-asset, bollinger_width is volatility,
# drawdown_from_252_high is volatility while distance_from_52w_high is a level.
_FAMILY_RULES = (
    ("Cross-asset", re.compile(
        r"^(benchmark_|asset_minus_benchmark|rolling_beta_|rolling_corr_|relative_momentum_)")),
    ("Volume", re.compile(r"volume")),
    ("Volatility", re.compile(
        r"^(high_low_range|realized_vol_|volatility_|bollinger_width_|atr_|drawdown_from_|max_drawdown_|downside_vol_)")),
    ("Returns & momentum", re.compile(
        r"^(simple_return|log_return|intraday_return|overnight_gap|momentum_|rolling_return_)")),
    ("Trend & levels", re.compile(
        r"^(close_position_in_range|sma_|ema_|price_to_|price_above_|rsi_|macd|"
        r"bollinger_(upper|lower|percent)|rolling_max_|distance_from_52w_|trend_regime_code)")),
)
CHANCE = 0.5
EDGE_VALIDATION = 0.52


def feature_family(name: str) -> str:
    """Family of a signal feature column; unknown columns fail loudly instead of being guessed."""
    for family, pattern in _FAMILY_RULES:
        if pattern.search(name):
            return family
    raise ValueError(f"No feature family for signal column {name!r}")


def fold_rho(folds: list[dict]) -> list[float | None]:
    """Spearman ρ of final-stage importances between consecutive folds (None if constant)."""
    finals = [np.asarray(f["frames"][-1]["feature_importance"], dtype=float) for f in folds]
    rho = []
    for a, b in zip(finals, finals[1:]):
        if np.ptp(a) == 0 or np.ptp(b) == 0:
            rho.append(None)
        else:
            rho.append(round(float(spearmanr(a, b).statistic), 6))
    return rho


def bootstrap_auc_ci(y_true, scores, *, resamples: int = 2000, seed: int = 42,
                     level: float = 0.95) -> dict | None:
    """Percentile bootstrap of ROC AUC over resampled rows.

    AUC is the Mann-Whitney statistic with average ranks for ties, which equals sklearn's
    roc_auc_score. Resamples that draw a single class have no AUC; they are skipped and the
    count of usable ones is reported.
    """
    if scores is None:
        return None
    y = np.asarray(y_true).astype(int).ravel()
    p = np.asarray(scores, dtype=float).ravel()
    if len(y) != len(p) or len(y) == 0 or len(np.unique(y)) < 2:
        return None
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(y), size=(resamples, len(y)))
    yy, pp = y[idx], p[idx]
    positives = yy.sum(axis=1)
    negatives = len(y) - positives
    valid = (positives > 0) & (negatives > 0)
    if not valid.any():
        return None
    ranks = rankdata(pp[valid], axis=1)
    pos = positives[valid].astype(float)
    auc = ((ranks * yy[valid]).sum(axis=1) - pos * (pos + 1) / 2) / (pos * negatives[valid])
    tail = (1 - level) / 2 * 100
    low, high = np.percentile(auc, [tail, 100 - tail])
    return {"low": float(low), "high": float(high), "resamples": resamples,
            "valid_resamples": int(valid.sum()), "seed": seed}


def selection_suppressed(validation_aucs) -> bool:
    """Every family at or below chance: picking the best of them is selection on noise."""
    values = [a for a in validation_aucs if a is not None]
    return bool(values) and all(a <= CHANCE for a in values)


def selection_verdict(ci: dict | None, validation_aucs) -> tuple[str, str]:
    """(verdict, reason).

    edge:         holdout CI lower bound > 0.5 and best validation AUC > 0.52
    none:         holdout CI upper bound < 0.5, or every validation AUC ≤ 0.5
    inconclusive: otherwise, including a holdout without a computable AUC
    """
    values = [a for a in validation_aucs if a is not None]
    if selection_suppressed(values):
        return "none", "validation_at_or_below_chance"
    if ci is None:
        return "inconclusive", "holdout_auc_unavailable"
    if ci["high"] < CHANCE:
        return "none", "holdout_ci_below_chance"
    if ci["low"] > CHANCE:
        if values and max(values) > EDGE_VALIDATION:
            return "edge", "holdout_ci_above_chance"
        return "inconclusive", "validation_edge_too_small"
    return "inconclusive", "holdout_ci_spans_chance"
