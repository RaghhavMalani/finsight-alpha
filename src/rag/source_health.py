import pandas as pd
from typing import List, Dict, Any

def record_source_status(
    source_name: str,
    status: str,
    message: str,
    url: str | None = None
) -> dict:
    return {
        "source": source_name,
        "status": status,
        "message": message,
        "url": url
    }

def summarize_source_health(source_records: List[Dict[str, Any]]) -> pd.DataFrame:
    """Aggregate errors by source to prevent UI spam."""
    if not source_records:
        return pd.DataFrame(columns=["Source", "Status", "Action"])
        
    summary = []
    # Group by source
    df = pd.DataFrame(source_records)
    if df.empty:
        return pd.DataFrame(columns=["Source", "Status", "Action"])
        
    for source, group in df.groupby("source"):
        # Find worst status
        statuses = group["status"].tolist()
        if "Blocked by robots.txt" in statuses:
            final_status = "Blocked by robots.txt"
            action = "Open manually"
        elif "Network error" in statuses:
            final_status = "Network error"
            action = "Retry later"
        elif "Requires manual download" in statuses:
            final_status = "Requires manual download"
            action = "Download manually"
        elif "Success" in statuses:
            final_status = "Available"
            action = "Auto-download enabled"
        else:
            final_status = statuses[0]
            action = "Review"
            
        summary.append({
            "Source": source,
            "Status": final_status,
            "Action": action
        })
        
    return pd.DataFrame(summary)
