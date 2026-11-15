"""Truth-layer reads: point-in-time fundamentals from admitted SEC filings. Never fetches upstream."""

from fastapi import APIRouter, HTTPException, Query, Request

from backend.routes.data_organ import service
from src.truth.fundamentals import FundamentalsBook

router = APIRouter(prefix="/truth", tags=["truth"])


@router.get("/fundamentals")
def fundamentals(
    request: Request,
    ticker: str = Query(min_length=1, max_length=24),
    field: str = Query(min_length=1, max_length=64),
    as_of: str = Query(description="Timezone-aware ISO-8601 instant"),
    max_age_days: int | None = Query(None, ge=1, le=36500),
):
    """Latest value whose filing was available at as_of, with its filing provenance.

    The answer is AVAILABLE, NOT_MEASURED (value null, with a reason) or AMBIGUOUS; a missing value
    is never reported as zero. Tenant-local and local-only, like the other Data Organ reads.
    """
    svc, tenant_id = service(request)
    try:
        book = FundamentalsBook.from_registry(svc.registry, tenant_id)
        return book.fundamentals(ticker, field, as_of, max_age_days=max_age_days).to_dict()
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
