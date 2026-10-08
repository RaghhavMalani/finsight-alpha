"""Return-native research evidence from one honestly dated revised capture.

Sequence timestamps order retrospective experiments; source availability remains
the actual capture time. This is deliberately separate from Alpaca PIT OHLCV.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from src.regime.hmm_regime import trace_hmm_fit
from src.regime.regime_features import (calculate_rolling_returns,
    calculate_rolling_volatility, calculate_drawdown_features)
from src.regime_intelligence.french import parse_zip
from src.observatory.traces import prepared_signal_trace, VERSION
from src.replay.publication import CLAIMS, canonical_bytes, utc, weekly_market_series

SOURCE_URLS = {
    "french-ff3.zip": "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_daily_CSV.zip",
    "french-mom.zip": "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Momentum_Factor_daily_CSV.zip",
    "iima-daily.csv": "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/DATA/2025-12_FourFactors_and_Market_Returns_Daily_SurvivorshipBiasAdjusted.csv",
}
DISCLOSURE = (
    "Market factor, not a ticker. Daily market excess returns (Rm-Rf), from one revised research release. "
    "Source availability is the actual capture time, never backdated. Chronological splits order observations "
    "within this fixed vintage; they do not reconstruct historically available vintages. "
    "HMM posteriors use the entire admitted history retrospectively. Compounded excess returns are a "
    "dimensionless research index, not an investable total-return index or an absolute price. No alpha claim."
)
HMM_COLUMNS = ["log_return", "rolling_return_20", "realized_vol_20", "drawdown_from_252_high"]


def checked_capture(root: Path, name: str, expected_url: str, as_of: str):
    raw = (root / name).read_bytes()
    meta = json.loads((root / (name + ".meta.json")).read_text())
    if (meta["sha256"] != hashlib.sha256(raw).hexdigest()
            or meta["source_url"] != expected_url
            or utc(meta["captured_at"]) > utc(as_of)):
        raise ValueError("Source capture identity, hash or cutoff mismatch")
    return raw, meta


@dataclass
class FactorSeries:
    identity: str
    source: str
    dataset_key: str
    frame: pd.DataFrame
    provenance: dict


def validate_returns(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty or frame.Date.duplicated().any() or not frame.Date.is_monotonic_increasing:
        raise ValueError("Factor sessions must be strictly ordered and unique")
    if not np.isfinite(frame.MKT).all() or (frame.MKT <= -1).any():
        raise ValueError("Invalid proportional market-factor return")
    return frame


def load_factor_series(root: Path, country: str, as_of: str) -> FactorSeries:
    captures = []
    if country == "US":
        by_date = {}
        for name, family in [("french-ff3.zip", "FF3"), ("french-mom.zip", "MOM")]:
            raw, meta = checked_capture(root, name, SOURCE_URLS[name], as_of)
            captures.append(meta)
            releases = parse_zip(raw, family=family, source_url=meta["source_url"],
                captured_at=meta["captured_at"], available_at=utc(meta["captured_at"]),
                release_identity="current-capture:" + meta["captured_at"],
                quality="CAPTURE_ONLY", start=date(1926, 1, 1))
            for row in releases:
                if row.frequency != "daily":
                    continue
                session = row.observed_at.astimezone(ZoneInfo("America/New_York")).date() - timedelta(days=1)
                values = by_date.setdefault(session, {"Date": pd.Timestamp(session, tz="UTC")})
                if any(key in values for key in row.values):
                    raise ValueError("Duplicate factor session")
                values.update(row.values)
        frame = pd.DataFrame([by_date[d] for d in sorted(by_date) if "MKT" in by_date[d]])
        identity, source, dataset_key = "US-MKT", "KENNETH_FRENCH", "ken-french:daily-factors"
        library_start = frame.Date.iloc[0].date().isoformat()
        end = frame.Date.iloc[-1].date() + timedelta(days=1)
        observed = datetime.combine(end, datetime.min.time(), ZoneInfo("America/New_York")).astimezone(timezone.utc).isoformat()
    elif country == "INDIA":
        name = "iima-daily.csv"
        raw, meta = checked_capture(root, name, SOURCE_URLS[name], as_of)
        captures.append(meta)
        from io import BytesIO
        frame = pd.read_csv(BytesIO(raw))
        if list(frame.columns) != ["Date", "SMB", "HML", "WML", "MF", "RF"]:
            raise ValueError("Unknown IIMA daily factor schema")
        frame.Date = pd.to_datetime(frame.Date, format="%Y-%m-%d", utc=True)
        if frame.Date.duplicated().any() or not frame.Date.is_monotonic_increasing:
            raise ValueError("Duplicate or unordered IIMA sessions")
        library_start = frame.Date.iloc[0].date().isoformat()
        frame = frame.rename(columns={"MF": "MKT", "WML": "MOM"})
        # Official CSV expresses holding-period returns as percentages, not logs.
        frame[["MKT", "SMB", "HML", "MOM", "RF"]] /= 100
        if np.isinf(frame[["MKT", "SMB", "HML", "MOM", "RF"]].to_numpy()).any():
            raise ValueError("Non-finite IIMA factor return")
        all_factor_rows = frame.copy()
        frame = frame.dropna(subset=["MKT"]).reset_index(drop=True)
        identity, source, dataset_key = "IN-MKT", "IIMA", "iima:daily-factors"
        end = frame.Date.iloc[-1].date() + timedelta(days=1)
        observed = datetime.combine(end, datetime.min.time(), ZoneInfo("Asia/Kolkata")).isoformat()
    else:
        raise ValueError("Unknown factor country")
    validate_returns(frame)
    coverage_frame = all_factor_rows if country == "INDIA" else frame
    available = max(c["captured_at"] for c in captures)
    if utc(observed) > utc(available):
        raise ValueError("Factor session follows its source capture")
    provenance = {
        "input_hash": hashlib.sha256(canonical_bytes({"captures": captures, "adapter": "daily-excess-factor/1"})).hexdigest(),
        "as_of": as_of, "latest_observation": observed, "latest_availability": available,
        "source": [source], "evidence_quality": ["CAPTURE_ONLY"],
        "evidence_mode": "CAPTURE_ONLY", "coverage": "MARKET_FACTOR",
        "disclosure": DISCLOSURE, "observations": len(frame),
        "price_basis": "NOT_APPLICABLE_FACTOR_RETURNS", "raw_snapshot_ids": [c["sha256"] for c in captures],
        "series_label": "market factor, not a ticker", "country": country,
        "source_urls": [c["source_url"] for c in captures], "source_captures": captures,
        "library_start": library_start, "market_start": frame.Date.iloc[0].date().isoformat(),
        "market_end": frame.Date.iloc[-1].date().isoformat(),
        "factor_coverage": {key: {"start": coverage_frame.loc[coverage_frame[key].notna(), "Date"].iloc[0].date().isoformat(),
                                  "rows": int(coverage_frame[key].notna().sum())}
                            for key in ["MKT", "SMB", "HML", "MOM"]},
        "return_definition": "Rm-Rf; source percentage holding-period returns divided by 100",
        "missing_market_rows": int(len(coverage_frame) - len(frame)),
        "split_clock": "OBSERVATION_SEQUENCE_FIXED_VINTAGE",
    }
    return FactorSeries(identity, source, dataset_key, frame, provenance)


def factor_features(series: FactorSeries):
    """Reusable return helpers work on a private dimensionless compounded index."""
    frame = series.frame
    index = pd.DataFrame({"Date": frame.Date, "Close": np.exp(np.log1p(frame.MKT).cumsum())})
    returns = calculate_rolling_returns(index)
    # The first source return is known even though the index has no preceding row.
    returns["log_return"] = np.log1p(frame.MKT)
    volatility = calculate_rolling_volatility(returns)
    drawdown = calculate_drawdown_features(index)
    features = pd.concat([index[["Date"]], returns, volatility,
                          drawdown[["drawdown_from_252_high", "max_drawdown_60"]]], axis=1)
    features.replace([np.inf, -np.inf], np.nan, inplace=True)
    return index, features


def factor_hmm(series: FactorSeries):
    index, features = factor_features(series)
    clean = features.dropna(subset=HMM_COLUMNS)
    result = trace_hmm_fit(clean, HMM_COLUMNS, n_states=4, max_iter=100, include_history=True)
    history = result.pop("history")
    result["semantics"] = DISCLOSURE
    trace = {"schema_version": VERSION, "kind": "hmm", "ticker": series.identity,
             "n_states": 4, "source": series.source, "as_of": series.provenance["as_of"],
             "provenance": series.provenance, "claims": dict(CLAIMS), "seed": 42,
             "fit_rows": len(clean), "feature_start": clean.Date.iloc[0].isoformat(),
             "latest_feature": clean.Date.iloc[-1].isoformat(), **result}
    regimes = {day[:10]: trace["labels"][str(state)] for day, state in zip(history["dates"], history["states"])}
    rows = [{"observed_at": day.isoformat(), "available_at": series.provenance["latest_availability"],
             "close": float(level)} for day, level in zip(index.Date, index.Close)]
    weekly = weekly_market_series(series.identity, rows, series.provenance["as_of"], regimes)
    # Include the first source return in the 20-session log-return volatility.
    daily_vol = np.log1p(series.frame.MKT).rolling(20).std() * np.sqrt(252)
    vol_by_day = dict(zip(series.frame.Date.dt.strftime("%Y-%m-%d"), daily_vol))
    for week in weekly["weeks"]:
        vol = vol_by_day[week["week"]]
        week["realized_volatility"] = None if pd.isna(vol) else float(vol)
    weekly["method"]["regime_semantics"] = DISCLOSURE
    weekly["method"]["hmm"] = {"status": "AVAILABLE", "fit_rows": len(clean),
        "feature_names": HMM_COLUMNS, "seed": 42, "n_states": 4, "converged": trace["converged"],
        "trace_sha256": hashlib.sha256(canonical_bytes(trace)).hexdigest(),
        "source_input_hash": series.provenance["input_hash"], "as_of": series.provenance["as_of"],
        "source_coverage": series.provenance}
    evidence = {"schema_version": "factor-regime/1", "series": series.identity,
        "as_of": series.provenance["as_of"], "provenance": series.provenance,
        "claims": dict(CLAIMS), "labels": trace["labels"],
        "transition_matrix": trace["frames"][-1]["transmat"],
        "fit_rows": len(clean), "converged": trace["converged"],
        "latest_state": int(history["states"][-1]), "latest_posterior": history["confidence"][-1],
        "latest": weekly["weeks"][-1], "weeks": weekly["weeks"],
        "hmm_trace_sha256": hashlib.sha256(canonical_bytes(trace)).hexdigest(),
        "scope": "Return-only HMM evidence. No liquidity, intraday, events or macro components; no six-component fracture score."}
    return trace, weekly, evidence


def factor_signal_inputs(series: FactorSeries, horizon=1):
    _, features = factor_features(series)
    columns = ["log_return", "rolling_return_5", "rolling_return_20", "rolling_return_60",
               "realized_vol_5", "realized_vol_20", "realized_vol_60",
               "volatility_ratio_5_20", "volatility_ratio_20_60",
               "drawdown_from_252_high", "max_drawdown_60"]
    features["sequence_at"] = features.Date
    features["source_available_at"] = series.provenance["latest_availability"]
    features["target_information_at"] = features.Date.shift(-horizon)
    future = series.frame.MKT.shift(-horizon)
    features["target_direction"] = (future > 0).astype(float).where(future.notna())
    clean = features.dropna(subset=[*columns, "target_direction", "target_information_at"])
    inference = features.dropna(subset=columns).iloc[[-1]].copy()
    return clean, columns, inference


def factor_signal(series: FactorSeries):
    frame, columns, inference = factor_signal_inputs(series)
    trace = prepared_signal_trace(series.identity, frame, columns, inference, series.provenance,
        source=series.source, feature_clock="sequence_at", horizon=1, embargo=0, fold_count=5)
    trace["split_contract"] = (
        "Nested chronological observation-sequence split on a fixed revised vintage: one-session horizon purge, "
        "validation-only family selection, final 20% holdout untouched until selection, separate last-row inference. "
        "All source rows became available at capture, not at these historical split dates. No vintage-PIT claim."
    )
    trace["families"] = [family for family in trace["families"] if family in trace["family"]]
    return trace
