from dataclasses import replace

import pandas as pd
import pytest

from src.data_organ.calendars import nse_evidence, sessions
from src.data_organ.diagnostics import disagreement, health, market_anomalies


def test_nse_window_never_falls_back_and_version_changes_identity(
    evidence, monkeypatch
):
    _, cap, _, rows = evidence
    import exchange_calendars

    monkeypatch.setattr(
        exchange_calendars,
        "get_calendar",
        lambda _: pytest.fail("XBOM/weekday fallback"),
    )
    nse = nse_evidence(
        b"official session manifest",
        source_url="https://nsearchives.nseindia.com/official-test.csv",
        version="test-v1",
        start="2025-01-01",
        end="2025-01-31",
        session_dates=["2025-01-01"],
    )
    with pytest.raises(ValueError, match="unsupported official NSE calendar window"):
        sessions(nse, "2025-01-01", "2025-02-28")
    before = health(
        rows, replace(cap, calendar=nse), start="2025-01-01", end="2025-01-31"
    )
    after = health(
        rows,
        replace(cap, calendar={**nse, "version": "test-v2"}),
        start="2025-01-01",
        end="2025-01-31",
    )
    assert before["diagnostic_id"] != after["diagnostic_id"]
    unsupported = health(
        rows, replace(cap, calendar=nse), start="2025-01-01", end="2025-02-28"
    )
    assert unsupported["missing_sessions"] is None
    assert unsupported["calendar_status"] == "UNAVAILABLE"


def test_comparison_rejects_adjustment_feed_units_and_vintage_splice(evidence):
    _, cap, _, rows = evidence
    for other in [
        replace(cap, price_basis="ADJUSTED"),
        replace(cap, feed_scope="IEX_ONLY"),
        replace(cap, unit="USD"),
    ]:
        assert disagreement(rows, rows, cap, other)["status"] == "INCOMPATIBLE"
    later = [{**rows[0], "available_at": "2025-02-02T12:00:00Z"}]
    assert disagreement(rows, later, cap, cap)["status"] == "UNAVAILABLE"


def test_capture_age_is_separate_and_capture_only_has_no_publication_lag(evidence):
    _, cap, _, rows = evidence
    diagnostic = health(
        rows,
        replace(cap, clock_quality="CAPTURE_ONLY"),
        start="2025-01-01",
        end="2025-02-28",
    )
    assert diagnostic["observation_age_seconds"] > 0
    assert diagnostic["capture_age_seconds"] == 0
    assert diagnostic["publication_lag_status"] == "UNAVAILABLE"
    assert diagnostic["publication_lag_median_seconds"] is None


def test_ohlc_volume_jumps_do_not_invent_split_or_adjustment():
    frame = pd.DataFrame(
        [
            {
                "Date": "2025-01-01",
                "Open": 100.0,
                "High": 105.0,
                "Low": 95.0,
                "Close": 100.0,
                "Volume": 2.0,
            },
            {
                "Date": "2025-01-02",
                "Open": 200.0,
                "High": 190.0,
                "Low": 180.0,
                "Close": 200.0,
                "Volume": -1.0,
            },
        ]
    )
    result = market_anomalies(frame, price_basis="UNADJUSTED")
    assert (
        result["impossible_ohlc"]
        == result["invalid_volume"]
        == result["large_jumps"]
        == 1
    )
    assert result["adjustment_evidence_status"] == "UNAVAILABLE"
