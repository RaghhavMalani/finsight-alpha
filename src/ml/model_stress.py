"""Adversarial and regime stress tests for every signal model."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score

SCENARIOS = (
    {
        "key": "VOL_SPIKE",
        "label": "Volatility doubles",
        "description": "Doubles volatility/range features and weakens momentum by one standard deviation.",
    },
    {
        "key": "CRASH_TAPE",
        "label": "Crash tape",
        "description": "Applies a two-sigma downside impulse to return, momentum and trend features.",
    },
    {
        "key": "TREND_REVERSAL",
        "label": "Trend reversal",
        "description": "Reverses directional momentum and moving-average distance features.",
    },
    {
        "key": "LIQUIDITY_GAP",
        "label": "Liquidity gap",
        "description": "Compresses volume/liquidity features and expands observed ranges.",
    },
    {
        "key": "FEATURE_OUTAGE",
        "label": "Feature outage",
        "description": "Replaces the highest-variance fifth of features with holdout-window medians.",
    },
    {
        "key": "NOISY_FEED",
        "label": "Noisy data feed",
        "description": "Adds deterministic three-quarter-sigma measurement noise to every feature.",
    },
)


def _f(value: Any) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _probabilities(model: Any, frame: pd.DataFrame) -> np.ndarray:
    if hasattr(model, "predict_proba"):
        values = np.asarray(model.predict_proba(frame))
        return (
            values[:, 1]
            if values.ndim == 2 and values.shape[1] > 1
            else values.reshape(-1)
        )
    if hasattr(model, "decision_function"):
        decision = np.asarray(model.decision_function(frame), dtype=float)
        return 1 / (1 + np.exp(-np.clip(decision, -30, 30)))
    return np.asarray(model.predict(frame), dtype=float)


def _metrics(y: pd.Series, probabilities: np.ndarray) -> dict[str, float | None]:
    truth = np.asarray(y, dtype=int)
    probs = np.clip(np.asarray(probabilities, dtype=float), 1e-6, 1 - 1e-6)
    predictions = (probs >= 0.5).astype(int)
    auc = roc_auc_score(truth, probs) if len(np.unique(truth)) > 1 else None
    return {
        "accuracy": _f(accuracy_score(truth, predictions)),
        "roc_auc": _f(auc),
        "brier_score": _f(brier_score_loss(truth, probs)),
        "mean_probability": _f(probs.mean()),
    }


def _matching(columns: list[str], terms: tuple[str, ...]) -> list[str]:
    return [
        column for column in columns if any(term in column.lower() for term in terms)
    ]


def _stress(frame: pd.DataFrame, key: str) -> pd.DataFrame:
    stressed = frame.copy()
    columns = list(stressed.columns)
    std = stressed.std().replace(0, 1).fillna(1)
    median = stressed.median().fillna(0)
    vol = _matching(columns, ("vol", "atr", "range", "variance", "std"))
    momentum = _matching(
        columns, ("return", "ret_", "momentum", "roc", "trend", "sma", "ema", "macd")
    )
    liquidity = _matching(
        columns, ("volume", "liquidity", "turnover", "obv", "money_flow")
    )
    directional = _matching(
        columns,
        ("momentum", "roc", "trend", "gap", "distance", "macd", "return", "ret_"),
    )

    if key == "VOL_SPIKE":
        if vol:
            stressed[vol] = stressed[vol] * 2.0
        if momentum:
            stressed[momentum] = stressed[momentum] - std[momentum]
    elif key == "CRASH_TAPE":
        if momentum:
            stressed[momentum] = stressed[momentum] - 2.0 * std[momentum]
        if vol:
            stressed[vol] = stressed[vol] * 2.5
    elif key == "TREND_REVERSAL":
        if directional:
            stressed[directional] = median[directional] - (
                stressed[directional] - median[directional]
            )
    elif key == "LIQUIDITY_GAP":
        if liquidity:
            stressed[liquidity] = stressed[liquidity] - 2.0 * std[liquidity]
        if vol:
            stressed[vol] = stressed[vol] * 1.5
    elif key == "FEATURE_OUTAGE":
        count = max(1, len(columns) // 5)
        outage = std.sort_values(ascending=False).head(count).index.tolist()
        for column in outage:
            stressed.loc[:, column] = median.loc[column]
    elif key == "NOISY_FEED":
        rng = np.random.default_rng(20260729)
        noise = rng.normal(0, 0.75, stressed.shape) * std.to_numpy()[None, :]
        stressed = pd.DataFrame(
            stressed.to_numpy() + noise, index=stressed.index, columns=stressed.columns
        )
    return stressed.replace([np.inf, -np.inf], np.nan).fillna(median)


def _regime_slices(
    frame: pd.DataFrame, truth: pd.Series, probabilities: np.ndarray
) -> list[dict[str, Any]]:
    columns = list(frame.columns)
    vol_columns = _matching(columns, ("realized_vol", "rolling_vol", "vol_20", "atr"))
    drawdown_columns = _matching(columns, ("drawdown",))
    slices: list[tuple[str, pd.Series]] = []
    if vol_columns:
        proxy = frame[vol_columns].abs().mean(axis=1)
        slices.extend(
            [
                ("HIGH_VOL", proxy >= proxy.quantile(0.75)),
                ("LOW_VOL", proxy <= proxy.quantile(0.25)),
            ]
        )
    if drawdown_columns:
        proxy = frame[drawdown_columns].mean(axis=1)
        slices.append(("DEEP_DRAWDOWN", proxy <= proxy.quantile(0.25)))
    output = []
    for label, mask in slices:
        positions = np.flatnonzero(mask.to_numpy())
        if len(positions) < 10:
            continue
        metrics = _metrics(truth.iloc[positions], probabilities[positions])
        output.append({"regime": label, "observations": len(positions), **metrics})
    return output


def stress_model_suite(
    trained_models: dict[str, dict[str, Any]],
    x_test: pd.DataFrame,
    y_test: pd.Series,
) -> dict[str, Any]:
    """Stress all fitted models with the same reproducible perturbation deck."""
    scorecards = []
    scenario_matrix = []
    for name, bundle in trained_models.items():
        model = bundle["model"]
        baseline_probs = _probabilities(model, x_test)
        baseline_predictions = (baseline_probs >= 0.5).astype(int)
        baseline = _metrics(y_test, baseline_probs)
        model_rows = []
        for scenario in SCENARIOS:
            stressed_frame = _stress(x_test, scenario["key"])
            probabilities = _probabilities(model, stressed_frame)
            stressed_metrics = _metrics(y_test, probabilities)
            row = {
                "model": name,
                "scenario": scenario["key"],
                "label": scenario["label"],
                "description": scenario["description"],
                **stressed_metrics,
                "accuracy_change": _f(
                    (stressed_metrics["accuracy"] or 0) - (baseline["accuracy"] or 0)
                ),
                "auc_change": _f(
                    (stressed_metrics["roc_auc"] or 0) - (baseline["roc_auc"] or 0)
                ),
                "brier_change": _f(
                    (stressed_metrics["brier_score"] or 0)
                    - (baseline["brier_score"] or 0)
                ),
                "prediction_flip_rate": _f(
                    np.mean((probabilities >= 0.5).astype(int) != baseline_predictions)
                ),
                "mean_probability_shift": _f(np.mean(probabilities - baseline_probs)),
                "latest_probability": _f(probabilities[-1]),
            }
            model_rows.append(row)
            scenario_matrix.append(row)
        worst_auc_drop = max(
            (-(row["auc_change"] or 0) for row in model_rows), default=0.0
        )
        worst_brier = max((row["brier_change"] or 0 for row in model_rows), default=0.0)
        worst_flip = max(
            (row["prediction_flip_rate"] or 0 for row in model_rows), default=0.0
        )
        robustness = max(
            0.0,
            100
            * (
                1
                - 0.45 * min(1, worst_auc_drop / 0.20)
                - 0.35 * worst_flip
                - 0.20 * min(1, worst_brier / 0.10)
            ),
        )
        worst = sorted(
            model_rows,
            key=lambda row: ((row["auc_change"] or 0), -(row["brier_change"] or 0)),
        )[0]
        scorecards.append(
            {
                "model": name,
                "robustness_score": _f(robustness),
                "baseline": baseline,
                "worst_scenario": worst["scenario"],
                "worst_auc_change": worst["auc_change"],
                "max_flip_rate": _f(worst_flip),
                "regime_slices": _regime_slices(x_test, y_test, baseline_probs),
            }
        )
    scorecards.sort(key=lambda row: row["robustness_score"] or 0, reverse=True)
    scenario_summary = []
    for scenario in SCENARIOS:
        rows = [row for row in scenario_matrix if row["scenario"] == scenario["key"]]
        scenario_summary.append(
            {
                "scenario": scenario["key"],
                "label": scenario["label"],
                "mean_auc_change": (
                    _f(np.mean([row["auc_change"] or 0 for row in rows]))
                    if rows
                    else None
                ),
                "mean_flip_rate": (
                    _f(np.mean([row["prediction_flip_rate"] or 0 for row in rows]))
                    if rows
                    else None
                ),
                "models": len(rows),
            }
        )
    return {
        "models_tested": len(scorecards),
        "scenarios_tested": len(SCENARIOS),
        "robustness_ranking": scorecards,
        "scenario_summary": scenario_summary,
        "matrix": scenario_matrix,
        "methodology": "All fitted models are re-scored on identical holdout rows after deterministic feature shocks; flip rate measures signal instability, not forecast error alone.",
    }
