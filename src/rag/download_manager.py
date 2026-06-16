import os
import json
import uuid
import datetime
from pathlib import Path
from urllib.parse import urlparse
from src.rag.source_policy import can_fetch_url, get_default_headers, polite_sleep

# Lazy load requests to avoid immediate dependency errors if missing
try:
    import requests
except ImportError:
    requests = None

def download_document(
    url: str,
    output_dir: str = "data/documents",
    ticker: str | None = None,
    source_name: str | None = None,
    timeout: int = 20,
    respect_robots: bool = True
) -> dict:
    """Download a document and save metadata."""
    if requests is None:
        return {"success": False, "message": "requests library not installed."}
        
    result = {
        "success": False,
        "url": url,
        "local_path": None,
        "source_name": source_name,
        "file_type": None,
        "status_code": None,
        "message": "",
        "metadata_path": None
    }
    
    # Check robots.txt
    allowed, msg = can_fetch_url(url, respect_robots=respect_robots)
    if not allowed:
        result["message"] = msg
        return result
        
    try:
        response = requests.get(url, headers=get_default_headers(), timeout=timeout, stream=True)
        result["status_code"] = response.status_code
        
        if response.status_code == 200:
            content_type = response.headers.get('Content-Type', '').lower()
            
            # Determine file extension
            ext = ".html"
            if "pdf" in content_type:
                ext = ".pdf"
            elif "text/plain" in content_type:
                ext = ".txt"
            elif "wordprocessingml" in content_type:
                ext = ".docx"
            elif url.lower().endswith(".pdf"):
                ext = ".pdf"
                
            result["file_type"] = ext
            
            # Create safe directory
            safe_ticker = "".join([c for c in (ticker or "unknown") if c.isalnum() or c in ['_', '-']])
            save_dir = Path(output_dir) / safe_ticker
            save_dir.mkdir(parents=True, exist_ok=True)
            
            # Create safe filename
            unique_id = str(uuid.uuid4())[:8]
            parsed_url = urlparse(url)
            filename = Path(parsed_url.path).name
            if not filename or "." not in filename:
                filename = f"document_{unique_id}{ext}"
            else:
                filename = f"{Path(filename).stem}_{unique_id}{ext}"
                
            safe_filename = "".join([c for c in filename if c.isalnum() or c in ['_', '-', '.']])
            local_path = save_dir / safe_filename
            
            # Save file
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
                    
            result["success"] = True
            result["local_path"] = str(local_path)
            result["message"] = "Download successful"
            
            # Save metadata
            metadata = {
                "url": url,
                "source_name": source_name,
                "ticker": ticker,
                "downloaded_at": datetime.datetime.now().isoformat(),
                "content_type": content_type,
                "status_code": response.status_code,
                "local_path": str(local_path)
            }
            meta_path = local_path.with_suffix(f"{ext}.meta.json")
            with open(meta_path, 'w') as mf:
                json.dump(metadata, mf, indent=2)
                
            result["metadata_path"] = str(meta_path)
        else:
            result["message"] = f"Failed with status code {response.status_code}"
            
    except Exception as e:
        result["message"] = f"Download error: {e}"
        
    return result

def download_documents_batch(
    candidates: list[dict],
    output_dir: str = "data/documents",
    max_downloads: int = 5,
    respect_robots: bool = True
) -> list[dict]:
    """Download a batch of documents politely."""
    results = []
    downloaded = 0
    
    for candidate in candidates:
        if downloaded >= max_downloads:
            break
            
        url = candidate.get("document_url")
        if not url:
            continue
            
        polite_sleep(2.0) # rate limit
        
        res = download_document(
            url=url,
            output_dir=output_dir,
            ticker=candidate.get("ticker"),
            source_name=candidate.get("source_name"),
            timeout=30,
            respect_robots=respect_robots
        )
        
        results.append({
            "candidate": candidate,
            "result": res
        })
        
        if res["success"]:
            downloaded += 1
            
    return results
