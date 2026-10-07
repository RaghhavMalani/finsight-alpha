"""Contracts behind the Markets screens: no synthetic data unless asked, strict as-of."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from backend.routes import fundamentals as fundamentals_route
from backend.routes import pricing
from src.data import options_data
from src.pricing import vol_surface


def _synthetic_only(monkeypatch) -> None:
    """Make the live chain unavailable, as when Yahoo has no options or is down."""
    monkeypatch.setattr(options_data, "fetch_option_chain", lambda *a, **k: None)


def test_vol_surface_withholds_the_synthetic_fallback(monkeypatch) -> None:
    _synthetic_only(monkeypatch)
    with pytest.raises(HTTPException) as caught:
        pricing.vol_surface("SPY", r=0.05, q=0.0, allow_synthetic=False)
    assert caught.value.status_code == 503
    assert "synthetic surface withheld" in caught.value.detail


def test_vol_surface_returns_synthetic_only_when_asked(monkeypatch) -> None:
    _synthetic_only(monkeypatch)
    payload = pricing.vol_surface("SPY", r=0.05, q=0.0, allow_synthetic=True)
    assert payload["source"] == "synthetic"
    assert payload["n_points"] == len(payload["points"]) > 0
    assert len(payload["iv"]) == len(payload["maturities"])
    assert all(len(row) == len(payload["strikes"]) for row in payload["iv"])


def test_vol_surface_passes_a_live_chain_through(monkeypatch) -> None:
    live = options_data.generate_synthetic_chain(ticker="SPY", spot=500.0)
    live.source = "yfinance"  # stands in for a chain Yahoo returned
    monkeypatch.setattr(options_data, "fetch_option_chain", lambda *a, **k: live)
    payload = pricing.vol_surface("SPY", r=0.05, q=0.0, allow_synthetic=False)
    assert payload["source"] == "yfinance"
    assert payload["spot"] == 500.0
    assert vol_surface.build_vol_surface(live).points.shape[0] == payload["n_points"]


def test_fundamentals_route_rejects_a_bad_as_of() -> None:
    with pytest.raises(HTTPException) as caught:
        fundamentals_route.fundamentals("AAPL", as_of="last tuesday")
    assert caught.value.status_code == 422


def test_search_source_failure_is_reported(monkeypatch) -> None:
    from backend.routes import assets

    def unavailable(*args, **kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr("yfinance.Search", unavailable)
    with pytest.raises(HTTPException) as caught:
        assets.search_assets("SPY", market="ALL", limit=8)
    assert caught.value.status_code == 503


def test_fundamentals_route_normalizes_as_of(monkeypatch) -> None:
    seen = {}

    def fake(ticker, as_of=None):
        seen["as_of"] = as_of
        return {"ticker": ticker.upper(), "as_of": as_of}

    import src.data.fundamentals as F

    monkeypatch.setattr(F, "extract_fundamentals", fake)
    fundamentals_route.fundamentals("aapl", as_of="2023-06-30T12:00:00Z")
    assert seen["as_of"] == "2023-06-30"
    fundamentals_route.fundamentals("aapl", as_of=None)
    assert seen["as_of"] is None


def test_markets_fixtures_match_the_routes() -> None:
    """The frontend's contract fixtures are what the routes return today.

    Shapes are compared rather than bytes, so platform float noise can't fail it;
    a renamed, dropped, added or retyped field can.
    """
    import json
    from pathlib import Path

    from scripts.export_markets_fixtures import OUT, build_payloads, shape

    fresh = build_payloads()
    on_disk = {
        path.name.removesuffix(".simulated.json"): json.loads(path.read_text(encoding="utf-8"))
        for path in Path(OUT).glob("*.simulated.json")
    }
    assert sorted(on_disk) == sorted(fresh), "run python scripts/export_markets_fixtures.py"
    for name, payload in fresh.items():
        assert shape(payload) == shape(on_disk[name]), (
            f"{name} drifted; run python scripts/export_markets_fixtures.py"
        )


def test_market_chain_drops_yahoo_off_hours_placeholder_ivs(monkeypatch) -> None:
    """Off-hours Yahoo quotes carry IV 1e-05 and no bid or ask; that is not a 0% vol."""
    from datetime import date, timedelta
    from types import SimpleNamespace

    import pandas as pd

    expiry = (date.today() + timedelta(days=30)).isoformat()

    def leg(strike, iv):
        return {"strike": strike, "contractSymbol": f"SPY{strike}", "lastPrice": 12.0,
                "bid": 0.0, "ask": 0.0, "impliedVolatility": iv, "volume": 1.0,
                "openInterest": 0.0, "inTheMoney": strike < 500, "lastTradeDate": None}

    class OffHours:
        def __init__(self, symbol):
            self.fast_info = {"last_price": 500.0}
            self.options = (expiry,)

        def option_chain(self, _expiry):
            rows = [leg(495.0, 1e-05), leg(500.0, 1e-05), leg(505.0, 0.18)]
            return SimpleNamespace(calls=pd.DataFrame(rows), puts=pd.DataFrame(rows))

    monkeypatch.setattr("yfinance.Ticker", OffHours)
    pricing._market_chain_cache.clear()
    chain = pricing.market_option_chain("ZZOFF", target_days=30, moneyness_band=0.3, r=0.05, q=0.0)
    by_strike = {row["strike"]: row for row in chain["rows"]}
    for strike in (495.0, 500.0):
        assert by_strike[strike]["call"]["iv"] is None
        assert by_strike[strike]["call"]["delta"] is None
        assert by_strike[strike]["call"]["bid"] == 0.0  # reported as-is: no bid
    assert by_strike[505.0]["call"]["iv"] == 0.18
    assert by_strike[505.0]["call"]["delta"] is not None
    pricing._market_chain_cache.clear()
