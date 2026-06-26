"""Dependency-graph route: a company's supply-chain / dependency network.

GET /graph/{ticker} builds the graph (LLM-extracted, optionally grounded in the
local RAG index), enriches any node that maps to a known ticker with recent
market metrics, and returns both the plain graph and a Cytoscape-ready payload
the front-end can render directly.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from src import config
from src.graph.dependency_graph import build_dependency_graph
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/graph", tags=["graph"])


def _ground_context(ticker: str):
    """Retrieve top chunks from the local RAG index to ground the graph, if any."""
    try:
        from src.rag.ingest import load_index
        from src.rag.retriever import hybrid_retrieve

        vs, chunks = load_index()
        if vs is None:
            return None
        return hybrid_retrieve(
            "business segments suppliers customers competitors commodities risks",
            chunks, vector_store=vs, top_k=8,
        )
    except Exception as exc:  # grounding is best-effort, never fatal
        logger.warning("Graph grounding failed: %s", exc)
        return None


def _metrics_for_nodes(graph) -> Dict[str, Dict[str, Any]]:
    """Best-effort recent metrics for nodes that carry a ticker (from local data)."""
    from src.data import storage

    out: Dict[str, Dict[str, Any]] = {}
    for node in graph.nodes:
        tk = node.get("ticker")
        if not tk or tk in out:
            continue
        try:
            df = storage.load_processed_ticker_data(tk)
            if df is None or df.empty:
                continue
            df = df.sort_values("Date")
            last = df.iloc[-1]
            out[tk] = {
                "last_close": _num(last.get("Close")),
                "cumulative_return": _num(last.get("cumulative_return")),
                "rolling_volatility": _num(last.get("rolling_volatility")),
            }
        except Exception:
            continue
    return out


def _num(value: Any) -> Optional[float]:
    try:
        import math

        f = float(value)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


@router.get("/{ticker}")
def get_dependency_graph(
    ticker: str,
    provider: str = Query("ollama", description="LLM: ollama|groq|gemini|openai|anthropic|auto|none"),
    model: Optional[str] = Query(None, description="Model override."),
    ground: bool = Query(False, description="Ground the graph in the local RAG index."),
    enrich: bool = Query(True, description="Attach recent market metrics to ticker nodes."),
    name: Optional[str] = Query(None, description="Company name override."),
) -> Dict[str, Any]:
    """Build and return a company's dependency graph.

    Always succeeds with at least the deterministic config-based graph (sector
    peers + benchmark) even when no LLM is reachable.
    """
    company_name = name or config.get_display_name(ticker)
    context = _ground_context(ticker) if ground else None

    try:
        graph = build_dependency_graph(
            company_name, ticker, context_chunks=context, provider=provider, model=model
        )
    except Exception as exc:  # build_dependency_graph shouldn't raise, but be safe
        raise HTTPException(status_code=500, detail=f"Graph build failed: {exc}") from exc

    if enrich:
        graph.attach_metrics(_metrics_for_nodes(graph))

    payload = graph.to_dict()
    payload["cytoscape"] = graph.to_cytoscape()
    return payload


def _norm_ticker(t: str) -> str:
    """Normalize an LLM-provided ticker to a yfinance symbol (strip a '.US' suffix)."""
    t = str(t).strip().upper()
    return t[:-3] if t.endswith(".US") else t


@router.get("/sensitivity/{ticker}")
def graph_sensitivity(
    ticker: str,
    provider: str = Query("ollama"),
    ground: bool = Query(False),
    with_news: bool = Query(True),
) -> Dict[str, Any]:
    """Dependency graph enriched with each node's market sensitivity to the focal
    stock, recent performance, and news.

    For every dependency that maps to a tradable ticker we regress the focal
    stock's daily returns on the dependency's returns: ``beta`` is the historical
    move in the focal stock per +1% move in the dependency. This is the honest,
    data-driven version of "how the stock moves if a dependency moves" (an
    HSMM/TFT forecasting layer is a separate, future effort).
    """
    import datetime
    import re

    from src.data.market_data import MarketDataService
    from src.data.providers import ProviderError
    from src.graph import market_link as ml

    company_name = config.get_display_name(ticker)
    context = _ground_context(ticker) if ground else None
    graph = build_dependency_graph(company_name, ticker, context_chunks=context, provider=provider)

    start = (datetime.date.today() - datetime.timedelta(days=300)).isoformat()
    svc = MarketDataService("yfinance")

    def closes(tk: str):
        try:
            df = svc.get_data(tk, start)
        except (ProviderError, Exception):
            return None
        if df is None or df.empty:
            return None
        return df.sort_values("Date").set_index("Date")["Close"].astype(float)

    focal_close = closes(ticker)
    focal_ret = focal_close.pct_change().dropna() if focal_close is not None else None
    company_id = graph.nodes[0]["id"]

    # The focal company's own news, scanned later for cross-mentions of each
    # dependency (a proxy for contract / relationship headlines).
    focal_news = []
    if with_news:
        try:
            from src.news.news_feed import fetch_news as _fn
            focal_news = _fn(ticker, 25)
        except Exception:
            focal_news = []

    def relation_for(nid: str) -> str:
        for e in graph.edges:
            if nid in (e["source"], e["target"]):
                return e["relation"]
        return "related"

    sens = []
    by_id: Dict[str, Dict[str, Any]] = {}
    for n in graph.nodes:
        if n["id"] == company_id or not n.get("ticker"):
            continue
        ntk = _norm_ticker(n["ticker"])
        item: Dict[str, Any] = {
            "id": n["id"], "ticker": ntk, "label": n["label"],
            "category": n["category"], "relation": relation_for(n["id"]),
            "beta": None, "corr": None, "r2": None, "ret_1m": None, "ret_3m": None,
            "last": None, "change_pct": None, "trend": "n/a",
            "lead_lag": None, "rolling_corr": [], "headlines": [],
        }
        try:
            dep_close = closes(ntk)
            if dep_close is not None:
                item.update(ml.perf(dep_close))
                dep_ret = dep_close.pct_change().dropna()
                if focal_ret is not None:
                    lk = ml.link(focal_ret, dep_ret)
                    item["beta"], item["corr"], item["r2"] = lk["beta"], lk["corr"], lk["r2"]
                    item["lead_lag"] = ml.lead_lag(focal_ret, dep_ret)
                    item["rolling_corr"] = ml.rolling_corr(focal_ret, dep_ret)
        except Exception:
            pass  # one bad dependency must never break the whole analysis
        if with_news:
            try:
                from src.news.news_feed import fetch_news
                from src.news.sentiment import score_text
                own = [{"title": h["title"], "url": h["url"], "kind": "company", **score_text(h["title"])}
                       for h in fetch_news(ntk, 2)]
                toks = [w for w in re.split(r"[^a-z]+", item["label"].lower()) if len(w) > 3][:3]
                rel = [{"title": h["title"], "url": h["url"], "kind": "relation", **score_text(h["title"])}
                       for h in focal_news
                       if toks and any(t in h["title"].lower() for t in toks)]
                item["headlines"] = (rel + own)[:4]
            except Exception:
                item["headlines"] = []
        sens.append(item)
        by_id[n["id"]] = item

    for n in graph.nodes:
        if n["id"] in by_id and by_id[n["id"]].get("beta") is not None:
            n["beta"] = by_id[n["id"]]["beta"]
            n["ret_1m"] = by_id[n["id"]].get("ret_1m")

    sens.sort(key=lambda x: abs(x.get("beta") or 0), reverse=True)
    payload = graph.to_dict()
    payload["cytoscape"] = graph.to_cytoscape()
    payload["sensitivities"] = sens
    payload["focal"] = ticker.upper()
    return payload


class GraphMCRequest(BaseModel):
    ticker: str
    dep: str
    shock: float = 0.05
    horizon: int = 21
    n: int = 4000


@router.post("/montecarlo")
def graph_montecarlo(req: GraphMCRequest) -> Dict[str, Any]:
    """Shock-propagation Monte Carlo: how the focal stock's horizon-return
    distribution shifts if a dependency takes a given shock (via regression beta)."""
    import datetime

    from src.data.market_data import MarketDataService
    from src.data.providers import ProviderError
    from src.graph import market_link as ml

    start = (datetime.date.today() - datetime.timedelta(days=300)).isoformat()
    svc = MarketDataService("yfinance")

    def returns(tk: str):
        try:
            df = svc.get_data(tk, start)
        except (ProviderError, Exception):
            return None
        if df is None or df.empty:
            return None
        return df.sort_values("Date").set_index("Date")["Close"].astype(float).pct_change().dropna()

    focal_ret = returns(req.ticker)
    dep_ret = returns(_norm_ticker(req.dep))
    if focal_ret is None:
        raise HTTPException(status_code=404, detail=f"No data for '{req.ticker}'.")
    if dep_ret is None:
        raise HTTPException(status_code=404, detail=f"No data for dependency '{req.dep}'.")

    res = ml.shock_montecarlo(focal_ret, dep_ret, req.shock, req.horizon, req.n)
    if res is None:
        raise HTTPException(status_code=422, detail="Insufficient overlapping history.")
    res["ticker"] = req.ticker.upper()
    res["dep"] = _norm_ticker(req.dep)
    res["shock"] = req.shock
    return res
