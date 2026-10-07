"""US company fundamentals from SEC EDGAR XBRL ``companyfacts`` (free, official).

No API key. Reuses the EDGAR ticker->CIK lookup, pulls the structured financial
facts, extracts headline line items (revenue, net income, assets, equity, cash
flow, EPS...) as annual histories, and computes standard ratios. Results are
cached on disk (company facts change only ~quarterly).

US filers only — non-US tickers raise :class:`EdgarError`.
"""

from __future__ import annotations

import math
from collections import Counter
from datetime import date
from typing import Any, Dict, List, Optional

from src.data import cache
from src.rag.edgar import USER_AGENT, EdgarError, get_cik

try:
    import requests
except Exception:  # pragma: no cover
    requests = None  # type: ignore[assignment]

_COMPANYFACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
_ANNUAL_FORMS = ("10-K", "10-K/A")
_FULL_YEAR_DAYS = (330, 380)

# Candidate XBRL (us-gaap) concept names per line item, in priority order.
CONCEPTS: Dict[str, List[str]] = {
    "revenue": ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
    "gross_profit": ["GrossProfit"],
    "operating_income": ["OperatingIncomeLoss"],
    "net_income": ["NetIncomeLoss"],
    "assets": ["Assets"],
    "current_assets": ["AssetsCurrent"],
    "liabilities": ["Liabilities"],
    "current_liabilities": ["LiabilitiesCurrent"],
    "equity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue"],
    "operating_cash_flow": ["NetCashProvidedByUsedInOperatingActivities"],
    "eps_diluted": ["EarningsPerShareDiluted"],
}


def _f(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def fetch_companyfacts(cik: str) -> Dict[str, Any]:
    """Fetch (and cache for 24h) the full company-facts document for a CIK."""
    def _producer():
        if requests is None:
            raise EdgarError("`requests` is not installed.")
        resp = requests.get(
            _COMPANYFACTS.format(cik=cik),
            headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"},
            timeout=30,
        )
        if resp.status_code != 200:
            raise EdgarError(f"EDGAR company-facts HTTP {resp.status_code} for CIK {cik}")
        return resp.json()

    return cache.cached(f"companyfacts:{cik}", ttl=86400, producer=_producer)


def _full_year(start: str, end: str) -> bool:
    """True when a duration fact spans one fiscal year (52/53 weeks, give or take)."""
    try:
        days = (date.fromisoformat(end) - date.fromisoformat(start)).days
    except (TypeError, ValueError):
        return False
    return _FULL_YEAR_DAYS[0] <= days <= _FULL_YEAR_DAYS[1]


def annual_series(
    facts: Dict[str, Any], names: List[str], as_of: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Annual 10-K values for the first matching concept name, as visible at ``as_of``.

    A 10-K reports its own fiscal year plus prior-year comparatives, and every
    one of those facts carries the filing's ``fy``. Values are therefore keyed by
    the period ``end``:

    * the year label is the ``fy`` of the filing in which that period was the
      latest one reported; periods only ever seen as comparatives take the same
      end-year offset as the labelled ones;
    * the value is the latest vintage filed on or before ``as_of`` (an ISO date),
      so a restatement replaces the original only once it has been filed;
    * duration facts must span a full year, and facts with no filing date are
      dropped whenever ``as_of`` is set.
    """
    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    for nm in names:
        node = gaap.get(nm)
        if not node:
            continue
        units = node.get("units") or {}
        arr = units.get("USD") or units.get("USD/shares") or (next(iter(units.values()), []))
        rows = []
        for it in arr:
            end = it.get("end")
            if it.get("form") not in _ANNUAL_FORMS or it.get("fp") != "FY" or not end:
                continue
            if it.get("fy") is None or _f(it.get("val")) is None:
                continue
            if it.get("start") and not _full_year(it["start"], end):
                continue
            if as_of is not None and not (it.get("filed") and str(it["filed"]) <= as_of):
                continue
            rows.append(it)
        if not rows:
            continue

        # The latest period a filing reports is the fiscal year that filing is for.
        filings: Dict[str, List[Dict[str, Any]]] = {}
        for it in rows:
            filings.setdefault(str(it.get("accn") or f"fy{it['fy']}"), []).append(it)
        labelled: Dict[str, int] = {}
        for items in filings.values():
            head = max(items, key=lambda it: it["end"])
            labelled.setdefault(head["end"], int(head["fy"]))
        offset = Counter(fy - int(end[:4]) for end, fy in labelled.items()).most_common(1)[0][0]

        by_year: Dict[int, Dict[str, Any]] = {}
        for end in sorted({it["end"] for it in rows}):
            vintage = max(
                (it for it in rows if it["end"] == end), key=lambda it: str(it.get("filed") or "")
            )
            year = labelled.get(end, int(end[:4]) + offset)
            by_year[year] = {
                "year": year,
                "val": _f(vintage["val"]),
                "end": end,
                "filed": vintage.get("filed"),
                "accn": vintage.get("accn"),
                "form": vintage.get("form"),
            }
        return [by_year[y] for y in sorted(by_year)]
    return []


def extract_fundamentals(ticker: str, as_of: Optional[str] = None) -> Dict[str, Any]:
    """Headline financials (annual history) + computed ratios for a US ticker.

    With ``as_of`` (an ISO date) only filings dated on or before it are used,
    so every value, ratio and growth rate is what was public at that cutoff.
    """
    cik = get_cik(ticker)  # raises EdgarError for non-US / unknown
    facts = fetch_companyfacts(cik)

    history = {k: annual_series(facts, names, as_of=as_of) for k, names in CONCEPTS.items()}
    last = {k: (s[-1] if s else None) for k, s in history.items()}
    latest = {k: (p["val"] if p else None) for k, p in last.items()}

    def ratio(a: str, b: str) -> Optional[float]:
        pa, pb = last.get(a), last.get(b)
        if not (pa and pb and pa["val"] and pb["val"]) or pa["year"] != pb["year"]:
            return None  # never divide numbers from different fiscal years
        return _f(pa["val"] / pb["val"])

    ratios = {
        "gross_margin": ratio("gross_profit", "revenue"),
        "operating_margin": ratio("operating_income", "revenue"),
        "net_margin": ratio("net_income", "revenue"),
        "roe": ratio("net_income", "equity"),
        "roa": ratio("net_income", "assets"),
        "current_ratio": ratio("current_assets", "current_liabilities"),
        "debt_to_equity": ratio("liabilities", "equity"),
    }

    # Revenue YoY growth (latest vs the fiscal year before it).
    rev = history["revenue"]
    rev_growth = (
        _f(rev[-1]["val"] / rev[-2]["val"] - 1)
        if len(rev) >= 2 and rev[-2]["val"] and rev[-1]["year"] - rev[-2]["year"] == 1
        else None
    )
    filed = [p["filed"] for p in last.values() if p and p.get("filed")]

    return {
        "ticker": ticker.upper(),
        "name": facts.get("entityName"),
        "as_of": as_of,
        "latest_year": rev[-1]["year"] if rev else None,
        "latest_filed": max(filed) if filed else None,
        "latest": latest,
        "ratios": ratios,
        "revenue_growth": rev_growth,
        "history": history,
    }
