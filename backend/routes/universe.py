"""Search and coverage endpoints for the global instrument directory."""

from __future__ import annotations

from fastapi import APIRouter, Query

from src.data.universe import refresh_universe, search_universe, universe_stats

router = APIRouter(prefix="/universe", tags=["universe"])


def _set(value: str | None) -> set[str] | None:
    if not value:
        return None
    parsed = {part.strip().upper() for part in value.split(",") if part.strip()}
    return parsed or None


@router.get("/search")
def search(
    q: str = Query("", max_length=120),
    regions: str | None = Query(None, description="Comma-separated: US,IN"),
    asset_types: str | None = Query(
        None, description="Comma-separated: EQUITY,ETF,INDEX"
    ),
    limit: int = Query(100, ge=1, le=500),
) -> dict:
    """Search official exchange directories by symbol or issuer name."""
    return search_universe(q, _set(regions), _set(asset_types), limit)


@router.get("/stats")
def stats() -> dict:
    """Return source health and catalog coverage without the full payload."""
    return universe_stats()


@router.post("/refresh")
def refresh() -> dict:
    """Refresh exchange masters now; used by operators and scheduled jobs."""
    rows, sources = refresh_universe(force=True)
    return {"status": "refreshed", "rows": len(rows), "sources": sources}
