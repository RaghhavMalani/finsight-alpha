import urllib.parse
from typing import Dict, Any
from src.rag.source_policy import can_fetch_url, get_default_headers

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    requests = None
    BeautifulSoup = None

def get_screener_url(ticker: str) -> str:
    if not ticker:
        return ""
    if ticker.endswith(".NS") or ticker.endswith(".BO"):
        symbol = ticker.split(".")[0]
        return f"https://www.screener.in/company/{symbol}/"
    return ""

def fetch_screener_snapshot(ticker: str, respect_robots: bool = True) -> Dict[str, Any]:
    """Fetch public company snapshot from Screener.in."""
    result = {
        "success": False,
        "ticker": ticker,
        "source": "Screener.in",
        "source_url": "",
        "company_name": "",
        "snapshot_metrics": {},
        "about": "",
        "pros": [],
        "cons": [],
        "peer_companies": [],
        "tables": {},
        "message": ""
    }
    
    if not requests or not BeautifulSoup:
        result["message"] = "requests or beautifulsoup4 not installed."
        return result
        
    company_url = get_screener_url(ticker)
    if not company_url:
        result["message"] = "Screener snapshot unavailable for this ticker (Indian markets only)."
        return result
        
    result["source_url"] = company_url
    
    allowed, _ = can_fetch_url(company_url, respect_robots=respect_robots)
    if not allowed:
        result["message"] = "Blocked by robots.txt"
        return result
        
    try:
        response = requests.get(company_url, headers=get_default_headers(), timeout=15)
        if response.status_code != 200:
            result["message"] = f"Failed to fetch data (Status {response.status_code})"
            return result
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Company Name
        h1 = soup.find('h1')
        if h1:
            result["company_name"] = h1.get_text(strip=True)
            
        # About
        about_div = soup.find('div', class_='about')
        if about_div:
            # First few paragraphs
            paragraphs = about_div.find_all('p')
            result["about"] = " ".join([p.get_text(strip=True) for p in paragraphs])
            
        # Metrics
        metrics = {}
        for li in soup.find_all('li', class_='flex flex-space-between'):
            name_span = li.find('span', class_='name')
            num_span = li.find('span', class_='number')
            if name_span and num_span:
                name = name_span.get_text(strip=True)
                val = num_span.get_text(strip=True)
                metrics[name] = val
        result["snapshot_metrics"] = metrics
        
        # Pros / Cons
        analysis = soup.find('section', id='analysis')
        if analysis:
            pros_div = analysis.find('div', class_='pros')
            if pros_div:
                result["pros"] = [li.get_text(strip=True) for li in pros_div.find_all('li')]
            cons_div = analysis.find('div', class_='cons')
            if cons_div:
                result["cons"] = [li.get_text(strip=True) for li in cons_div.find_all('li')]
                
        # Peers
        peers_section = soup.find('section', id='peers')
        if peers_section:
            for a in peers_section.find_all('a', href=True):
                if "/company/" in a['href']:
                    result["peer_companies"].append(a.get_text(strip=True))
        result["peer_companies"] = list(set([p for p in result["peer_companies"] if p]))
        
        result["success"] = True
        result["message"] = "Snapshot fetched successfully."
        
    except Exception as e:
        result["message"] = f"Error extracting snapshot: {e}"
        
    return result
