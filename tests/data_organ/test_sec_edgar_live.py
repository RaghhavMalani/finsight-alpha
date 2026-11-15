"""Opt-in live SEC smoke test: FINSIGHT_NETWORK_TESTS=1 (two rate-limited requests)."""

import os

import pytest

from src.data_organ import sec_edgar
from src.data_organ.registry import Registry
from src.data_organ.service import Service
from src.truth.fundamentals import AVAILABLE, FundamentalsBook

pytestmark = pytest.mark.skipif(
    os.environ.get("FINSIGHT_NETWORK_TESTS") != "1",
    reason="live SEC EDGAR access is opt-in (FINSIGHT_NETWORK_TESTS=1)",
)


def test_live_companyfacts_admits_and_reads_point_in_time(tmp_path):
    captures = sec_edgar.fetch_companyfacts("AAPL")
    service = Service(Registry(tmp_path / "admissions.duckdb"), tmp_path / "captures")
    for cap, raw, rows in captures:
        assert cap.metadata["cik"] == "0000320193"
        service.ingest("live", cap, raw, rows, window=("2009-01-01", "2100-12-31"))
    book = FundamentalsBook.from_registry(service.registry, "live")
    result = book.fundamentals("AAPL", "assets", "2024-01-01T00:00:00Z")
    assert result.status == AVAILABLE and result.evidence["available_at"] <= "2024-01-01"
    assert result.evidence["effective_at"] <= result.evidence["available_at"]
