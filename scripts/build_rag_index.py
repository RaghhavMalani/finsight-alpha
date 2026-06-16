"""Build a RAG vector index from a folder of documents.

This is the reliable, scraper-free way to get documents into the terminal:
drop the annual report / investor-presentation PDFs into a folder and run this.

Usage
-----
    python scripts/build_rag_index.py --docs data/documents/RELIANCE --ticker RELIANCE.NS
    python scripts/build_rag_index.py --docs ./my_pdfs --ticker AAPL --index data/rag_index

The first run downloads the local embedding model (~80 MB) once.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Make the project root importable when run directly.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.rag.ingest import DEFAULT_INDEX_DIR, ingest_documents


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a RAG index from documents.")
    parser.add_argument("--docs", required=True, help="Folder or file of PDF/TXT/DOCX documents.")
    parser.add_argument("--ticker", default=None, help="Ticker to tag chunks with, e.g. RELIANCE.NS.")
    parser.add_argument("--index", default=DEFAULT_INDEX_DIR, help="Output index directory.")
    args = parser.parse_args()

    print(f"Indexing documents from: {args.docs}")
    try:
        vs, chunks = ingest_documents(source=args.docs, ticker=args.ticker, index_dir=args.index)
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1

    sources = sorted({c.get("source_file", "?") for c in chunks})
    print(f"Indexed {len(chunks)} chunks from {len(sources)} file(s):")
    for s in sources:
        print(f"  - {s}")
    print(f"Saved index to: {args.index}")
    print("Next: python scripts/ask_rag.py --index "
          f"{args.index} --q \"What are the key risks?\"")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
