from typing import List, Dict, Any

try:
    from googlesearch import search
    HAS_GOOGLESEARCH = True
except ImportError:
    HAS_GOOGLESEARCH = False
    
try:
    from duckduckgo_search import DDGS
    HAS_DDGS = True
except ImportError:
    HAS_DDGS = False

def discover_documents_via_search(ticker: str, company_name: str | None = None, max_results: int = 10) -> List[Dict[str, Any]]:
    """Discover candidate documents using a web search fallback."""
    name = company_name or ticker.split(".")[0]
    
    # Generate queries
    queries = [
        f"{name} annual report pdf",
        f"{name} investor presentation pdf",
        f"{name} quarterly results pdf",
        f"{name} earnings call transcript"
    ]
    
    candidates = []
    
    if not HAS_GOOGLESEARCH and not HAS_DDGS:
        # Provide suggested queries
        for i, q in enumerate(queries):
            candidates.append({
                "ticker": ticker,
                "source_name": "Web Search (Suggested)",
                "document_url": f"https://duckduckgo.com/?q={q.replace(' ', '+')}",
                "title": f"Search: {q}",
                "document_type": "source_page",
                "confidence": 0.5,
                "downloadable": False,
                "message": "Required search packages not installed. Click the link to search manually."
            })
        return candidates
        
    try:
        if HAS_DDGS:
            ddgs = DDGS()
            for query in queries[:2]: # Limit to avoid rate limiting
                results = ddgs.text(query, max_results=3)
                for r in results:
                    candidates.append({
                        "ticker": ticker,
                        "source_name": "Web Search (DDG)",
                        "document_url": r.get("href"),
                        "title": r.get("title", f"Search Result for {query}"),
                        "document_type": "unknown",
                        "confidence": 0.6,
                        "downloadable": str(r.get("href", "")).endswith(".pdf")
                    })
        elif HAS_GOOGLESEARCH:
            for query in queries[:2]:
                for j, url in enumerate(search(query, num=3, stop=3, pause=2)):
                    candidates.append({
                        "ticker": ticker,
                        "source_name": "Web Search (Google)",
                        "document_url": url,
                        "title": f"Search Result for {query}",
                        "document_type": "unknown",
                        "confidence": 0.6,
                        "downloadable": str(url).endswith(".pdf")
                    })
    except Exception as e:
        candidates.append({
            "ticker": ticker,
            "source_name": "Web Search Error",
            "document_url": "",
            "title": f"Search Failed: {e}",
            "document_type": "error",
            "confidence": 0.0,
            "downloadable": False
        })
        
    return candidates[:max_results]
