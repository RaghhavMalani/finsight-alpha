"""Offline tests for grounded answer generation.

These never touch a network or a real LLM. We monkeypatch ``llm_client.generate``
so we can assert the *grounding and citation logic* deterministically:

* citations are parsed from inline ``[n]`` markers and mapped to the right chunk,
* out-of-range citations are ignored,
* empty retrieval abstains,
* ``provider="none"`` and LLM failures fall back to extractive mode.
"""

from __future__ import annotations

import pytest

from src.rag import rag_answer
from src.rag.llm_client import LLMResult


CHUNKS = [
    {"text": "Revenue grew 12% YoY driven by retail.", "source_file": "ar.pdf", "page_number": 10, "ticker": "X"},
    {"text": "Net debt fell to 1.2x EBITDA after deleveraging.", "source_file": "ar.pdf", "page_number": 22, "ticker": "X"},
    {"text": "Management flagged margin pressure from input costs.", "source_file": "q3.pdf", "page_number": 3, "ticker": "X"},
]


def test_empty_retrieval_abstains():
    out = rag_answer.generate_grounded_answer("anything", [], provider="ollama")
    assert out["grounded"] is False
    assert out["citations"] == []
    assert "could not find" in out["answer"].lower()


def test_provider_none_uses_extractive():
    out = rag_answer.generate_grounded_answer("revenue?", CHUNKS, provider="none")
    assert out["provider"] == "none"
    assert out["grounded"] is False
    # Extractive mode still surfaces every chunk as a citation/source.
    assert len(out["citations"]) == len(CHUNKS)


def test_grounded_answer_parses_citations(monkeypatch):
    def fake_generate(prompt, **kwargs):
        # Model cites excerpts 1 and 3 (1-based).
        return LLMResult(True, text="Revenue rose 12% [1]; margins are pressured [3].",
                         provider="ollama", model="llama3.1")

    monkeypatch.setattr(rag_answer.llm_client, "generate", fake_generate)
    out = rag_answer.generate_grounded_answer("summary?", CHUNKS, provider="ollama")

    assert out["grounded"] is True
    cited_ns = [c["n"] for c in out["citations"]]
    assert cited_ns == [1, 3]
    # Citation 1 maps to chunk 0 (ar.pdf p10), citation 3 to chunk 2 (q3.pdf p3).
    assert out["citations"][0]["page_number"] == 10
    assert out["citations"][1]["source_file"] == "q3.pdf"


def test_out_of_range_citation_ignored(monkeypatch):
    def fake_generate(prompt, **kwargs):
        return LLMResult(True, text="Claim with bad cite [9] and good cite [2].",
                         provider="ollama")

    monkeypatch.setattr(rag_answer.llm_client, "generate", fake_generate)
    out = rag_answer.generate_grounded_answer("q", CHUNKS, provider="ollama")
    assert [c["n"] for c in out["citations"]] == [2]


def test_uncited_answer_is_not_grounded(monkeypatch):
    def fake_generate(prompt, **kwargs):
        return LLMResult(True, text="Some answer with no citations at all.", provider="ollama")

    monkeypatch.setattr(rag_answer.llm_client, "generate", fake_generate)
    out = rag_answer.generate_grounded_answer("q", CHUNKS, provider="ollama")
    assert out["grounded"] is False
    assert out["citations"] == []


def test_llm_failure_falls_back_to_evidence(monkeypatch):
    def fake_generate(prompt, **kwargs):
        return LLMResult(False, error="connection refused", provider="ollama")

    monkeypatch.setattr(rag_answer.llm_client, "generate", fake_generate)
    out = rag_answer.generate_grounded_answer("q", CHUNKS, provider="ollama")
    assert out["grounded"] is False
    assert "LLM unavailable" in out["answer"]
    assert len(out["retrieved_chunks"]) == len(CHUNKS)


def test_backwards_compatible_wrapper_default():
    # Old call style (default llm_provider="none") still works and is extractive.
    out = rag_answer.generate_llm_answer("q", CHUNKS)
    assert out["provider"] == "none"
    assert out["grounded"] is False


def test_json_extractor_handles_fenced_output():
    from src.rag.llm_client import _extract_json
    fenced = '```json\n{"risk_score": 0.4, "growth_score": 0.7}\n```'
    parsed = _extract_json(fenced)
    assert parsed == {"risk_score": 0.4, "growth_score": 0.7}
