"""Authoritative, searchable US and Indian security universes.

The catalog is provider-backed rather than a hard-coded terminal watchlist:
Nasdaq Trader supplies US listed issues, the SEC supplies a resilient issuer
fallback, and NSE publishes the Indian equity master.  Small seed catalogs keep
the terminal useful when an exchange blocks or times out.  Every row carries
source and quote-symbol provenance so consumers never confuse a directory
identifier with an executable market-data symbol.
"""

from __future__ import annotations

import csv
import io
import os
import threading
import time
from typing import Any, Iterable

import requests

from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
NASDAQ_OTHER = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
SEC_TICKERS = "https://www.sec.gov/files/company_tickers_exchange.json"
NSE_EQUITIES = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
BSE_ACTIVE = (
    "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w"
    "?Group=&Scripcode=&industry=&segment=Equity&status=Active"
)

_TTL = 12 * 60 * 60
_lock = threading.Lock()
_cache: tuple[float, list[dict[str, Any]], list[dict[str, Any]]] | None = None

EXCHANGE_NAMES = {
    "A": "NYSE AMERICAN",
    "N": "NYSE",
    "P": "NYSE ARCA",
    "Z": "CBOE",
    "V": "IEX",
}

INDEX_SEED = [
    # US broad, style, volatility, rates and sector benchmarks.
    ("^GSPC", "S&P 500", "US", "S&P DJI"),
    ("^SPX", "S&P 500 Index", "US", "CBOE"),
    ("^DJI", "Dow Jones Industrial Average", "US", "S&P DJI"),
    ("^IXIC", "Nasdaq Composite", "US", "NASDAQ"),
    ("^NDX", "Nasdaq 100", "US", "NASDAQ"),
    ("^RUT", "Russell 2000", "US", "FTSE Russell"),
    ("^RUI", "Russell 1000", "US", "FTSE Russell"),
    ("^RUA", "Russell 3000", "US", "FTSE Russell"),
    ("^VIX", "CBOE Volatility Index", "US", "CBOE"),
    ("^VXN", "Nasdaq 100 Volatility Index", "US", "CBOE"),
    ("^TNX", "US 10 Year Treasury Yield", "US", "CBOE"),
    ("^FVX", "US 5 Year Treasury Yield", "US", "CBOE"),
    ("^TYX", "US 30 Year Treasury Yield", "US", "CBOE"),
    ("^SOX", "PHLX Semiconductor Index", "US", "NASDAQ"),
    ("^XAU", "PHLX Gold/Silver Index", "US", "NASDAQ"),
    ("^BKX", "KBW Nasdaq Bank Index", "US", "NASDAQ"),
    ("^DJT", "Dow Jones Transportation Average", "US", "S&P DJI"),
    ("^MID", "S&P MidCap 400", "US", "S&P DJI"),
    # Indian broad, sector and factor benchmarks with Yahoo-compatible symbols where available.
    ("^NSEI", "NIFTY 50", "IN", "NSE INDICES"),
    ("^BSESN", "S&P BSE SENSEX", "IN", "BSE"),
    ("^NSEBANK", "NIFTY BANK", "IN", "NSE INDICES"),
    ("^CNXIT", "NIFTY IT", "IN", "NSE INDICES"),
    ("^CNXPHARMA", "NIFTY PHARMA", "IN", "NSE INDICES"),
    ("^CNXAUTO", "NIFTY AUTO", "IN", "NSE INDICES"),
    ("^CNXFMCG", "NIFTY FMCG", "IN", "NSE INDICES"),
    ("^CNXMETAL", "NIFTY METAL", "IN", "NSE INDICES"),
    ("^CNXREALTY", "NIFTY REALTY", "IN", "NSE INDICES"),
    ("^CNXENERGY", "NIFTY ENERGY", "IN", "NSE INDICES"),
    ("^CNXPSUBANK", "NIFTY PSU BANK", "IN", "NSE INDICES"),
    ("^CNXINFRA", "NIFTY INFRASTRUCTURE", "IN", "NSE INDICES"),
    ("^CNXMEDIA", "NIFTY MEDIA", "IN", "NSE INDICES"),
    ("^CNXCONSUM", "NIFTY INDIA CONSUMPTION", "IN", "NSE INDICES"),
    ("^NSEMDCP50", "NIFTY MIDCAP 50", "IN", "NSE INDICES"),
    ("^CNXSC", "NIFTY SMALLCAP", "IN", "NSE INDICES"),
    ("NIFTY_FIN_SERVICE.NS", "NIFTY FINANCIAL SERVICES", "IN", "NSE INDICES"),
    ("NIFTY_HEALTHCARE.NS", "NIFTY HEALTHCARE", "IN", "NSE INDICES"),
    ("NIFTY_CONSR_DURBL.NS", "NIFTY CONSUMER DURABLES", "IN", "NSE INDICES"),
    ("NIFTY_OIL_AND_GAS.NS", "NIFTY OIL & GAS", "IN", "NSE INDICES"),
]

