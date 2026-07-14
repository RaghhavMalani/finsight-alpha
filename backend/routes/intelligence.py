"""Evidence-backed agriculture and country intelligence endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, Response

from src.data.intelligence import agriculture_intelligence, satellite_image, trade_intelligence
from src.data.pipeline_health import record_run

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


@router.get("/agriculture")
def agriculture(request: Request, country: str = Query("IND", min_length=3, max_length=3)) -> dict:
    try:
        result = agriculture_intelligence(country)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    products = [result["weather"], result["crop_yield"], result["production"], result["satellite"]]
    rows = sum(len(product.get("points", [])) for product in products)
    errors = [product.get("reason") for product in products if product["status"] == "UNAVAILABLE"]
    result["monitoring"] = record_run(
        organization_id=request.state.organization_id,
        pipeline_key="agriculture-intelligence",
        status=result["status"],
        rows_received=rows,
        metrics={"country": country.upper(), "available_products": len(products) - len(errors)},
        error="; ".join(error for error in errors if error) or None,
    )
    return result


@router.get("/agriculture/satellite")
def agriculture_satellite(
    country: str = Query("IND", min_length=3, max_length=3),
    as_of: str = Query(..., min_length=10, max_length=10),
) -> Response:
    """Proxy validated NASA imagery so the browser never calls upstream."""
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
def trade(request: Request, country: str = Query("IND", min_length=3, max_length=3)) -> dict:
    try:
        result = trade_intelligence(country)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    rows = sum(len(series.get("points", [])) for series in result["series"])
    errors = [series.get("reason") for series in result["series"] if series["status"] == "UNAVAILABLE"]
    result["monitoring"] = record_run(
        organization_id=request.state.organization_id,
        pipeline_key="trade-country-growth",
        status=result["status"],
        rows_received=rows,
        metrics={"country": country.upper(), "available_series": len(result["series"]) - len(errors)},
        error="; ".join(error for error in errors if error) or None,
    )
    return result


@router.get("/company-demand")
def company_demand() -> dict:
    return {
        "status": "UNAVAILABLE",
        "product": "Company Demand Radar",
        "reason": "Choose a specific industry and register a licensed, versioned ground-truth dataset before producing company-demand evidence.",
        "required_before_enablement": [
            "specific industry and decision use case",
            "licensed ground-truth target with availability dates",
            "versioned feature dataset and geography",
            "quality checks and out-of-sample validation protocol",
        ],
    }
