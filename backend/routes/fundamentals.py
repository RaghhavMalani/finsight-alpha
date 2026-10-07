"""Fundamentals route: real financial statements + ratios from SEC EDGAR."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/fundamentals", tags=["fundamentals"])


@router.get("/{ticker}")
def fundamentals(
    ticker: str,
    as_of: Optional[str] = Query(
        None, description="ISO date; only filings dated on or before it are used"
    ),
) -> Dict[str, Any]:
    """Annual financials + ratios for a US ticker (EDGAR XBRL, cached)."""
    from src.data.as_of import AsOfContext
    from src.data.fundamentals import extract_fundamentals
    from src.rag.edgar import EdgarError

    cutoff = None
    if as_of is not None:
        try:
            cutoff = AsOfContext.bind(as_of).date.isoformat()
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=422, detail=f"as_of must be an ISO date, got '{as_of}'."
            ) from exc
    try:
        return extract_fundamentals(ticker, as_of=cutoff)
    except EdgarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Fundamentals failed: {exc}") from exc
