"""Offline tests for the SQLite cache and EDGAR fundamentals extraction."""

from __future__ import annotations

import pytest

from src.data import cache
from src.data import fundamentals as F


@pytest.fixture(autouse=True)
def _temp_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "_DB_PATH", tmp_path / "cache.db")


def test_cache_hit_and_ttl():
    cache.put_json("k", {"a": 1})
    assert cache.get_json("k") == {"a": 1}
    assert cache.get_json("k", ttl=-1) is None  # expired
    assert cache.get_json("missing") is None


def test_cache_memoizes():
    calls = {"n": 0}

    def producer():
        calls["n"] += 1
        return {"v": 42}

    assert cache.cached("z", 100, producer) == {"v": 42}
    assert cache.cached("z", 100, producer) == {"v": 42}
    assert calls["n"] == 1  # producer only ran once


def _pts(vals):
    return [{"end": f"{fy}-12-31", "val": v, "fy": fy, "fp": "FY", "form": "10-K"} for fy, v in vals]


FACTS = {"entityName": "Apple Inc.", "facts": {"us-gaap": {
    "Revenues": {"units": {"USD": _pts([(2022, 394_328e6), (2023, 383_285e6)])}},
    "NetIncomeLoss": {"units": {"USD": _pts([(2022, 99_803e6), (2023, 96_995e6)])}},
    "Assets": {"units": {"USD": _pts([(2023, 352_583e6)])}},
    "Liabilities": {"units": {"USD": _pts([(2023, 290_437e6)])}},
    "StockholdersEquity": {"units": {"USD": _pts([(2023, 62_146e6)])}},
    "GrossProfit": {"units": {"USD": _pts([(2023, 169_148e6)])}},
}}}


def test_annual_series_picks_fiscal_years():
    s = F.annual_series(FACTS, ["Revenues"])
    assert [x["year"] for x in s] == [2022, 2023]
    assert s[-1]["val"] == 383_285e6


def test_annual_series_fallback_and_missing():
    # falls through candidates; unknown concept -> empty
    assert F.annual_series(FACTS, ["NopeConcept", "Revenues"])[-1]["year"] == 2023
    assert F.annual_series(FACTS, ["TotallyMissing"]) == []


def test_extract_fundamentals(monkeypatch):
    monkeypatch.setattr(F, "get_cik", lambda t: "0000320193")
    monkeypatch.setattr(F, "fetch_companyfacts", lambda cik: FACTS)
    d = F.extract_fundamentals("AAPL")
    assert d["name"] == "Apple Inc."
    assert d["latest"]["revenue"] == 383_285e6
    assert d["revenue_growth"] < 0  # 2023 revenue below 2022
    assert abs(d["ratios"]["net_margin"] - 96_995e6 / 383_285e6) < 1e-9
    assert abs(d["ratios"]["roe"] - 96_995e6 / 62_146e6) < 1e-9
    assert abs(d["ratios"]["debt_to_equity"] - 290_437e6 / 62_146e6) < 1e-9
    assert len(d["history"]["revenue"]) == 2
