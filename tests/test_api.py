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


def test_health() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["app"] == config.APP_NAME
    assert body["version"] == config.APP_VERSION


def test_root() -> None:
    resp = client.get("/")
    assert resp.status_code == 200
    assert "message" in resp.json()


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
