"""Automatic SEC EDGAR filing fetcher — reliable, free, no API key.

Unlike scraping NSE/BSE/Screener (which actively block bots), EDGAR offers a
documented, free, fair-access API. The only requirement is a descriptive
``User-Agent`` header. This module turns a US ticker into indexed text with no
manual steps:

    ticker -> CIK (official map) -> recent 10-K/10-Q (submissions API)
           -> download primary document (HTML) -> extract text
           -> save .txt into data/documents/<ticker>/

The saved .txt files are picked up unchanged by :mod:`src.rag.ingest`.

Limitations
-----------
EDGAR covers **US filers only**. Indian tickers (``.NS`` / ``.BO``) raise
:class:`EdgarError` - for those, the annual-report PDF must be supplied manually.
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import requests
except Exception:  # pragma: no cover - declared in requirements.txt
    requests = None  # type: ignore[assignment]

try:
    from bs4 import BeautifulSoup
except Exception:  # pragma: no cover
    BeautifulSoup = None  # type: ignore[assignment]


# EDGAR's fair-access policy: identify yourself. Override via env if you like.
USER_AGENT = os.getenv(
    "FINSIGHT_SEC_USER_AGENT", "FinSight Alpha research tool (contact: admin@finsight.local)"
)

_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"
_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik10}.json"
_ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{doc}"

_CACHE_DIR = Path("data/.cache")
_TICKER_CACHE = _CACHE_DIR / "edgar_tickers.json"

DEFAULT_DOC_ROOT = "data/documents"


class EdgarError(Exception):
    """Raised when EDGAR can't serve a request (e.g. a non-US ticker)."""


def _headers() -> Dict[str, str]:
    return {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}


def _get(url: str, *, as_json: bool = True, timeout: float = 20.0):
    if requests is None:
        raise EdgarError("`requests` is not installed.")
    resp = requests.get(url, headers=_headers(), timeout=timeout)
    if resp.status_code != 200:
        raise EdgarError(f"EDGAR HTTP {resp.status_code} for {url}")
    time.sleep(0.15)  # polite rate limiting (<10 req/s)
    return resp.json() if as_json else resp.text


def _is_us_ticker(ticker: str) -> bool:
    t = ticker.upper()
    return not (t.endswith(".NS") or t.endswith(".BO"))


# ---------------------------------------------------------------------------
# Ticker -> CIK
# ---------------------------------------------------------------------------
def _load_ticker_map() -> Dict[str, str]:
    """Return {TICKER: zero-padded-CIK}, cached on disk to avoid refetching ~1MB."""
    if _TICKER_CACHE.exists():
        try:
            return json.loads(_TICKER_CACHE.read_text(encoding="utf-8"))
        except Exception:
            pass
    raw = _get(_TICKER_MAP_URL)
    mapping: Dict[str, str] = {}
    # Format: {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}, ...}
    for entry in raw.values():
        try:
            mapping[str(entry["ticker"]).upper()] = f"{int(entry['cik_str']):010d}"
        except (KeyError, TypeError, ValueError):
            continue
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _TICKER_CACHE.write_text(json.dumps(mapping), encoding="utf-8")
    except Exception:
        pass
    return mapping


def get_cik(ticker: str) -> str:
    """Resolve a US ticker to its zero-padded 10-digit CIK.

    Raises
    ------
    EdgarError
        For non-US tickers or symbols EDGAR doesn't list.
    """
    if not _is_us_ticker(ticker):
        raise EdgarError(
            f"'{ticker}' looks like a non-US listing. EDGAR covers US filers only; "
            f"supply the annual-report PDF manually for this name."
        )
    cik = _load_ticker_map().get(ticker.upper())
    if not cik:
        raise EdgarError(f"No EDGAR CIK found for ticker '{ticker}'.")
    return cik


