from typing import List, Dict, Any

def generate_retrieval_only_answer(query: str, retrieved_chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generate a simple extractive answer without using an LLM."""
    if not retrieved_chunks:
        return {
            "answer": "I could not find enough evidence in the uploaded documents.",
            "sources": [],
            "retrieved_chunks": []
        }
        
    answer_parts = []
    sources = set()
    
    answer_parts.append(f"Based on a local search, here is the most relevant information regarding '{query}':\n")
    
    for i, chunk in enumerate(retrieved_chunks):
        source = chunk.get('source_file', 'Unknown')
        page = chunk.get('page_number', 'N/A')
        text = chunk.get('text', '')[:300] + "..." # Extractive summary limits length
        
        answer_parts.append(f"- \"{text}\" (Source: {source}, Page: {page})")
        sources.add(f"{source} (Page {page})")
        
    return {
        "answer": "\n\n".join(answer_parts),
        "sources": list(sources),
        "retrieved_chunks": retrieved_chunks
    }

def generate_llm_answer(
    query: str,
    retrieved_chunks: List[Dict[str, Any]],
    llm_provider: str = "none"
) -> Dict[str, Any]:
    """Generate an answer using an optional local or cloud LLM."""
    if not retrieved_chunks:
        return {
            "answer": "I could not find enough evidence in the uploaded documents.",
            "sources": [],
            "retrieved_chunks": []
        }
        
    if llm_provider == "none":
        return generate_retrieval_only_answer(query, retrieved_chunks)
        
    # We will fall back to retrieval only if LLM integration is requested but not implemented
    # or if we are not connected to the API
    try:
        if llm_provider == "ollama":
            pass
        elif llm_provider == "openai_optional":
            pass
    except Exception as e:
        print(f"LLM generation failed: {e}")
        
    # Fallback
    return generate_retrieval_only_answer(query, retrieved_chunks)
