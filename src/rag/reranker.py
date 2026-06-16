from typing import List, Dict, Any

FINANCIAL_KEYWORDS = [
    "revenue", "ebitda", "margin", "capex", "debt", "cash flow", "profit",
    "risk", "oil", "telecom", "retail", "growth", "regulation", "interest rate",
    "inflation", "currency", "crude", "refining", "subscriber", "arpu"
]

def rerank_chunks(
    query: str,
    chunks: List[Dict[str, Any]],
    top_k: int = 5
) -> List[Dict[str, Any]]:
    """Simple keyword/overlap reranker."""
    if not chunks:
        return []
        
    query_lower = query.lower()
    query_terms = set(query_lower.split())
    
    reranked = []
    for chunk in chunks:
        text_lower = chunk["text"].lower()
        
        # 1. Query term overlap
        term_overlap = sum(1 for term in query_terms if term in text_lower)
        
        # 2. Financial keyword overlap
        finance_overlap = sum(1 for kw in FINANCIAL_KEYWORDS if kw in text_lower)
        
        # 3. Base semantic score
        base_score = chunk.get("hybrid_score", chunk.get("score", 0.0))
        
        # Simple weighted sum
        final_score = base_score + (term_overlap * 0.1) + (finance_overlap * 0.05)
        
        c = chunk.copy()
        c["rerank_score"] = final_score
        reranked.append(c)
        
    reranked.sort(key=lambda x: x["rerank_score"], reverse=True)
    return reranked[:top_k]
