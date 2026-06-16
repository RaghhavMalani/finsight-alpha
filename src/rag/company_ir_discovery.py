from typing import List, Dict, Any
from src.rag.source_policy import can_fetch_url, get_default_headers, normalize_url

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    requests = None
    BeautifulSoup = None

def get_known_ir_pages(ticker: str) -> List[str]:
    """Get known Investor Relations pages for major tickers."""
    ir_map = {
        "RELIANCE.NS": ["https://www.ril.com/investors"],
        "TCS.NS": ["https://www.tcs.com/investor-relations"],
        "INFY.NS": ["https://www.infosys.com/investors.html"],
        "HDFCBANK.NS": ["https://www.hdfcbank.com/personal/about-us/investor-relations"],
        "ICICIBANK.NS": ["https://www.icicibank.com/about-us/investor-relations"],
        "SBIN.NS": ["https://sbi.co.in/web/corporate-governance/investor-relations"],
        "AAPL": ["https://investor.apple.com/investor-relations/default.aspx"],
        "MSFT": ["https://www.microsoft.com/en-us/investor"],
        "NVDA": ["https://investor.nvidia.com/home/default.aspx"],
        "JPM": ["https://www.jpmorganchase.com/ir"],
        "BLK": ["https://ir.blackrock.com/home/default.aspx"]
    }
    return ir_map.get(ticker, [])

def discover_company_ir_documents(ticker: str, max_links: int = 20, respect_robots: bool = True) -> List[Dict[str, Any]]:
    """Discover candidate documents from Official Company IR pages."""
    ir_pages = get_known_ir_pages(ticker)
    if not ir_pages or not requests or not BeautifulSoup:
        return []
        
    candidates = []
    
    for page_url in ir_pages:
        allowed, _ = can_fetch_url(page_url, respect_robots=respect_robots)
        if not allowed:
            continue
            
        try:
            response = requests.get(page_url, headers=get_default_headers(), timeout=15)
            if response.status_code != 200:
                continue
                
            soup = BeautifulSoup(response.text, 'html.parser')
            for a_tag in soup.find_all('a', href=True):
                href = a_tag['href']
                text = a_tag.get_text(strip=True)
                
                url_lower = href.lower()
                text_lower = text.lower()
                
                doc_type = None
                if "annual report" in text_lower or "annual-report" in url_lower or "10-k" in text_lower:
                    doc_type = "annual_report"
                elif "concall" in text_lower or "transcript" in text_lower or "earnings call" in text_lower:
                    doc_type = "earnings_transcript"
                elif "investor presentation" in text_lower or "presentation" in text_lower:
                    doc_type = "investor_presentation"
                elif "results" in text_lower or "quarterly" in text_lower or "earnings release" in text_lower:
                    doc_type = "quarterly_result"
                    
                if doc_type:
                    full_url = normalize_url(href, page_url)
                    
                    confidence = 0.9
                    if full_url.endswith(".pdf"):
                        confidence += 0.1
                        
                    candidates.append({
                        "ticker": ticker,
                        "source_name": "Official IR",
                        "source_url": page_url,
                        "document_url": full_url,
                        "title": text or f"Official IR Document ({doc_type})",
                        "document_type": doc_type,
                        "confidence": min(1.0, confidence),
                        "downloadable": full_url.endswith(".pdf") or full_url.endswith(".txt") or full_url.endswith(".html")
                    })
                    
                    if len(candidates) >= max_links:
                        break
        except Exception:
            pass
            
    return candidates
