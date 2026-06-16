from typing import Dict, Any, List

def generate_research_brief(ticker: str, retrieved_or_indexed_chunks: List[Dict[str, Any]], company_snapshot: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Generate a structured investment research brief from retrieved chunks and company snapshot."""
    
    company_name = ticker
    business_summary = ""
    
    if company_snapshot and company_snapshot.get("success"):
        company_name = company_snapshot.get("company_name", ticker)
        business_summary = company_snapshot.get("about", "")
    
    if not business_summary:
        business_summary = "Business overview is not available. Please ingest an Annual Report to generate a full overview."
        
    brief = {
        "ticker": ticker,
        "company_name": company_name,
        "business_summary": business_summary,
        "key_growth_drivers": [],
        "key_risks": [],
        "margin_outlook": "Insufficient data to determine margin outlook.",
        "capex_and_cashflow": "Insufficient data to determine capex plans.",
        "debt_and_balance_sheet": "Insufficient data to determine debt position.",
        "segment_analysis": {},
        "bull_case": [],
        "bear_case": [],
        "open_questions": [],
        "evidence": []
    }
    
    if not retrieved_or_indexed_chunks:
        brief["open_questions"].append("No documents indexed for this company. What is the core business?")
        return brief
        
    growth_chunks = []
    risk_chunks = []
    margin_chunks = []
    capex_chunks = []
    debt_chunks = []
    bull_chunks = []
    bear_chunks = []
    
    for c in retrieved_or_indexed_chunks:
        text = c.get("text", "").lower()
        if "growth" in text or "expansion" in text or "increase in revenue" in text:
            growth_chunks.append(c.get("text"))
        if "risk" in text or "challenge" in text or "decline" in text or "threat" in text:
            risk_chunks.append(c.get("text"))
        if "margin" in text or "ebitda" in text or "profitability" in text:
            margin_chunks.append(c.get("text"))
        if "capex" in text or "capital expenditure" in text or "cash flow" in text:
            capex_chunks.append(c.get("text"))
        if "debt" in text or "leverage" in text or "borrowing" in text:
            debt_chunks.append(c.get("text"))
        if "competitive advantage" in text or "market leader" in text or "tailwinds" in text:
            bull_chunks.append(c.get("text"))
        if "headwinds" in text or "competition" in text or "regulatory" in text:
            bear_chunks.append(c.get("text"))
            
    if growth_chunks:
        brief["key_growth_drivers"] = [
            f"Mentions of growth or expansion found in {len(growth_chunks)} passages."
        ]
        brief["evidence"].append({"category": "Growth", "text": growth_chunks[0][:200] + "..."})
        
    if risk_chunks:
        brief["key_risks"] = [
            f"Mentions of risks or challenges found in {len(risk_chunks)} passages."
        ]
        brief["evidence"].append({"category": "Risk", "text": risk_chunks[0][:200] + "..."})
        
    if margin_chunks:
        brief["margin_outlook"] = f"Margins discussed in {len(margin_chunks)} passages. Example: {margin_chunks[0][:150]}..."
        
    if capex_chunks:
        brief["capex_and_cashflow"] = f"Capex discussed in {len(capex_chunks)} passages. Example: {capex_chunks[0][:150]}..."
        
    if debt_chunks:
        brief["debt_and_balance_sheet"] = f"Debt discussed in {len(debt_chunks)} passages. Example: {debt_chunks[0][:150]}..."
        
    if bull_chunks:
        brief["bull_case"] = ["Market leadership and competitive advantages frequently cited."]
        
    if bear_chunks:
        brief["bear_case"] = ["Macro headwinds, regulatory risks, and competition are primary concerns."]
        
    if not growth_chunks and not risk_chunks:
        brief["open_questions"].append("What are the specific quantitative targets for next fiscal year?")
        brief["open_questions"].append("How will macroeconomic factors impact revenue?")
        
    return brief
