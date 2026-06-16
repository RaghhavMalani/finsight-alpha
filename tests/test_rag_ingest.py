"""Offline end-to-end test of the RAG ingest + query path.

No model download, no network:
* the embedder is injected (deterministic hashing -> vectors),
* ``retriever.embed_query`` is monkeypatched with the same embedder,
* ``llm_client.generate`` is monkeypatched to a canned grounded answer.

This proves the load -> chunk -> tag -> embed -> index -> retrieve -> answer
chain wires together correctly.
"""

from __future__ import annotations

import numpy as np
import pytest

from src.rag import ingest, retriever
from src.rag.llm_client import LLMResult


DIM = 16


def _fake_vec(text: str) -> np.ndarray:
    """Deterministic pseudo-embedding from a text hash (unit-norm)."""
    rng = np.random.default_rng(abs(hash(text)) % (2**32))
    v = rng.standard_normal(DIM).astype("float32")
    n = np.linalg.norm(v)
    return v / n if n else v


def _fake_embed_texts(texts):
    return np.vstack([_fake_vec(t) for t in texts]) if texts else np.zeros((0, DIM))


@pytest.fixture()
def doc_dir(tmp_path):
    d = tmp_path / "docs"
    d.mkdir()
    (d / "reliance_notes.txt").write_text(
        "Reliance faces key risks from crude oil price volatility and regulatory "
        "changes in telecom. Management highlighted strong growth in the retail "
        "segment and improving cash flow. Net debt declined after deleveraging.",
        encoding="utf-8",
    )
    return d


def test_ingest_builds_index_and_tags_ticker(doc_dir):
    vs, chunks = ingest.ingest_documents(
        source=str(doc_dir), ticker="RELIANCE.NS",
        index_dir=None, embed_fn=_fake_embed_texts,
    )
    assert len(chunks) >= 1
    # Every chunk carries the requested ticker (so the dashboard filter matches).
    assert all(c["ticker"] == "RELIANCE.NS" for c in chunks)
    assert len(vs.chunks) == len(chunks)


def test_ingest_empty_source_raises(tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(ValueError):
        ingest.ingest_documents(source=str(empty), embed_fn=_fake_embed_texts)


def test_save_and_load_roundtrip(doc_dir, tmp_path):
    index_dir = tmp_path / "idx"
    vs, chunks = ingest.ingest_documents(
        source=str(doc_dir), ticker="RELIANCE.NS",
        index_dir=str(index_dir), embed_fn=_fake_embed_texts,
    )
    loaded_vs, loaded_chunks = ingest.load_index(str(index_dir))
    assert loaded_vs is not None
    assert len(loaded_chunks) == len(chunks)


def test_answer_question_grounded(doc_dir, monkeypatch):
    vs, chunks = ingest.ingest_documents(
        source=str(doc_dir), ticker="RELIANCE.NS",
        index_dir=None, embed_fn=_fake_embed_texts,
    )

    # Retrieval needs to embed the query without the real model.
    monkeypatch.setattr(retriever, "embed_query", lambda q: _fake_vec(q))

    # Canned LLM answer that cites the first retrieved excerpt.
    from src.rag import rag_answer

    monkeypatch.setattr(
        rag_answer.llm_client, "generate",
        lambda prompt, **kw: LLMResult(True, text="Key risk is crude oil volatility [1].",
                                       provider="ollama"),
    )

    result = ingest.answer_question(
        "What are the key risks?", vs, chunks,
        ticker="RELIANCE.NS", provider="ollama",
    )
    assert result["grounded"] is True
    assert result["citations"]
    assert result["provider"] == "ollama"


def test_answer_question_no_llm_is_extractive(doc_dir, monkeypatch):
    vs, chunks = ingest.ingest_documents(
        source=str(doc_dir), ticker="RELIANCE.NS",
        index_dir=None, embed_fn=_fake_embed_texts,
    )
    monkeypatch.setattr(retriever, "embed_query", lambda q: _fake_vec(q))

    result = ingest.answer_question(
        "What are the key risks?", vs, chunks, provider="none",
    )
    assert result["grounded"] is False
    assert result["provider"] == "none"
    assert result["retrieved_chunks"]
