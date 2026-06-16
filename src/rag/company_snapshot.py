from typing import Dict, Any

def create_company_snapshot_summary(snapshot: Dict[str, Any]) -> str:
    """Create a textual summary of the company snapshot for LLM context."""
    if not snapshot or not snapshot.get("success"):
        return "Company snapshot unavailable."
        
    name = snapshot.get("company_name", snapshot.get("ticker", "The company"))
    about = snapshot.get("about", "")
    metrics = snapshot.get("snapshot_metrics", {})
    
    summary = f"{name} Company Snapshot:\n"
    if about:
        summary += f"Business Overview: {about}\n\n"
        
    summary += "Key Metrics:\n"
    for k, v in metrics.items():
        summary += f"- {k}: {v}\n"
        
    pros = snapshot.get("pros", [])
    cons = snapshot.get("cons", [])
    
    if pros:
        summary += "\nKey Strengths (Screener Pros):\n"
        for p in pros:
            summary += f"- {p}\n"
            
    if cons:
        summary += "\nKey Concerns (Screener Cons):\n"
        for c in cons:
            summary += f"- {c}\n"
            
    peers = snapshot.get("peer_companies", [])
    if peers:
        summary += f"\nPeers: {', '.join(peers[:5])}\n"
        
    return summary
