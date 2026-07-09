"""Microsoft Agent Framework (MAF) backed analyst agent.

This is the "agentic AI" engine for FinSight Alpha. It exposes the platform's
existing engines (fundamentals, price metrics, news sentiment, shock Monte
Carlo, filing search) as MAF *function tools* and lets a ``ChatAgent`` running
on Azure ``gpt-5-mini`` decide which to call, in what order, to answer a
question — true tool-calling autonomy rather than our hand-rolled ReAct loop.

Design notes
------------
* **Azure via the OpenAI v1 surface.** Your Foundry resource exposes the
  OpenAI-compatible ``/openai/v1`` endpoint (Responses API). MAF's
  ``OpenAIChatClient`` speaks exactly that when given ``base_url`` + ``api_key``,
  so we reuse the same endpoint that already powers the rest of the app.
* **Never hard-crashes.** If ``agent-framework`` isn't installed or Azure isn't
  configured, :func:`maf_available` returns ``False`` and the caller falls back
  to the legacy loop. Any runtime error is caught and surfaced.
* **Trace compatible with the terminal UI.** Each tool invocation is recorded as
  ``{"step", "tool", "args", "result"}`` so the existing AI AGENT tab renders it
  unchanged.

Requires: ``pip install agent-framework`` (or ``agent-framework-openai``).
"""

from __future__ import annotations

import asyncio
import contextvars
import os
from typing import Annotated, Any, AsyncIterator, Dict, List, Optional
from urllib.parse import urlparse

from pydantic import Field

from src.agent import tools as _tools

# Async-safe, per-run trace of tool calls. Each MAF tool appends to whatever
# list is active in the current context (set in :func:`run_maf_agent`).
_TRACE: contextvars.ContextVar[Optional[List[Dict[str, Any]]]] = contextvars.ContextVar(
    "finsight_maf_trace", default=None
)

# Optional per-run event queue for live streaming. When set, each tool call is
# pushed here as it happens so the SSE generator can emit it immediately.
_EVENTS: contextvars.ContextVar[Optional["asyncio.Queue"]] = contextvars.ContextVar(
    "finsight_maf_events", default=None
)


def maf_available() -> bool:
    """True only if the MAF package is importable *and* Azure is configured."""
    if not (os.getenv("AZURE_OPENAI_API_KEY") and os.getenv("AZURE_OPENAI_ENDPOINT")):
        return False
    try:
        import agent_framework  # noqa: F401
        from agent_framework.openai import OpenAIChatClient  # noqa: F401
    except Exception:
        return False
    return True


def _record(tool: str, args: Dict[str, Any], result: Any) -> None:
    trace = _TRACE.get()
    step = {"step": (len(trace) + 1) if trace is not None else 1,
            "tool": tool, "args": args, "result": result}
    if trace is not None:
        trace.append(step)
    queue = _EVENTS.get()
    if queue is not None:
        try:
            queue.put_nowait({"type": "tool", **step})
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Function tools. Plain Python functions with Annotated/Field metadata so MAF
# can build accurate JSON schemas for the model. Each delegates to the existing
# implementation in ``src.agent.tools`` and records the call for the trace.
# ---------------------------------------------------------------------------
def get_fundamentals(
    ticker: Annotated[str, Field(description="US stock ticker symbol, e.g. AAPL.")],
) -> dict:
    """Annual financials & ratios from SEC filings: revenue, net income, gross/net
    margin, ROE, ROA, debt/equity, revenue growth. US tickers only."""
    out = _tools.TOOLS["get_fundamentals"]["fn"](ticker=ticker)
    _record("get_fundamentals", {"ticker": ticker}, out)
    return out


def get_price_metrics(
    ticker: Annotated[str, Field(description="Stock ticker symbol, e.g. NVDA.")],
) -> dict:
    """Price-based metrics: last price, total return, CAGR, annualized volatility,
    Sharpe ratio, and maximum drawdown."""
    out = _tools.TOOLS["get_price_metrics"]["fn"](ticker=ticker)
    _record("get_price_metrics", {"ticker": ticker}, out)
    return out


