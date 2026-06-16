"""Company dependency / supply-chain knowledge graph.

Builds a network around a company: its suppliers, customers, competitors, the
commodities/inputs it's exposed to, and its own business segments. An LLM
extracts the entities and relationships (grounded in retrieved documents when
provided), and the result is validated into a clean graph that any front-end can
render.

Why it's a standout feature
---------------------------
It turns qualitative research into structure: "a car maker depends on steel,
aluminium, lithium and chips, and sells to dealers and fleets" becomes a graph
you can traverse, and each node that maps to a listed ticker can carry live
price/risk metrics from the rest of the platform.

Design
------
* **LLM-extracted** via :func:`src.rag.llm_client.generate_json` (default local
  Ollama), optionally grounded in RAG context chunks.
* **Deterministic fallback** when no LLM is available: same-sector peers from
  :data:`src.config.TICKER_SECTOR_MAP` plus the regional benchmark, so the graph
  is never empty.
* **Validated**: unique node ids, edges always reference existing nodes,
  confidences clamped, node count capped.
* **UI-agnostic exports**: :meth:`DependencyGraph.to_dict`,
  :meth:`~DependencyGraph.to_cytoscape`, :meth:`~DependencyGraph.to_networkx`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from src import config

try:
    from src.rag import llm_client
except Exception:  # keep import-safe
    llm_client = None  # type: ignore[assignment]


VALID_CATEGORIES = {
    "company", "supplier", "customer", "competitor",
    "commodity", "subsidiary", "segment", "sector_index", "regulator", "related",
}

# Reverse map of display name -> ticker, for linking LLM entity names to tickers.
_NAME_TO_TICKER = {name.lower(): tk for tk, name in config.TICKER_DISPLAY_NAMES.items()}

# Canonical relationship per node role: (direction, relation), where direction
# "in" means node -> company and "out" means company -> node. This is what lets
# us OVERRIDE a weak model's wrong edge directions (e.g. a supplier always
# *supplies* the company, never the other way round).
_CATEGORY_EDGE = {
    "supplier": ("in", "supplies"),
    "customer": ("out", "sells_to"),
    "competitor": ("out", "competes_with"),
    "commodity": ("out", "exposed_to"),
    "segment": ("out", "operates"),
    "subsidiary": ("out", "owns"),
    "regulator": ("in", "regulates"),
    "sector_index": ("out", "benchmarked_against"),
}

_LABEL_SUFFIXES = (
    " ltd", " limited", " corporation", " corp", " inc", " plc",
    " co", " company", " platforms", " industries",
)


def _normalize_label(label: str) -> str:
    """Normalize an entity name for dedup (lowercase, drop punctuation/suffixes)."""
    s = re.sub(r"[^a-z0-9 ]+", " ", str(label).lower())
    s = re.sub(r"\s+", " ", s).strip()
    for suf in _LABEL_SUFFIXES:
        if s.endswith(suf):
            s = s[: -len(suf)].strip()
    return s


DEPENDENCY_GRAPH_SYSTEM = (
    "You are a financial analyst that maps a company's economic dependency "
    "network. You output ONLY valid JSON - no prose, no markdown fences."
)

DEPENDENCY_GRAPH_PROMPT = """\
Map the dependency / supply-chain network for the company below.

Company: {company} (ticker: {ticker})

