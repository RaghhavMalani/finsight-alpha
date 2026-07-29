"""Leakage-conscious benchmark for FinSight Alpha's signal models.

The production ML endpoint compares models on one chronological holdout and
selects the winner on that same holdout.  This script adds a stricter,
resume-friendly evaluation:

1. Build the application's signal features and next-period targets.
2. Use the first 60% of each ticker for initial training.
3. Use the next 20% for global model selection.
4. Lock the selected model before evaluating the final 20%.
5. Retrain on an expanding window at each step without shuffling.

The full-series volatility-regime code is intentionally excluded because its
quantile thresholds use the complete dataset.  All ``target_*`` columns are
also excluded dynamically.
"""

from __future__ import annotations

import argparse
import json
import sys
import math
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    brier_score_loss,
    f1_score,
    log_loss,
    matthews_corrcoef,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.data.market_data import MarketDataService
from src.ml import models, signal_features, signal_targets


DEFAULT_TICKERS = [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "JPM",
    "XOM",
    "JNJ",
    "CAT",
]
CORE_CLASSIFIERS = [
    "logistic_regression",
    "random_forest",
    "gradient_boosting",
]
CORE_REGRESSORS = [
    "linear_regression",
    "random_forest",
    "gradient_boosting",
]
RAW_AND_LEAKAGE_SENSITIVE_COLUMNS = {
    "Date",
    "Ticker",
    "Open",
    "High",
    "Low",
    "Close",
    "Volume",
    # signal_features.py derives this from full-series qcut thresholds.
    "volatility_regime_code",
}


@dataclass(frozen=True)
class BenchmarkConfig:
    tickers: list[str]
    benchmark: str
    start: str
    end: str
    horizon: int
    selection_start_fraction: float
    test_start_fraction: float
    step_size: int
    random_state: int
    classifiers: list[str]
    regressors: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tickers",
        default=",".join(DEFAULT_TICKERS),
        help="Comma-separated ticker universe.",
    )
    parser.add_argument("--benchmark", default="SPY")
    parser.add_argument("--start", default="2018-01-01")
    parser.add_argument("--end", default=date.today().isoformat())
    parser.add_argument("--horizon", type=int, default=1)
    parser.add_argument("--selection-start-fraction", type=float, default=0.60)
    parser.add_argument("--test-start-fraction", type=float, default=0.80)
    parser.add_argument(
        "--step-size",
        type=int,
        default=126,
        help="Trading rows in each expanding-window prediction block.",
    )
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument(
        "--classifiers",
        default=",".join(CORE_CLASSIFIERS),
        help="Comma-separated classification model names.",
    )
    parser.add_argument(
        "--regressors",
        default=",".join(CORE_REGRESSORS),
        help="Comma-separated regression model names; pass an empty value to skip.",
    )
    parser.add_argument(
        "--output-dir",
        default="data/exports/ml_benchmark",
        help="Directory for CSV and JSON benchmark artifacts.",
    )
    return parser.parse_args()


