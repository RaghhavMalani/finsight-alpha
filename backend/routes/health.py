"""Health check route."""

from __future__ import annotations

import os

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


@router.get("/health/llm")
def health_llm(probe: bool = True) -> dict:
    """Report which LLM providers are configured and (optionally) test one call.

    Open ``/health/llm`` to instantly see whether Azure (or any provider) is
    wired up correctly — no need to run a full agent loop. With ``?probe=false``
    it only reports configuration without spending a token.
    """
    from src.rag import llm_client

    avail = [p for p in llm_client.available_providers() if p != "none"]
    resolved = llm_client._resolve_auto_provider()

    detail: dict = {
        "available_providers": avail,
        "auto_resolves_to": resolved,
        "default_override": os.getenv("FINSIGHT_LLM_PROVIDER") or None,
        "azure_configured": bool(
            os.getenv("AZURE_OPENAI_API_KEY")
            and os.getenv("AZURE_OPENAI_ENDPOINT")
            and os.getenv("AZURE_OPENAI_DEPLOYMENT")
        ),
    }

    if probe and resolved != "none":
        res = llm_client.generate(
            "Reply with the single word: OK",
            provider="auto",
            temperature=0.0,
            timeout=30.0,
        )
        detail["probe"] = {
            "provider": res.provider,
            "model": res.model,
            "ok": res.ok,
            "reply": (res.text or "")[:80],
            "error": res.error,
        }
        detail["status"] = "ok" if res.ok else "error"
    else:
        detail["status"] = "ok" if avail else "no-provider"

    return detail
