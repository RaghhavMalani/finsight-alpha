"""US company fundamentals from SEC EDGAR XBRL ``companyfacts`` (free, official).

No API key. Reuses the EDGAR ticker->CIK lookup, pulls the structured financial
facts, extracts headline line items (revenue, net income, assets, equity, cash
flow, EPS...) as annual histories, and computes standard ratios. Results are
cached on disk (company facts change only ~quarterly).

US filers only — non-US tickers raise :class:`EdgarError`.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from src.data import cache
from src.rag.edgar import USER_AGENT, EdgarError, get_cik

try:
    import requests
except Exception:  # pragma: no cover
    requests = None  # type: ignore[assignment]

_COMPANYFACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

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


def annual_series(facts: Dict[str, Any], names: List[str]) -> List[Dict[str, Any]]:
    """Annual (10-K, fiscal-year) values for the first matching concept name."""
    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    for nm in names:
        node = gaap.get(nm)
        if not node:
            continue
        units = node.get("units") or {}
        arr = units.get("USD") or units.get("USD/shares") or (next(iter(units.values()), []))
        by_year: Dict[int, float] = {}
        for it in arr:
            if it.get("form") == "10-K" and it.get("fp") == "FY" and it.get("fy") is not None:
                v = _f(it.get("val"))
                if v is not None:
                    by_year[int(it["fy"])] = v
        if by_year:
            return [{"year": y, "val": by_year[y]} for y in sorted(by_year)]
    return []


def extract_fundamentals(ticker: str) -> Dict[str, Any]:
    """Headline financials (annual history) + computed ratios for a US ticker."""
    cik = get_cik(ticker)  # raises EdgarError for non-US / unknown
    facts = fetch_companyfacts(cik)

    history = {k: annual_series(facts, names) for k, names in CONCEPTS.items()}
    latest = {k: (s[-1]["val"] if s else None) for k, s in history.items()}

    def ratio(a: str, b: str) -> Optional[float]:
        return _f(latest[a] / latest[b]) if latest.get(a) and latest.get(b) else None

    ratios = {
        "gross_margin": ratio("gross_profit", "revenue"),
        "operating_margin": ratio("operating_income", "revenue"),
        "net_margin": ratio("net_income", "revenue"),
        "roe": ratio("net_income", "equity"),
        "roa": ratio("net_income", "assets"),
        "current_ratio": ratio("current_assets", "current_liabilities"),
        "debt_to_equity": ratio("liabilities", "equity"),
    }

    # Revenue YoY growth (latest vs prior year).
    rev = history["revenue"]
    rev_growth = _f(rev[-1]["val"] / rev[-2]["val"] - 1) if len(rev) >= 2 and rev[-2]["val"] else None

    return {
        "ticker": ticker.upper(),
        "name": facts.get("entityName"),
        "latest_year": rev[-1]["year"] if rev else None,
        "latest": latest,
        "ratios": ratios,
        "revenue_growth": rev_growth,
        "history": history,
    }