def comma_list(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def validate_config(config: BenchmarkConfig) -> None:
    if not 0 < config.selection_start_fraction < config.test_start_fraction < 1:
        raise ValueError(
            "Fractions must satisfy 0 < selection_start_fraction "
            "< test_start_fraction < 1."
        )
    if config.horizon < 1:
        raise ValueError("horizon must be at least 1.")
    if config.step_size < 1:
        raise ValueError("step_size must be at least 1.")


def feature_columns(frame: pd.DataFrame) -> list[str]:
    return [
        column
        for column in frame.columns
        if pd.api.types.is_numeric_dtype(frame[column])
        and column not in RAW_AND_LEAKAGE_SENSITIVE_COLUMNS
        and not column.startswith("target_")
    ]


def build_dataset(
    asset: pd.DataFrame,
    benchmark: pd.DataFrame,
    ticker: str,
    horizon: int,
) -> tuple[pd.DataFrame, list[str]]:
    asset = asset.sort_values("Date").reset_index(drop=True).copy()
    benchmark = benchmark.sort_values("Date").reset_index(drop=True).copy()
    asset["Ticker"] = ticker
    benchmark["Ticker"] = "BENCHMARK"

    featured = signal_features.create_signal_research_features(
        asset,
        benchmark_df=benchmark,
        ticker=ticker,
    )
    targeted = signal_targets.create_signal_research_targets(
        featured,
        horizon=horizon,
    )
    columns = feature_columns(targeted)
    target_return = f"target_return_{horizon}d"
    required = ["target_direction", target_return, *columns]
    clean = (
        targeted.replace([np.inf, -np.inf], np.nan)
        .dropna(subset=required)
        .reset_index(drop=True)
    )
    if len(clean) < 500:
        raise ValueError(
            f"{ticker}: only {len(clean)} clean rows; at least 500 are required."
        )
    return clean, columns


def classifier(name: str, random_state: int) -> Any:
    model = models.get_classification_model(name, random_state=random_state)
    if name == "logistic_regression":
        return Pipeline([("scaler", StandardScaler()), ("model", model)])
    return model


def regressor(name: str, random_state: int) -> Any:
    model = models.get_regression_model(name, random_state=random_state)
    if name == "linear_regression":
        return Pipeline([("scaler", StandardScaler()), ("model", model)])
    return model


def prediction_windows(
    total_rows: int,
    start_fraction: float,
    end_fraction: float,
    step_size: int,
) -> Iterable[tuple[int, int]]:
    current = int(total_rows * start_fraction)
    stop = int(total_rows * end_fraction)
    while current < stop:
        end = min(current + step_size, stop)
        yield current, end
        current = end


def classification_predictions(
    frame: pd.DataFrame,
    columns: list[str],
    ticker: str,
    model_name: str,
    start_fraction: float,
    end_fraction: float,
    step_size: int,
    horizon: int,
    random_state: int,
) -> pd.DataFrame:
    rows: list[pd.DataFrame] = []
    for fold, (start, end) in enumerate(
        prediction_windows(len(frame), start_fraction, end_fraction, step_size),
        start=1,
    ):
        # A horizon-h label is known at prediction row ``start`` only when its
        # source row is no later than start-h.
        train_stop = start - horizon + 1
        train = frame.iloc[:train_stop]
        test = frame.iloc[start:end]
        estimator = classifier(model_name, random_state)
        estimator.fit(train[columns], train["target_direction"])
        prediction = estimator.predict(test[columns])
        probability = estimator.predict_proba(test[columns])[:, 1]
        train_prevalence = float(train["target_direction"].mean())
        rows.append(
            pd.DataFrame(
                {
                    "Date": test["Date"].astype(str).str[:10].to_numpy(),
                    "ticker": ticker,
                    "model": model_name,
                    "fold": fold,
                    "y_true": test["target_direction"].astype(int).to_numpy(),
                    "y_pred": prediction.astype(int),
                    "y_probability": probability.astype(float),
                    "training_prevalence": train_prevalence,
                    "training_rows": len(train),
                }
            )
        )
    return pd.concat(rows, ignore_index=True)


def regression_predictions(
    frame: pd.DataFrame,
    columns: list[str],
    ticker: str,
    model_name: str,
    start_fraction: float,
    end_fraction: float,
    step_size: int,
    horizon: int,
    random_state: int,
) -> pd.DataFrame:
    target = f"target_return_{horizon}d"
    rows: list[pd.DataFrame] = []
    for fold, (start, end) in enumerate(
        prediction_windows(len(frame), start_fraction, end_fraction, step_size),
        start=1,
    ):
        train_stop = start - horizon + 1
        train = frame.iloc[:train_stop]
        test = frame.iloc[start:end]
        estimator = regressor(model_name, random_state)
        estimator.fit(train[columns], train[target])
        prediction = estimator.predict(test[columns])
        rows.append(
            pd.DataFrame(
                {
                    "Date": test["Date"].astype(str).str[:10].to_numpy(),
                    "ticker": ticker,
                    "model": model_name,
                    "fold": fold,
                    "y_true": test[target].astype(float).to_numpy(),
                    "y_pred": prediction.astype(float),
                    "training_mean_return": float(train[target].mean()),
                    "training_rows": len(train),
                }
            )
        )
    return pd.concat(rows, ignore_index=True)


def expected_calibration_error(
    y_true: np.ndarray,
    probability: np.ndarray,
    bins: int = 10,
) -> float:
    edges = np.linspace(0.0, 1.0, bins + 1)
    total = len(y_true)
    error = 0.0
    for lower, upper in zip(edges[:-1], edges[1:]):
        if upper == 1.0:
            mask = (probability >= lower) & (probability <= upper)
        else:
            mask = (probability >= lower) & (probability < upper)
        if not mask.any():
            continue
        confidence = float(probability[mask].mean())
        observed = float(y_true[mask].mean())
        error += float(mask.sum()) / total * abs(confidence - observed)
    return error


def wilson_interval(successes: int, total: int) -> tuple[float, float]:
    if total == 0:
        return math.nan, math.nan
    z = 1.959963984540054
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    margin = (
        z
        * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
        / denominator
    )
    return centre - margin, centre + margin


def classification_summary(predictions: pd.DataFrame) -> dict[str, Any]:
    y_true = predictions["y_true"].to_numpy(dtype=int)
    y_pred = predictions["y_pred"].to_numpy(dtype=int)
    probability = predictions["y_probability"].to_numpy(dtype=float)
    baseline_prediction = (
        predictions["training_prevalence"].to_numpy(dtype=float) >= 0.5
    ).astype(int)
    baseline_probability = predictions["training_prevalence"].to_numpy(dtype=float)
    high_confidence = (probability >= 0.55) | (probability <= 0.45)
    correct = int((y_true == y_pred).sum())
    ci_low, ci_high = wilson_interval(correct, len(y_true))

    return {
        "model": str(predictions["model"].iloc[0]),
        "tickers": int(predictions["ticker"].nunique()),
        "predictions": int(len(predictions)),
        "period_start": str(predictions["Date"].min()),
        "period_end": str(predictions["Date"].max()),
        "positive_rate": float(y_true.mean()),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "accuracy_ci95_low": ci_low,
        "accuracy_ci95_high": ci_high,
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "mcc": float(matthews_corrcoef(y_true, y_pred)),
        "roc_auc": float(roc_auc_score(y_true, probability)),
        "brier_score": float(brier_score_loss(y_true, probability)),
        "log_loss": float(log_loss(y_true, probability, labels=[0, 1])),
        "expected_calibration_error": expected_calibration_error(
            y_true,
            probability,
        ),
        "training_only_baseline_accuracy": float(
            accuracy_score(y_true, baseline_prediction)
        ),
        "accuracy_edge": float(
            accuracy_score(y_true, y_pred)
            - accuracy_score(y_true, baseline_prediction)
        ),
        "baseline_brier_score": float(
            brier_score_loss(y_true, baseline_probability)
        ),
        "always_up_accuracy": float(y_true.mean()),
        "high_confidence_coverage": float(high_confidence.mean()),
        "high_confidence_accuracy": (
            float(accuracy_score(y_true[high_confidence], y_pred[high_confidence]))
            if high_confidence.any()
            else math.nan
        ),
    }


def regression_summary(predictions: pd.DataFrame) -> dict[str, Any]:
    y_true = predictions["y_true"].to_numpy(dtype=float)
    y_pred = predictions["y_pred"].to_numpy(dtype=float)
    baseline = predictions["training_mean_return"].to_numpy(dtype=float)
    rmse = math.sqrt(mean_squared_error(y_true, y_pred))
    baseline_rmse = math.sqrt(mean_squared_error(y_true, baseline))
    correlation = np.corrcoef(y_true, y_pred)[0, 1]
    return {
        "model": str(predictions["model"].iloc[0]),
        "tickers": int(predictions["ticker"].nunique()),
        "predictions": int(len(predictions)),
        "period_start": str(predictions["Date"].min()),
        "period_end": str(predictions["Date"].max()),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "mae_bps": float(mean_absolute_error(y_true, y_pred) * 10_000),
        "rmse": float(rmse),
        "rmse_bps": float(rmse * 10_000),
        "r2": float(r2_score(y_true, y_pred)),
        "directional_accuracy": float(
            accuracy_score(y_true > 0, y_pred > 0)
        ),
        "prediction_correlation": float(correlation),
        "training_mean_baseline_mae_bps": float(
            mean_absolute_error(y_true, baseline) * 10_000
        ),
        "training_mean_baseline_rmse_bps": float(baseline_rmse * 10_000),
        "rmse_improvement": float((baseline_rmse - rmse) / baseline_rmse),
    }


def summarize_by_model(
    predictions: pd.DataFrame,
    summary_function: Any,
) -> pd.DataFrame:
    rows = [
        summary_function(group)
        for _, group in predictions.groupby("model", sort=False)
    ]
    return pd.DataFrame(rows)


def summarize_by_ticker(
    predictions: pd.DataFrame,
    summary_function: Any,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for (model_name, ticker), group in predictions.groupby(
        ["model", "ticker"],
        sort=False,
    ):
        result = summary_function(group)
        result["model"] = model_name
        result["ticker"] = ticker
        rows.append(result)
    return pd.DataFrame(rows)


def download_datasets(
    config: BenchmarkConfig,
) -> tuple[dict[str, tuple[pd.DataFrame, list[str]]], list[dict[str, Any]]]:
    service = MarketDataService("yfinance")
    benchmark = service.get_data(
        config.benchmark,
        config.start,
        config.end,
    )
    datasets: dict[str, tuple[pd.DataFrame, list[str]]] = {}
    inventory: list[dict[str, Any]] = []
    for ticker in config.tickers:
        print(f"Preparing {ticker}...", flush=True)
        asset = service.get_data(ticker, config.start, config.end)
        frame, columns = build_dataset(
            asset,
            benchmark,
            ticker,
            config.horizon,
        )
        datasets[ticker] = (frame, columns)
        inventory.append(
            {
                "ticker": ticker,
                "clean_rows": len(frame),
                "features": len(columns),
                "start": str(frame["Date"].min())[:10],
                "end": str(frame["Date"].max())[:10],
            }
        )
    return datasets, inventory


def run_classification(
    config: BenchmarkConfig,
    datasets: dict[str, tuple[pd.DataFrame, list[str]]],
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, str]:
    validation_parts: list[pd.DataFrame] = []
    test_parts: list[pd.DataFrame] = []
    for model_name in config.classifiers:
        for ticker, (frame, columns) in datasets.items():
            print(
                f"Classification {model_name}: {ticker} validation/test...",
                flush=True,
            )
            validation_parts.append(
                classification_predictions(
                    frame,
                    columns,
                    ticker,
                    model_name,
                    config.selection_start_fraction,
                    config.test_start_fraction,
                    config.step_size,
                    config.horizon,
                    config.random_state,
                )
            )
            test_parts.append(
                classification_predictions(
                    frame,
                    columns,
                    ticker,
                    model_name,
                    config.test_start_fraction,
                    1.0,
                    config.step_size,
                    config.horizon,
                    config.random_state,
                )
            )

    validation = pd.concat(validation_parts, ignore_index=True)
    test = pd.concat(test_parts, ignore_index=True)
    validation_summary = summarize_by_model(
        validation,
        classification_summary,
    ).sort_values(
        ["roc_auc", "brier_score", "f1"],
        ascending=[False, True, False],
    )
    selected_model = str(validation_summary.iloc[0]["model"])
    test_summary = summarize_by_model(test, classification_summary)
    test_summary["selected_before_test"] = (
        test_summary["model"] == selected_model
    )
    test_per_ticker = summarize_by_ticker(test, classification_summary)
    test_per_ticker["selected_before_test"] = (
        test_per_ticker["model"] == selected_model
    )
    return validation, test, validation_summary, test_summary, test_per_ticker, selected_model


def run_regression(
    config: BenchmarkConfig,
    datasets: dict[str, tuple[pd.DataFrame, list[str]]],
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, str]:
    validation_parts: list[pd.DataFrame] = []
    test_parts: list[pd.DataFrame] = []
    for model_name in config.regressors:
        for ticker, (frame, columns) in datasets.items():
            print(
                f"Regression {model_name}: {ticker} validation/test...",
                flush=True,
            )
            validation_parts.append(
                regression_predictions(
                    frame,
                    columns,
                    ticker,
                    model_name,
                    config.selection_start_fraction,
                    config.test_start_fraction,
                    config.step_size,
                    config.horizon,
                    config.random_state,
                )
            )
            test_parts.append(
                regression_predictions(
                    frame,
                    columns,
                    ticker,
                    model_name,
                    config.test_start_fraction,
                    1.0,
                    config.step_size,
                    config.horizon,
                    config.random_state,
                )
            )

    validation = pd.concat(validation_parts, ignore_index=True)
    test = pd.concat(test_parts, ignore_index=True)
    validation_summary = summarize_by_model(
        validation,
        regression_summary,
    ).sort_values(["rmse", "mae"])
    selected_model = str(validation_summary.iloc[0]["model"])
    test_summary = summarize_by_model(test, regression_summary)
    test_summary["selected_before_test"] = (
        test_summary["model"] == selected_model
    )
    test_per_ticker = summarize_by_ticker(test, regression_summary)
    test_per_ticker["selected_before_test"] = (
        test_per_ticker["model"] == selected_model
    )
    return validation, test, validation_summary, test_summary, test_per_ticker, selected_model


def dataframe_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    clean = frame.replace({np.nan: None})
    return clean.to_dict(orient="records")


def write_outputs(
    output_dir: Path,
    config: BenchmarkConfig,
    inventory: list[dict[str, Any]],
    classification_result: tuple[
        pd.DataFrame,
        pd.DataFrame,
        pd.DataFrame,
        pd.DataFrame,
        pd.DataFrame,
        str,
    ],
    regression_result: tuple[
        pd.DataFrame,
        pd.DataFrame,
        pd.DataFrame,
        pd.DataFrame,
        pd.DataFrame,
        str,
    ]
    | None,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (
        class_validation,
        class_test,
        class_validation_summary,
        class_test_summary,
        class_test_per_ticker,
        selected_classifier,
    ) = classification_result
    class_validation.to_csv(
        output_dir / "classification_validation_predictions.csv",
        index=False,
    )
    class_test.to_csv(
        output_dir / "classification_test_predictions.csv",
        index=False,
    )
    class_validation_summary.to_csv(
        output_dir / "classification_validation_summary.csv",
        index=False,
    )
    class_test_summary.to_csv(
        output_dir / "classification_test_summary.csv",
        index=False,
    )
    class_test_per_ticker.to_csv(
        output_dir / "classification_test_by_ticker.csv",
        index=False,
    )

    report: dict[str, Any] = {
        "config": asdict(config),
        "dataset_inventory": inventory,
        "methodology": {
            "split": "60% initial train / 20% model selection / 20% locked test",
            "validation": "chronological expanding-window; no shuffle",
            "model_selection": "validation ROC-AUC desc, Brier asc, F1 desc",
            "retraining_step_rows": config.step_size,
            "excluded_feature": "volatility_regime_code",
            "excluded_feature_reason": (
                "Its qcut thresholds are computed from the complete series."
            ),
            "target_purge": (
                "Training rows whose horizon label was unavailable at prediction "
                "time were excluded."
            ),
        },
        "classification": {
            "selected_on_validation": selected_classifier,
            "validation_summary": dataframe_records(class_validation_summary),
            "locked_test_summary": dataframe_records(class_test_summary),
        },
    }

    if regression_result is not None:
        (
            regression_validation,
            regression_test,
            regression_validation_summary,
            regression_test_summary,
            regression_test_per_ticker,
            selected_regressor,
        ) = regression_result
        regression_validation.to_csv(
            output_dir / "regression_validation_predictions.csv",
            index=False,
        )
        regression_test.to_csv(
            output_dir / "regression_test_predictions.csv",
            index=False,
        )
        regression_validation_summary.to_csv(
            output_dir / "regression_validation_summary.csv",
            index=False,
        )
        regression_test_summary.to_csv(
            output_dir / "regression_test_summary.csv",
            index=False,
        )
        regression_test_per_ticker.to_csv(
            output_dir / "regression_test_by_ticker.csv",
            index=False,
        )
        report["regression"] = {
            "selected_on_validation": selected_regressor,
            "validation_summary": dataframe_records(regression_validation_summary),
            "locked_test_summary": dataframe_records(regression_test_summary),
        }

    (output_dir / "benchmark_report.json").write_text(
        json.dumps(report, indent=2, allow_nan=False),
        encoding="utf-8",
    )


def main() -> None:
    args = parse_args()
    config = BenchmarkConfig(
        tickers=comma_list(args.tickers),
        benchmark=args.benchmark.strip().upper(),
        start=args.start,
        end=args.end,
        horizon=args.horizon,
        selection_start_fraction=args.selection_start_fraction,
        test_start_fraction=args.test_start_fraction,
        step_size=args.step_size,
        random_state=args.random_state,
        classifiers=comma_list(args.classifiers),
        regressors=comma_list(args.regressors),
    )
    validate_config(config)
    datasets, inventory = download_datasets(config)
    classification_result = run_classification(config, datasets)
    regression_result = (
        run_regression(config, datasets) if config.regressors else None
    )
    write_outputs(
        Path(args.output_dir),
        config,
        inventory,
        classification_result,
        regression_result,
    )

    selected_classifier = classification_result[-1]
    class_test_summary = classification_result[3]
    print("\nLocked classification test:")
    print(class_test_summary.to_string(index=False))
    print(f"\nSelected classifier (validation only): {selected_classifier}")
    if regression_result is not None:
        selected_regressor = regression_result[-1]
        regression_test_summary = regression_result[3]
        print("\nLocked regression test:")
        print(regression_test_summary.to_string(index=False))
        print(f"\nSelected regressor (validation only): {selected_regressor}")
    print(f"\nArtifacts: {Path(args.output_dir).resolve()}")


if __name__ == "__main__":
    main()
