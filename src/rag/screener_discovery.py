from typing import List, Dict, Any
import urllib.parse
from src.rag.source_policy import can_fetch_url, get_default_headers, normalize_url, polite_sleep

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    requests = None
    BeautifulSoup = None

def get_screener_company_url(ticker: str) -> str:
    """Get the Screener.in URL for a given ticker."""
    if not ticker:
        return ""
    
    # Check if Indian ticker (ends with .NS or .BO)
    if ticker.endswith(".NS") or ticker.endswith(".BO"):
        symbol = ticker.split(".")[0]
        return f"https://www.screener.in/company/{symbol}/"
    return ""

def discover_screener_documents(ticker: str, max_links: int = 20, respect_robots: bool = True) -> List[Dict[str, Any]]:
    """Discover candidate documents from Screener.in."""
    if not requests or not BeautifulSoup:
        return []
        
    company_url = get_screener_company_url(ticker)
    if not company_url:
        # Unsupported ticker for Screener
        return []
        
    allowed, _ = can_fetch_url(company_url, respect_robots=respect_robots)
    if not allowed:
        return []
        
    candidates = []
    
    try:
        response = requests.get(company_url, headers=get_default_headers(), timeout=15)
        if response.status_code != 200:
            return []
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Screener has specific sections for documents
        # Search all links
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            text = a_tag.get_text(strip=True)
            
            # Filter criteria
            url_lower = href.lower()
            text_lower = text.lower()
            
            doc_type = None
            if "annual report" in text_lower or "annual-report" in url_lower:
                doc_type = "annual_report"
            elif "credit rating" in text_lower:
                doc_type = "credit_rating"
            elif "concall" in text_lower or "transcript" in text_lower:
                doc_type = "earnings_transcript"
            elif "investor presentation" in text_lower:
                doc_type = "investor_presentation"
            elif "announcement" in url_lower:
                doc_type = "announcements"
            elif "results" in text_lower and ("q1" in text_lower or "q2" in text_lower or "q3" in text_lower or "q4" in text_lower):
                doc_type = "quarterly_result"
                
            if doc_type:
                full_url = normalize_url(href, company_url)
                
                # Assign confidence
                confidence = 0.8
                if full_url.endswith(".pdf"):
                    confidence += 0.1
                
                candidates.append({
                    "ticker": ticker,
                    "source_name": "Screener.in",
                    "source_url": company_url,
                    "document_url": full_url,
                    "title": text or f"Screener Document ({doc_type})",
                    "document_type": doc_type,
                    "confidence": min(1.0, confidence),
                    "downloadable": full_url.endswith(".pdf") or full_url.endswith(".txt") or full_url.endswith(".html")
                })
                
                if len(candidates) >= max_links:
                    break
                    
    except Exception as e:
        pass
        
    return candidates
