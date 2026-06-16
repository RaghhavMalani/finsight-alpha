"""Prompt templates for the RAG layer.

The templates here enforce the two properties that make a financial RAG system
defensible rather than a demo:

1. **Grounding** - the model may only use the supplied context.
2. **Citations** - every factual claim must carry an inline ``[n]`` marker that
   maps to the numbered context block, so answers are auditable.

``{context}`` is filled with a numbered block produced by
:func:`src.rag.rag_answer._build_numbered_context`::

    [1] (annual_report.pdf, Page 42)
    <text>

    [2] (q3_results.pdf, Page 3)
    <text>
"""

from __future__ import annotations

# System instruction sent alongside the QA prompt (chat models).
FINANCIAL_QA_SYSTEM = (
    "You are a meticulous equity research analyst. You answer ONLY from the "
    "document excerpts provided to you. You never use outside knowledge, never "
    "speculate, and never give investment advice (no buy/sell/hold "
    "recommendations). If the excerpts do not contain the answer, you say so "
    "plainly."
)

FINANCIAL_QA_PROMPT = """\
Use ONLY the numbered excerpts below to answer the question.

Rules:
- Cite every factual claim with the matching excerpt number in square brackets,
  e.g. "Revenue grew 12% YoY [2]." Use multiple citations when relevant [1][3].
- Do NOT use any knowledge outside these excerpts.
- If the excerpts are insufficient, reply exactly:
  "I could not find enough evidence in the indexed documents to answer that."
- Be concise and specific. Prefer numbers and direct quotes from the excerpts.
- Do not give buy/sell/hold advice; describe evidence and uncertainty instead.

Numbered excerpts:
{context}

Question: {query}

Grounded answer (with [n] citations):"""

# JSON factor extraction. Kept strict so the output parses reliably.
FACTOR_EXTRACTION_SYSTEM = (
    "You are a financial analyst that outputs ONLY valid JSON. No prose, no "
    "markdown fences. Score strictly from the provided excerpts."
)

FACTOR_EXTRACTION_PROMPT = """\
From the excerpts below, extract financial factor scores. Output ONLY a single
JSON object with EXACTLY these keys and numeric ranges:

{{
  "overall_sentiment_score": float (-1.0..1.0),
  "risk_score": float (0.0..1.0),
  "growth_score": float (-1.0..1.0),
  "debt_risk_score": float (0.0..1.0),
  "capex_intensity_score": float (0.0..1.0),
  "margin_pressure_score": float (0.0..1.0),
  "cash_flow_quality_score": float (-1.0..1.0),
  "management_tone_score": float (-1.0..1.0),
  "regulatory_risk_score": float (0.0..1.0),
  "key_positive_factors": [up to 5 short strings],
  "key_negative_factors": [up to 5 short strings]
}}

Base every score on evidence in the excerpts only. If a factor is not discussed,
score it 0.0. Output JSON only.

Excerpts:
{context}
"""

RISK_SUMMARY_PROMPT = """\
Summarize the key financial and operational risks in the numbered excerpts.
Return short bullet points, each ending with its source citation, e.g.
"- Rising input costs pressure margins [2]". Use ONLY the excerpts.

Excerpts:
{context}
"""

MANAGEMENT_TONE_PROMPT = """\
Assess management's tone from the numbered excerpts: optimistic, cautious, or
pessimistic. Justify with cited evidence ([n]). Use ONLY the excerpts.

Excerpts:
{context}
"""

SEGMENT_ANALYSIS_PROMPT = """\
Identify the business segments named in the numbered excerpts and summarize each
segment's performance in one line with a citation ([n]). Use ONLY the excerpts.

Excerpts:
{context}
"""
