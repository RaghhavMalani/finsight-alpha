"""Research route: auto-fetch SEC filings, index them, and answer questions."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from src.rag.namespace import ResearchNamespace
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/research", tags=["research"])


@router.post("/fetch/{ticker}")
def fetch_filings(request: Request, ticker: str) -> Dict[str, Any]:
    """Auto-fetch the latest 10-K/10-Q from EDGAR and build the RAG index."""
    scope = ResearchNamespace(
        request.state.organization_id, request.state.user_id, ticker
    )
    from src.rag.edgar import EdgarError, fetch_filings_for_ticker
    from src.rag.ingest import ingest_documents

    try:
        paths, dest = fetch_filings_for_ticker(
            scope.ticker, forms=("10-K", "10-Q"), limit=1
        )
    except EdgarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"EDGAR fetch failed: {exc}"
        ) from exc

    try:
        _, chunks = ingest_documents(
            source=dest,
            ticker=scope.ticker,
            index_dir=scope.index_dir(),
            organization_id=scope.organization_id,
            user_id=scope.user_id,
            overwrite_ticker=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}") from exc

    return {
        "ticker": scope.ticker,
        "files": [p.name for p in paths],
        "chunks": len(chunks),
    }


@router.get("/ask")
def ask(
    request: Request,
    q: str = Query(..., description="The question."),
    ticker: str = Query(..., description="Required company evidence scope."),
    provider: str = Query("auto", description="LLM provider."),
) -> Dict[str, Any]:
    """Answer a question against the current document index (grounded + cited)."""
    from src.rag.ingest import NoEvidenceError, answer_question, load_index

    scope = ResearchNamespace(
        request.state.organization_id, request.state.user_id, ticker
    )
    vs, chunks = load_index(scope.index_dir())
    if vs is None:
        raise HTTPException(
            status_code=404,
            detail="No document index yet. POST /research/fetch/{ticker} first.",
        )
    try:
        res = answer_question(
            q,
            vs,
            chunks,
            ticker=scope.ticker,
            organization_id=scope.organization_id,
            user_id=scope.user_id,
            provider=provider,
        )
    except NoEvidenceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "answer": res.get("answer", ""),
        "grounded": res.get("grounded", False),
        "provider": res.get("provider"),
        "citations": res.get("citations", []),
    }