EQUITY_SEED = [
    ("AAPL", "Apple Inc.", "US", "NASDAQ"),
    ("MSFT", "Microsoft Corp.", "US", "NASDAQ"),
    ("NVDA", "NVIDIA Corp.", "US", "NASDAQ"),
    ("AMZN", "Amazon.com Inc.", "US", "NASDAQ"),
    ("META", "Meta Platforms Inc.", "US", "NASDAQ"),
    ("GOOGL", "Alphabet Inc.", "US", "NASDAQ"),
    ("BRK-B", "Berkshire Hathaway Inc.", "US", "NYSE"),
    ("JPM", "JPMorgan Chase & Co.", "US", "NYSE"),
    ("RELIANCE.NS", "Reliance Industries Ltd.", "IN", "NSE"),
    ("TCS.NS", "Tata Consultancy Services Ltd.", "IN", "NSE"),
    ("HDFCBANK.NS", "HDFC Bank Ltd.", "IN", "NSE"),
    ("ICICIBANK.NS", "ICICI Bank Ltd.", "IN", "NSE"),
    ("INFY.NS", "Infosys Ltd.", "IN", "NSE"),
    ("BHARTIARTL.NS", "Bharti Airtel Ltd.", "IN", "NSE"),
    ("SBIN.NS", "State Bank of India", "IN", "NSE"),
    ("LT.NS", "Larsen & Toubro Ltd.", "IN", "NSE"),
]


def _row(
    symbol: str,
    name: str,
    region: str,
    exchange: str,
    asset_type: str,
    source: str,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "symbol": (
            symbol.replace(".NS", "").replace(".BO", "")
            if region == "IN" and asset_type != "INDEX"
            else symbol
        ),
        "quote_symbol": symbol,
        "name": name.strip(),
        "region": region,
        "country": "India" if region == "IN" else "United States",
        "exchange": exchange,
        "asset_type": asset_type,
        "currency": "INR" if region == "IN" else "USD",
        "source": source,
        **extra,
    }


def _get(
    url: str, *, timeout: float = 12.0, headers: dict[str, str] | None = None
) -> requests.Response:
    base = {
        "User-Agent": os.getenv(
            "FINSIGHT_SEC_USER_AGENT", "FinSight Alpha research contact@example.com"
        ),
        "Accept": "*/*",
    }
    if headers:
        base.update(headers)
    response = requests.get(url, headers=base, timeout=timeout)
    response.raise_for_status()
    return response


