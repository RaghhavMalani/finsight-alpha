from typing import List, Dict, Any

def discover_nse_documents(ticker: str, document_types: List[str] = ["annual_report", "announcements", "results"], max_links: int = 10) -> List[Dict[str, Any]]:
    """Discover candidate documents from NSE."""
    if not ticker.endswith(".NS"):
        return []
        
    symbol = ticker.split(".")[0]
    
    # Direct scraping of NSE is difficult due to dynamic JS and bot protections.
    # We will provide a direct candidate source page.
    nse_url = f"https://www.nseindia.com/get-quotes/equity?symbol={symbol}"
    
    return [{
        "ticker": ticker,
        "source_name": "NSE",
        "document_url": nse_url,
        "title": f"NSE Corporate Filings for {symbol}",
        "document_type": "source_page",
        "confidence": 0.9,
        "downloadable": False,
        "message": "Open this page and download the relevant filing manually if automatic discovery is blocked."
    }]

def discover_bse_documents(ticker: str, document_types: List[str] = ["annual_report", "announcements", "results"], max_links: int = 10) -> List[Dict[str, Any]]:
    """Discover candidate documents from BSE."""
    if not ticker.endswith(".BO") and not ticker.endswith(".NS"):
        return []
        
    symbol = ticker.split(".")[0]
    
    # Like NSE, BSE uses dynamic pages. Provide a fallback search page.
    bse_url = f"https://www.bseindia.com/stock-share-price/{symbol}/"
    
    return [{
        "ticker": ticker,
        "source_name": "BSE",
        "document_url": bse_url,
        "title": f"BSE Corporate Filings for {symbol}",
        "document_type": "source_page",
        "confidence": 0.8,
        "downloadable": False,
        "message": "Open this page and download the relevant filing manually if automatic discovery is blocked."
    }]
