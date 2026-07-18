"""Agriculture and trade/country intelligence API routes."""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from src.intelligence import (
    AgricultureIntelligenceService,
    CountryIntelligenceService,
    SnapshotStore,
)
from src.intelligence.services import COUNTRIES


router = APIRouter(prefix="/intelligence", tags=["intelligence"])


@router.get("/agriculture/overview")
def agriculture_overview(
    state: str = Query("Maharashtra", min_length=2, max_length=80),
    district: str | None = Query(None, max_length=80),
    commodity: str = Query("Onion", min_length=2, max_length=80),
    market: str | None = Query(None, max_length=80),
    latitude: float = Query(18.5204, ge=-90, le=90),
    longitude: float = Query(73.8567, ge=-180, le=180),
    limit: int = Query(100, ge=1, le=500),
) -> dict[str, Any]:
    """Return live-or-snapshotted mandi prices and seven-day weather alerts."""

    return AgricultureIntelligenceService().overview(
        state=state,
        district=district,
        commodity=commodity,
        market=market,
        latitude=latitude,
        longitude=longitude,
        limit=limit,
    )


@router.get("/country/{country_code}/pulse")
def country_pulse(
    country_code: str,
    as_of: date | None = Query(
        None,
        description="Historical information date for ALFRED-style vintage retrieval.",
    ),
    trade_year: int | None = Query(None, ge=2000, le=2100),
    partner_code: int = Query(0, ge=0),
    commodity_code: str = Query("10", pattern=r"^[A-Z0-9]{1,10}$"),
) -> dict[str, Any]:
    """Return a vintage-aware macro pulse with WTO and Comtrade context."""

    try:
        return CountryIntelligenceService().pulse(
            country_code,
            as_of=as_of,
            trade_year=trade_year,
            partner_code=partner_code,
            commodity_code=commodity_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/countries")
def supported_countries() -> dict[str, Any]:
    return {
        "countries": [
            {"code": code, "name": definition["name"]}
            for code, definition in COUNTRIES.items()
        ]
    }


@router.get("/snapshots/{provider}/{snapshot_id}")
def reproduce_snapshot(provider: str, snapshot_id: str) -> dict[str, Any]:
    """Return the immutable raw source version referenced by a displayed signal."""

    snapshot = SnapshotStore().get(provider, snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Snapshot not found.")
    return {
        "lineage": snapshot.lineage.to_dict(),
        "public_params": snapshot.public_params,
        "payload": snapshot.payload,
    }
