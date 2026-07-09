"""Tools the analyst agent can call — thin wrappers over the platform's engines.

Each tool returns a **compact** JSON-serializable dict (so the LLM's context stays
small) and imports its heavy dependencies lazily (so importing this registry is
cheap and side-effect-free). Tool errors are returned as ``{"error": ...}`` rather
than raised — the agent loop handles them gracefully.
"""

from __future__ import annotations

import datetime
from typing import Any, Dict


def _get_fundamentals(ticker: str) -> Dict[str, Any]:
    from src.data.fundamentals import extract_fundamentals
    d = extract_fundamentals(ticker)
    L, R = d.get("latest", {}), d.get("ratios", {})
    return {
        "ticker": d.get("ticker"), "fiscal_year": d.get("latest_year"),
        "revenue": L.get("revenue"), "net_income": L.get("net_income"),
        "gross_margin": R.get("gross_margin"), "net_margin": R.get("net_margin"),
        "roe": R.get("roe"), "roa": R.get("roa"),
        "debt_to_equity": R.get("debt_to_equity"), "revenue_growth": d.get("revenue_growth"),
    }


def _get_price_metrics(ticker: str) -> Dict[str, Any]:
    from src.analytics import calculate_summary_statistics
    from src.data.market_data import MarketDataService
    df = MarketDataService("yfinance").get_data(ticker)
    close = df.sort_values("Date")["Close"].astype(float)
    s = calculate_summary_statistics(close)
    return {
        "ticker": ticker.upper(), "last": float(close.iloc[-1]),
        "total_return": s.get("total_return"), "cagr": s.get("cagr"),
        "annualized_volatility": s.get("annualized_volatility"),
        "sharpe": s.get("sharpe_ratio"), "max_drawdown": s.get("max_drawdown"),
    }


def _get_news_sentiment(ticker: str) -> Dict[str, Any]:
    from src.news.news_feed import fetch_news
    from src.news.sentiment import score_headlines
    agg = score_headlines(fetch_news(ticker, 12))
    return {
        "ticker": ticker.upper(), "overall": agg["overall_label"],
        "score": agg["overall_score"], "counts": agg["counts"],
        "top_headlines": [i["title"] for i in agg["items"][:4]],
    }


def _shock_scenario(ticker: str, dep_ticker: str, shock_pct: float) -> Dict[str, Any]:
    from src.data.market_data import MarketDataService
    from src.graph import market_link as ml
    start = (datetime.date.today() - datetime.timedelta(days=400)).isoformat()
    svc = MarketDataService("yfinance")

    def rets(t: str):
        df = svc.get_data(t, start)
        return df.sort_values("Date").set_index("Date")["Close"].astype(float).pct_change().dropna()

    res = ml.shock_montecarlo(rets(ticker), rets(dep_ticker), float(shock_pct) / 100.0)
    if not res:
        return {"error": "insufficient overlapping history between the two tickers"}
    return {
        "ticker": ticker.upper(), "dependency": dep_ticker.upper(), "shock_pct": shock_pct,
        "beta": res["beta"], "expected_move": res["expected_move"],
        "shocked_median": res["shocked"]["median"], "prob_loss": res["shocked"]["prob_loss"],
    }


def _search_filings(ticker: str, query: str) -> Dict[str, Any]:
    from src.rag.ingest import load_index
    from src.rag.reranker import rerank_chunks
    from src.rag.retriever import hybrid_retrieve
    vs, chunks = load_index()
    if vs is None:
        return {"error": "no filings indexed yet — fetch filings on the Research tab first"}
    scoped = [c for c in chunks if c.get("ticker") == ticker.upper()] or chunks
    top = rerank_chunks(query, hybrid_retrieve(query, scoped, vector_store=vs, top_k=8), top_k=3)
    return {
        "query": query,
        "snippets": [{"text": (c.get("text") or "")[:300],
                      "source": c.get("source_file"), "page": c.get("page_number")} for c in top],
    }


TOOLS: Dict[str, Dict[str, Any]] = {
    "get_fundamentals": {
        "description": "Annual financials & ratios (revenue, net income, gross/net margin, ROE, ROA, "
                       "debt/equity, revenue growth) from SEC filings. US tickers only.",
        "parameters": {"ticker": "stock symbol e.g. AAPL"},
        "fn": _get_fundamentals,
    },
    "get_price_metrics": {
        "description": "Price-based metrics: last price, total return, CAGR, annualized volatility, "
                       "Sharpe ratio, max drawdown.",
        "parameters": {"ticker": "stock symbol"},
        "fn": _get_price_metrics,
    },
    "get_news_sentiment": {
        "description": "Recent news headlines and aggregate bullish/neutral/bearish sentiment.",
        "parameters": {"ticker": "stock symbol"},
        "fn": _get_news_sentiment,
    },
    "shock_scenario": {
        "description": "Monte Carlo: how the stock's expected return shifts if a dependency ticker "
                       "moves by shock_pct percent (e.g. dep_ticker='TSM', shock_pct=-10).",
        "parameters": {"ticker": "the stock", "dep_ticker": "dependency stock symbol",
                       "shock_pct": "percent move, e.g. -10"},
        "fn": _shock_scenario,
    },
    "search_filings": {
        "description": "Search the company's indexed SEC filings for a query; returns cited snippets. "
                       "Requires filings to have been fetched on the Research tab.",
        "parameters": {"ticker": "the stock", "query": "what to look for"},
        "fn": _search_filings,
    },
}
