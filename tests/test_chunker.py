from src.rag.chunker import chunk_documents, clean_financial_text

def test_clean_financial_text():
    text = "This   has \n\n too many \t\t spaces. $100M  5% "
    cleaned = clean_financial_text(text)
    assert cleaned == "This has \n too many spaces. $100M 5%"

def test_chunk_documents():
    pages = [
        {
            "text": "A" * 1000,
            "source_file": "reliance_annual_report_2023.pdf",
            "page_number": 1
        }
    ]
    chunks = chunk_documents(pages, chunk_size=800, chunk_overlap=100)
    
    assert len(chunks) >= 2
    assert chunks[0]["company"] == "Reliance"
    assert chunks[0]["fiscal_year"] == "2023"
