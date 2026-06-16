"""Auto-fetch SEC filings for a US ticker and index them for RAG — one command.

Usage
-----
    python scripts/fetch_filings.py --ticker AAPL
    python scripts/fetch_filings.py --ticker MSFT --forms 10-K 10-Q --limit 2
    python scripts/fetch_filings.py --ticker NVDA --no-index   # just download

No API key. EDGAR covers US filers only (Indian .NS/.BO tickers are rejected).
After this, ask questions with:
    python scripts/ask_rag.py --q "What are the key risks?"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.rag.edgar import EdgarError, fetch_filings_for_ticker
from src.rag.ingest import DEFAULT_INDEX_DIR, ingest_documents


def main() -> int:
    ap = argparse.ArgumentParser(description="Auto-fetch + index SEC filings.")
    ap.add_argument("--ticker", required=True, help="US ticker, e.g. AAPL")
    ap.add_argument("--forms", nargs="+", default=["10-K", "10-Q"], help="Filing forms.")
    ap.add_argument("--limit", type=int, default=1, help="Max filings to fetch.")
    ap.add_argument("--index", default=DEFAULT_INDEX_DIR, help="Output index dir.")
    ap.add_argument("--no-index", action="store_true", help="Download only, skip indexing.")
    args = ap.parse_args()

    print(f"Fetching {'/'.join(args.forms)} for {args.ticker} from SEC EDGAR...")
    try:
        paths, dest_dir = fetch_filings_for_ticker(
            args.ticker, forms=tuple(args.forms), limit=args.limit
        )
    except EdgarError as exc:
        print(f"ERROR: {exc}")
        return 1

    print(f"Downloaded {len(paths)} filing(s) to {dest_dir}:")
    for p in paths:
        print(f"  - {p.name}")

    if args.no_index:
        return 0

    print("Indexing...")
    try:
        _, chunks = ingest_documents(source=dest_dir, ticker=args.ticker.upper(), index_dir=args.index)
    except Exception as exc:
        print(f"ERROR during indexing: {exc}")
        return 1
    print(f"Indexed {len(chunks)} chunks to {args.index}.")
    print(f'Next: python scripts/ask_rag.py --index {args.index} --q "What are the key risks?"')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
