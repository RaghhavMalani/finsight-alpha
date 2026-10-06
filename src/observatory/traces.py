"""Read-only traces. No fitting, scaler or selection may see unadmitted data."""
from __future__ import annotations

from collections import OrderedDict
import copy
from concurrent.futures import Future
import threading
import time

import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits

from src import regime
from src.dynamics.market_regime_inputs import digest
from src.ml import models, signal_features, signal_targets
from src.ml.point_in_time_modeling import build_signal_splits, signal_selection_split, train_point_in_time_signal_suite
from src.observatory.adapters import adapter_for
from src.observatory.evidence import (FAMILIES, bootstrap_auc_ci, feature_family, fold_rho,
                                      selection_suppressed, selection_verdict)
from src.observatory.inputs import pit_prices
from src.regime.hmm_regime import trace_hmm_fit

VERSION = "model-observatory/2"
CLAIMS = dict(market_claim_eligible=False, causal_claim_eligible=False, validated_alpha=False)
_cache = OrderedDict()
_pending = {}
_lock = threading.Lock()
_TTL = 1800
EXCLUDE = {"Date", "Ticker", "Open", "High", "Low", "Close", "Volume",
           "target_return_1d", "target_return_3d", "target_return_5d", "target_direction",
           "target_strong_up", "target_strong_down", "target_risk_event"}


def cached(key, compute):
    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < _TTL:
            _cache.move_to_end(key)
            return copy.deepcopy(hit[1])
        owner = key not in _pending
        future = _pending.setdefault(key, Future())
    if not owner:
        return copy.deepcopy(future.result(timeout=240))
    try:
        result = compute()
        with _lock:
            _cache[key] = (time.monotonic(), result)
            while len(_cache) > 16:
                _cache.popitem(last=False)
        future.set_result(result)
        return copy.deepcopy(result)
    except BaseException as error:
        future.set_exception(error)
        raise
    finally:
        with _lock:
            _pending.pop(key, None)


def hmm_trace(ticker, as_of, n_states, source, *, dataset=None, max_iter=100):
    prices, provenance = pit_prices(ticker, as_of, source, dataset=dataset)
    features = regime.create_regime_features(prices)
    columns = regime.get_regime_feature_columns(features, "core")
    features = features.dropna(subset=columns).reset_index(drop=True)
    if len(features) < 60:
        raise ValueError("Not enough complete HMM feature rows")
    result = trace_hmm_fit(features, columns, n_states=n_states, max_iter=max_iter)
    return {
        "schema_version": VERSION, "kind": "hmm", "ticker": ticker,
        "n_states": n_states, "source": source, "as_of": provenance["as_of"],
        "provenance": provenance, "claims": CLAIMS, "fit_rows": len(features),
        "feature_start": features.iloc[0]["Date"].isoformat(),
        "latest_feature": features.iloc[-1]["Date"].isoformat(),
        "seed": 42, **result,
    }


def signal_inputs(prices, benchmark, ticker, horizon):
    features = signal_features.create_signal_research_features(prices, benchmark_df=benchmark, ticker=ticker)
    features["target_information_at"] = features["available_at"].shift(-horizon)
    labeled = signal_targets.create_signal_research_targets(features, horizon=horizon)
    columns = [c for c in labeled if pd.api.types.is_numeric_dtype(labeled[c])
               and c not in EXCLUDE and not c.startswith("target_")]
    clean = labeled.dropna(subset=["target_direction", "target_information_at", *columns])
    complete = features.dropna(subset=columns)
    if complete.empty:
        raise ValueError("No complete current inference row")
    inference = complete.iloc[[-1]].copy()
    if len(clean) < 200:
        raise ValueError("Need 200 complete labeled signal rows")
    return clean, columns, inference


def split_evidence(frame, x_fit, x_validation):
    train = frame.loc[x_fit.index]
    validation = frame.loc[x_validation.index]
    information_end = pd.to_datetime(train["target_information_at"], utc=True).max()
    feature_start = pd.to_datetime(validation["available_at"], utc=True).min()
    if information_end >= feature_start:
        raise ValueError("Training target information crosses the validation/holdout feature boundary")
    return {
        "fit_start": train.iloc[0]["Date"].isoformat(),
        "fit_end": train.iloc[-1]["Date"].isoformat(),
        "fit_rows": len(train), "training_target_information_end": information_end.isoformat(),
        "validation_start": validation.iloc[0]["Date"].isoformat(),
        "validation_end": validation.iloc[-1]["Date"].isoformat(),
        "validation_feature_start": feature_start.isoformat(), "validation_rows": len(validation),
        "fit_indices": [int(i) for i in x_fit.index],
        "validation_indices": [int(i) for i in x_validation.index],
    }


