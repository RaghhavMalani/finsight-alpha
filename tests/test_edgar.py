"""Offline tests for the EDGAR fetcher (requests fully mocked, no network)."""

from __future__ import annotations

import json

import pytest

from src.rag import edgar


class _FakeResp:
    def __init__(self, status=200, payload=None, text=""):
        self.status_code = status
        self._payload = payload
        self.text = text

    def json(self):
        return self._payload


TICKER_MAP = {
    "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
    "1": {"cik_str": 789019, "ticker": "MSFT", "title": "Microsoft Corp"},
}

SUBMISSIONS = {
    "cik": "320193",
    "filings": {
        "recent": {
            "form": ["8-K", "10-K", "10-Q", "4"],
            "accessionNumber": ["0000320193-24-000100", "0000320193-24-000123",
                                 "0000320193-24-000200", "0000320193-24-000300"],
            "primaryDocument": ["a8k.htm", "aapl-20240928.htm", "aapl-10q.htm", "form4.xml"],
            "filingDate": ["2024-10-01", "2024-11-01", "2024-08-01", "2024-07-01"],
            "primaryDocDescription": ["8-K", "10-K", "10-Q", "FORM 4"],
        }
    },
}

FILING_HTML = "<html><body><script>x=1</script><h1>Risk Factors</h1>" \
              "<p>Crude oil volatility is a key risk.</p></body></html>"


def _fake_get(url, headers=None, timeout=None):
    if "company_tickers.json" in url:
        return _FakeResp(payload=TICKER_MAP)
    if "submissions/CIK" in url:
        return _FakeResp(payload=SUBMISSIONS)
    if url.endswith(".htm"):
        return _FakeResp(text=FILING_HTML)
    return _FakeResp(status=404)


@pytest.fixture(autouse=True)
def _no_network(monkeypatch, tmp_path):
    monkeypatch.setattr(edgar.requests, "get", _fake_get)
    monkeypatch.setattr(edgar, "time", type("T", (), {"sleep": staticmethod(lambda *_: None)}))
    # Redirect the ticker-map cache into a temp dir so tests don't touch real data/.
    monkeypatch.setattr(edgar, "_TICKER_CACHE", tmp_path / "tickers.json")
    monkeypatch.setattr(edgar, "_CACHE_DIR", tmp_path)


def test_get_cik_resolves_and_pads():
    assert edgar.get_cik("AAPL") == "0000320193"
    assert edgar.get_cik("msft") == "0000789019"


def test_non_us_ticker_rejected():
    with pytest.raises(edgar.EdgarError):
        edgar.get_cik("RELIANCE.NS")


def test_recent_filings_filters_and_builds_url():
    filings = edgar.recent_filings("AAPL", forms=("10-K",), limit=5)
    assert len(filings) == 1
    f = filings[0]
    assert f["form"] == "10-K"
    # URL uses unpadded CIK + dash-stripped accession + primary doc.
    assert f["url"] == (
        "https://www.sec.gov/Archives/edgar/data/320193/"
        "000032019324000123/aapl-20240928.htm"
    )


def test_recent_filings_limit_and_multi_form():
    filings = edgar.recent_filings("AAPL", forms=("10-K", "10-Q"), limit=2)
    assert [f["form"] for f in filings] == ["10-K", "10-Q"]


def test_html_extraction_strips_scripts():
    text = edgar._html_to_text(FILING_HTML)
    assert "Risk Factors" in text and "Crude oil volatility" in text
    assert "x=1" not in text  # script content removed


def test_fetch_filings_writes_text(tmp_path):
    paths, dest = edgar.fetch_filings_for_ticker(
        "AAPL", forms=("10-K",), limit=1, doc_root=str(tmp_path / "docs")
    )
    assert len(paths) == 1
    content = paths[0].read_text(encoding="utf-8")
    assert "SEC EDGAR" in content and "Risk Factors" in content
