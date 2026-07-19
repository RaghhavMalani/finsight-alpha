"""Agriculture and trade/country intelligence API routes."""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, Response

from src.data.intelligence import (
    agriculture_intelligence,
    satellite_image,
    trade_intelligence,
)
from src.data.license_policy import dataset_license_status, enforce_evidence_licenses
from src.data.pipeline_health import record_run
from src.intelligence import (
    AgricultureIntelligenceService,
    CompanyIntelligenceService,
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


@router.get("/company/{ticker}")
def company_intelligence(
    ticker: str,
    as_of: date | None = Query(
        None,
        description="Historical information date for ALFRED-style vintage retrieval.",
    ),
    trade_year: int | None = Query(None, ge=2000, le=2100),
) -> dict[str, Any]:
    """Return evidence selected from the active ticker's registered profile."""

    return CompanyIntelligenceService().overview(
        ticker,
        as_of=as_of,
        trade_year=trade_year,
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


@router.get("/agriculture")
def agriculture(
    request: Request,
    country: str = Query("IND", min_length=3, max_length=3),
) -> dict:
    try:
        result = agriculture_intelligence(country)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    products = [
        result["weather"],
        result["crop_yield"],
        result["production"],
        result["satellite"],
    ]
    rows = sum(len(product.get("points", [])) for product in products)
    errors = [
        product.get("reason")
        for product in products
        if product["status"] == "UNAVAILABLE"
    ]
    result["monitoring"] = record_run(
        organization_id=request.state.organization_id,
        pipeline_key="agriculture-intelligence",
        status=result["status"],
        rows_received=rows,
        metrics={
            "country": country.upper(),
            "available_products": len(products) - len(errors),
        },
        error="; ".join(error for error in errors if error) or None,
    )
    return enforce_evidence_licenses(result, request.state.organization_id)


@router.get("/agriculture/satellite")
def agriculture_satellite(
    request: Request,
    country: str = Query("IND", min_length=3, max_length=3),
    as_of: str = Query(..., min_length=10, max_length=10),
) -> Response:
    """Proxy validated NASA imagery so the browser never calls upstream."""

    license_status = dataset_license_status(
        request.state.organization_id,
        "nasa-gibs:MODIS_Terra_CorrectedReflectance_TrueColor",
    )
    if license_status["status"] != "ACTIVE":
        raise HTTPException(
            status_code=403,
            detail=f"Satellite evidence license status is {license_status['status']}.",
        )
    try:
        image, metadata = satellite_image(country, as_of)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(
        content=image,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-FinSight-Dataset-Version": metadata["version"],
            "X-FinSight-As-Of": metadata["as_of"],
        },
    )


@router.get("/trade")
def trade(
    request: Request,
    country: str = Query("IND", min_length=3, max_length=3),
) -> dict:
    try:
        result = trade_intelligence(country)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    rows = sum(len(series.get("points", [])) for series in result["series"])
    errors = [
        series.get("reason")
        for series in result["series"]
        if series["status"] == "UNAVAILABLE"
    ]
    result["monitoring"] = record_run(
        organization_id=request.state.organization_id,
        pipeline_key="trade-country-growth",
        status=result["status"],
        rows_received=rows,
        metrics={
            "country": country.upper(),
            "available_series": len(result["series"]) - len(errors),
        },
        error="; ".join(error for error in errors if error) or None,
    )
    return enforce_evidence_licenses(result, request.state.organization_id)


@router.get("/company-demand")
def company_demand() -> dict:
    return {
        "status": "UNAVAILABLE",
        "product": "Company Demand Radar",
        "reason": (
            "Choose a specific industry and register a licensed, versioned "
            "ground-truth dataset before producing company-demand evidence."
        ),
        "required_before_enablement": [
            "specific industry and decision use case",
            "licensed ground-truth target with availability dates",
            "versioned feature dataset and geography",
            "quality checks and out-of-sample validation protocol",
        ],
    }
