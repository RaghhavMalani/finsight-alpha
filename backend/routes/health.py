"""Liveness, readiness, dependency, and pipeline-health routes."""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text

from src import config
from src.auth.db import get_session
from src.data.pipeline_health import latest_runs

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": config.APP_NAME, "version": config.APP_VERSION}


@router.get("/health/ready")
def readiness() -> dict:
    """Fail readiness when durable metadata storage is unusable."""
    try:
        config.validate_runtime_config()
        with get_session() as session:
            session.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Metadata database unavailable: {exc}") from exc
    return {
        "status": "ready",
        "environment": config.APP_ENV,
        "database": "postgresql" if config.DATABASE_URL else "sqlite-development-only",
        "durable_production_storage": bool(config.DATABASE_URL),
        "error_reporting": "configured" if config.SENTRY_DSN else "unconfigured",
    }


@router.get("/health/pipelines")
def pipeline_health(request: Request) -> dict:
    """Latest ingestion outcome, isolated to the active organization."""
    organization_id = getattr(request.state, "organization_id", None)
    if not organization_id:
        raise HTTPException(status_code=401, detail="Organization context required")
    runs = latest_runs(organization_id)
    return {
        "status": "AVAILABLE" if runs else "UNAVAILABLE",
        "organization_id": organization_id,
        "pipelines": runs,
        "reason": None if runs else "No pipeline run has been recorded for this organization.",
    }


@router.get("/health/llm")
def health_llm(probe: bool = True) -> dict:
    from src.rag import llm_client

    available = [provider for provider in llm_client.available_providers() if provider != "none"]
    resolved = llm_client._resolve_auto_provider()
    detail: dict = {
        "available_providers": available,
        "auto_resolves_to": resolved,
        "default_override": os.getenv("FINSIGHT_LLM_PROVIDER") or None,
        "azure_configured": bool(
            os.getenv("AZURE_OPENAI_API_KEY")
            and os.getenv("AZURE_OPENAI_ENDPOINT")
            and os.getenv("AZURE_OPENAI_DEPLOYMENT")
        ),
    }
    if probe and resolved != "none":
        result = llm_client.generate(
            "Reply with the single word: OK", provider="auto", temperature=0.0, timeout=30.0
        )
        detail["probe"] = {
            "provider": result.provider,
            "model": result.model,
            "ok": result.ok,
            "reply": (result.text or "")[:80],
            "error": result.error,
        }
        detail["status"] = "ok" if result.ok else "error"
    else:
        detail["status"] = "ok" if available else "no-provider"
    return detail
