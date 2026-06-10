import re
from typing import Dict, Any, Optional

# Basic document types
DOC_TYPES = [
    "annual_report",
    "quarterly_result",
    "investor_presentation",
    "earnings_transcript",
    "news_article",
    "brokerage_report",
    "sector_report",
]

# Simple heuristic mapping for Indian and US tickers.
TICKER_HINTS = {
    "reliance": "RELIANCE.NS",
    "tcs": "TCS.NS",
    "infy": "INFY.NS",
    "infosys": "INFY.NS",
    "hdfc": "HDFCBANK.NS",
    "icici": "ICICIBANK.NS",
    "sbi": "SBIN.NS",
    "bharti": "BHARTIARTL.NS",
    "airtel": "BHARTIARTL.NS",
    "itc": "ITC.NS",
    "apple": "AAPL",
    "aapl": "AAPL",
    "microsoft": "MSFT",
    "msft": "MSFT",
    "nvidia": "NVDA",
    "nvda": "NVDA",
    "google": "GOOGL",
    "alphabet": "GOOGL",
    "amazon": "AMZN",
    "amzn": "AMZN",
    "meta": "META",
    "facebook": "META",
    "jpmorgan": "JPM",
    "jpm": "JPM",
    "blackrock": "BLK",
    "blk": "BLK",
}

def infer_document_metadata(file_name: str, text_sample: Optional[str] = None) -> Dict[str, Any]:
    """Infer metadata from filename using heuristics."""
    name_lower = file_name.lower()
    
    metadata = {
        "company": "Unknown",
        "ticker": "Unknown",
        "fiscal_year": "Unknown",
        "quarter": "Unknown",
        "document_type": "unknown",
        "source_name": file_name
    }
    
    # 1. Infer Ticker & Company
    for hint, ticker in TICKER_HINTS.items():
        if hint in name_lower:
            metadata["ticker"] = ticker
            metadata["company"] = hint.capitalize()
            break
            
    # 2. Infer Year (e.g. 2023, 2024)
    year_match = re.search(r'(20\d{2})', name_lower)
    if year_match:
        metadata["fiscal_year"] = year_match.group(1)
        
    # 3. Infer Quarter (e.g. q1, q2, q3, q4)
    q_match = re.search(r'(q[1-4])', name_lower)
    if q_match:
        metadata["quarter"] = q_match.group(1).upper()
        
    # 4. Infer Document Type
    if "annual" in name_lower and "report" in name_lower:
        metadata["document_type"] = "annual_report"
    elif "quarterly" in name_lower or "result" in name_lower or ("earnings" in name_lower and "transcript" not in name_lower):
        metadata["document_type"] = "quarterly_result"
    elif "presentation" in name_lower or "deck" in name_lower:
        metadata["document_type"] = "investor_presentation"
    elif "transcript" in name_lower or "call" in name_lower:
        metadata["document_type"] = "earnings_transcript"
    elif "news" in name_lower or "article" in name_lower:
        metadata["document_type"] = "news_article"
    elif "broker" in name_lower or "initiation" in name_lower:
        metadata["document_type"] = "brokerage_report"
    elif "sector" in name_lower or "industry" in name_lower:
        metadata["document_type"] = "sector_report"
        
    return metadata

def create_document_id(source_file: str, page_number: Optional[int] = None) -> str:
    """Create a unique string ID for a document or page."""
    base = source_file.replace(" ", "_").replace("/", "_").replace("\\", "_")
    if page_number is not None:
        return f"{base}_p{page_number}"
    return base
