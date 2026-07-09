"""A transparent, provider-agnostic tool-calling agent (ReAct-style).

The agent answers a question by repeatedly choosing a tool, observing its result,
and reasoning — then producing a grounded, cited answer. It speaks a strict JSON
protocol so it works with **any** LLM provider (Ollama, Azure, Groq, OpenAI...),
not just ones with native function-calling. Every step is recorded so the UI can
show the agent *thinking*.

Design goals
------------
* **Transparent** — the full trace (thought → tool → args → result) is returned.
* **Grounded** — the system prompt forbids inventing numbers; everything comes
  from tool outputs, and the agent must cite which tools it used.
* **Safe** — bounded step budget, robust JSON parsing, tool errors don't crash
  the loop, and no buy/sell/hold advice.
* **Testable** — ``run_agent`` takes an injectable ``generate`` callable and a
  tools dict, so it can be exercised with a scripted fake LLM (no network).
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Dict, List, Optional

AGENT_SYSTEM = (
    "You are FinSight, a meticulous quantitative equity-research agent. You answer "
    "questions by calling tools and reasoning over their outputs. Use tools to get "
    "EVERY number — never invent figures or rely on outside knowledge. You never give "
    "buy/sell/hold advice; you present evidence, numbers, and risks. Output ONLY a "
    "single JSON object per turn, with no surrounding prose or markdown."
)


def _protocol(tool_docs: str, max_steps: int) -> str:
    return (
        "Available tools:\n" + tool_docs + "\n\n"
        "Each turn output exactly ONE JSON object and nothing else:\n"
        '  to call a tool:  {"thought": "<why this tool>", "tool": "<name>", "args": {<args>}}\n'
        '  to finish:       {"answer": "<full answer grounded in tool results, with the numbers>", '
        '"citations": ["<tool_name>:<ticker>", ...]}\n\n'
        f"Rules: use at most {max_steps} tool calls; get every number from a tool; if a tool "
        "returns an error, try a different tool or finish with what you have; cite the tools you used."
    )


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Best-effort: parse the first balanced ``{...}`` object out of LLM text."""
    if not text:
        return None
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except Exception:
                    return None
    return None


def _tool_docs(tools: Dict[str, Dict[str, Any]]) -> str:
    lines = []
    for name, t in tools.items():
        params = ", ".join(t.get("parameters", {}).keys())
        lines.append(f"- {name}({params}): {t.get('description', '')}")
    return "\n".join(lines)


def run_agent(
    question: str,
    tools: Dict[str, Dict[str, Any]],
    generate: Callable[[str, str], Any],
    ticker: Optional[str] = None,
    max_steps: int = 6,
    result_clip: int = 1600,
) -> Dict[str, Any]:
    """Run the agent loop.

    Parameters
    ----------
    question:
        The user's question.
    tools:
        ``{name: {"description", "parameters": {name: desc}, "fn": callable}}``.
    generate:
        ``generate(prompt, system) -> object with .ok/.text/.provider`` (an
        ``LLMResult``); injectable so tests use a fake LLM.
    ticker:
        Default ticker passed into the context (the LLM can override per call).

    Returns
    -------
    ``{"answer", "citations", "steps", "provider"}`` where ``steps`` is the full
    reasoning/tool trace.
    """
    docs = _tool_docs(tools)
    base = (
        f"Question: {question}\n"
        f"Default ticker: {ticker or 'none'}\n\n" + _protocol(docs, max_steps)
    )
    history = ""
    steps: List[Dict[str, Any]] = []
    provider = ""

    for n in range(1, max_steps + 1):
        res = generate(base + history + "\n\nYour next JSON action:", AGENT_SYSTEM)
        provider = getattr(res, "provider", "") or provider
        if not getattr(res, "ok", False):
            return {"answer": f"Agent LLM unavailable: {getattr(res, 'error', 'unknown')}. "
                              "Start Ollama or set an LLM key.",
                    "citations": [], "steps": steps, "provider": provider}
        obj = _extract_json(getattr(res, "text", "")) or {}

        if "answer" in obj and "tool" not in obj:
            return {"answer": str(obj.get("answer", "")),
                    "citations": obj.get("citations", []), "steps": steps, "provider": provider}

        thought = str(obj.get("thought", ""))
        tool = obj.get("tool")
        args = obj.get("args") or {}

        if tool not in tools:
            steps.append({"step": n, "thought": thought, "tool": tool, "args": args,
                          "result": {"error": f"unknown tool '{tool}'"}})
            history += f"\n\n[step {n}] invalid tool '{tool}'. Valid: {', '.join(tools)}."
            continue

        try:
            result = tools[tool]["fn"](**args) if isinstance(args, dict) else tools[tool]["fn"]()
        except Exception as exc:
            result = {"error": str(exc)}

        steps.append({"step": n, "thought": thought, "tool": tool, "args": args, "result": result})
        history += (f"\n\n[step {n}] thought: {thought}\n  called {tool}({json.dumps(args)})\n"
                    f"  result: {json.dumps(result)[:result_clip]}")

    # Out of budget — force a final synthesis from what we gathered.
    res = generate(
        base + history + "\n\nTool budget exhausted. Now output the FINAL JSON: "
        '{"answer": "...", "citations": [...]}.',
        AGENT_SYSTEM,
    )
    provider = getattr(res, "provider", "") or provider
    obj = _extract_json(getattr(res, "text", "")) or {}
    return {"answer": str(obj.get("answer", getattr(res, "text", "")[:800])),
            "citations": obj.get("citations", []), "steps": steps, "provider": provider}
