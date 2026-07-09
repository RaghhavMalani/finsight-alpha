"""Finnhub real-time quote provider (free tier).

Provides a single live snapshot quote (current price, change, day range) used to
make the terminal header *tick* instead of showing only end-of-day data. The
free tier is rate-limited (~60 calls/min) and does not include intraday candles,
so this module intentionally exposes only the lightweight ``/quote`` snapshot.

Reads ``FINNHUB_API_KEY`` from the environment (set it in ``.env``). Never raises
to callers that check :func:`finnhub_available` first; otherwise raises
:class:`FinnhubError` with a readable reason.
"""

from __future__ import annotations

import os
from typing import Any, Dict

try:
    import requests
except Exception:  # pragma: no cover
    requests = None  # type: ignore[assignment]

FINNHUB_BASE = "https://finnhub.io/api/v1"


class FinnhubError(Exception):
    """Expected Finnhub failure (missing key, rate limit, unknown symbol)."""


def finnhub_available() -> bool:
    return bool(os.getenv("FINNHUB_API_KEY")) and requests is not None


def get_live_quote(ticker: str, timeout: float = 6.0) -> Dict[str, Any]:
    """Return a normalized live quote for ``ticker``.

    Keys: ``ticker, price, change, change_pct (fraction), high, low, open,
    prev_close, ts``. ``change_pct`` is a fraction (e.g. -0.0074) to match the
    rest of the app's convention.
    """
    key = os.getenv("FINNHUB_API_KEY")
    if not key:
        raise FinnhubError("FINNHUB_API_KEY not set.")
    if requests is None:
        raise FinnhubError("`requests` is not installed.")

    try:
        resp = requests.get(
            f"{FINNHUB_BASE}/quote",
            params={"symbol": ticker.upper(), "token": key},
            timeout=timeout,
        )
    except Exception as exc:
        raise FinnhubError(f"Finnhub request failed: {exc}")

    if resp.status_code == 429:
        raise FinnhubError("Finnhub rate limit hit (free tier ~60/min).")
    if resp.status_code != 200:
        raise FinnhubError(f"Finnhub HTTP {resp.status_code}: {resp.text[:120]}")

    d = resp.json() or {}
    # Finnhub: c=current, d=change, dp=percent change, h/l/o, pc=prev close, t=epoch.
    if not d.get("c") and not d.get("pc"):
        raise FinnhubError(f"No live quote for '{ticker}'.")
    dp = d.get("dp")
    return {
        "ticker": ticker.upper(),
        "price": d.get("c"),
        "change": d.get("d"),
        "change_pct": (dp / 100.0) if dp is not None else None,
        "high": d.get("h"),
        "low": d.get("l"),
        "open": d.get("o"),
        "prev_close": d.get("pc"),
        "ts": d.get("t"),
    }
