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


def _fact(fy, start, end, val, filed, accn, form="10-K", fp="FY"):
    item = {"fy": fy, "fp": fp, "form": form, "end": end, "val": val}
    if start:
        item["start"] = start
    if filed:
        item["filed"] = filed
    if accn:
        item["accn"] = accn
    return item


# Two 10-Ks for a September fiscal year. Each tags its comparatives with its own fy,
# and the FY2023 filing restates FY2022 revenue.
FY22 = ("0000320193-22-000108", "2022-10-28")
FY23 = ("0000320193-23-000106", "2023-11-03")
REVENUE = [
    _fact(2023, "2022-09-25", "2023-09-30", 383.3, FY23[1], FY23[0]),
    _fact(2022, "2020-09-27", "2021-09-25", 365.8, FY22[1], FY22[0]),
    _fact(2023, "2021-09-26", "2022-09-24", 394.0, FY23[1], FY23[0]),  # restated
    _fact(2022, "2019-09-29", "2020-09-26", 274.5, FY22[1], FY22[0]),
    _fact(2023, "2020-09-27", "2021-09-25", 365.8, FY23[1], FY23[0]),
    _fact(2022, "2021-09-26", "2022-09-24", 394.3, FY22[1], FY22[0]),
    # A fourth-quarter duration inside the 10-K is not an annual value.
    _fact(2023, "2023-07-02", "2023-09-30", 89.5, FY23[1], FY23[0]),
]
VINTAGE_FACTS = {"facts": {"us-gaap": {"Revenues": {"units": {"USD": REVENUE}}}}}


def test_annual_series_keys_values_by_period_not_filing_year():
    s = F.annual_series(VINTAGE_FACTS, ["Revenues"])
    assert [(p["year"], p["end"]) for p in s] == [
        (2020, "2020-09-26"),
        (2021, "2021-09-25"),
        (2022, "2022-09-24"),
        (2023, "2023-09-30"),
    ]
    assert s[-1]["val"] == 383.3  # the annual value, not the Q4 duration
    assert s[2]["val"] == 394.0 and s[2]["accn"] == FY23[0]  # latest vintage


def test_annual_series_as_of_hides_later_filings_and_restatements():
    before = F.annual_series(VINTAGE_FACTS, ["Revenues"], as_of="2023-06-30")
    assert [p["year"] for p in before] == [2020, 2021, 2022]
    assert before[-1]["val"] == 394.3 and before[-1]["filed"] == FY22[1]
    on_filing_day = F.annual_series(VINTAGE_FACTS, ["Revenues"], as_of=FY23[1])
    assert on_filing_day[2]["val"] == 394.0 and on_filing_day[-1]["year"] == 2023
    assert F.annual_series(VINTAGE_FACTS, ["Revenues"], as_of="2022-10-27") == []


def test_annual_series_drops_undated_facts_under_as_of():
    facts = {"facts": {"us-gaap": {"Assets": {"units": {"USD": [
        _fact(2023, None, "2023-12-31", 10.0, None, None),
    ]}}}}}
    assert F.annual_series(facts, ["Assets"])[0]["val"] == 10.0
    assert F.annual_series(facts, ["Assets"], as_of="2030-01-01") == []


def test_annual_series_labels_comparative_only_periods_by_offset():
    # A January fiscal year end: FY2023 ends 2024-01-28, so labels sit one year
    # behind the end date, including periods only ever reported as comparatives.
    acc = ("0001045810-24-000029", "2024-02-21")
    facts = {"facts": {"us-gaap": {"Revenues": {"units": {"USD": [
        _fact(2023, "2023-01-30", "2024-01-28", 60.9, acc[1], acc[0]),
        _fact(2023, "2022-01-31", "2023-01-29", 27.0, acc[1], acc[0]),
        _fact(2023, "2021-02-01", "2022-01-30", 26.9, acc[1], acc[0]),
    ]}}}}}
    assert [(p["year"], p["end"]) for p in F.annual_series(facts, ["Revenues"])] == [
        (2021, "2022-01-30"),
        (2022, "2023-01-29"),
        (2023, "2024-01-28"),
    ]


def test_extract_fundamentals_as_of_and_same_year_ratios(monkeypatch):
    facts = {"entityName": "Apple Inc.", "facts": {"us-gaap": {
        "Revenues": {"units": {"USD": REVENUE}},
        "NetIncomeLoss": {"units": {"USD": [
            _fact(2022, "2021-09-26", "2022-09-24", 99.8, FY22[1], FY22[0]),
            _fact(2023, "2022-09-25", "2023-09-30", 97.0, FY23[1], FY23[0]),
        ]}},
        # Equity is only reported for FY2022, so FY2023 ROE has no denominator.
        "StockholdersEquity": {"units": {"USD": [
            _fact(2022, None, "2022-09-24", 50.7, FY22[1], FY22[0]),
        ]}},
    }}}
    monkeypatch.setattr(F, "get_cik", lambda t: "0000320193")
    monkeypatch.setattr(F, "fetch_companyfacts", lambda cik: facts)

    now = F.extract_fundamentals("AAPL")
    assert now["as_of"] is None and now["latest_year"] == 2023
    assert now["latest_filed"] == FY23[1]
    assert abs(now["ratios"]["net_margin"] - 97.0 / 383.3) < 1e-12
    assert now["ratios"]["roe"] is None  # FY2023 income over FY2022 equity is refused
    assert abs(now["revenue_growth"] - (383.3 / 394.0 - 1)) < 1e-12

    then = F.extract_fundamentals("AAPL", as_of="2023-06-30")
    assert then["as_of"] == "2023-06-30" and then["latest_year"] == 2022
    assert then["latest"]["revenue"] == 394.3
    assert abs(then["ratios"]["roe"] - 99.8 / 50.7) < 1e-12
    assert then["latest_filed"] == FY22[1]
