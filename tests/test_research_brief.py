from src.rag.research_brief import generate_research_brief

def test_generate_research_brief():
    chunks = [
        {"text": "The company sees strong growth ahead."},
        {"text": "Key risk is regulatory changes."},
        {"text": "Capex will be minimal this year."}
    ]
    brief = generate_research_brief("TEST", chunks, {"success": True, "company_name": "Test Corp"})
    
    assert brief["ticker"] == "TEST"
    assert brief["company_name"] == "Test Corp"
    assert len(brief["key_growth_drivers"]) > 0
    assert len(brief["key_risks"]) > 0
    assert "Capex discussed in" in brief["capex_and_cashflow"]
    assert len(brief["evidence"]) > 0

def test_generate_research_brief_empty():
    brief = generate_research_brief("TEST", [])
    assert len(brief["open_questions"]) > 0
    assert "No documents indexed" in brief["open_questions"][0]
