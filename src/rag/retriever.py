from typing import List, Dict, Any, Optional

try:
    from rank_bm25 import BM25Okapi
except ImportError:
    BM25Okapi = None

from src.rag import embeddings

def retrieve_relevant_chunks(
    query: str,
    vector_store,
    top_k: int = 5,
    filters: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """Retrieve chunks using purely semantic search with metadata filtering."""
    if not vector_store or len(vector_store.chunks) == 0:
        return []
        
    query_emb = embeddings.embed_query(query)
    results = vector_store.search(query_emb, top_k=top_k * 3) # retrieve more for filtering
    
    filtered_results = []
    for res in results:
        match = True
        if filters:
            for k, v in filters.items():
                if v and res.get(k) != v:
                    match = False
                    break
        if match:
            filtered_results.append(res)
            
    return filtered_results[:top_k]

def hybrid_retrieve(
    query: str,
    chunks: List[Dict[str, Any]],
    vector_store=None,
    top_k: int = 5,
    semantic_weight: float = 0.7,
    keyword_weight: float = 0.3
) -> List[Dict[str, Any]]:
    """Retrieve using a hybrid of semantic vector search and BM25 keyword search."""
    if not chunks:
        return []
        
    semantic_scores = {chunk["chunk_id"]: 0.0 for chunk in chunks}
    if vector_store and vector_store.chunks:
        # Assumes vector_store.chunks is the same as the chunks list
        q_emb = embeddings.embed_query(query)
        # Search all to get relative scores
        s_results = vector_store.search(q_emb, top_k=len(chunks))
        if s_results:
            max_s = max(res["score"] for res in s_results)
            min_s = min(res["score"] for res in s_results)
            rng = max_s - min_s if max_s > min_s else 1.0
            for res in s_results:
                semantic_scores[res["chunk_id"]] = (res["score"] - min_s) / rng
                
    keyword_scores = {chunk["chunk_id"]: 0.0 for chunk in chunks}
    if BM25Okapi is not None:
        tokenized_corpus = [c["text"].lower().split() for c in chunks]
        bm25 = BM25Okapi(tokenized_corpus)
        tokenized_query = query.lower().split()
        doc_scores = bm25.get_scores(tokenized_query)
        
        if len(doc_scores) > 0:
            max_k = max(doc_scores)
            min_k = min(doc_scores)
            rng_k = max_k - min_k if max_k > min_k else 1.0
            
            for i, chunk in enumerate(chunks):
                keyword_scores[chunk["chunk_id"]] = (doc_scores[i] - min_k) / rng_k
                
    # Combine
    combined = []
    for chunk in chunks:
        cid = chunk["chunk_id"]
        score = (semantic_weight * semantic_scores.get(cid, 0.0)) + \
                (keyword_weight * keyword_scores.get(cid, 0.0))
        
        c = chunk.copy()
        c["hybrid_score"] = score
        combined.append(c)
        
    combined.sort(key=lambda x: x["hybrid_score"], reverse=True)
    return combined[:top_k]