def signal_trace(ticker, as_of, source, *, horizon=1, embargo=0, dataset=None,
                 benchmark_dataset=None, fold_count=5):
    prices, provenance = pit_prices(ticker, as_of, source, dataset=dataset)
    benchmark, benchmark_provenance = pit_prices("SPY", as_of, source,
        dataset=dataset if ticker == "SPY" else benchmark_dataset)
    provenance = {**provenance, "asset_input_hash": provenance["input_hash"],
                  "benchmark_input_hash": benchmark_provenance["input_hash"],
                  "input_hash": digest([provenance["input_hash"], benchmark_provenance["input_hash"]])}
    frame, columns, inference = signal_inputs(prices, benchmark, ticker, horizon)
    split = build_signal_splits(frame, columns, "target_direction", horizon=horizon, embargo=embargo)
    holdout_boundary = split_evidence(frame, split["X_train"], split["X_test"])
    development = split["development"]
    folds = []
    adapter = adapter_for("gradient_boosting")
    with threadpool_limits(limits=1):
        for fold, fraction in enumerate(np.linspace(0.6, 1, fold_count), 1):
            prefix = development.iloc[:max(100, int(len(development) * fraction))]
            x_fit, x_val, y_fit, y_val = signal_selection_split(
                prefix, columns, "target_direction", horizon=horizon, embargo=embargo)
            evidence = split_evidence(frame, x_fit, x_val)
            if set(x_fit.index) & set(split["X_test"].index) or set(x_val.index) & set(split["X_test"].index):
                raise ValueError("Untouched holdout entered model-selection stages")
            model = models.get_classification_model("gradient_boosting", random_state=42)
            model.fit(x_fit, y_fit)
            frames = [{"fold": fold, **stage} for stage in adapter.stages(model, x_val, y_val, columns)]
            folds.append({"fold": fold, **evidence, "frames": frames,
                          "stage_trace": "AVAILABLE", "model": "gradient_boosting"})
        # Selection/holdout/inference use the same shared construction as /ml/signal.
        suite = train_point_in_time_signal_suite(
            frame, columns, "target_direction", inference_row=inference, horizon=horizon,
            signal_date=inference.iloc[0]["Date"].isoformat(), data_version=provenance["input_hash"],
            embargo=embargo, ticker=ticker)
    families = [feature_family(c) for c in columns]
    selection = []
    for row in suite["model_results"].to_dict(orient="records"):
        selection.append({"model": row["model_name"], "validation_auc": _finite(row.get("roc_auc")),
                          "stage_trace": "AVAILABLE" if adapter_for(row["model_name"]) else "UNAVAILABLE",
                          "stage_trace_note": "Cumulative impurity importance from trees fitted through each stage"
                          if adapter_for(row["model_name"]) else "No validated deterministic intermediate-stage adapter installed"})
    validation_aucs = [row["validation_auc"] for row in selection]
    # The interval and verdict use the holdout predictions the suite already made; no refit.
    ci = bootstrap_auc_ci(suite["y_test"], suite["y_pred_proba"]) if _finite(suite.get("roc_auc")) is not None else None
    verdict, verdict_reason = selection_verdict(ci, validation_aucs)
    return {
        "schema_version": VERSION, "kind": "signal", "ticker": ticker, "source": source,
        "as_of": provenance["as_of"], "provenance": provenance, "claims": CLAIMS,
        "feature_names": columns, "folds": folds, "seed": 42, "horizon": horizon, "embargo": embargo,
        "selection": selection, "selected_model": suite["diagnostic_model_name"],
        "holdout": {"label": "UNTOUCHED OOS HOLDOUT", "feature_start": holdout_boundary["validation_feature_start"],
                    "start": holdout_boundary["validation_start"], "end": holdout_boundary["validation_end"],
                    "rows": len(split["X_test"]), "indices": [int(i) for i in split["X_test"].index],
                    "training_target_information_end": holdout_boundary["training_target_information_end"],
                    "auc": _finite(suite.get("roc_auc")), "auc_ci95": ci,
                    "baseline_accuracy": _finite(suite.get("baseline_accuracy")),
                    "model": suite["diagnostic_model_name"], "visible_after_selection": True},
        "families": list(FAMILIES), "family": families, "rho": fold_rho(folds),
        "suppressed": selection_suppressed(validation_aucs),
        "verdict": verdict, "verdict_reason": verdict_reason,
        "inference": {"date": inference.iloc[0]["Date"].isoformat(),
                      "included_in_labeled_rows": bool(inference.index[0] in frame.index)},
        "importance_semantics": "Cumulative normalized impurity decrease of sklearn GBM trees through the displayed stage; selection stages use VALIDATION only.",
        "split_contract": "Production nested chronological split: horizon purge, configured embargo, family selection on validation, final untouched holdout, separate current inference row.",
    }


def _finite(value):
    return float(value) if value is not None and np.isfinite(value) else None
