from unittest.mock import patch, MagicMock
from src.rag.screener_discovery import get_screener_company_url, discover_screener_documents

def test_get_screener_company_url():
    assert get_screener_company_url("RELIANCE.NS") == "https://www.screener.in/company/RELIANCE/"
    assert get_screener_company_url("AAPL") == ""
    
@patch('src.rag.screener_discovery.requests.get')
@patch('src.rag.screener_discovery.can_fetch_url')
def test_discover_screener_documents(mock_can_fetch, mock_get):
    mock_can_fetch.return_value = (True, "Allowed")
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '''
        <html>
            <body>
                <a href="/documents/annual-report-2024.pdf">Annual Report 2024</a>
                <a href="/documents/presentation.pdf">Investor Presentation</a>
                <a href="/about-us">About Us</a>
            </body>
        </html>
    '''
    mock_get.return_value = mock_response
    
    candidates = discover_screener_documents("RELIANCE.NS")
    
    assert len(candidates) == 2
    assert candidates[0]["document_type"] == "annual_report"
    assert candidates[1]["document_type"] == "investor_presentation"
