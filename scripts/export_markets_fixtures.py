"""Export the Markets screens' contract fixtures from the real route functions.

Each fixture is the JSON a Markets endpoint returns, produced by calling the
route function itself with its data sources replaced by seeded stand-ins:

* price history: geometric random walks per ticker sharing one market factor;
* the Yahoo option chain: Black-Scholes prices off a fixed smile, frozen clock;
* EDGAR company facts and the RAG index: small hand-written stubs.

None of it is market data, which is why every file is named ``*.simulated.json``.
The frontend's ``scripts/verify-markets.mjs`` runs its adapters on these files,
and ``tests/test_markets_contract.py`` fails when a route's response shape drifts
from them. Regenerate after changing a route:

    python scripts/export_markets_fixtures.py
"""

from __future__ import annotations

import json
import math
import sys
import zlib
from contextlib import ExitStack
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable, Dict
from unittest.mock import patch

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

OUT = ROOT / "frontend-v2" / "scripts" / "fixtures" / "markets"
PROVIDER = "SIMULATED_FIXTURE"
TODAY = date(2026, 1, 2)
DAYS = 420
# Market loadings for the stand-in histories; anything else gets 1.0.
BETAS = {"SPY": 1.0, "IWM": 1.2, "IWD": 0.9, "MTUM": 1.05, "QUAL": 0.95, "USMV": 0.7}


def _history(ticker: str, start: Any = None) -> pd.DataFrame:
    """A seeded OHLCV history: market factor x beta plus ticker noise."""
    market = np.random.default_rng(0).normal(0.0003, 0.011, DAYS)
    rng = np.random.default_rng(zlib.crc32(ticker.upper().encode()))
    beta = BETAS.get(ticker.upper(), 1.0)
    noise = 0.0 if ticker.upper() == "SPY" else 0.008
    returns = beta * market + rng.normal(0.0001, noise or 1e-12, DAYS)
    close = (80.0 + (zlib.crc32(ticker.encode()) % 300)) * np.exp(np.cumsum(returns))
    spread = np.abs(rng.normal(0.0, 0.006, DAYS))
    open_ = close * np.exp(rng.normal(0.0, 0.004, DAYS))
    return pd.DataFrame(
        {
            "Date": pd.bdate_range("2023-01-02", periods=DAYS),
            "Open": open_,
            "High": np.maximum(open_, close) * (1 + spread),
            "Low": np.minimum(open_, close) * (1 - spread),
            "Close": close,
            "Volume": rng.integers(2_000_000, 9_000_000, DAYS).astype(float),
            "Provider": PROVIDER,
        }
    )


class _Service:
    def __init__(self, provider: str = "yfinance") -> None:
        self.provider = provider

    def get_data(self, ticker: str, start: Any = None, *args: Any, **kwargs: Any) -> pd.DataFrame:
        return _history(ticker, start)


class _FrozenDate(date):
    @classmethod
    def today(cls) -> "_FrozenDate":
        return cls(TODAY.year, TODAY.month, TODAY.day)


class _FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz: Any = None) -> "_FrozenDatetime":
        return cls(TODAY.year, TODAY.month, TODAY.day, 21, 0, tzinfo=tz or timezone.utc)


class _YahooTicker:
    """Just enough of ``yfinance.Ticker`` for the market-chain route."""

    SPOT = 500.0

    def __init__(self, symbol: str) -> None:
        self.symbol = symbol
        self.fast_info = {"last_price": self.SPOT}
        self.options = tuple(
            (TODAY + timedelta(days=d)).isoformat() for d in (7, 14, 28, 49, 77, 168)
        )

    def option_chain(self, expiry: str) -> SimpleNamespace:
        from src.pricing import black_scholes

        T = (date.fromisoformat(expiry) - TODAY).days / 365.0
        rows: Dict[str, list] = {"call": [], "put": []}
        for strike in np.arange(400.0, 601.0, 10.0):
            m = math.log(strike / self.SPOT)
            iv = 0.18 - 0.25 * m + 0.6 * m * m + 0.02 * math.sqrt(T)
            for kind in ("call", "put"):
                mid = black_scholes.calculate_option_price(self.SPOT, strike, T, 0.05, iv, 0.0, kind)
                tick = max(0.01, round(mid * 0.01, 2))
                itm = strike < self.SPOT if kind == "call" else strike > self.SPOT
                rows[kind].append(
                    {
                        "contractSymbol": f"{self.symbol}{expiry.replace('-', '')[2:]}"
                        f"{'C' if kind == 'call' else 'P'}{int(strike * 1000):08d}",
                        "strike": strike,
                        "lastPrice": round(mid, 2),
                        "bid": round(max(mid - tick, 0.0), 2),
                        "ask": round(mid + tick, 2),
                        "impliedVolatility": iv,
                        "volume": float(int(5000 * math.exp(-40 * m * m))),
                        "openInterest": float(int(20000 * math.exp(-30 * m * m))),
                        "inTheMoney": itm,
                        "lastTradeDate": pd.Timestamp(f"{TODAY.isoformat()}T20:59:00Z"),
                    }
                )
        return SimpleNamespace(calls=pd.DataFrame(rows["call"]), puts=pd.DataFrame(rows["put"]))


