"""Bounded extraction with source bytes and checked anchors; no invented methods."""
from pathlib import Path
from src.eval.canonical import sha256_bytes
from src.rag.document_loader import load_document
from .contracts import Paper, PaperClaim


def import_paper(path: Path, *, title: str, authors: tuple[str, ...], source_url: str,
                 claims: tuple[PaperClaim, ...] = (), maximum_bytes: int = 10_000_000) -> Paper:
    if not path.is_file() or path.stat().st_size > maximum_bytes:
        raise ValueError("Paper missing or exceeds import limit")
    raw = path.read_bytes()
    extracted = load_document(str(path))
    # Preserve actual PDF page numbers even when blank pages were skipped.
    pages = ["[No extracted text]"] * max((p["page_number"] for p in extracted), default=0)
    for page in extracted:
        pages[page["page_number"] - 1] = page["text"]
    return Paper(title=title, authors=authors, source_url=source_url,
        source_sha256=sha256_bytes(raw), extraction_status="EXTRACTED" if pages else "UNAVAILABLE",
        pages=tuple(pages), claims=claims,
        limitations=("Extraction does not establish original data, seeds or confidence intervals.",))
