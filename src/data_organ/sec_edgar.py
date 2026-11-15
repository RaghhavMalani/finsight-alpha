"""SEC EDGAR XBRL companyfacts: each fact row is a filing-dated, append-only observation.

Row mapping (Data Organ convention: ``observed_at`` is the observation period):
``observed_at`` = XBRL period end (the effective date, UTC date-only convention),
``available_at`` = next America/New_York midnight after the EDGAR ``filed`` date,
``revision`` = accession number, capture ``captured_at`` = fetch clock. A later
filing for the same concept/period is a new row; nothing is overwritten.
"""

from __future__ import annotations

import json
import math
import os
import re
import threading
import time
from collections import Counter, defaultdict, deque
from dataclasses import replace
from datetime import date, datetime, time as dtime, timedelta, timezone
from hashlib import sha256
from zoneinfo import ZoneInfo

from .contracts import Capture

SOURCE = "sec:edgar-companyfacts"
USER_AGENT = "FinSight-Forge research (github.com/RaghhavMalani/finsight-alpha)"
HEADERS = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}


def request_headers():
    """SEC fair access asks for a contact in the User-Agent; only an explicitly configured one is sent."""
    contact = os.environ.get("FINSIGHT_SEC_CONTACT", "").strip()
    if contact and not re.fullmatch(r"[^\s@<>()]+@[^\s@<>()]+\.[A-Za-z]{2,}", contact):
        raise ValueError("FINSIGHT_SEC_CONTACT must be a plain email address")
    return {**HEADERS, "User-Agent": USER_AGENT + (" " + contact if contact else "")}
TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
MAX_REQUESTS_PER_SECOND = 10
# The shared observation contract (contracts.py) is sealed by earlier freezes and keeps only the six
# core fields. Filing provenance therefore travels in capture metadata, keyed by the admitted row.
PROVENANCE_FIELDS = ("effective_start", "filed", "form", "fiscal_year", "fiscal_period", "frame", "xbrl_concept")


def provenance_key(row):
    return f'{row["field"]}|{row["observed_at"]}|{row["revision"]}'


def _withhold(row):
    """A row the provider cannot stand behind makes no availability claim, so admission refuses it."""
    held = {k: v for k, v in row.items() if k != "available_at"}
    return held | {"claimed_available_at": row.get("available_at")}
MAX_RESPONSE_BYTES = 64 * 1024 * 1024
ADAPTER_VERSION = "sec-edgar-companyfacts/1"
AVAILABILITY_RULE = (
    "Next America/New_York midnight after the EDGAR filing date. EDGAR dates a "
    "filing accepted after 17:30 ET to the next business day, so public "
    "dissemination precedes the end of the filing date."
)
NEW_YORK = ZoneInfo("America/New_York")

LICENCE = {
    "status": "PUBLIC_INFORMATION",
    "permitted_uses": ["research_local"],
    "dataset_key": SOURCE,
    "valid_through": None,
    "terms_url": "https://www.sec.gov/about/privacy-information",
    "fair_access_url": "https://www.sec.gov/developer",
    "terms": (
        "SEC states information on sec.gov is public and may be copied or "
        "redistributed without its permission. Fair access: at most 10 "
        "requests/second with a declared User-Agent."
    ),
    "publication": (
        "No derived-publication grant is registered; admitted rows stay local "
        "until one is recorded explicitly."
    ),
}

# Bounded declared schema: (taxonomy, concept) -> (field, period kind, unit).
CONCEPTS = {
    ("us-gaap", "Revenues"): ("revenues", "duration", "USD"),
    ("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax"): (
        "revenue_from_contracts",
        "duration",
        "USD",
    ),
    ("us-gaap", "OperatingIncomeLoss"): ("operating_income_loss", "duration", "USD"),
    ("us-gaap", "NetIncomeLoss"): ("net_income_loss", "duration", "USD"),
    ("us-gaap", "NetCashProvidedByUsedInOperatingActivities"): (
        "operating_cash_flow",
        "duration",
        "USD",
    ),
    ("us-gaap", "EarningsPerShareDiluted"): ("eps_diluted", "duration", "USD/shares"),
    ("us-gaap", "Assets"): ("assets", "instant", "USD"),
    ("us-gaap", "Liabilities"): ("liabilities", "instant", "USD"),
    ("us-gaap", "StockholdersEquity"): ("stockholders_equity", "instant", "USD"),
    ("us-gaap", "CashAndCashEquivalentsAtCarryingValue"): ("cash", "instant", "USD"),
    ("dei", "EntityCommonStockSharesOutstanding"): (
        "shares_outstanding",
        "instant",
        "shares",
    ),
}
# Duration facts become ``<field>_q`` (one quarter) or ``<field>_fy`` (one fiscal year).
DURATIONS = (("_q", 80, 100), ("_fy", 350, 380))


