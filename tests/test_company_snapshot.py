from src.rag.company_snapshot import create_company_snapshot_summary

def test_create_company_snapshot_summary_success():
    snap = {
        "success": True,
        "company_name": "TestCorp",
        "about": "We are a test corp.",
        "snapshot_metrics": {"P/E": "20.5", "Market Cap": "100Cr"},
        "pros": ["Good debt"],
        "cons": ["Low ROE"],
        "peer_companies": ["PeerA", "PeerB"]
    }
    summary = create_company_snapshot_summary(snap)
    assert "TestCorp Company Snapshot" in summary
    assert "We are a test corp" in summary
    assert "P/E: 20.5" in summary
    assert "Good debt" in summary
    assert "Low ROE" in summary
    assert "PeerA" in summary

def test_create_company_snapshot_summary_fail():
    snap = {"success": False}
    assert "Company snapshot unavailable" in create_company_snapshot_summary(snap)
