from src.rag.company_ir_discovery import get_known_ir_pages

def test_get_known_ir_pages():
    assert "https://www.ril.com/investors" in get_known_ir_pages("RELIANCE.NS")
    assert not get_known_ir_pages("UNKNOWN_TICKER")