def schema_fields(unit):
    fields = set()
    for field, kind, declared in CONCEPTS.values():
        if declared == unit:
            fields |= (
                {field + suffix for suffix, _, _ in DURATIONS}
                if kind == "duration"
                else {field}
            )
    return {name: "float" for name in sorted(fields)}


FIELDS = frozenset(
    name for unit in ("USD", "USD/shares", "shares") for name in schema_fields(unit)
)


def edgar_available_at(filed):
    """Conservative availability for an EDGAR filing date (YYYY-MM-DD)."""
    next_day = date.fromisoformat(filed) + timedelta(days=1)
    midnight = datetime.combine(next_day, dtime(0), tzinfo=NEW_YORK)  # DST-aware
    return midnight.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class RateLimiter:
    """Sliding one-second window shared by every SEC request in this process."""

    def __init__(self, per_second=MAX_REQUESTS_PER_SECOND, *, clock=None, sleep=None):
        if not 0 < per_second <= MAX_REQUESTS_PER_SECOND:
            raise ValueError("SEC fair access allows at most 10 requests/second")
        self.per_second = per_second
        self.clock, self.sleep = clock or time.monotonic, sleep or time.sleep
        self.starts, self.lock = deque(), threading.Lock()

    def wait(self):
        with self.lock:
            while True:
                now = self.clock()
                while self.starts and now - self.starts[0] >= 1.0:
                    self.starts.popleft()
                if len(self.starts) < self.per_second:
                    self.starts.append(now)
                    return now
                self.sleep(1.0 - (now - self.starts[0]))


LIMITER = RateLimiter()


def get(url, *, transport=None, limiter=None):
    """One rate-limited SEC GET with the declared User-Agent. Never fetches elsewhere."""
    if url != TICKERS_URL and not re.fullmatch(
        r"https://data\.sec\.gov/api/xbrl/companyfacts/CIK[0-9]{10}\.json", url
    ):
        raise ValueError("Only the bounded SEC ticker map and companyfacts are allowed")
    if transport is None:
        import requests

        transport = requests.get
    headers = request_headers()  # a bad contact setting surfaces its own message
    (limiter or LIMITER).wait()
    try:
        response = transport(url, headers=headers, timeout=(10, 35), allow_redirects=False)
    except Exception as error:  # transport errors never echo request details
        raise ValueError("SEC EDGAR transport unavailable: " + type(error).__name__) from None
    if 300 <= response.status_code < 400:
        raise ValueError("SEC EDGAR redirect refused: HTTP " + str(response.status_code))
    if response.status_code != 200:
        raise ValueError("SEC EDGAR unavailable: HTTP " + str(response.status_code))
    if len(response.content) > MAX_RESPONSE_BYTES:
        raise ValueError("SEC EDGAR capture exceeds 64 MiB bound")
    clock = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return response.content, clock


def cik_for(ticker, raw):
    """Resolve a ticker with SEC's current map (a present-day link, not a PIT identity)."""
    wanted = ticker.strip().upper()
    matches = {
        f"{int(row['cik_str']):010d}"
        for row in json.loads(raw).values()
        if isinstance(row, dict) and str(row.get("ticker", "")).upper() == wanted
    }
    if len(matches) != 1:
        raise ValueError("Ticker is absent from or ambiguous in SEC company_tickers.json")
    return matches.pop()


def _iso_date(value):
    """Strict YYYY-MM-DD; fromisoformat alone also accepts 20231231 and week dates."""
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ValueError("Date must be YYYY-MM-DD")
    return date.fromisoformat(value)


def _row(asset, field, kind, entry):
    end, filed = entry.get("end"), entry.get("filed")
    row = {
        "asset": asset,
        "field": field,
        "value": entry.get("val"),
        "observed_at": f"{end}T00:00:00Z",
        "available_at": None,
        "revision": entry.get("accn"),
        "filed": filed,
        "form": entry.get("form"),
        "fiscal_year": entry.get("fy"),
        "fiscal_period": entry.get("fp"),
    }
    if entry.get("frame"):
        row["frame"] = entry["frame"]
    if entry.get("start"):
        row["effective_start"] = entry["start"]
    if not all(isinstance(entry.get(k), str) and entry[k] for k in ("end", "filed", "accn", "form")):
        return row | {"quarantine_reason": "Missing companyfacts filing provenance"}, None
    try:
        period_end, filing_day = _iso_date(end), _iso_date(filed)
    except ValueError:
        return row | {"quarantine_reason": "Invalid companyfacts date"}, None
    row["available_at"] = edgar_available_at(filed)
    if filing_day < period_end:
        return row | {"quarantine_reason": "Filing date precedes period end"}, None
    try:
        if type(row["value"]) not in (int, float) or not math.isfinite(float(row["value"])):
            raise ValueError
    except (OverflowError, ValueError):
        value = row["value"]
        if type(value) is int:  # keep downstream diagnostics away from float overflow
            value = {"invalid_numeric": f"int with {len(str(abs(value)))} digits"}
        return row | {
            "value": value,
            "quarantine_reason": "Non-numeric or non-finite companyfacts value",
        }, None
    row["value"] = float(row["value"])
    if kind == "instant":
        if entry.get("start"):
            return row | {"quarantine_reason": "Instant concept reported with a duration"}, None
        return row, None
    try:
        days = (period_end - _iso_date(entry.get("start") or "")).days
    except ValueError:
        return row | {"quarantine_reason": "Duration concept without a valid start"}, None
    suffix = next((s for s, low, high in DURATIONS if low <= days <= high), None)
    if suffix is None:
        return None, "unsupported_duration"
    return row | {"field": field + suffix}, None


