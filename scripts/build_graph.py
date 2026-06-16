"""Build a company dependency / supply-chain graph and print or save it.

Uses the same LLM as the RAG terminal (local Ollama by default). Optionally
grounds the graph in an existing RAG index so the relationships come from the
company's own documents.

Usage
-----
    # from model knowledge (needs Ollama running)
    python scripts/build_graph.py --ticker RELIANCE.NS

    # grounded in indexed documents, save JSON for the future UI
    python scripts/build_graph.py --ticker RELIANCE.NS --index data/rag_index --out data/graphs/reliance.json

    # deterministic, no LLM (sector peers from config)
    python scripts/build_graph.py --ticker TCS.NS --provider none
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src import config
from src.graph.dependency_graph import build_dependency_graph
from src.rag.ingest import load_index


def main() -> int:
    ap = argparse.ArgumentParser(description="Build a company dependency graph.")
    ap.add_argument("--ticker", required=True, help="e.g. RELIANCE.NS")
    ap.add_argument("--name", default=None, help="Company name (defaults from config).")
    ap.add_argument("--provider", default="ollama", help="ollama|groq|gemini|openai|anthropic|auto|none")
    ap.add_argument("--model", default=None, help="Model override.")
    ap.add_argument("--index", default=None, help="Optional RAG index dir to ground the graph in documents.")
    ap.add_argument("--out", default=None, help="Optional path to save the graph as JSON.")
    args = ap.parse_args()

    name = args.name or config.get_display_name(args.ticker)

    context = None
    if args.index:
        vs, chunks = load_index(args.index)
        if vs is not None:
            from src.rag.retriever import hybrid_retrieve

            context = hybrid_retrieve(
                "business segments suppliers customers competitors commodities risks",
                chunks, vector_store=vs, top_k=8,
            )
            print(f"Grounding in {len(context)} retrieved chunks from '{args.index}'.")
        else:
            print(f"No index at '{args.index}' - building from model knowledge.")

    print(f"Building dependency graph for {name} ({args.ticker}) via '{args.provider}'...")
    g = build_dependency_graph(
        name, args.ticker, context_chunks=context, provider=args.provider, model=args.model
    )

    print(f"\nSource: {g.source}")
    print(f"\nNodes ({len(g.nodes)}):")
    for n in g.nodes:
        tk = f" [{n['ticker']}]" if n.get("ticker") else ""
        note = f"  — {n['note']}" if n.get("note") else ""
        print(f"  - {n['label']}{tk}  ({n['category']}){note}")

    print(f"\nEdges ({len(g.edges)}):")
    for e in g.edges:
        print(f"  {e['source']} --{e['relation']}--> {e['target']}  (conf {e['confidence']:.2f})")

    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            json.dump(g.to_dict(), f, indent=2)
        print(f"\nSaved JSON to {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
