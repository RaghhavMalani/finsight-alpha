"""Health check route."""

from __future__ import annotations

from fastapi import APIRouter

from src import config

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run / load balancers and the dashboard.

    Returns the service status, app name, and version.
    """
    return {
        "status": "ok",
        "app": config.APP_NAME,
        "version": config.APP_VERSION,
    }
