from src.data_organ.revisions import predecessor, summarize


def test_vintage_predecessor_only_uses_available_revision(evidence):
    row = evidence[3][0]
    revised = {
        **row,
        "value": 4.2,
        "available_at": "2025-03-01T12:00:00Z",
        "revision": "r2",
    }
    assert (
        predecessor([row, revised], row["observed_at"], "2025-02-20T00:00:00Z")["value"]
        == 4.0
    )
    assert (
        predecessor([row, revised], row["observed_at"], "2025-03-01T12:00:00Z")["value"]
        == 4.2
    )
    assert summarize([row, revised], "PUBLICATION_TIMESTAMP")["transitions"] == 1
    assert summarize([row, revised], "CAPTURE_ONLY")["status"] == "UNAVAILABLE"
