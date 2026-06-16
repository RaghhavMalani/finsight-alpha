"""Dependency-graph route: a company's supply-chain / dependency network.

GET /graph/{ticker} builds the graph (LLM-extracted, optionally grounded in the
local RAG index), enriches any node that maps to a known ticker with recent
market metrics, and returns both the plain graph and a Cytoscape-ready payload
the front-end can render directly.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query

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
