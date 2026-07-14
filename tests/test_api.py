"""Tests for the FastAPI backend using TestClient.

These tests are network-free: they exercise routing, schemas, and reference
endpoints. Endpoints that would download data are only checked for existence
(via the OpenAPI schema) so the suite stays fast and offline.

Run with::

    pytest -q
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app
from src import config

client = TestClient(app)

# API tests exercise endpoint behavior through the authenticated browser contract.
from src.auth import db as auth_db

auth_db.init_db()
_TEST_EMAIL = "api-tests@finsight.local"
_TEST_PASSWORD = "test-password-1234"
_auth = client.post("/auth/register", json={"email": _TEST_EMAIL, "password": _TEST_PASSWORD})
if _auth.status_code == 400:
    _auth = client.post("/auth/login", json={"email": _TEST_EMAIL, "password": _TEST_PASSWORD})
assert _auth.status_code == 200, _auth.text


def test_health() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["app"] == config.APP_NAME
    assert body["version"] == config.APP_VERSION


def test_root() -> None:
    resp = client.get("/", follow_redirects=False)
    assert resp.status_code == 307
    assert resp.headers["location"]


def test_assets() -> None:
    resp = client.get("/assets")
    assert resp.status_code == 200
    body = resp.json()
    assert "indian" in body and "us" in body and "sectors" in body
    assert "AAPL" in body["us"]
    assert "RELIANCE.NS" in body["indian"]
    # Sector map should cover the known tickers.
    assert body["sectors"]["AAPL"] == "Information Technology"


def test_market_data_routes_exist() -> None:
    # Confirm the routes are registered without invoking network downloads.
    paths = app.openapi()["paths"]
    assert "/market-data/fetch" in paths
    assert any(p.startswith("/market-data/") for p in paths)
    assert "/analytics/summary/{ticker}" in paths
    assert "/analytics/correlation" in paths
    assert "/analytics/sector-comparison" in paths


def test_market_data_fetch_validation() -> None:
    # Empty tickers list should be rejected (400), no network needed.
    resp = client.post("/market-data/fetch", json={"tickers": []})
    assert resp.status_code == 400


def test_get_market_data_missing_returns_404() -> None:
    # A symbol with no processed file on disk should 404 cleanly.
    resp = client.get("/market-data/__definitely_not_a_ticker__")
    assert resp.status_code == 404


def test_summary_missing_returns_404() -> None:
    resp = client.get("/analytics/summary/__definitely_not_a_ticker__")
    assert resp.status_code == 404


def test_correlation_requires_two_tickers() -> None:
    resp = client.post(
        "/analytics/correlation",
        json={"tickers": ["AAPL"], "start_date": "2023-01-01", "end_date": "2024-01-01"},
    )
    assert resp.status_code == 400


def test_fetch_request_schema_has_cloud_storage_flag() -> None:
    # The request schema should advertise the new upload_cloud_storage flag.
    from backend.schemas.market_data_schema import MarketDataFetchRequest

    fields = MarketDataFetchRequest.model_fields
    assert "upload_bigquery" in fields
    assert "upload_cloud_storage" in fields
    # Defaults are off so cloud is opt-in.
    req = MarketDataFetchRequest(tickers=["AAPL"])
    assert req.upload_bigquery is False
    assert req.upload_cloud_storage is False


def test_fetch_response_schema_has_status_dicts() -> None:
    from backend.schemas.market_data_schema import MarketDataFetchResponse

    fields = MarketDataFetchResponse.model_fields
    for name in (
        "local_save_status",
        "bigquery_upload_status",
        "cloud_storage_upload_status",
    ):
        assert name in fields


def test_fetch_returns_structured_statuses(monkeypatch) -> None:
    """The fetch route returns all three status dicts without real network/GCP.

    We monkeypatch the market-data service so no download happens, and leave
    cloud uploads disabled - they should report "not requested".
    """
    import pandas as pd

    import backend.routes.market_data as md

    sample = pd.DataFrame(
        {
            "Date": pd.to_datetime(["2023-01-02", "2023-01-03", "2023-01-04"]),
            "Open": [1.0, 2.0, 3.0],
            "High": [1.0, 2.0, 3.0],
            "Low": [1.0, 2.0, 3.0],
            "Close": [1.0, 2.0, 3.0],
            "Volume": [10, 20, 30],
            "Ticker": ["AAPL", "AAPL", "AAPL"],
            "Provider": ["fake", "fake", "fake"],
        }
    )

    class _FakeService:
        def __init__(self, provider: str) -> None:
            self.provider = provider

        def get_multiple(self, tickers, start, end, skip_errors=True):
            return sample.copy()

    monkeypatch.setattr(md, "MarketDataService", _FakeService)

    resp = client.post(
        "/market-data/fetch",
        json={
            "tickers": ["AAPL"],
            "start_date": "2023-01-01",
            "end_date": "2023-02-01",
            "provider": "fake",
            "save_local": False,
            "upload_bigquery": False,
            "upload_cloud_storage": False,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "success"
    assert "not requested" in body["bigquery_upload_status"]["message"]
    assert "not requested" in body["cloud_storage_upload_status"]["message"]
    assert body["local_save_status"]["success"] is False