def companyfacts(raw, *, captured_at, source_url, ticker, cik, ticker_evidence):
    """Parse one captured companyfacts document into per-unit Data Organ captures."""
    payload = json.loads(raw)
    if f"{int(payload.get('cik', -1)):010d}" != cik:
        raise ValueError("companyfacts CIK substitution")
    asset = "CIK" + cik
    excluded, by_unit = Counter(), defaultdict(list)
    declared = {(t, c) for t, c in CONCEPTS}
    for taxonomy, concepts in payload.get("facts", {}).items():
        for concept, fact in concepts.items():
            if (taxonomy, concept) not in declared:
                excluded["undeclared_concept"] += 1
                continue
            field, kind, unit = CONCEPTS[(taxonomy, concept)]
            for unit_name, entries in fact.get("units", {}).items():
                for entry in entries:
                    row, skip = _row(asset, field, kind, entry)
                    if skip:
                        excluded[skip] += 1
                        continue
                    row["xbrl_concept"] = f"{taxonomy}:{concept}"
                    if unit_name != unit:
                        row["quarantine_reason"] = f"Undeclared unit {unit_name} for {concept}"
                    by_unit[unit].append(row)
    collapsed = 0
    for unit, rows in by_unit.items():
        groups = defaultdict(list)
        for row in rows:
            if not row.get("quarantine_reason"):
                groups[(row["field"], row["observed_at"], row["available_at"])].append(row)
        drop = set()
        for group in groups.values():
            if len(group) == 1:
                continue
            if len({r["value"] for r in group}) == 1:
                keep = min(group, key=lambda r: r["revision"])
                drop |= {id(r) for r in group if r is not keep}
                collapsed += len(group) - 1
            else:
                for r in group:
                    r["quarantine_reason"] = (
                        "Conflicting values for one period at one filing instant"
                    )
        by_unit[unit] = [r for r in rows if id(r) not in drop]
    captures = []
    for unit in sorted(by_unit):
        rows = sorted(
            by_unit[unit],
            key=lambda r: (r["field"], r["observed_at"], r["available_at"] or "", r["revision"] or ""),
        )
        provenance = {}
        for r in rows:
            if not r.get("quarantine_reason"):
                provenance.setdefault(
                    provenance_key(r), {k: r[k] for k in PROVENANCE_FIELDS if r.get(k) is not None}
                )
        rows = [_withhold(r) if r.get("quarantine_reason") else r for r in rows]
        cap = Capture(
            SOURCE,
            source_url,
            sha256(raw).hexdigest(),
            captured_at,
            schema_fields(unit),
            LICENCE,
            "CONSERVATIVE_VINTAGE_DAY",
            {"status": "NOT_APPLICABLE"},
            "SEC XBRL companyfacts as filed; one row per filing (accession)",
            unit,
            "SEC_XBRL_COMPANYFACTS",
        )
        cap = replace(
            cap,
            metadata={
                "adapter_version": ADAPTER_VERSION,
                "cadence": "FILING_EVENT",
                "field_schema_units": {k: unit for k in cap.schema},
                "availability_rule": AVAILABILITY_RULE,
                "source_convention": "observed_at is the XBRL period end (UTC date-only); revision is the accession number",
                "ticker": ticker.strip().upper(),
                "cik": cik,
                "ticker_map": ticker_evidence,
                "user_agent": USER_AGENT,
                "excluded_rows": dict(sorted(excluded.items())),
                "collapsed_same_instant_duplicates": collapsed,
                "filing_provenance": provenance,
            },
        )
        captures.append((cap, raw, rows))
    return captures


def fetch_companyfacts(ticker, *, transport=None, limiter=None):
    """Network capture: SEC ticker map, then the company's companyfacts document."""
    tickers, ticker_clock = get(TICKERS_URL, transport=transport, limiter=limiter)
    cik = cik_for(ticker, tickers)
    url = COMPANYFACTS_URL.format(cik=cik)
    raw, clock = get(url, transport=transport, limiter=limiter)
    return companyfacts(
        raw,
        captured_at=clock,
        source_url=url,
        ticker=ticker,
        cik=cik,
        ticker_evidence={
            "url": TICKERS_URL,
            "sha256": sha256(tickers).hexdigest(),
            "captured_at": ticker_clock,
        },
    )
