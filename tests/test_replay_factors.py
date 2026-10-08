"""Clock/unit/source sabotage checks for the separate return-native adapter."""
from datetime import datetime, timezone
import hashlib
import json

import numpy as np
import pandas as pd
import pytest

from src.data.license_policy import derived_publication_license
from src.replay.factors import (SOURCE_URLS, FactorSeries, checked_capture,
    factor_features, factor_signal_inputs, load_factor_series, validate_returns)
from src.observatory.traces import split_evidence
from src.ml.point_in_time_modeling import build_signal_splits

CUTOFF = "2026-10-08T04:10:00Z"


def capture(tmp_path, text):
    raw = text.encode()
    (tmp_path / "iima-daily.csv").write_bytes(raw)
    (tmp_path / "iima-daily.csv.meta.json").write_text(json.dumps({
        "source_url": SOURCE_URLS["iima-daily.csv"], "captured_at": CUTOFF,
        "sha256": hashlib.sha256(raw).hexdigest()}))


def test_public_research_registration_is_narrow_and_attributed():
    for key in ("ken-french:daily-factors", "iima:daily-factors", "celestrak:gp"):
        licence = derived_publication_license(key, None)
        assert licence["status"] == "ACTIVE"
        assert licence["permitted_uses"] == ["publish_derived"]
        assert licence["attribution"] and licence["source_urls"] and licence["terms_url"]
    for key in ("alpaca:iex", "yfinance:daily", "nse:india-vix", "celestrak:unknown", "iima:prowess", "ken-french:crsp"):
        assert derived_publication_license(key, None)["permitted_uses"] == []


def test_iima_percentage_units_missing_market_start_and_capture_clock(tmp_path):
    capture(tmp_path, "Date,SMB,HML,WML,MF,RF\n1993-10-01,1,2,3,NA,NA\n1993-10-04,1,2,3,-0.9,0.02\n1993-10-05,1,2,3,0.3,0.02\n")
    series = load_factor_series(tmp_path, "INDIA", CUTOFF)
    assert list(series.frame.MKT) == pytest.approx([-.009, .003])
    assert series.provenance["library_start"] == "1993-10-01"
    assert series.provenance["market_start"] == "1993-10-04"
    assert series.provenance["latest_availability"] == CUTOFF
    assert series.provenance["evidence_mode"] == "CAPTURE_ONLY"
    assert "never backdated" in series.provenance["disclosure"]
    with pytest.raises(ValueError, match="cutoff"):
        load_factor_series(tmp_path, "INDIA", "2026-10-07T00:00:00Z")
    (tmp_path / "iima-daily.csv").write_text("changed byte")
    with pytest.raises(ValueError, match="hash"):
        load_factor_series(tmp_path, "INDIA", CUTOFF)


@pytest.mark.parametrize("market", ["-100", "inf", "-inf"])
def test_invalid_iima_returns_fail_closed(tmp_path, market):
    capture(tmp_path, f"Date,SMB,HML,WML,MF,RF\n1993-10-04,1,2,3,{market},0.02\n")
    with pytest.raises(ValueError):
        load_factor_series(tmp_path, "INDIA", CUTOFF)


def test_duplicate_or_reversed_sessions_fail_closed(tmp_path):
    for days in [("1993-10-04", "1993-10-04"), ("1993-10-05", "1993-10-04")]:
        capture(tmp_path, "Date,SMB,HML,WML,MF,RF\n" + "".join(f"{day},1,2,3,0.3,0.02\n" for day in days))
        with pytest.raises(ValueError, match="sessions"):
            load_factor_series(tmp_path, "INDIA", CUTOFF)


def test_factor_features_are_causal_and_splits_purge_future_targets():
    # Explicit synthetic test inputs; none is installed in public Replay.
    dates = pd.date_range("2000-01-01", periods=700, tz="UTC")
    frame = pd.DataFrame({"Date": dates, "MKT": np.sin(np.arange(700)/9)/100})
    provenance = {"latest_availability": CUTOFF}
    series = FactorSeries("US-MKT", "TEST_ONLY", "test", frame, provenance)
    short = FactorSeries("US-MKT", "TEST_ONLY", "test", frame.iloc[:500], provenance)
    assert validate_returns(frame) is frame
    _, full_features = factor_features(series)
    _, short_features = factor_features(short)
    pd.testing.assert_frame_equal(full_features.iloc[:500], short_features)
    clean, columns, inference = factor_signal_inputs(series)
    assert not any(c in columns for c in ("Close", "Volume", "source_available_at", "sequence_at"))
    assert inference.index[0] not in clean.index
    assert inference.Date.iloc[0] == dates[-1]
    assert set(clean.source_available_at) == {CUTOFF}
    split = build_signal_splits(clean, columns, "target_direction", horizon=1)
    boundary = split_evidence(clean, split["X_train"], split["X_test"], feature_clock="sequence_at")
    assert pd.Timestamp(boundary["training_target_information_end"]) < pd.Timestamp(boundary["validation_feature_start"])
    # Backdating availability would be a false PIT claim: the capture clock can't
    # validate these historical splits, only the declared observation sequence can.
    capture_clock = clean.copy()
    capture_clock["target_information_at"] = CUTOFF
    with pytest.raises(ValueError, match="crosses"):
        split_evidence(capture_clock, split["X_train"], split["X_test"], feature_clock="source_available_at")
