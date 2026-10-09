"""Typed inspectable relations; edges cannot fabricate experiment lineage."""
from src.eval.canonical import canonical_sha256


def validate_dag(nodes,edges):
    ids={n["id"] for n in nodes}
    if len(ids)!=len(nodes): raise ValueError("Duplicate DAG nodes")
    parents={k:[] for k in ids}
    for e in edges:
        if e["kind"] not in {"BASELINE","ABLATION","PLACEBO","ROBUSTNESS","REPLICATION","EXECUTION"}:
            raise ValueError("Unknown DAG relation")
        if e["from"] not in ids or e["to"] not in ids: raise ValueError("Dangling DAG relation")
        parents[e["to"]].append(e["from"])
    active,finished=set(),set()
    def visit(node):
        if node in active: raise ValueError("Cyclic experiment DAG")
        if node in finished: return
        active.add(node)
        for parent in parents[node]: visit(parent)
        active.remove(node);finished.add(node)
    for node in ids: visit(node)
    hypotheses={n["hypothesis_hash"] for n in nodes}
    if len(hypotheses)!=1: raise ValueError("DAG hypothesis substitution")
    return {"nodes":nodes,"edges":edges,"content_sha256":canonical_sha256({"nodes":nodes,"edges":edges})}