Identify the most important related entities and how they connect. Categories:
- supplier      (provides inputs/components to the company)
- customer       (buys the company's products/services)
- competitor     (competes in the same markets)
- commodity      (raw material / input the company is exposed to)
- segment        (the company's own business divisions)
- sector_index   (benchmark/index it belongs to)
- regulator      (key regulator)

Output ONLY this JSON shape:
{{
  "nodes": [
    {{"id": "short_slug", "label": "Human Name", "category": "supplier",
      "ticker": "TICKER_OR_EMPTY", "note": "one short phrase"}}
  ],
  "edges": [
    {{"source": "slug_a", "target": "slug_b", "relation": "supplies|sells_to|competes_with|exposed_to|operates",
      "rationale": "short why", "confidence": 0.0}}
  ]
}}

Rules:
- Include one node with category "company" for {company} itself.
- Every entity must be SPECIFIC to {company} and its real industry. Do NOT copy
  any names from these instructions; do not invent entities from other sectors.
- Keep to the ~15 most material entities. Edge source/target must be node ids.
- "regulator" means a government/oversight body that actually regulates
  {company} in its own jurisdiction - NOT a rival company.
- Use ONE canonical name per entity; never list the same entity twice (e.g. avoid
  listing both an acronym and the full legal name of the same firm).
- For a supplier, the supplier provides inputs TO the company (not vice versa).
- Base it on the context excerpts when given; otherwise use general knowledge.

Context excerpts:
{context}
"""


@dataclass
class DependencyGraph:
    """A validated company dependency graph."""

    company_ticker: str
    company_name: str
    nodes: List[Dict[str, Any]] = field(default_factory=list)
    edges: List[Dict[str, Any]] = field(default_factory=list)
    source: str = "unknown"  # "llm:<provider>" or "config_fallback"

    # -- exports -------------------------------------------------------------
    def to_dict(self) -> Dict[str, Any]:
        return {
            "company_ticker": self.company_ticker,
            "company_name": self.company_name,
            "source": self.source,
            "nodes": self.nodes,
            "edges": self.edges,
        }

    def to_cytoscape(self) -> Dict[str, List[Dict[str, Any]]]:
        """Elements in Cytoscape.js / vis-friendly ``{nodes, edges}`` form."""
        return {
            "nodes": [{"data": n} for n in self.nodes],
            "edges": [
                {"data": {"id": f"{e['source']}->{e['target']}", **e}} for e in self.edges
            ],
        }

    def to_networkx(self):  # pragma: no cover - optional dependency
        """A :class:`networkx.DiGraph` (raises if networkx isn't installed)."""
        import networkx as nx

        g = nx.DiGraph()
        for n in self.nodes:
            g.add_node(n["id"], **n)
        for e in self.edges:
            g.add_edge(e["source"], e["target"], **e)
        return g

    def attach_metrics(self, metrics_by_ticker: Dict[str, Dict[str, Any]]) -> "DependencyGraph":
        """Enrich ticker-bearing nodes with precomputed metrics (in place).

        ``metrics_by_ticker`` maps a ticker to a dict of fields (e.g.
        ``{"AAPL": {"ret_1m": 0.04, "vol": 0.21}}``) - typically derived from the
        platform's existing market data. Nodes without a ticker are left as-is.
        """
        for n in self.nodes:
            tk = n.get("ticker")
            if tk and tk in metrics_by_ticker:
                n["metrics"] = metrics_by_ticker[tk]
        return self


# ---------------------------------------------------------------------------
# Building
# ---------------------------------------------------------------------------
def build_dependency_graph(
    company_name: str,
    ticker: str,
    context_chunks: Optional[List[Dict[str, Any]]] = None,
    *,
    provider: str = "ollama",
    model: Optional[str] = None,
    max_nodes: int = 24,
) -> DependencyGraph:
    """Build a dependency graph via LLM, falling back to config-based peers.

    Never raises - returns the deterministic fallback graph if the LLM is
    unavailable or returns nothing usable.
    """
    if provider in (None, "none", "") or llm_client is None:
        return _fallback_graph_from_config(ticker, company_name)

    context = _format_context(context_chunks)
    prompt = DEPENDENCY_GRAPH_PROMPT.format(
        company=company_name, ticker=ticker,
        context=context or "(no documents provided; use general knowledge)",
    )
    parsed, result = llm_client.generate_json(
        prompt, provider=provider, system=DEPENDENCY_GRAPH_SYSTEM, model=model
    )
    if not parsed:
        return _fallback_graph_from_config(ticker, company_name)

    graph = _graph_from_payload(
        parsed, ticker, company_name, source=f"llm:{result.provider}", max_nodes=max_nodes
    )
    # If the model produced essentially nothing, prefer the useful fallback.
    if len(graph.nodes) <= 1 or not graph.edges:
        return _fallback_graph_from_config(ticker, company_name)
    return graph


def _format_context(chunks: Optional[List[Dict[str, Any]]], max_chunks: int = 8, max_chars: int = 600) -> str:
    if not chunks:
        return ""
    parts = []
    for i, c in enumerate(chunks[:max_chunks], start=1):
        text = (c.get("text") or "").strip().replace("\n", " ")
        parts.append(f"[{i}] {text[:max_chars]}")
    return "\n".join(parts)


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", str(text).lower()).strip("_")
    return s or "node"


def _map_ticker(label: str, given: Optional[str]) -> str:
    """Resolve a node's ticker: trust a given one, else match the display name."""
    if given:
        return str(given).strip()
    return _NAME_TO_TICKER.get(str(label).strip().lower(), "")


def _graph_from_payload(
    payload: Dict[str, Any], ticker: str, company_name: str, source: str, max_nodes: int
) -> DependencyGraph:
    """Validate and normalize a raw LLM payload into a DependencyGraph."""
    raw_nodes = payload.get("nodes") or []
    raw_edges = payload.get("edges") or []

    nodes: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_norm: set[str] = set()

    # Ensure the company node exists and is first.
    company_id = _slug(ticker or company_name)
    nodes.append({
        "id": company_id, "label": company_name, "category": "company",
        "ticker": ticker, "note": "",
    })
    seen_ids.add(company_id)
    seen_norm.add(_normalize_label(company_name))

    for rn in raw_nodes:
        if not isinstance(rn, dict):
            continue
        label = str(rn.get("label") or rn.get("id") or "").strip()
        if not label:
            continue
        nid = _slug(rn.get("id") or label)
        norm = _normalize_label(label)
        # Dedup by id AND by normalized name (catches "X Ltd" vs "X").
        if nid in seen_ids or (norm and norm in seen_norm):
            continue
        category = str(rn.get("category") or "related").strip().lower()
        if category not in VALID_CATEGORIES:
            category = "related"
        if category == "company":
            category = "subsidiary"  # only the canonical company node is "company"
        nodes.append({
            "id": nid,
            "label": label,
            "category": category,
            "ticker": _map_ticker(label, rn.get("ticker")),
            "note": str(rn.get("note") or "")[:120],
        })
        seen_ids.add(nid)
        if norm:
            seen_norm.add(norm)
        if len(nodes) >= max_nodes:
            break

    # Normalize the model's raw edges (valid endpoints, clamped confidence),
    # then enforce canonical direction/relation by role.
    llm_edges: List[Dict[str, Any]] = []
    for re_ in raw_edges:
        if not isinstance(re_, dict):
            continue
        s = _slug(re_.get("source") or "")
        t = _slug(re_.get("target") or "")
        if s not in seen_ids or t not in seen_ids or s == t:
            continue
        try:
            conf = float(re_.get("confidence", 0.5))
        except (TypeError, ValueError):
            conf = 0.5
        llm_edges.append({
            "source": s,
            "target": t,
            "relation": str(re_.get("relation") or "related_to")[:40],
            "rationale": str(re_.get("rationale") or "")[:160],
            "confidence": min(max(conf, 0.0), 1.0),
        })

    edges = _fix_and_complete_edges(nodes, company_id, llm_edges)

    return DependencyGraph(
        company_ticker=ticker, company_name=company_name,
        nodes=nodes, edges=edges, source=source,
    )


def _fix_and_complete_edges(
    nodes: List[Dict[str, Any]], company_id: str, llm_edges: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Correct edge direction/relation by role and ensure no node is orphaned.

    * Any edge between the company and a categorized node is rewritten to the
      canonical direction + relation for that role (fixes "company supplies its
      supplier" type errors).
    * Node<->node edges (e.g. a segment exposed to a commodity) are kept as-is.
    * Every categorized node gets at least one company edge so the graph is
      connected.
    """
    node_by_id = {n["id"]: n for n in nodes}
    fixed: List[Dict[str, Any]] = []
    seen: set[tuple] = set()

    def _add(edge: Dict[str, Any]) -> None:
        key = (edge["source"], edge["target"])
        if key in seen or edge["source"] == edge["target"]:
            return
        seen.add(key)
        fixed.append(edge)

    for e in llm_edges:
        s, t = e["source"], e["target"]
        other = t if s == company_id else (s if t == company_id else None)
        if other and other in node_by_id:
            spec = _CATEGORY_EDGE.get(node_by_id[other]["category"])
            if spec:
                direction, relation = spec
                s2, t2 = (other, company_id) if direction == "in" else (company_id, other)
                _add({**e, "source": s2, "target": t2, "relation": relation})
                continue
        _add(e)

    connected = {n for e in fixed for n in (e["source"], e["target"])}
    for n in nodes:
        nid = n["id"]
        if nid == company_id or nid in connected:
            continue
        spec = _CATEGORY_EDGE.get(n["category"])
        if not spec:
            continue
        direction, relation = spec
        s2, t2 = (nid, company_id) if direction == "in" else (company_id, nid)
        _add({"source": s2, "target": t2, "relation": relation, "rationale": "", "confidence": 0.5})

    return fixed


def _fallback_graph_from_config(ticker: str, company_name: str) -> DependencyGraph:
    """Deterministic graph from the config sector map (no LLM needed).

    Adds same-sector peers as competitors and the regional benchmark as a
    sector_index, so the user always sees a meaningful starting graph.
    """
    company_id = _slug(ticker or company_name)
    nodes = [{
        "id": company_id, "label": company_name or ticker, "category": "company",
        "ticker": ticker, "note": "",
    }]
    edges = []

    sector = config.get_sector(ticker)
    peers = [
        tk for tk, sec in config.TICKER_SECTOR_MAP.items()
        if sec == sector and tk != ticker
    ][:6]
    for tk in peers:
        nid = _slug(tk)
        nodes.append({
            "id": nid, "label": config.get_display_name(tk), "category": "competitor",
            "ticker": tk, "note": f"{sector} peer",
        })
        edges.append({
            "source": company_id, "target": nid, "relation": "competes_with",
            "rationale": f"Same sector ({sector})", "confidence": 0.6,
        })

    bench = config.get_default_benchmark(ticker)
    if bench and bench != ticker:
        bid = _slug(bench)
        if not any(n["id"] == bid for n in nodes):
            nodes.append({
                "id": bid, "label": config.get_display_name(bench),
                "category": "sector_index", "ticker": bench, "note": "Benchmark",
            })
        edges.append({
            "source": company_id, "target": bid, "relation": "benchmarked_against",
            "rationale": "Regional market benchmark", "confidence": 0.7,
        })

    return DependencyGraph(
        company_ticker=ticker, company_name=company_name or ticker,
        nodes=nodes, edges=edges, source="config_fallback",
    )
