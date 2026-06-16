from src.rag.document_discovery import rank_document_candidates, deduplicate_candidates

def test_deduplicate_candidates():
    candidates = [
        {"document_url": "https://example.com/1"},
        {"document_url": "https://example.com/1"},
        {"document_url": "https://example.com/2"}
    ]
    deduped = deduplicate_candidates(candidates)
    assert len(deduped) == 2

def test_rank_document_candidates():
    candidates = [
        {"source_name": "Screener.in", "document_type": "annual_report", "document_url": "1.pdf", "confidence": 1.0},
        {"source_name": "Official IR", "document_type": "annual_report", "document_url": "2.pdf", "confidence": 1.0}
    ]
    ranked = rank_document_candidates(candidates)
    assert ranked[0]["source_name"] == "Official IR"
