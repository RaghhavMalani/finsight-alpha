"""Agent route: the analyst agent runs a tool-calling loop and returns its trace.

Engine selection:
* When the Microsoft Agent Framework (``agent-framework``) is installed and Azure
  is configured, the request is served by the MAF agent (native tool calling on
  gpt-5-mini) — see :mod:`src.agent.maf_agent`.
* Otherwise (or if MAF errors at runtime) it falls back to the dependency-free
  hand-rolled ReAct loop in :mod:`src.agent.agent`, so the endpoint always works.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentRequest(BaseModel):
    question: str
    ticker: Optional[str] = None
    provider: str = "auto"
    max_steps: int = 6


def _run_legacy(req: "AgentRequest") -> Dict[str, Any]:
    """The provider-agnostic hand-rolled ReAct loop (sync)."""
    from src.agent.agent import run_agent
    from src.agent.tools import TOOLS
    from src.rag import llm_client

    def generate(prompt: str, system: str):
        return llm_client.generate(prompt, provider=req.provider, system=system, temperature=0.2)

    out = run_agent(
        req.question, TOOLS, generate,
        ticker=req.ticker, max_steps=max(2, min(req.max_steps, 8)),
    )
    out.setdefault("engine", "react")
    return out


@router.post("")
async def run(req: AgentRequest) -> Dict[str, Any]:
    """Answer a question by autonomously calling the platform's tools, with a trace."""
    from src.agent import maf_agent
    from src.rag import llm_client

    resolved = (
        llm_client._resolve_auto_provider() if req.provider == "auto" else req.provider
    )

    # Prefer the Microsoft Agent Framework when it's usable for this request.
    if resolved == "azure" and maf_agent.maf_available():
        try:
            return await maf_agent.run_maf_agent(
                req.question, ticker=req.ticker,
                max_steps=max(2, min(req.max_steps, 8)),
            )
        except Exception as exc:  # never let MAF take the endpoint down
            logger.warning("MAF agent failed (%s); falling back to ReAct loop.", exc)

    # Fallback: legacy loop, run off the event loop since it does sync I/O.
    return await run_in_threadpool(_run_legacy, req)


def _sse(event: Dict[str, Any]) -> str:
    return f"data: {json.dumps(event)}\n\n"


@router.post("/stream")
async def run_stream(req: AgentRequest) -> StreamingResponse:
    """Stream the agent's tool calls and answer tokens as Server-Sent Events.

    Emits ``tool`` events as each tool runs, ``token`` events for incremental
    answer text, and a final ``done`` event. If MAF isn't active, it streams a
    single ``done`` event built from the legacy loop so the UI still works.
    """
    from src.agent import maf_agent
    from src.rag import llm_client

    resolved = (
        llm_client._resolve_auto_provider() if req.provider == "auto" else req.provider
    )
    use_maf = resolved == "azure" and maf_agent.maf_available()

    async def gen():
        if use_maf:
            try:
                async for ev in maf_agent.stream_maf_agent(
                    req.question, ticker=req.ticker,
                    max_steps=max(2, min(req.max_steps, 8)),
                ):
                    yield _sse(ev)
                return
            except Exception as exc:  # fall back to a one-shot legacy result
                logger.warning("MAF stream failed (%s); falling back to ReAct loop.", exc)

        out = await run_in_threadpool(_run_legacy, req)
        for st in out.get("steps", []) or []:
            yield _sse({"type": "tool", **st})
        if out.get("answer"):
            yield _sse({"type": "token", "text": out["answer"]})
        yield _sse({"type": "done", **out})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
