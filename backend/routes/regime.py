"""Regime route: HMM / GMM / KMeans market regime detection over price history.

Exposes the existing ``src.regime`` engine (previously Streamlit-only) as JSON:
state timeline, labeled regimes, transition matrix, durations, and the current
regime summary — everything the terminal needs to render a regime card.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from src import regime
from src.data.market_data import MarketDataService
from src.data.providers import ProviderError
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/regime", tags=["regime"])


def _f(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


@router.get("/{ticker}")
def detect_regimes(
    ticker: str,
    model: str = Query("hmm", description="hmm|gmm|kmeans"),
    n_states: int = Query(4, ge=2, le=6),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Run regime detection and return a JSON payload for charting."""
    try:
        df = MarketDataService("yfinance").get_data(ticker, start, end)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}") from exc
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{ticker}'.")

    df = df.sort_values("Date").reset_index(drop=True)

    feat_df = regime.create_regime_features(df)
    cols = regime.get_regime_feature_columns(feat_df, "core")
    feat_df = feat_df.dropna(subset=cols).reset_index(drop=True)
    if len(feat_df) < 60:
        raise HTTPException(status_code=422, detail="Not enough history for regime detection.")

    model = model.lower()
    if model == "hmm" and regime.is_hmmlearn_available():
        res_df = regime.run_hmm_regime_detection(feat_df, cols, n_states=n_states)
        state_col, prob_col = "hmm_state", "hmm_state_probability"
    elif model in ("hmm", "gmm"):
        res_df = regime.run_gmm_regime_detection(feat_df, cols, n_states=n_states)
        state_col, prob_col = "gmm_state", "gmm_state_probability"
    else:
        res_df = regime.run_kmeans_regime_detection(feat_df, cols, n_states=n_states)
        state_col, prob_col = "kmeans_state", "kmeans_state_probability"

    if state_col not in res_df.columns or res_df[state_col].isna().all():
        raise HTTPException(status_code=500, detail="Regime model failed to converge.")

    reg_summary = regime.summarize_regime_states(res_df, state_col)
    labels = regime.label_regime_states(reg_summary)
    res_df = regime.map_regime_labels_to_rows(res_df, state_col, labels)

    trans = regime.calculate_regime_transition_matrix(res_df["regime_label"])
    durations = regime.calculate_regime_duration(res_df)
    current = regime.calculate_current_regime_summary(
        res_df, probability_col=prob_col if prob_col in res_df.columns else None
    )
    perf = regime.calculate_regime_performance_summary(res_df)

    # Timeline (downsampled for payload size, latest point kept).
    tl = res_df[["Date", "Close", state_col, "regime_label"]].copy()
    tl["Date"] = pd.to_datetime(tl["Date"]).dt.strftime("%Y-%m-%d")
    if len(tl) > 900:
        step = len(tl) // 900 + 1
        tl = pd.concat([tl.iloc[::step], tl.iloc[[-1]]]).drop_duplicates("Date")

    def _records(frame: pd.DataFrame) -> List[Dict[str, Any]]:
        if frame is None or getattr(frame, "empty", True):
            return []
        out = frame.reset_index()
        out.columns = [str(c) for c in out.columns]
        return out.astype(object).where(out.notna(), None).to_dict(orient="records")

    return {
        "ticker": ticker.upper(),
        "model": model,
        "n_states": n_states,
        "timeline": [
            {
                "date": r.Date,
                "close": _f(r.Close),
                "state": int(getattr(r, state_col)) if _f(getattr(r, state_col)) is not None else None,
                "label": str(r.regime_label),
            }
            for r in tl.itertuples()
        ],
        "labels": {str(int(k)) if _f(k) is not None else str(k): v for k, v in labels.items()},
        "current": {
            k: (v if isinstance(v, str) else _f(v))
            for k, v in (current or {}).items()
        },
        "transition_matrix": {
            "states": [str(c) for c in trans.columns] if not trans.empty else [],
            "matrix": trans.values.tolist() if not trans.empty else [],
        },
        "durations": _records(durations),
        "performance": _records(perf),
    }
