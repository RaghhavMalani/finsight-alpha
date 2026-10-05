"""Authenticated through the Dynamics router; calculations are read-only."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import ValidationError

from src.dynamics.market_regime_inputs import RegimeInputError
from src.dynamics.market_regime_projection import (
    RegimeEvidenceError,
    load_lab,
    world_catalog,
)

router = APIRouter(prefix="/regime-intelligence", tags=["market regime intelligence"])


@router.get("/worlds")
def regime_worlds() -> dict:
    return world_catalog()


@router.get("")
def market_regime_intelligence(
    world: str = Query(
        default="demo-full", pattern="^(demo-full|demo-sparse|pit-local)$"
    ),
    as_of: str | None = Query(default=None, max_length=64),
) -> dict:
    try:
        return load_lab(world, as_of)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RegimeEvidenceError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (RegimeInputError, ValidationError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
