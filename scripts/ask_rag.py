"""Ask a grounded question against a saved RAG index.

Usage
-----
    # one-shot
    python scripts/ask_rag.py --index data/rag_index --q "What are the key risks?"

    # interactive
    python scripts/ask_rag.py --index data/rag_index

    # choose a provider/model (defaults to local Ollama)
    python scripts/ask_rag.py --q "Capex plans?" --provider ollama --model llama3.1

Requires a running LLM. For the free local path:
    1. Install Ollama:  https://ollama.com/download
    2. Pull a model:    ollama pull llama3.1
    3. Ensure it serves: ollama serve   (usually automatic)
Without a model it falls back to extractive evidence.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.rag.ingest import DEFAULT_INDEX_DIR, answer_question, load_index


def _print_answer(result: dict) -> None:
    badge = (
        f"[grounded · {result.get('provider')}]"
        if result.get("grounded")
        else "[extractive · no LLM]"
    )
    print(f"\n{badge}\n")
    print(result.get("answer", "").strip())
    citations = result.get("citations", [])
    if citations:
        print("\nSources:")
        for c in citations:
            print(f"  [{c['n']}] {c['label']}")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Ask questions against a RAG index.")
    parser.add_argument("--index", default=DEFAULT_INDEX_DIR, help="Index directory.")
    parser.add_argument("--q", default=None, help="Question (omit for interactive mode).")
    parser.add_argument("--ticker", default=None, help="Scope answers to a ticker.")
    parser.add_argument("--provider", default="ollama", help="ollama|openai|anthropic|gemini|auto|none")
    parser.add_argument("--model", default=None, help="Model override.")
    args = parser.parse_args()

    vs, chunks = load_index(args.index)
    if vs is None:
        print(f"No index found at '{args.index}'. Build one first:\n"
              f"  python scripts/build_rag_index.py --docs <folder> --ticker <TICKER>")
        return 1
    print(f"Loaded index: {len(chunks)} chunks.")

    def ask(question: str) -> None:
        result = answer_question(
            question, vs, chunks, ticker=args.ticker,
            provider=args.provider, model=args.model,
        )
        _print_answer(result)

    if args.q:
        ask(args.q)
        return 0

    print("Interactive mode. Type a question (or 'exit').")
    while True:
        try:
            q = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if q.lower() in ("exit", "quit", ""):
            break
        ask(q)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
