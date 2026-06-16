from typing import Dict, Any, List

def extract_segment_intelligence(chunks: List[Dict[str, Any]], ticker: str | None = None) -> Dict[str, Any]:
    """Detect major business segments and extract factor intelligence per segment."""
    
    segment_keywords = {
        "O2C / Energy": ["o2c", "oil to chemicals", "refining", "petrochemicals", "energy"],
        "Digital Services / Telecom": ["jio", "digital services", "telecom", "broadband", "arpu"],
        "Retail": ["retail", "stores", "consumer", "reliance retail"],
        "IT Services": ["bfsi", "it services", "digital transformation", "cloud", "consulting"],
        "Banking / Financial": ["retail banking", "corporate banking", "treasury", "casa", "npa"]
    }
    
    segment_intelligence = {}
    
    for seg_name, keywords in segment_keywords.items():
        seg_chunks = []
        for c in chunks:
            text = c.get("text", "").lower()
            if any(kw in text for kw in keywords):
                seg_chunks.append(c)
                
        if len(seg_chunks) > 0:
            sentiment = 0.5
            growth = 0.5
            risk = 0.5
            evidence = []
            
            for c in seg_chunks:
                t = c.get("text", "").lower()
                if "growth" in t or "increase" in t or "strong" in t or "momentum" in t:
                    sentiment += 0.05
                    growth += 0.1
                if "risk" in t or "decline" in t or "weak" in t or "challenge" in t:
                    sentiment -= 0.05
                    risk += 0.1
                    
                if len(evidence) < 3:
                    evidence.append(c.get("text", "")[:150] + "...")
                    
            segment_intelligence[seg_name] = {
                "sentiment_score": min(1.0, max(0.0, sentiment)),
                "growth_score": min(1.0, growth),
                "risk_score": min(1.0, risk),
                "evidence_count": len(seg_chunks),
                "evidence": evidence
            }
            
    return {"segments": segment_intelligence}
