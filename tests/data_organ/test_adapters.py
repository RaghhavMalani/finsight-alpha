"""Operator adapters preserve source-specific clocks and pre-cleaning findings."""

import json
from datetime import datetime, timezone
from hashlib import sha256
from types import SimpleNamespace

import pandas as pd
import pytest

from src.data_organ import adapters
from src.data_organ.india import release_import


def test_alpaca_asset_is_explicit_and_conservative_clock_is_retained():
    observation = SimpleNamespace(
        values={"close": 10.0},
        observed_at=datetime(2025, 1, 2, tzinfo=timezone.utc),
        available_at=datetime(2025, 1, 2, 0, 15, tzinfo=timezone.utc),
        revision="r1",
        quality="CONSERVATIVE_MARKET_TIME",
    )
    cap, _, rows = adapters.alpaca(
        [observation],
        b"operator IEX test",
        "2025-01-03T00:00:00Z",
        "https://data.alpaca.markets/v2/stocks/bars",
        asset="SPY",
    )
    assert rows[0]["asset"] == "SPY"
    assert rows[0]["available_at"] == observation.available_at.isoformat()
    assert (
        cap.feed_scope == "IEX_ONLY" and cap.clock_quality == "CONSERVATIVE_MARKET_TIME"
    )
    assert "publish_derived" not in cap.licence.get("permitted_uses", [])


def test_market_naive_clock_needs_disclosed_convention_and_raw_anomalies_survive():
    frame = pd.DataFrame(
        [
            {
                "Date": "2025-01-02",
                "Open": 10.0,
                "High": 1.0,
                "Low": 2.0,
                "Close": 9.0,
                "Volume": -1,
            }
        ]
    )
    kwargs = dict(
        source="yfinance",
        source_url="https://finance.yahoo.com/quote/SPY/",
        asset="SPY",
        calendar={"mic": "XNYS", "status": "UNAVAILABLE"},
        price_basis="ADJUSTED",
    )
    with pytest.raises(ValueError, match="Naive"):
        adapters.market_provider(frame, b"raw test", "2025-01-03T00:00:00Z", **kwargs)
    cap, _, rows = adapters.market_provider(
        frame, b"raw test", "2025-01-03T00:00:00Z", date_only_utc_period=True, **kwargs
    )
    assert rows[0]["observed_at"].endswith("+00:00")
    assert cap.metadata["market_anomalies"]["impossible_ohlc"] == 1
    assert cap.metadata["market_anomalies"]["invalid_volume"] == 1
    assert cap.content_sha256 == sha256(b"raw test").hexdigest()


def test_india_release_requires_actual_publication_evidence_and_never_grants_permission():
    payload = {
        "schema_version": "india-macro-release/1",
        "observations": [
            {
                "observed_at": "2025-01-01T00:00:00Z",
                "available_at": "2025-02-01T12:00:00+05:30",
                "value": 5.0,
                "revision": "r1",
            }
        ],
    }
    kwargs = dict(
        source="rbi:policy-repo",
        source_url="https://www.rbi.org.in/release",
        captured_at="2025-03-01T00:00:00Z",
    )
    with pytest.raises(ValueError, match="citation"):
        release_import(json.dumps(payload).encode(), **kwargs)
    payload["observations"][0]["publication_evidence"] = (
        "Official release citation; synthetic test only"
    )
    cap, _, rows = release_import(json.dumps(payload).encode(), **kwargs)
    assert rows[0]["available_at"] == payload["observations"][0]["available_at"]
    assert cap.licence["status"] == "UNVERIFIED" and cap.licence["permitted_uses"] == []