# ---------------------------------------------------------------------------
# Filings
# ---------------------------------------------------------------------------
def recent_filings(
    ticker: str,
    forms: Tuple[str, ...] = ("10-K", "10-Q"),
    limit: int = 2,
) -> List[Dict[str, Any]]:
    """Return recent filings of the requested form types, newest first."""
    cik = get_cik(ticker)
    data = _get(_SUBMISSIONS_URL.format(cik10=cik))
    recent = (data.get("filings") or {}).get("recent") or {}

    forms_arr = recent.get("form") or []
    acc_arr = recent.get("accessionNumber") or []
    doc_arr = recent.get("primaryDocument") or []
    date_arr = recent.get("filingDate") or []
    desc_arr = recent.get("primaryDocDescription") or []

    wanted = {f.upper() for f in forms}
    cik_int = int(cik)
    out: List[Dict[str, Any]] = []
    for i in range(len(forms_arr)):
        if str(forms_arr[i]).upper() not in wanted:
            continue
        accession = acc_arr[i] if i < len(acc_arr) else ""
        doc = doc_arr[i] if i < len(doc_arr) else ""
        if not accession or not doc:
            continue
        url = _ARCHIVE_URL.format(
            cik=cik_int, accession=accession.replace("-", ""), doc=doc
        )
        out.append({
            "ticker": ticker.upper(),
            "form": forms_arr[i],
            "filing_date": date_arr[i] if i < len(date_arr) else "",
            "accession": accession,
            "primary_document": doc,
            "description": desc_arr[i] if i < len(desc_arr) else "",
            "url": url,
        })
        if len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------------------
# Download + extract
# ---------------------------------------------------------------------------
def _html_to_text(html: str, max_chars: int = 400_000) -> str:
    """Strip an EDGAR HTML filing down to readable text (capped for speed)."""
    if BeautifulSoup is None:
        # Crude fallback: drop tags.
        text = re.sub(r"<[^>]+>", " ", html)
    else:
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()
        text = soup.get_text(" ")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def _safe_stem(ticker: str) -> str:
    return ticker.replace(".", "_").replace("/", "_")


def download_filing_text(
    filing: Dict[str, Any],
    dest_dir: str | Path,
    max_chars: int = 400_000,
) -> Optional[Path]:
    """Download one filing's primary document and save extracted text as .txt."""
    html = _get(filing["url"], as_json=False, timeout=40.0)
    text = _html_to_text(html, max_chars=max_chars)
    if not text:
        return None
    header = (
        f"SOURCE: SEC EDGAR | {filing['ticker']} | {filing['form']} | "
        f"filed {filing['filing_date']} | {filing['url']}\n\n"
    )
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    fname = f"{_safe_stem(filing['ticker'])}_{filing['form'].replace('-', '')}_{filing['filing_date']}.txt"
    path = dest / fname
    path.write_text(header + text, encoding="utf-8")
    return path


def fetch_filings_for_ticker(
    ticker: str,
    forms: Tuple[str, ...] = ("10-K", "10-Q"),
    limit: int = 1,
    doc_root: str = DEFAULT_DOC_ROOT,
    max_chars: int = 400_000,
) -> Tuple[List[Path], str]:
    """Fetch + extract recent filings for a ticker. Returns (saved_paths, dest_dir).

    Raises
    ------
    EdgarError
        For non-US tickers, unknown symbols, or when EDGAR returns no filings.
    """
    filings = recent_filings(ticker, forms=forms, limit=limit)
    if not filings:
        raise EdgarError(
            f"No {'/'.join(forms)} filings found on EDGAR for '{ticker}'."
        )
    dest_dir = str(Path(doc_root) / _safe_stem(ticker.upper()))
    saved: List[Path] = []
    for f in filings:
        p = download_filing_text(f, dest_dir, max_chars=max_chars)
        if p:
            saved.append(p)
    if not saved:
        raise EdgarError(f"Filings found but no text could be extracted for '{ticker}'.")
    return saved, dest_dir