def _fact(fy: int, end: str, val: float, filed: str, accn: str, start: str | None) -> dict:
    item = {"fy": fy, "fp": "FY", "form": "10-K", "end": end, "val": val,
            "filed": filed, "accn": accn}
    if start:
        item["start"] = start
    return item


def _companyfacts() -> dict:
    """Two stub 10-Ks; the second restates the prior year's revenue."""
    a = ("0000000000-24-000001", "2024-02-15")
    b = ("0000000000-25-000001", "2025-02-14")

    def flow(v22: float, v23: float, v23r: float, v24: float) -> list:
        return [
            _fact(2023, "2022-12-31", v22, a[1], a[0], "2022-01-01"),
            _fact(2023, "2023-12-31", v23, a[1], a[0], "2023-01-01"),
            _fact(2024, "2023-12-31", v23r, b[1], b[0], "2023-01-01"),
            _fact(2024, "2024-12-31", v24, b[1], b[0], "2024-01-01"),
        ]

    def stock(v23: float, v24: float) -> list:
        return [
            _fact(2023, "2023-12-31", v23, a[1], a[0], None),
            _fact(2024, "2024-12-31", v24, b[1], b[0], None),
        ]

    usd = lambda items: {"units": {"USD": items}}  # noqa: E731
    return {
        "entityName": "Simulated Fixture Corp",
        "facts": {
            "us-gaap": {
                "Revenues": usd(flow(1000.0, 1100.0, 1080.0, 1210.0)),
                "GrossProfit": usd(flow(400.0, 450.0, 440.0, 500.0)),
                "OperatingIncomeLoss": usd(flow(150.0, 170.0, 165.0, 200.0)),
                "NetIncomeLoss": usd(flow(100.0, 120.0, 118.0, 140.0)),
                "NetCashProvidedByUsedInOperatingActivities": usd(flow(130.0, 150.0, 150.0, 175.0)),
                "Assets": usd(stock(2000.0, 2200.0)),
                "AssetsCurrent": usd(stock(800.0, 900.0)),
                "Liabilities": usd(stock(1200.0, 1250.0)),
                "LiabilitiesCurrent": usd(stock(500.0, 520.0)),
                "StockholdersEquity": usd(stock(800.0, 950.0)),
                "CashAndCashEquivalentsAtCarryingValue": usd(stock(300.0, 340.0)),
            }
        },
    }


_CHUNKS = [
    {
        "ticker": "SIMF",
        "organization_id": 1,
        "user_id": 1,
        "source_file": "simf-10k-2024.htm",
        "page_number": 41,
        "text": "Revenue increased 12% to $1,210 million, driven by higher unit volume.",
    },
    {
        "ticker": "SIMF",
        "organization_id": 1,
        "user_id": 1,
        "source_file": "simf-10k-2024.htm",
        "page_number": 18,
        "text": "Supplier concentration is a principal risk to gross margin.",
    },
]


def _round(value: Any, digits: int = 10) -> Any:
    """Round floats to significant digits so fixtures are small and stable."""
    if isinstance(value, float):
        return float(f"{value:.{digits}g}") if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: _round(v, digits) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_round(v, digits) for v in value]
    return value


