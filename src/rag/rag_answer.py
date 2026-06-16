"""Grounded, citation-aware answer generation for the RAG layer.

This is the "brain" of the AI Equity Research Terminal. Given a question and a
list of already-retrieved/reranked chunks, it produces an analyst-style answer
that is **grounded** in those chunks and **cites** them inline with ``[n]``
markers that map back to specific source documents and pages.

Two modes
---------
* **LLM mode** - when a working provider is available (local Ollama or a cloud
  key), the model writes a synthesized answer constrained to the supplied
  context, must cite sources as ``[n]``, and must abstain if the context does
  not support an answer. See :mod:`src.rag.prompt_templates`.
* **Extractive fallback** - when no LLM is available (``provider="none"`` or the
  call fails), we return the top evidence snippets with their sources. This
  guarantees the dashboard always shows *something* useful and never crashes.

Design notes
------------
* Every returned dict has the same shape regardless of mode, so the dashboard
  rendering code is identical: ``answer``, ``sources``, ``citations``,
  ``retrieved_chunks``, ``provider``, ``grounded``.
* ``grounded`` is ``True`` only when an LLM produced an answer that cited at
  least one supplied chunk - a cheap, honest faithfulness signal you can show
  in the UI and talk about in an interview.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from src.rag import prompt_templates

try:
    from src.rag import llm_client
except Exception:  # pragma: no cover - keeps import-safe even if client missing
    llm_client = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Context formatting
# ---------------------------------------------------------------------------
def _source_label(chunk: Dict[str, Any]) -> str:
    """Human-readable 'file (page N)' label for a chunk."""
    source = chunk.get("source_file") or chunk.get("source") or "Unknown"
    page = chunk.get("page_number", chunk.get("page", "N/A"))
    return f"{source} (Page {page})"


def _build_numbered_context(chunks: List[Dict[str, Any]], max_chars: int = 1200) -> str:
    """Render chunks as a numbered context block the model can cite by index.

    Each entry looks like::

        [1] (annual_report.pdf, Page 42)
        <chunk text...>

    The ``[n]`` indices are 1-based and align with ``chunks`` order, so we can
    map an inline ``[1]`` in the answer straight back to ``chunks[0]``.
    """
    blocks = []
    for i, chunk in enumerate(chunks, start=1):
        text = (chunk.get("text") or "").strip().replace("\n", " ")
        if len(text) > max_chars:
            text = text[:max_chars].rsplit(" ", 1)[0] + " ..."
        blocks.append(f"[{i}] ({_source_label(chunk)})\n{text}")
    return "\n\n".join(blocks)


_CITATION_RE = re.compile(r"\[(\d+)\]")


def _extract_cited_indices(answer: str, n_chunks: int) -> List[int]:
    """Return the distinct, in-range chunk indices cited in ``answer`` (1-based)."""
    seen: List[int] = []
    for match in _CITATION_RE.findall(answer or ""):
        idx = int(match)
        if 1 <= idx <= n_chunks and idx not in seen:
            seen.append(idx)
    return seen


def _citations_payload(
    chunks: List[Dict[str, Any]], cited_indices: List[int]
) -> List[Dict[str, Any]]:
    """Build a structured citation list for the indices actually referenced."""
    payload = []
    for idx in cited_indices:
        chunk = chunks[idx - 1]
        payload.append(
            {
                "n": idx,
                "source_file": chunk.get("source_file") or chunk.get("source") or "Unknown",
                "page_number": chunk.get("page_number", chunk.get("page", "N/A")),
                "label": _source_label(chunk),
                "text": chunk.get("text", ""),
            }
        )
    return payload


# ---------------------------------------------------------------------------
# Extractive fallback (no LLM)
# ---------------------------------------------------------------------------
def generate_retrieval_only_answer(
    query: str, retrieved_chunks: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Extractive answer: present the strongest evidence snippets with sources.

    Used whenever no LLM is available. It is intentionally honest about being a
    retrieval summary rather than a synthesized answer.
    """
    if not retrieved_chunks:
        return _empty_answer()

    lines = [
        f"No language model is active, so here is the most relevant evidence "
        f"retrieved for: “{query}”"
    ]
    sources, citations = [], []
    for i, chunk in enumerate(retrieved_chunks, start=1):
        text = (chunk.get("text") or "").strip()
        snippet = text[:300] + ("..." if len(text) > 300 else "")
        label = _source_label(chunk)
        lines.append(f"[{i}] {snippet}\n    — {label}")
        sources.append(label)
        citations.append(
            {
                "n": i,
                "source_file": chunk.get("source_file") or chunk.get("source") or "Unknown",
                "page_number": chunk.get("page_number", chunk.get("page", "N/A")),
                "label": label,
                "text": text,
            }
        )

    return {
        "answer": "\n\n".join(lines),
        "sources": list(dict.fromkeys(sources)),  # de-dup, preserve order
        "citations": citations,
        "retrieved_chunks": retrieved_chunks,
        "provider": "none",
        "grounded": False,
    }