def get_news_sentiment(
    ticker: Annotated[str, Field(description="Stock ticker symbol, e.g. MSFT.")],
) -> dict:
    """Recent news headlines plus aggregate bullish / neutral / bearish sentiment."""
    out = _tools.TOOLS["get_news_sentiment"]["fn"](ticker=ticker)
    _record("get_news_sentiment", {"ticker": ticker}, out)
    return out


def shock_scenario(
    ticker: Annotated[str, Field(description="The stock whose reaction you want to estimate.")],
    dep_ticker: Annotated[str, Field(description="The dependency/related ticker that gets shocked, e.g. TSM.")],
    shock_pct: Annotated[float, Field(description="Percent move applied to dep_ticker, e.g. -10 for a 10% drop.")],
) -> dict:
    """Monte Carlo estimate of how the stock's expected return shifts when a
    dependency ticker moves by shock_pct percent."""
    out = _tools.TOOLS["shock_scenario"]["fn"](ticker=ticker, dep_ticker=dep_ticker, shock_pct=shock_pct)
    _record("shock_scenario", {"ticker": ticker, "dep_ticker": dep_ticker, "shock_pct": shock_pct}, out)
    return out


def search_filings(
    ticker: Annotated[str, Field(description="The company's ticker whose SEC filings to search.")],
    query: Annotated[str, Field(description="What to look for in the filings, e.g. 'supply chain risks'.")],
) -> dict:
    """Search the company's indexed SEC filings and return cited snippets.
    Requires filings to have been fetched on the Research tab first."""
    out = _tools.TOOLS["search_filings"]["fn"](ticker=ticker, query=query)
    _record("search_filings", {"ticker": ticker, "query": query}, out)
    return out


_MAF_TOOLS = [get_fundamentals, get_price_metrics, get_news_sentiment, shock_scenario, search_filings]

_SYSTEM = (
    "You are FinSight Alpha's autonomous equity-research analyst. "
    "Answer the user's question by calling the provided tools to gather evidence "
    "before you conclude — prefer tool data over prior knowledge. "
    "Rules: (1) never invent or estimate numbers; every figure must come from a "
    "tool result. (2) Briefly cite which tool/source each key figure came from. "
    "(3) Do NOT give buy/sell/hold recommendations — present analysis, drivers, "
    "and risks neutrally. (4) If a tool returns an error, acknowledge the gap "
    "rather than guessing. Keep the final answer tight and decision-useful."
)


def _v1_base_url(endpoint: str) -> str:
    """Reduce any pasted endpoint form to the OpenAI ``/openai/v1/`` base URL."""
    parsed = urlparse(endpoint if "://" in endpoint else f"https://{endpoint}")
    return f"{parsed.scheme or 'https'}://{parsed.netloc}/openai/v1/"


def _deployment() -> str:
    return os.getenv("AZURE_OPENAI_DEPLOYMENT") or "gpt-5-mini"


def _build_agent(ticker: Optional[str]):
    """Construct a MAF ChatAgent wired to Azure gpt-5-mini with our tools."""
    from agent_framework.openai import OpenAIChatClient

    key = os.getenv("AZURE_OPENAI_API_KEY")
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT") or ""
    deployment = _deployment()

    instructions = _SYSTEM
    if ticker:
        instructions += (
            f"\n\nThe user is currently focused on ticker {ticker.upper()}. "
            "Treat it as the default ticker unless the question names another."
        )

    # The model-parameter name has changed across MAF versions (``ai_model_id``
    # in the SK-derived releases, ``model_id`` in newer ones). Introspect the
    # constructor and use whichever it accepts; otherwise fall back to the
    # ``OPENAI_CHAT_MODEL`` env var that the client reads on its own.
    import inspect

    kwargs: Dict[str, Any] = {"api_key": key, "base_url": _v1_base_url(endpoint)}
    try:
        params = set(inspect.signature(OpenAIChatClient.__init__).parameters)
    except (TypeError, ValueError):
        params = set()
    for cand in ("model_id", "ai_model_id", "model", "deployment_name"):
        if cand in params:
            kwargs[cand] = deployment
            break
    else:
        os.environ.setdefault("OPENAI_CHAT_MODEL", deployment)

    client = OpenAIChatClient(**kwargs)
    return client.as_agent(name="FinSight Analyst", instructions=instructions, tools=_MAF_TOOLS)


