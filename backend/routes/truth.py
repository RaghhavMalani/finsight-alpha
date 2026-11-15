"""Truth-layer reads: point-in-time fundamentals from admitted SEC filings. Never fetches upstream."""

from datetime import datetime

import duckdb
from fastapi import APIRouter, HTTPException, Query, Request

from backend.routes.data_organ import service
from src.data_organ.sec_edgar import FIELDS
from src.truth.fundamentals import FundamentalsBook

router = APIRouter(prefix="/truth", tags=["truth"])


@router.get("/fundamentals")
def fundamentals(
    request: Request,
    ticker: str = Query(min_length=1, max_length=24),
    field: str = Query(min_length=1, max_length=64),
    as_of: str = Query(max_length=40, description="Timezone-aware ISO-8601 instant"),
    max_age_days: int | None = Query(None, ge=1, le=36500),
):
    """Latest value whose filing was available at as_of, with its filing provenance.

    The answer is AVAILABLE, NOT_MEASURED (value null, with a reason) or AMBIGUOUS; a missing value
    is never reported as zero. Tenant-local and local-only, like the other Data Organ reads.
    """
    # Caller mistakes are 422. Anything wrong with the stored evidence is 503: never the caller's fault.
    if field not in FIELDS:
        raise HTTPException(422, "Undeclared fundamentals field")
    try:
        if datetime.fromisoformat(as_of.replace("Z", "+00:00")).tzinfo is None:
            raise ValueError
    except ValueError:
        raise HTTPException(422, "as_of must be a timezone-aware ISO-8601 instant") from None
    try:
        svc, tenant_id = service(request)
        book = FundamentalsBook.from_registry(svc.registry, tenant_id)
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError, OSError, duckdb.Error):
        raise HTTPException(503, "Fundamentals evidence is unavailable: the registry failed its integrity check") from None
    try:
        return book.fundamentals(ticker, field, as_of, max_age_days=max_age_days).to_dict()
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
