from typing import List, Dict, Any, Optional
import pandas as pd
import datetime

def extract_financial_factors_rule_based(
    chunks: List[Dict[str, Any]],
    ticker: Optional[str] = None,
    as_of_date: Optional[str] = None
) -> Dict[str, Any]:
    """Extract factor scores based on keyword rules from retrieved chunks."""
    if not as_of_date:
        as_of_date = datetime.date.today().isoformat()
        
    scores = {
        "overall_sentiment_score": 0.0,
        "risk_score": 0.0,
        "growth_score": 0.0,
        "debt_risk_score": 0.0,
        "capex_intensity_score": 0.0,
        "margin_pressure_score": 0.0,
        "cash_flow_quality_score": 0.0,
        "management_tone_score": 0.0,
        "regulatory_risk_score": 0.0,
    }
    
    pos_keywords = ["growth", "expansion", "strong demand", "margin improvement", "deleveraging", "cash flow improvement", "subscriber growth", "arpu growth"]
    neg_keywords = ["risk", "decline", "margin pressure", "debt", "capex burden", "regulatory", "inflation", "weak demand", "volatility", "crude price", "forex loss"]
    debt_keywords = ["debt", "borrowings", "leverage", "finance cost", "interest expense"]
    capex_keywords = ["capital expenditure", "capex", "investment", "expansion", "project cost"]
    margin_keywords = ["margin pressure", "lower margins", "input cost", "crude volatility", "refining margin"]
    
    pos_matches = []
    neg_matches = []
    evidence = []
    
    for chunk in chunks:
        text = chunk.get("text", "").lower()
        if not text:
            continue
            
        evidence.append(chunk.get("text", "")[:100] + "...")
        
        # Sentiment & Growth
        p_count = sum(1 for kw in pos_keywords if kw in text)
        n_count = sum(1 for kw in neg_keywords if kw in text)
        
        if p_count > n_count:
            scores["overall_sentiment_score"] += 0.2
            scores["growth_score"] += 0.2
            scores["management_tone_score"] += 0.2
            pos_matches.extend([kw for kw in pos_keywords if kw in text])
        elif n_count > p_count:
            scores["overall_sentiment_score"] -= 0.2
            scores["growth_score"] -= 0.1
            scores["management_tone_score"] -= 0.2
            scores["risk_score"] += 0.2
            neg_matches.extend([kw for kw in neg_keywords if kw in text])
            
        # Specific Risks (0 to 1)
        if any(kw in text for kw in debt_keywords):
            scores["debt_risk_score"] += 0.3
        if any(kw in text for kw in capex_keywords):
            scores["capex_intensity_score"] += 0.3
        if any(kw in text for kw in margin_keywords):
            scores["margin_pressure_score"] += 0.3
        if "cash flow" in text and "strong" in text:
            scores["cash_flow_quality_score"] += 0.3
        elif "cash flow" in text and "weak" in text:
            scores["cash_flow_quality_score"] -= 0.3
        if "regulat" in text or "compliance" in text:
            scores["regulatory_risk_score"] += 0.2
            
    # Normalize scores
    for k in scores:
        if k in ["risk_score", "debt_risk_score", "capex_intensity_score", "margin_pressure_score", "regulatory_risk_score"]:
            scores[k] = min(max(scores[k], 0.0), 1.0)
        else:
            scores[k] = min(max(scores[k], -1.0), 1.0)
            
    return {
        "ticker": ticker or (chunks[0].get("ticker", "Unknown") if chunks else "Unknown"),
        "as_of_date": as_of_date,
        **scores,
        "segment_scores": {
            "oil_to_chemicals": 0.0,
            "telecom": 0.0,
            "retail": 0.0,
            "financial_services": 0.0
        },
        "key_positive_factors": list(set(pos_matches))[:5],
        "key_negative_factors": list(set(neg_matches))[:5],
        "evidence": evidence[:3]
    }

_LLM_SCORE_KEYS = [
    "overall_sentiment_score", "risk_score", "growth_score", "debt_risk_score",
    "capex_intensity_score", "margin_pressure_score", "cash_flow_quality_score",
    "management_tone_score", "regulatory_risk_score",
]
_UNIPOLAR_KEYS = {
    "risk_score", "debt_risk_score", "capex_intensity_score",
    "margin_pressure_score", "regulatory_risk_score",
}


def extract_financial_factors_llm(
    chunks: List[Dict[str, Any]],
    ticker: Optional[str] = None,
    llm_provider: str = "none",
    as_of_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Extract factor scores with an LLM, falling back to rules when needed.

    The LLM is asked to return strict JSON (see
    :data:`src.rag.prompt_templates.FACTOR_EXTRACTION_PROMPT`). We clamp every
    score into its valid range and backfill any missing key from the rule-based
    extractor, so the output schema is always complete and safe to feed into the
    ML factor store. If no LLM is available, this transparently returns the
    rule-based result.
    """
    if not as_of_date:
        as_of_date = datetime.date.today().isoformat()

    rule_based = extract_financial_factors_rule_based(chunks, ticker, as_of_date)

    if llm_provider in (None, "none", "") or not chunks:
        return rule_based

    try:
        from src.rag import llm_client, prompt_templates
    except Exception:
        return rule_based

    context = "\n\n".join(
        f"[{i}] {(c.get('text') or '')[:1000]}" for i, c in enumerate(chunks, start=1)
    )
    prompt = prompt_templates.FACTOR_EXTRACTION_PROMPT.format(context=context)

    parsed, result = llm_client.generate_json(
        prompt,
        provider=llm_provider,
        system=prompt_templates.FACTOR_EXTRACTION_SYSTEM,
    )
    if not parsed:
        return rule_based  # parse failure or LLM unavailable -> safe fallback

    # Merge: start from rule-based (complete schema), overlay valid LLM scores.
    merged = dict(rule_based)
    for key in _LLM_SCORE_KEYS:
        if key in parsed:
            try:
                val = float(parsed[key])
            except (TypeError, ValueError):
                continue
            lo = 0.0 if key in _UNIPOLAR_KEYS else -1.0
            merged[key] = min(max(val, lo), 1.0)

    for list_key in ("key_positive_factors", "key_negative_factors"):
        val = parsed.get(list_key)
        if isinstance(val, list):
            merged[list_key] = [str(x) for x in val][:5]

    merged["extraction_method"] = f"llm:{result.provider}"
    return merged

def create_factor_dataframe(factor_records: List[Dict[str, Any]]) -> pd.DataFrame:
    """Create ML-ready factor table."""
    if not factor_records:
        return pd.DataFrame()
        
    records = []
    for r in factor_records:
        records.append({
            "Date": r.get("as_of_date"),
            "Ticker": r.get("ticker"),
            "overall_sentiment_score": r.get("overall_sentiment_score", 0.0),
            "risk_score": r.get("risk_score", 0.0),
            "growth_score": r.get("growth_score", 0.0),
            "debt_risk_score": r.get("debt_risk_score", 0.0),
            "capex_intensity_score": r.get("capex_intensity_score", 0.0),
            "margin_pressure_score": r.get("margin_pressure_score", 0.0),
            "cash_flow_quality_score": r.get("cash_flow_quality_score", 0.0),
            "management_tone_score": r.get("management_tone_score", 0.0),
            "regulatory_risk_score": r.get("regulatory_risk_score", 0.0)
        })
    df = pd.DataFrame(records)
    if not df.empty:
        df["Date"] = pd.to_datetime(df["Date"]).dt.date
    return df