def build_payloads() -> Dict[str, Any]:
    """Call every Markets route with stand-in data; return name -> payload."""
    import backend.monte_carlo_study as mc_study
    import src.data.fundamentals as fundamentals_data
    import src.data.market_data as market_data
    import src.rag.ingest as rag_ingest
    from backend.routes import backtest, factors, fundamentals, portfolio, pricing, research, risk
    from src.rag import edgar
    from src.rag.rag_answer import generate_grounded_answer

    request = SimpleNamespace(state=SimpleNamespace(organization_id=1, user_id=1))
    calls: Dict[str, Callable[[], Any]] = {
        "options-price-call": lambda: pricing.option_price(
            S=100.0, K=105.0, T=0.25, r=0.05, sigma=0.2, q=0.01, type="call"),
        "options-price-put": lambda: pricing.option_price(
            S=100.0, K=105.0, T=0.25, r=0.05, sigma=0.2, q=0.01, type="put"),
        "options-strategy": lambda: pricing.option_strategy(pricing.StrategyRequest(
            S=100.0, sigma=0.2, T=0.25, legs=[
                pricing.StrategyLeg(type="call", side="long", strike=100.0, qty=1),
                pricing.StrategyLeg(type="call", side="short", strike=110.0, qty=1),
            ])),
        "options-chain": lambda: pricing.option_chain("SIMF", r=0.05, q=0.0, n_strikes=9, band=0.18),
        "options-market-chain": lambda: pricing.market_option_chain(
            "SIMF", target_days=30, moneyness_band=0.3, r=0.05, q=0.0),
        "vol-surface": lambda: pricing.vol_surface("SIMF", r=0.05, q=0.0, allow_synthetic=True),
        "risk-dashboard": lambda: risk.risk_dashboard("SIMF", benchmark="SPY", notional=100_000.0),
        "risk-montecarlo": lambda: risk.montecarlo(
            "SIMF", horizon_days=63, n=2_000, conf=0.95, seed=42, include_paths=False),
        "factors": lambda: factors.factor_exposures("SIMF", lookback_days=540),
        "portfolio": lambda: portfolio.portfolio_risk(portfolio.PortfolioRequest(holdings=[
            portfolio.Holding(ticker="SIMF", weight=0.5),
            portfolio.Holding(ticker="SPY", weight=0.3),
            portfolio.Holding(ticker="IWM", weight=0.2),
        ])),
        "backtest": lambda: backtest.backtest(
            "SIMF", strategy="sma_cross", fast=20, slow=50, rsi_period=14, rsi_low=30.0, rsi_high=70.0),
        "fundamentals": lambda: fundamentals.fundamentals("SIMF", as_of="2025-06-30"),
        "fundamentals-before-restatement": lambda: fundamentals.fundamentals("SIMF", as_of="2024-06-30"),
        "research-fetch": lambda: research.fetch_filings(request, "SIMF"),
        "research-ask": lambda: research.ask(
            request, q="What drove revenue growth?", ticker="SIMF", provider="none"),
    }

    with ExitStack() as stack:
        for target in (
            "src.data.market_data.MarketDataService",
            "backend.routes.backtest.MarketDataService",
            "backend.routes.portfolio.MarketDataService",
            "backend.routes.factors.MarketDataService",
            "backend.monte_carlo_study.MarketDataService",
        ):
            stack.enter_context(patch(target, _Service))
        stack.enter_context(patch("backend.routes.pricing.date", _FrozenDate))
        stack.enter_context(patch("backend.routes.pricing.datetime", _FrozenDatetime))
        stack.enter_context(patch("yfinance.Ticker", _YahooTicker))
        stack.enter_context(patch.object(fundamentals_data, "get_cik", lambda t: "0000000000"))
        stack.enter_context(patch.object(fundamentals_data, "fetch_companyfacts", lambda c: _companyfacts()))
        stack.enter_context(patch.object(
            edgar, "fetch_filings_for_ticker",
            lambda t, forms, limit: ([Path("simf-10k-2024.htm"), Path("simf-10q-2025q1.htm")], Path("."))))
        stack.enter_context(patch.object(
            rag_ingest, "ingest_documents", lambda **kw: (None, _CHUNKS * 64)))
        stack.enter_context(patch.object(rag_ingest, "load_index", lambda d: (object(), _CHUNKS)))
        stack.enter_context(patch.object(
            rag_ingest, "answer_question",
            lambda q, vs, chunks, **kw: generate_grounded_answer(q, chunks, provider="none")))
        pricing._market_chain_cache.clear()
        assert market_data and mc_study  # imported so the patch targets resolve
        payloads = {name: json.loads(json.dumps(call(), default=str)) for name, call in calls.items()}
    return {name: _round(payload) for name, payload in payloads.items()}


def shape(value: Any, path: str = "$") -> set[str]:
    """Every path in a payload with its JSON type; list items share one path."""
    if isinstance(value, dict):
        out = {f"{path}:object"}
        for key, item in value.items():
            out |= shape(item, f"{path}.{key}")
        return out
    if isinstance(value, list):
        out = {f"{path}:array"}
        for item in value:
            out |= shape(item, f"{path}[]")
        return out
    kind = (
        "null" if value is None
        else "boolean" if isinstance(value, bool)
        else "number" if isinstance(value, (int, float))
        else "string"
    )
    return {f"{path}:{kind}"}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    payloads = build_payloads()
    for stale in OUT.glob("*.simulated.json"):
        if stale.name.removesuffix(".simulated.json") not in payloads:
            stale.unlink()
    for name, payload in payloads.items():
        text = json.dumps(payload, indent=1, sort_keys=True, allow_nan=False) + "\n"
        (OUT / f"{name}.simulated.json").write_text(text, encoding="utf-8", newline="\n")
    print(f"Wrote {len(payloads)} simulated Markets fixtures to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