def _parse_pipe(text: str, source: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for raw in csv.DictReader(io.StringIO(text), delimiter="|"):
        if not raw or any(
            str(v).startswith("File Creation Time") for v in raw.values()
        ):
            continue
        symbol = (raw.get("Symbol") or raw.get("ACT Symbol") or "").strip()
        name = (raw.get("Security Name") or "").strip()
        if not symbol or not name or raw.get("Test Issue") == "Y":
            continue
        exchange_code = (raw.get("Exchange") or "").strip()
        exchange = (
            "NASDAQ"
            if source == "NASDAQ_LISTED"
            else EXCHANGE_NAMES.get(exchange_code, exchange_code or "US")
        )
        is_etf = (raw.get("ETF") or "N").strip() == "Y"
        quote_symbol = symbol.replace(".", "-")
        rows.append(
            _row(
                quote_symbol,
                name,
                "US",
                exchange,
                "ETF" if is_etf else "EQUITY",
                source,
            )
        )
    return rows


def _load_us() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    for url, source in (
        (NASDAQ_LISTED, "NASDAQ_LISTED"),
        (NASDAQ_OTHER, "NASDAQ_OTHER"),
    ):
        try:
            part = _parse_pipe(_get(url).text, source)
            rows.extend(part)
            errors.append({"source": source, "ok": True, "rows": len(part)})
        except Exception as exc:
            logger.warning("Universe source %s unavailable: %s", source, exc)
            errors.append({"source": source, "ok": False, "error": str(exc)})
    if not rows:
        try:
            payload = _get(SEC_TICKERS).json()
            fields = payload.get("fields", [])
            for values in payload.get("data", []):
                item = dict(zip(fields, values))
                symbol = str(item.get("ticker") or "").replace(".", "-")
                if symbol:
                    rows.append(
                        _row(
                            symbol,
                            str(item.get("name") or symbol),
                            "US",
                            str(item.get("exchange") or "US"),
                            "EQUITY",
                            "SEC_EDGAR",
                            cik=item.get("cik"),
                        )
                    )
            errors.append({"source": "SEC_EDGAR", "ok": True, "rows": len(rows)})
        except Exception as exc:
            errors.append({"source": "SEC_EDGAR", "ok": False, "error": str(exc)})
    return rows, errors


def _load_india() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    status: list[dict[str, Any]] = []
    try:
        reader = csv.DictReader(
            io.StringIO(
                _get(
                    NSE_EQUITIES, headers={"Referer": "https://www.nseindia.com/"}
                ).text
            )
        )
        for raw in reader:
            clean = {str(k).strip(): str(v or "").strip() for k, v in raw.items()}
            symbol = clean.get("SYMBOL", "")
            if not symbol:
                continue
            rows.append(
                _row(
                    f"{symbol}.NS",
                    clean.get("NAME OF COMPANY") or symbol,
                    "IN",
                    "NSE",
                    "EQUITY",
                    "NSE_SECURITY_MASTER",
                    isin=clean.get(" ISIN NUMBER") or clean.get("ISIN NUMBER"),
                    series=clean.get(" SERIES") or clean.get("SERIES"),
                )
            )
        status.append({"source": "NSE_SECURITY_MASTER", "ok": True, "rows": len(rows)})
    except Exception as exc:
        logger.warning("NSE universe unavailable: %s", exc)
        status.append({"source": "NSE_SECURITY_MASTER", "ok": False, "error": str(exc)})

    try:
        payload = _get(
            BSE_ACTIVE,
            headers={
                "Origin": "https://www.bseindia.com",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://www.bseindia.com/",
            },
        ).json()
        table = (
            payload
            if isinstance(payload, list)
            else payload.get("Table") or payload.get("table") or []
        )
        before = len(rows)
        for raw in table:
            code = str(raw.get("SCRIP_CD") or raw.get("scrip_cd") or "").strip()
            symbol = str(raw.get("SCRIP_ID") or raw.get("scrip_id") or code).strip()
            name = str(raw.get("Scrip_Name") or raw.get("scrip_name") or symbol).strip()
            if code:
                rows.append(
                    _row(
                        f"{code}.BO",
                        name,
                        "IN",
                        "BSE",
                        "EQUITY",
                        "BSE_ACTIVE_MASTER",
                        local_symbol=symbol,
                        security_code=code,
                    )
                )
        status.append(
            {"source": "BSE_ACTIVE_MASTER", "ok": True, "rows": len(rows) - before}
        )
    except Exception as exc:
        status.append({"source": "BSE_ACTIVE_MASTER", "ok": False, "error": str(exc)})
    return rows, status


def _seeds() -> list[dict[str, Any]]:
    rows = [
        _row(symbol, name, region, exchange, "INDEX", "CURATED_OFFICIAL_MAP")
        for symbol, name, region, exchange in INDEX_SEED
    ]
    rows.extend(
        _row(symbol, name, region, exchange, "EQUITY", "RESILIENT_SEED")
        for symbol, name, region, exchange in EQUITY_SEED
    )
    return rows


def _dedupe(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    out: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in rows:
        key = (
            str(row["region"]),
            str(row["asset_type"]),
            str(row["quote_symbol"]).upper(),
        )
        previous = out.get(key)
        if previous is None or previous.get("source") in {
            "RESILIENT_SEED",
            "CURATED_OFFICIAL_MAP",
        }:
            out[key] = row
    return sorted(
        out.values(),
        key=lambda item: (item["region"], item["asset_type"], item["quote_symbol"]),
    )


def refresh_universe(
    force: bool = False,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    global _cache
    now = time.time()
    with _lock:
        if _cache and not force and now - _cache[0] < _TTL:
            return list(_cache[1]), list(_cache[2])
    us, us_status = _load_us()
    india, in_status = _load_india()
    rows = _dedupe([*_seeds(), *us, *india])
    status = [*us_status, *in_status]
    with _lock:
        _cache = (now, rows, status)
    return list(rows), list(status)


def search_universe(
    query: str = "",
    regions: set[str] | None = None,
    asset_types: set[str] | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    rows, sources = refresh_universe()
    q = query.strip().upper()
    filtered = [
        row
        for row in rows
        if (not regions or row["region"] in regions)
        and (not asset_types or row["asset_type"] in asset_types)
    ]
    if q:
        filtered = [
            row
            for row in filtered
            if q in str(row["quote_symbol"]).upper()
            or q in str(row["symbol"]).upper()
            or q in str(row["name"]).upper()
        ]
        filtered.sort(
            key=lambda row: (
                (
                    0
                    if str(row["quote_symbol"]).upper() == q
                    else (
                        1
                        if str(row["quote_symbol"]).upper().startswith(q)
                        else 2 if str(row["name"]).upper().startswith(q) else 3
                    )
                ),
                row["quote_symbol"],
            )
        )
    counts: dict[str, int] = {}
    for row in rows:
        key = f"{row['region']}_{row['asset_type']}"
        counts[key] = counts.get(key, 0) + 1
    return {
        "query": query,
        "total_catalog": len(rows),
        "matched": len(filtered),
        "returned": min(limit, len(filtered)),
        "coverage": counts,
        "sources": sources,
        "items": filtered[:limit],
        "as_of_epoch": int(_cache[0]) if _cache else None,
    }


def universe_stats() -> dict[str, Any]:
    payload = search_universe(limit=0)
    payload.pop("items", None)
    payload.pop("query", None)
    return payload
