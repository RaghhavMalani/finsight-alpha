"""Authenticated, read-only product API. Ingestion is an operator CLI."""

from fastapi import APIRouter, HTTPException

from src.dynamics.market_regime_projection import RegimeEvidenceError
from src.regime_intelligence import service

router = APIRouter(prefix="/regime-product", tags=["Market Regime Intelligence"])


def read(operation, *args):
    try:
        return operation(*args)
    except FileNotFoundError as error:
        raise HTTPException(
            404, "UNAVAILABLE: publication-evidenced input not installed"
        ) from error
    except RegimeEvidenceError as error:
        raise HTTPException(
            409, "Frozen analytics evidence failed validation"
        ) from error
    except (ValueError, TypeError) as error:
        raise HTTPException(422, str(error)) from error
    except TimeoutError as error:
        raise HTTPException(503, "Replay is still computing; retry") from error


@router.get("/assets")
def assets():
    return read(service.catalog)


@router.get("/snapshot")
def snapshot(asset: str = "SPY", as_of: str | None = None, source: str = "real"):
    return read(service.snapshot, asset, as_of, source)


@router.get("/compare")
def compare(asset: str, left: str, right: str, source: str = "real"):
    return read(service.compare, asset, left, right, source)
