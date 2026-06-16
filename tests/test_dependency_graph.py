"""Offline tests for the dependency graph backend.

The LLM is mocked via ``generate_json`` so we test the validation/normalization
and the deterministic config fallback without any network.
"""

from __future__ import annotations

import pytest

from src import config
from src.graph import dependency_graph as dg
from src.rag.llm_client import LLMResult


def _payload():
    return {
        "nodes": [
            {"id": "crude", "label": "Crude Oil", "category": "commodity", "note": "key input"},
            {"id": "jio", "label": "Jio Platforms", "category": "segment"},
            {"id": "tcs", "label": "Tata Consultancy Services", "category": "competitor"},
            {"id": "bad", "label": "", "category": "supplier"},          # dropped: no label
            {"id": "x", "label": "Mystery", "category": "nonsense"},      # category coerced
        ],
        "edges": [
            {"source": "reliance_ns", "target": "crude", "relation": "exposed_to", "confidence": 0.9},
            {"source": "reliance_ns", "target": "jio", "relation": "operates", "confidence": 1.4},  # clamp
            {"source": "ghost", "target": "crude", "relation": "x"},      # dropped: missing endpoint
        ],
    }


def test_llm_graph_is_validated(monkeypatch):
    monkeypatch.setattr(
        dg.llm_client, "generate_json",
        lambda *a, **k: (_payload(), LLMResult(True, provider="ollama")),
    )
    g = dg.build_dependency_graph("Reliance Industries", "RELIANCE.NS", provider="ollama")

    ids = {n["id"] for n in g.nodes}
    # Company node always present and first.
    assert g.nodes[0]["category"] == "company"
    assert "crude" in ids and "jio" in ids
    # Empty-label node dropped.
    assert all(n["label"] for n in g.nodes)
    # Unknown category coerced to "related".
    assert all(n["category"] in dg.VALID_CATEGORIES for n in g.nodes)
    # TCS label resolved to its ticker via the display-name map.
    tcs = next(n for n in g.nodes if n["label"].startswith("Tata"))
    assert tcs["ticker"] == "TCS.NS"
    # Edge with missing endpoint dropped; confidence clamped to <= 1.
    assert all(e["source"] in ids and e["target"] in ids for e in g.edges)
    assert all(0.0 <= e["confidence"] <= 1.0 for e in g.edges)
    assert g.source == "llm:ollama"


def test_edge_direction_is_corrected(monkeypatch):
    # Model wrongly says the company supplies its supplier and the wrong relation;
    # the graph must rewrite it to supplier -> company "supplies".
    payload = {
        "nodes": [
            {"id": "aramco", "label": "Saudi Aramco", "category": "supplier"},
            {"id": "dealers", "label": "Auto Dealers", "category": "customer"},
        ],
        "edges": [
            {"source": "reliance_ns", "target": "aramco", "relation": "supplies", "confidence": 0.9},
            {"source": "dealers", "target": "reliance_ns", "relation": "supplies", "confidence": 0.7},
        ],
    }
    monkeypatch.setattr(
        dg.llm_client, "generate_json",
        lambda *a, **k: (payload, LLMResult(True, provider="ollama")),
    )
    g = dg.build_dependency_graph("Reliance Industries", "RELIANCE.NS", provider="ollama")
    company = g.nodes[0]["id"]

    supplier_edge = next(e for e in g.edges if "aramco" in (e["source"], e["target"]))
    assert supplier_edge["source"] == "aramco" and supplier_edge["target"] == company
    assert supplier_edge["relation"] == "supplies"

    customer_edge = next(e for e in g.edges if "dealers" in (e["source"], e["target"]))
    assert customer_edge["source"] == company and customer_edge["target"] == "dealers"
    assert customer_edge["relation"] == "sells_to"


def test_duplicate_lookalike_nodes_merged(monkeypatch):
    payload = {
        "nodes": [
            {"id": "ioc", "label": "Indian Oil Corporation", "category": "competitor"},
            {"id": "ioc_ltd", "label": "Indian Oil Corporation Ltd", "category": "competitor"},
        ],
        "edges": [],
    }
    monkeypatch.setattr(
        dg.llm_client, "generate_json",
        lambda *a, **k: (payload, LLMResult(True, provider="ollama")),
    )
    g = dg.build_dependency_graph("Reliance Industries", "RELIANCE.NS", provider="ollama")
    labels = [dg._normalize_label(n["label"]) for n in g.nodes]
    # "indian oil" should appear only once despite the "Ltd" variant.
    assert labels.count("indian oil") == 1


def test_fallback_when_no_llm():
    g = dg.build_dependency_graph("Tata Consultancy Services", "TCS.NS", provider="none")
    assert g.source == "config_fallback"
    # IT sector peers (e.g. Infosys) appear as competitors.
    peer_tickers = {n["ticker"] for n in g.nodes if n["category"] == "competitor"}
    assert "INFY.NS" in peer_tickers
    # Benchmark node present.
    assert any(n["category"] == "sector_index" for n in g.nodes)


def test_fallback_when_llm_returns_nothing(monkeypatch):
    monkeypatch.setattr(
        dg.llm_client, "generate_json",
        lambda *a, **k: (None, LLMResult(False, provider="ollama", error="down")),
    )
    g = dg.build_dependency_graph("Infosys", "INFY.NS", provider="ollama")
    assert g.source == "config_fallback"


def test_cytoscape_export_shape(monkeypatch):
    monkeypatch.setattr(
        dg.llm_client, "generate_json",
        lambda *a, **k: (_payload(), LLMResult(True, provider="ollama")),
    )
    g = dg.build_dependency_graph("Reliance Industries", "RELIANCE.NS", provider="ollama")
    cy = g.to_cytoscape()
    assert set(cy.keys()) == {"nodes", "edges"}
    assert all("data" in n for n in cy["nodes"])
    assert all("id" in e["data"] for e in cy["edges"])


def test_attach_metrics():
    g = dg.build_dependency_graph("Tata Consultancy Services", "TCS.NS", provider="none")
    g.attach_metrics({"INFY.NS": {"ret_1m": 0.03, "vol": 0.25}})
    infy = next((n for n in g.nodes if n["ticker"] == "INFY.NS"), None)
    assert infy is not None and infy["metrics"]["ret_1m"] == 0.03
