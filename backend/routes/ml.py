"""ML route: the institutional signal engine (Phase 6) as an API.

Runs the full signal research pipeline: feature engineering,
target construction, model-suite training, and the institutional signal with
its suppression rules — and returns a JSON payload the terminal can render.

Results are cached in-process for 30 minutes per (ticker, benchmark, horizon):
training the suite takes a few seconds and the signal doesn't change intraday.
"""

from __future__ import annotations

import math
import threading
import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/ml", tags=["ml"])

_EXCLUDE_COLS = [
    "Date", "Ticker", "Open", "High", "Low", "Close", "Volume",
    "target_return_1d", "target_return_3d", "target_return_5d",
    "target_direction", "target_strong_up", "target_strong_down", "target_risk_event",
]

_cache: dict[tuple, tuple[float, Dict[str, Any]]] = {}
_cache_lock = threading.Lock()
_TTL = 1800.0


def _f(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def _records(df: pd.DataFrame, limit: int = 20) -> List[Dict[str, Any]]:
    if df is None or getattr(df, "empty", True):
        return []
    out = df.head(limit).reset_index(drop=True).copy()
    out.columns = [str(c) for c in out.columns]
    for c in out.columns:
        if pd.api.types.is_numeric_dtype(out[c]):
            out[c] = out[c].map(_f)
        else:
            out[c] = out[c].astype(str)
    return out.to_dict(orient="records")


@router.get("/signal/{ticker}")
def ml_signal(
    ticker: str,
    benchmark: str = Query("SPY"),
    horizon: int = Query(1, ge=1, le=5),
) -> Dict[str, Any]:
    """Train the signal model suite and return the institutional signal."""
    key = (ticker.upper(), benchmark.upper(), horizon)
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < _TTL:
            return hit[1]

    from src.data.market_data import MarketDataService
    from src.data.providers import ProviderError
    from src.ml import signal_engine, signal_features, signal_modeling, signal_targets

    svc = MarketDataService("yfinance")
    try:
        asset_df = svc.get_data(ticker)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}") from exc
    if asset_df is None or asset_df.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{ticker}'.")
    asset_df = asset_df.sort_values("Date").reset_index(drop=True)
    asset_df["Ticker"] = ticker.upper()

    b_df = pd.DataFrame()
    try:
        b_df = svc.get_data(benchmark).sort_values("Date").reset_index(drop=True)
        b_df["Ticker"] = benchmark.upper()
    except Exception:
        pass

    feat_df = signal_features.create_signal_research_features(
        asset_df, benchmark_df=b_df if not b_df.empty else None, ticker=ticker
    )
    if feat_df is None or feat_df.empty:
        raise HTTPException(status_code=422, detail="Feature engineering produced no rows.")

    ml_df = signal_targets.create_signal_research_targets(feat_df, horizon=horizon)
    target_col = "target_direction"
    if target_col not in ml_df.columns:
        raise HTTPException(status_code=500, detail=f"Missing target column '{target_col}'.")

    feature_cols = [
        c for c in ml_df.columns
        if pd.api.types.is_numeric_dtype(ml_df[c]) and c not in _EXCLUDE_COLS
    ]
    ml_df = ml_df.dropna(subset=[target_col] + feature_cols).reset_index(drop=True)
    if len(ml_df) < 200:
        raise HTTPException(status_code=422, detail="Not enough clean rows to train (need 200+).")

    try:
        suite = signal_modeling.train_signal_model_suite(
            ml_df, feature_cols, target_col, test_size=0.2, ticker=ticker
        )
    except Exception as exc:
        logger.exception("Signal suite training failed")
        raise HTTPException(status_code=500, detail=f"Model training failed: {exc}") from exc

    sig = suite.get("institutional_signal") or signal_engine.generate_institutional_signal(
        None, suite.get("roc_auc"), suite.get("model_edge")
    )

    # probability timeline over the test window
    timeline = {"dates": [], "prob_up": []}
    try:
        proba = np.asarray(suite["y_pred_proba"], dtype=float)
        x_test = suite["X_test"]
        d = ml_df.loc[x_test.index, "Date"] if "Date" in ml_df.columns else None
        dts = [str(v)[:10] for v in (d.tolist() if d is not None else range(len(proba)))]
        step = max(1, len(proba) // 400)
        timeline = {"dates": dts[::step], "prob_up": [_f(p) for p in proba[::step]]}
    except Exception:
        pass

    fi = suite.get("feature_importance")
    latest = feat_df.iloc[-1]

    payload = {
        "ticker": ticker.upper(),
        "benchmark": benchmark.upper(),
        "horizon_days": horizon,
        "n_rows": int(len(ml_df)),
        "n_features": len(feature_cols),
        "signal": {
            "label": sig.get("signal"),
            "allowed": bool(sig.get("is_signal_allowed")),
            "strength": sig.get("signal_strength"),
            "confidence_band": sig.get("confidence_band"),
            "validation_quality": sig.get("validation_quality"),
            "prob_up": _f(sig.get("raw_probability_up")),
            "explanation": sig.get("explanation"),
        },
        "validation": {
            "best_model": suite.get("best_model_name"),
            "roc_auc": _f(suite.get("roc_auc")),
            "model_edge": _f(suite.get("model_edge")),
            "brier_score": _f(suite.get("brier_score")),
            "baseline_accuracy": _f(suite.get("baseline_accuracy")),
        },
        "model_scorecard": _records(suite.get("model_results"), 8),
        "top_features": _records(fi, 12),
        "market_context": {
            "trend_regime": str(latest.get("trend_regime", "Unknown")),
            "volatility_regime": str(latest.get("volatility_regime", "Unknown")),
            "realized_vol_20": _f(latest.get("realized_vol_20")),
            "drawdown_from_52w_high": _f(latest.get("drawdown_from_252_high")),
            "rolling_beta_60": _f(latest.get("rolling_beta_60")),
        },
        "prob_timeline": timeline,
    }

    with _cache_lock:
        _cache[key] = (now, payload)
    return payload