def _empty_answer() -> Dict[str, Any]:
    return {
        "answer": "I could not find enough evidence in the indexed documents to answer that.",
        "sources": [],
        "citations": [],
        "retrieved_chunks": [],
        "provider": "none",
        "grounded": False,
    }


# ---------------------------------------------------------------------------
# Grounded LLM answer
# ---------------------------------------------------------------------------
def generate_grounded_answer(
    query: str,
    retrieved_chunks: List[Dict[str, Any]],
    *,
    provider: str = "auto",
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """Produce a synthesized, citation-grounded answer from retrieved chunks.

    Falls back to :func:`generate_retrieval_only_answer` if there are no chunks,
    no LLM client, ``provider="none"``, or the LLM call fails for any reason.
    """
    if not retrieved_chunks:
        return _empty_answer()

    if provider in (None, "none", "") or llm_client is None:
        return generate_retrieval_only_answer(query, retrieved_chunks)

    context = _build_numbered_context(retrieved_chunks)
    prompt = prompt_templates.FINANCIAL_QA_PROMPT.format(context=context, query=query)

    result = llm_client.generate(
        prompt,
        provider=provider,
        system=prompt_templates.FINANCIAL_QA_SYSTEM,
        model=model,
        temperature=0.1,
    )

    if not result.ok or not result.text:
        # Graceful degradation: keep the evidence visible and tell the user why.
        fallback = generate_retrieval_only_answer(query, retrieved_chunks)
        if result.error:
            fallback["answer"] = (
                f"_(LLM unavailable: {result.error} — showing retrieved evidence.)_\n\n"
                + fallback["answer"]
            )
        return fallback

    answer_text = result.text.strip()
    cited = _extract_cited_indices(answer_text, len(retrieved_chunks))
    citations = _citations_payload(retrieved_chunks, cited)

    return {
        "answer": answer_text,
        "sources": [c["label"] for c in citations],
        "citations": citations,
        "retrieved_chunks": retrieved_chunks,
        "provider": result.provider or provider,
        "model": result.model,
        # A grounded answer is one that cited at least one supplied chunk.
        "grounded": bool(cited),
    }


# ---------------------------------------------------------------------------
# Backwards-compatible entry point (used by the existing dashboard)
# ---------------------------------------------------------------------------
def generate_llm_answer(
    query: str,
    retrieved_chunks: List[Dict[str, Any]],
    llm_provider: str = "none",
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """Compatibility wrapper kept for ``app/streamlit_app.py``.

    Historically this accepted ``llm_provider="none"`` and silently returned an
    extractive answer. It now routes to the real grounded generator while
    preserving that default behaviour, so existing callers keep working and new
    callers can pass ``"ollama"``, ``"openai"``, ``"anthropic"``, ``"gemini"``,
    or ``"auto"``.
    """
    return generate_grounded_answer(
        query, retrieved_chunks, provider=llm_provider, model=model
    )
