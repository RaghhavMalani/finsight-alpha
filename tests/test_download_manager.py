import os
import json
from unittest.mock import patch, MagicMock
from src.rag.download_manager import download_document

@patch('src.rag.download_manager.requests.get')
@patch('src.rag.download_manager.can_fetch_url')
def test_download_document_success(mock_can_fetch, mock_get, tmp_path):
    mock_can_fetch.return_value = (True, "Allowed")
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.headers = {'Content-Type': 'application/pdf'}
    mock_response.iter_content.return_value = [b"mock pdf content"]
    mock_get.return_value = mock_response
    
    output_dir = tmp_path / "documents"
    
    result = download_document(
        url="https://example.com/report.pdf",
        output_dir=str(output_dir),
        ticker="TEST.NS",
        source_name="MockSource"
    )
    
    assert result["success"] is True
    assert result["file_type"] == ".pdf"
    assert os.path.exists(result["local_path"])
    assert os.path.exists(result["metadata_path"])
    
    with open(result["metadata_path"], 'r') as f:
        meta = json.load(f)
        assert meta["ticker"] == "TEST.NS"
        assert meta["source_name"] == "MockSource"
