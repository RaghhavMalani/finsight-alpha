FINANCIAL_QA_PROMPT = """
You are an expert financial analyst. Please answer the question based strictly on the provided document excerpts.
If the excerpts do not contain the answer, say "I could not find enough evidence in the uploaded documents."
Always cite the source document and page number when stating a fact.

Context:
{context}

Question: {query}
Answer:
"""

FACTOR_EXTRACTION_PROMPT = """
Analyze the following document excerpts and extract financial factor scores ranging from -1.0 (very negative) to 1.0 (very positive).
Provide the output strictly in JSON format as follows:
{
  "overall_sentiment_score": float,
  "risk_score": float,  # 0.0 to 1.0
  "growth_score": float, # -1.0 to 1.0
  "debt_risk_score": float, # 0.0 to 1.0
  "capex_intensity_score": float, # 0.0 to 1.0
  "margin_pressure_score": float, # 0.0 to 1.0
  "cash_flow_quality_score": float, # -1.0 to 1.0
  "management_tone_score": float, # -1.0 to 1.0
  "regulatory_risk_score": float, # 0.0 to 1.0
  "key_positive_factors": [list of strings],
  "key_negative_factors": [list of strings]
}

Context:
{context}
"""

RISK_SUMMARY_PROMPT = """
Summarize the key financial and operational risks mentioned in the following excerpts.
List them as bullet points and include citations (Source: Page X).

Context:
{context}
"""

MANAGEMENT_TONE_PROMPT = """
Analyze the management's tone in the provided excerpts. Is it optimistic, cautious, or pessimistic?
Provide evidence for your conclusion.

Context:
{context}
"""

SEGMENT_ANALYSIS_PROMPT = """
Identify the key business segments mentioned in the following text and summarize their performance.

Context:
{context}
"""
