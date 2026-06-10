from src.rag.factor_extractor import extract_financial_factors_rule_based

def test_factor_extractor_positive():
    chunks = [{"text": "We saw strong growth and margin improvement this year.", "ticker": "AAPL"}]
    factors = extract_financial_factors_rule_based(chunks)
    assert factors["growth_score"] > 0
    assert factors["overall_sentiment_score"] > 0

def test_factor_extractor_negative_debt():
    chunks = [{"text": "Our debt and borrowings have increased due to high capex burden.", "ticker": "RELIANCE.NS"}]
    factors = extract_financial_factors_rule_based(chunks)
    assert factors["debt_risk_score"] > 0
    assert factors["capex_intensity_score"] > 0
    assert factors["risk_score"] > 0
