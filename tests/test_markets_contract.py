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