def _citations(trace: List[Dict[str, Any]]) -> List[str]:
    """Lightweight citations derived from the tools/sources actually used."""
    out: List[str] = []
    for st in trace:
        res = st.get("result") or {}
        if st["tool"] == "search_filings" and isinstance(res, dict):
            for sn in res.get("snippets", []) or []:
                src = sn.get("source")
                if src and src not in out:
                    out.append(src)
        else:
            out.append(st["tool"])
    seen: set = set()
    return [c for c in out if not (c in seen or seen.add(c))]


async def run_maf_agent(
    question: str, ticker: Optional[str] = None, max_steps: int = 6
) -> Dict[str, Any]:
    """Run the MAF agent and return a payload matching the legacy agent shape:
    ``{answer, steps, citations, provider, model, engine}``."""
    agent = _build_agent(ticker)

    trace: List[Dict[str, Any]] = []
    token = _TRACE.set(trace)
    try:
        result = await agent.run(question)
    finally:
        _TRACE.reset(token)

    answer = getattr(result, "text", None)
    if not answer:
        answer = str(result) if result is not None else ""

    return {
        "answer": answer.strip(),
        "steps": trace,
        "citations": _citations(trace),
        "provider": "azure",
        "model": _deployment(),
        "engine": "maf",
    }


async def stream_maf_agent(
    question: str, ticker: Optional[str] = None, max_steps: int = 6
) -> AsyncIterator[Dict[str, Any]]:
    """Yield streaming events for the AI Agent UI:

    * ``{"type": "tool", step, tool, args, result}`` — emitted as each tool runs
    * ``{"type": "token", "text": ...}`` — incremental answer text
    * ``{"type": "done", answer, steps, citations, provider, model, engine}``

    Falls back to a single non-streaming run (emitting one token + done) if the
    installed MAF build doesn't support ``agent.run(stream=True)``.
    """
    agent = _build_agent(ticker)
    trace: List[Dict[str, Any]] = []
    events: "asyncio.Queue" = asyncio.Queue()
    t_token = _TRACE.set(trace)
    e_token = _EVENTS.set(events)
    parts: List[str] = []
    try:
        streamed = False
        try:
            stream = agent.run(question, stream=True)
            aiter = stream.__aiter__()  # raises if not an async iterator
            streamed = True
            while True:
                # Drain any tool events recorded since the last chunk.
                while not events.empty():
                    yield events.get_nowait()
                try:
                    chunk = await aiter.__anext__()
                except StopAsyncIteration:
                    break
                text = getattr(chunk, "text", None)
                if text:
                    parts.append(text)
                    yield {"type": "token", "text": text}
            while not events.empty():
                yield events.get_nowait()
        except (TypeError, AttributeError):
            # No streaming support — run once and emit the whole answer.
            if not streamed:
                result = await agent.run(question)
                while not events.empty():
                    yield events.get_nowait()
                text = getattr(result, "text", None) or (str(result) if result else "")
                parts.append(text)
                if text:
                    yield {"type": "token", "text": text}
            else:
                raise
    finally:
        _EVENTS.reset(e_token)
        _TRACE.reset(t_token)

    yield {
        "type": "done",
        "answer": "".join(parts).strip(),
        "steps": trace,
        "citations": _citations(trace),
        "provider": "azure",
        "model": _deployment(),
        "engine": "maf",
    }
