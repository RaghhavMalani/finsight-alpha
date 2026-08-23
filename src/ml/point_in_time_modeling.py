"""Leakage-resistant signal selection, evaluation, and current inference."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from src.ml import evaluation, models, signal_engine, walk_forward
from src.ml.model_stress import stress_model_suite
from src.truth import canonical_hash


def _model(name: str, random_state: int):
    estimator = models.get_classification_model(name, random_state=random_state)
    if name == "logistic_regression":
        return Pipeline([("scaler", StandardScaler()), ("clf", estimator)])
    return estimator


def _metrics(y_true, predictions, probabilities) -> dict[str, Any]:
    result = evaluation.evaluate_classification_model(
        y_true, predictions, probabilities
    )
    result["brier_score"] = (
        float(brier_score_loss(y_true, probabilities))
        if probabilities is not None
        else np.nan
    )
    return result


def _score_key(row: dict[str, Any]) -> tuple[float, float, float]:
    roc_auc = float(row.get("roc_auc") or 0.0)
    if not np.isfinite(roc_auc):
        roc_auc = 0.0
    brier = float(row.get("brier_score"))
    if not np.isfinite(brier):
        brier = float("inf")
    f1_score = float(row.get("f1_score") or 0.0)
    if not np.isfinite(f1_score):
        f1_score = 0.0
    return (-roc_auc, brier, -f1_score)


def train_point_in_time_signal_suite(
    df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
    *,
    inference_row: pd.DataFrame,
    horizon: int,
    signal_date: str,
    data_version: str,
    test_size: float = 0.2,
    validation_size: float = 0.2,
    embargo: int = 0,
    random_state: int = 42,
    ticker: str | None = None,
) -> dict[str, Any]:
    """Select on validation, evaluate once on holdout, then infer on current data."""

    if inference_row.empty or len(inference_row) != 1:
        raise ValueError("inference_row must contain exactly one current feature row.")
    if horizon < 1:
        raise ValueError("horizon must be positive.")

    X_train, X_test, y_train, y_test = walk_forward.time_series_train_test_split(
        df,
        feature_cols,
        target_col,
        test_size=test_size,
        target_horizon=horizon,
        embargo=embargo,
    )
    development = df.loc[X_train.index]
    X_fit, X_validation, y_fit, y_validation = (
        walk_forward.time_series_train_test_split(
            development,
            feature_cols,
            target_col,
            test_size=validation_size,
            target_horizon=horizon,
            embargo=embargo,
        )
    )

    candidate_names = ["logistic_regression", "random_forest", "gradient_boosting"]
    if getattr(models, "HAS_XGB", False):
        candidate_names.append("xgboost")
    if getattr(models, "HAS_LGB", False):
        candidate_names.append("lightgbm")

    selection_rows: list[dict[str, Any]] = []
    for name in candidate_names:
        candidate = models.train_model(_model(name, random_state), X_fit, y_fit)
        predictions, probabilities = models.make_predictions(candidate, X_validation)
        row = {"model_name": name, **_metrics(y_validation, predictions, probabilities)}
        row["model_edge"] = row.get(
            "accuracy", 0
        ) - evaluation.calculate_baseline_accuracy(y_validation)
        selection_rows.append(row)

    selection_rows.sort(key=_score_key)
    selected_name = selection_rows[0]["model_name"]
    selection_table = pd.DataFrame(selection_rows)

    # The holdout is touched only after the model family has been selected.
    evaluation_model = models.train_model(
        _model(selected_name, random_state), X_train, y_train
    )
    test_predictions, test_probabilities = models.make_predictions(
        evaluation_model, X_test
    )
    test_metrics = _metrics(y_test, test_predictions, test_probabilities)
    test_baseline = evaluation.calculate_baseline_accuracy(y_test)
    test_metrics["model_edge"] = test_metrics.get("accuracy", 0) - test_baseline

    # Current inference uses a separately constructed, unlabeled latest row.
    inference_model = models.train_model(
        _model(selected_name, random_state), df[feature_cols], df[target_col]
    )
    _, latest_probability = models.make_predictions(
        inference_model, inference_row[feature_cols]
    )
    raw_probability = (
        float(latest_probability[0]) if latest_probability is not None else None
    )
    reliable_name = (
        selected_name
        if float(test_metrics.get("roc_auc") or 0) >= 0.52
        else "No reliable edge found"
    )
    signal = signal_engine.generate_institutional_signal(
        probability_up=raw_probability,
        roc_auc=test_metrics.get("roc_auc"),
        model_edge=test_metrics.get("model_edge"),
    )
    actual_model = (
        inference_model.named_steps["clf"]
        if selected_name == "logistic_regression"
        else inference_model
    )
    model_version = canonical_hash(
        {
            "family": selected_name,
            "feature_cols": feature_cols,
            "horizon": horizon,
            "random_state": random_state,
            "training_rows": len(df),
            "data_version": data_version,
        }
    )

    return {
        "ticker": ticker,
        "model_results": selection_table,
        "best_model_name": reliable_name,
        "best_model": inference_model,
        "diagnostic_model_name": selected_name,
        "best_model_metrics": test_metrics,
        "baseline_accuracy": test_baseline,
        "model_edge": test_metrics.get("model_edge"),
        "roc_auc": test_metrics.get("roc_auc"),
        "raw_probability_up": raw_probability,
        "calibrated_probability_up": raw_probability,
        "shrunk_probability_up": raw_probability,
        "institutional_signal": signal,
        "model_stress": stress_model_suite(
            {
                selected_name: {
                    "model": evaluation_model,
                    "preds": test_predictions,
                    "probs": test_probabilities,
                }
            },
            X_test,
            y_test,
        ),
        "calibration_table": None,
        "brier_score": test_metrics.get("brier_score"),
        "feature_importance": models.get_feature_importance(actual_model, feature_cols),
        "X_train": X_train,
        "X_test": X_test,
        "y_train": y_train,
        "y_test": y_test,
        "y_pred": test_predictions,
        "y_pred_proba": test_probabilities,
        "timing": {
            "signal_date": signal_date,
            "training_start": str(df.iloc[0].get("Date", df.index[0]))[:10],
            "training_end": str(df.iloc[-1].get("Date", df.index[-1]))[:10],
            "target_horizon_days": horizon,
            "purged_rows": horizon,
            "embargo_rows": embargo,
            "data_version": data_version,
            "model_version": model_version,
        },
    }
