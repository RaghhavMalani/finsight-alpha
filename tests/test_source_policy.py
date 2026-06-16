import pytest
from src.rag.source_policy import normalize_url, is_allowed_file_type, is_probably_financial_document

def test_normalize_url():
    assert normalize_url("https://example.com/doc.pdf") == "https://example.com/doc.pdf"
    assert normalize_url("/doc.pdf", "https://example.com") == "https://example.com/doc.pdf"
    assert normalize_url("doc.pdf", "https://example.com/sub/") == "https://example.com/sub/doc.pdf"
    assert normalize_url("") == ""

def test_is_allowed_file_type():
    assert is_allowed_file_type("https://example.com/report.pdf") is True
    assert is_allowed_file_type("https://example.com/report.txt") is True
    assert is_allowed_file_type("https://example.com/report.docx") is True
    assert is_allowed_file_type("https://example.com/report.html") is True
    assert is_allowed_file_type("https://example.com/report.htm") is True
    assert is_allowed_file_type("https://example.com/report.exe") is False
    assert is_allowed_file_type("https://example.com/route/without/extension") is True

def test_is_probably_financial_document():
    assert is_probably_financial_document("https://example.com/annual-report-2024.pdf") is True
    assert is_probably_financial_document("https://example.com/random.pdf", text="Q2 Results Presentation") is True
    assert is_probably_financial_document("https://example.com/menu.pdf", text="Our lunch menu") is False
