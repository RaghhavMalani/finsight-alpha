from typing import List, Dict, Any
from src.rag.screener_discovery import discover_screener_documents
from src.rag.exchange_discovery import discover_nse_documents, discover_bse_documents
from src.rag.company_ir_discovery import discover_company_ir_documents
from src.rag.web_search_discovery import discover_documents_via_search

def rank_document_candidates(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Rank and sort document candidates based on source and metadata."""
    for c in candidates:
        score = 0.0
        src = c.get("source_name", "")
        doc_type = c.get("document_type", "")
        url = c.get("document_url", "").lower()
        title = c.get("title", "").lower()
        
        if "Official IR" in src:
            score += 40
        elif src in ["NSE", "BSE"]:
            score += 35
        elif "Screener" in src:
            score += 25
        elif "Web Search" in src:
            score += 15
        else:
            score -= 5
            
        if url.endswith(".pdf"):
            score += 20
            
        if doc_type == "annual_report":
            score += 15
        elif doc_type == "investor_presentation":
            score += 12
        elif doc_type == "earnings_transcript":
            score += 10
            
        # Recent year heuristic
        if "2024" in url or "2024" in title or "fy24" in url or "fy24" in title:
            score += 10
        elif "2023" in url or "2023" in title or "fy23" in url or "fy23" in title:
            score += 5
            
        # Apply base confidence as multiplier
        conf = c.get("confidence", 0.5)
        c["rank_score"] = score * conf
        
    # Sort
    ranked = sorted(candidates, key=lambda x: x.get("rank_score", 0), reverse=True)
    return ranked

def deduplicate_candidates(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove exact duplicate URLs."""
    seen = set()
    deduped = []
    for c in candidates:
        url = c.get("document_url")
        if url and url not in seen:
            seen.add(url)
            deduped.append(c)
    return deduped

def discover_financial_documents(
    ticker: str,
    company_name: str | None = None,
    sources: List[str] = ["company_ir", "screener", "nse", "bse", "web_search"],
    document_types: List[str] = ["annual_report", "quarterly_result", "investor_presentation", "earnings_transcript"],
    max_candidates: int = 25,
    respect_robots: bool = True
) -> List[Dict[str, Any]]:
    """Master discovery module."""
    all_candidates = []
    
    if "company_ir" in sources:
        all_candidates.extend(discover_company_ir_documents(ticker, respect_robots=respect_robots))
        
    if "screener" in sources:
        all_candidates.extend(discover_screener_documents(ticker, respect_robots=respect_robots))
        
    if "nse" in sources:
        all_candidates.extend(discover_nse_documents(ticker, document_types))
        
    if "bse" in sources:
        all_candidates.extend(discover_bse_documents(ticker, document_types))
        
    if "web_search" in sources:
        all_candidates.extend(discover_documents_via_search(ticker, company_name))
        
    # Filter by document types if specified
    if document_types:
        filtered = []
        for c in all_candidates:
            if c.get("document_type") in document_types or c.get("document_type") in ["unknown", "source_page", "error"]:
                filtered.append(c)
        all_candidates = filtered
        
    # Deduplicate
    all_candidates = deduplicate_candidates(all_candidates)
    
    # Rank
    all_candidates = rank_document_candidates(all_candidates)
    
    return all_candidates[:max_candidates]
