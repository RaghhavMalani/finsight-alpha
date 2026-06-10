import os
from src.rag.document_loader import load_txt_document

def test_load_txt_document(tmp_path):
    test_file = tmp_path / "test.txt"
    test_file.write_text("This is a test document.\nWith multiple lines.")
    
    pages = load_txt_document(str(test_file))
    
    assert len(pages) == 1
    assert "This is a test document." in pages[0]["text"]
    assert pages[0]["document_type"] == "txt"
    assert pages[0]["page_number"] == 1
