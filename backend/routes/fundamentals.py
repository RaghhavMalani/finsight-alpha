"""Fundamentals route: real financial statements + ratios from SEC EDGAR."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/fundamentals", tags=["fundamentals"])


@router.get("/{ticker}")
def fundamentals(ticker: str) -> Dict[str, Any]:
    """Annual financials + ratios for a US ticker (EDGAR XBRL, cached)."""
    from src.data.fundamentals import extract_fundamentals
    from src.rag.edgar import EdgarError

    try:
        return extract_fundamentals(ticker)
    except EdgarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Fundamentals failed: {exc}") from exc
