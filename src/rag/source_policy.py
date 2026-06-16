import urllib.robotparser
import urllib.parse
import time

def get_default_headers() -> dict:
    return {
        "User-Agent": "FinSightAlphaResearchBot/1.0 educational local research",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

def normalize_url(url: str, base_url: str = "") -> str:
    """Normalize a URL to be absolute."""
    if not url:
        return ""
    if url.startswith("http"):
        return url
    if base_url:
        return urllib.parse.urljoin(base_url, url)
    return ""

def can_fetch_url(url: str, user_agent: str = "FinSightAlphaResearchBot/1.0", respect_robots: bool = True) -> tuple[bool, str]:
    """Check if the bot is allowed to fetch the URL according to robots.txt."""
    if not respect_robots:
        return True, "Robots.txt check disabled."
        
    parsed = urllib.parse.urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return False, "Invalid URL."
        
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    
    # We will use requests to fetch robots.txt with timeout to avoid hanging
    import requests
    rp = urllib.robotparser.RobotFileParser()
    try:
        response = requests.get(robots_url, headers=get_default_headers(), timeout=5)
        if response.status_code == 200:
            rp.parse(response.text.splitlines())
            allowed = rp.can_fetch(user_agent, url)
            if allowed:
                return True, "Allowed by robots.txt"
            else:
                return False, "Blocked by robots.txt"
        elif response.status_code in [401, 403]:
             return False, f"Robots.txt access denied ({response.status_code})."
        else:
             return True, f"Robots.txt not found ({response.status_code}), proceeding cautiously."
    except Exception as e:
        return True, f"Could not verify robots.txt; proceeding cautiously. Error: {e}"

def is_allowed_file_type(url: str) -> bool:
    """Check if the URL points to an allowed file type for ingestion."""
    url_lower = url.lower()
    allowed_exts = [".pdf", ".txt", ".docx", ".html", ".htm"]
    
    parsed = urllib.parse.urlparse(url_lower)
    path = parsed.path
    if not path:
        return True 
        
    if any(path.endswith(ext) for ext in allowed_exts):
        return True
        
    # If there is no extension, it's likely a regular web page returning HTML
    filename = path.split("/")[-1]
    if "." not in filename:
        return True
        
    return False

def is_probably_financial_document(url: str, text: str | None = None) -> bool:
    """Determine if URL/text indicates a financial document."""
    terms = [
        "annual report", "annual-report", "investor presentation", 
        "earnings call", "transcript", "quarterly results", "financial results", 
        "results presentation", "concall", "credit rating", "press release", 
        "management discussion", "investor relations", "bse", "nse"
    ]
    target = f"{url} {text if text else ''}".lower()
    for term in terms:
        if term in target:
            return True
    return False

def polite_sleep(seconds: float = 1.0):
    time.sleep(seconds)
