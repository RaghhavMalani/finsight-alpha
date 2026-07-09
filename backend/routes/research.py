"""Research route: auto-fetch SEC filings, index them, and answer questions."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query

from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/research", tags=["research"])


@router.post("/fetch/{ticker}")
def fetch_filings(ticker: str) -> Dict[str, Any]:
    """Auto-fetch the latest 10-K/10-Q from EDGAR and build the RAG index."""
    from src.rag.edgar import EdgarError, fetch_filings_for_ticker
    from src.rag.ingest import ingest_documents

    try:
        paths, dest = fetch_filings_for_ticker(ticker, forms=("10-K", "10-Q"), limit=1)
    except EdgarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"EDGAR fetch failed: {exc}") from exc

    try:
        _, chunks = ingest_documents(source=dest, ticker=ticker.upper(), index_dir="data/rag_index")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}") from exc

    return {"ticker": ticker.upper(), "files": [p.name for p in paths], "chunks": len(chunks)}


@router.get("/ask")
def ask(
    q: str = Query(..., description="The question."),
    ticker: Optional[str] = Query(None, description="Scope to a ticker."),
    provider: str = Query("auto", description="LLM provider."),
) -> Dict[str, Any]:
    """Answer a question against the current document index (grounded + cited)."""
    from src.rag.ingest import answer_question, load_index

    vs, chunks = load_index()
    if vs is None:
        raise HTTPException(
            status_code=404,
            detail="No document index yet. POST /research/fetch/{ticker} first.",
        )
    res = answer_question(q, vs, chunks, ticker=ticker, provider=provider)
    return {
        "answer": res.get("answer", ""),
        "grounded": res.get("grounded", False),
        "provider": res.get("provider"),
        "citations": res.get("citations", []),
    }
