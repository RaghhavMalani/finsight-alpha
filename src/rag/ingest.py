"""Reliable end-to-end RAG ingestion and querying.

This is the dependable path that makes the AI Equity Research Terminal actually
work, *without* depending on the brittle web scrapers. You point it at a folder
(or a list) of PDF/TXT/DOCX files, and it:

    load -> chunk -> tag with the company ticker -> embed -> build a vector index

and then lets you ask grounded, cited questions against that index with a local
Ollama model (or any configured provider).

Why this exists
---------------
The dashboard's auto-discovery finds *links* to filings, but exchanges block
scrapers, so "Downloaded 0 documents" is common. The robust workflow is: the
user drops the annual report / investor PPT PDFs into a folder, and we index
those directly. This module is that workflow, reusable from the dashboard, the
CLI scripts, and tests.

The embedder is injectable (``embed_fn``) so tests can run without downloading
the sentence-transformers model.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple, Union

import numpy as np

from src.rag.chunker import chunk_documents
from src.rag.document_loader import load_document, load_documents_from_folder
from src.rag.vector_store import LocalVectorStore

EmbedFn = Callable[[List[str]], np.ndarray]
PathLike = Union[str, Path]

# Default place to drop documents and store the index.
DEFAULT_DOC_DIR = "data/documents"
DEFAULT_INDEX_DIR = "data/rag_index"


def _default_embed_fn(texts: List[str]) -> np.ndarray:
    """Embed with the project's local MiniLM model (lazy import)."""
    from src.rag.embeddings import embed_texts

    return embed_texts(texts)


def _gather_pages(source: Union[PathLike, Iterable[PathLike]]) -> List[Dict[str, Any]]:
    """Load raw pages from a folder, a single file, or a list of files."""
    if isinstance(source, (str, Path)):
        p = Path(source)
        if p.is_dir():
            return load_documents_from_folder(str(p))
        if p.is_file():
            return load_document(str(p))
        raise FileNotFoundError(f"Path does not exist: {p}")
    # Iterable of paths.
    pages: List[Dict[str, Any]] = []
    for item in source:
        ip = Path(item)
        if ip.is_dir():
            pages.extend(load_documents_from_folder(str(ip)))
        elif ip.is_file():
            pages.extend(load_document(str(ip)))
    return pages


def _apply_ticker(chunks: List[Dict[str, Any]], ticker: Optional[str], overwrite: bool) -> None:
    """Tag chunks with ``ticker`` so the dashboard's ticker filter matches them.

    When ``overwrite`` is True, every chunk is associated with ``ticker`` (the
    normal case: "these documents are for this company"). Otherwise only chunks
    with a missing/unknown inferred ticker are filled in.
    """
    if not ticker:
        return
    for c in chunks:
        current = str(c.get("ticker") or "").strip().lower()
        if overwrite or current in ("", "unknown", "none"):
            c["ticker"] = ticker


def ingest_documents(
    source: Union[PathLike, Iterable[PathLike]] = DEFAULT_DOC_DIR,
    ticker: Optional[str] = None,
    index_dir: Optional[PathLike] = DEFAULT_INDEX_DIR,
    embed_fn: Optional[EmbedFn] = None,
    overwrite_ticker: bool = True,
    chunk_size: int = 800,
    chunk_overlap: int = 150,
) -> Tuple[LocalVectorStore, List[Dict[str, Any]]]:
    """Build (and optionally persist) a vector index from documents.

    Parameters
    ----------
    source:
        Folder, single file, or iterable of files (PDF/TXT/DOCX).
    ticker:
        Company ticker to associate with every chunk (e.g. ``"RELIANCE.NS"``).
    index_dir:
        Where to save the index. Pass ``None`` to skip persistence.
    embed_fn:
        Optional embedder override (used by tests). Defaults to local MiniLM.

    Returns
    -------
    (vector_store, chunks)

    Raises
    ------
    ValueError
        If no readable text could be extracted from the source.
    """
    embed_fn = embed_fn or _default_embed_fn

    pages = _gather_pages(source)
    if not pages:
        raise ValueError(
            f"No readable documents found in {source!r}. "
            f"Add PDF/TXT/DOCX files (e.g. into '{DEFAULT_DOC_DIR}') and retry."
        )

    chunks = chunk_documents(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    if not chunks:
        raise ValueError("Documents loaded but no text chunks were produced.")

    _apply_ticker(chunks, ticker, overwrite_ticker)

    embeddings = embed_fn([c["text"] for c in chunks])
    embeddings = np.asarray(embeddings)
    if embeddings.ndim != 2 or embeddings.shape[0] != len(chunks):
        raise ValueError(
            f"Embedder returned shape {embeddings.shape}; expected "
            f"({len(chunks)}, dim)."
        )

    vs = LocalVectorStore()
    vs.build_index(chunks, embeddings)

    if index_dir is not None:
        vs.save(str(index_dir))

    return vs, chunks


def load_index(index_dir: PathLike = DEFAULT_INDEX_DIR) -> Tuple[Optional[LocalVectorStore], List[Dict[str, Any]]]:
    """Load a previously-saved index. Returns ``(None, [])`` if absent."""
    vs = LocalVectorStore()
    if vs.load(str(index_dir)):
        return vs, vs.chunks
    return None, []


def answer_question(
    query: str,
    vector_store: LocalVectorStore,
    chunks: Optional[List[Dict[str, Any]]] = None,
    *,
    ticker: Optional[str] = None,
    provider: str = "ollama",
    model: Optional[str] = None,
    top_k_retrieve: int = 10,
    top_k_rerank: int = 5,
) -> Dict[str, Any]:
    """Retrieve, rerank, and produce a grounded, cited answer.

    If ``ticker`` is given, the search is scoped to that company's chunks - but
    only if any exist, so a mismatch never silently empties the results.
    """
    from src.rag.rag_answer import generate_grounded_answer
    from src.rag.reranker import rerank_chunks
    from src.rag.retriever import hybrid_retrieve

    pool = chunks if chunks is not None else list(getattr(vector_store, "chunks", []))
    if ticker:
        scoped = [c for c in pool if c.get("ticker") == ticker]
        pool = scoped or pool  # fall back to everything rather than returning nothing

    retrieved = hybrid_retrieve(query, pool, vector_store=vector_store, top_k=top_k_retrieve)
    reranked = rerank_chunks(query, retrieved, top_k=top_k_rerank)
    return generate_grounded_answer(query, reranked, provider=provider, model=model)
