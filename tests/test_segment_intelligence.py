from src.rag.segment_intelligence import extract_segment_intelligence

def test_extract_segment_intelligence():
    chunks = [
        {"text": "The O2C business showed strong growth."},
        {"text": "Jio digital services experienced a decline in ARPU and faces risk."},
        {"text": "Retail stores expanded massively this year."}
    ]
    
    intel = extract_segment_intelligence(chunks, "RELIANCE.NS")
    segments = intel["segments"]
    
    assert "O2C / Energy" in segments
    assert "Digital Services / Telecom" in segments
    assert "Retail" in segments
    
    assert segments["O2C / Energy"]["growth_score"] > 0.5
    assert segments["Digital Services / Telecom"]["risk_score"] > 0.5
    
def test_extract_segment_intelligence_no_segments():
    chunks = [{"text": "We just sell widgets."}]
    intel = extract_segment_intelligence(chunks, "TEST")
    assert len(intel["segments"]) == 0
