"""Tests for the cloud clients' graceful local-fallback behavior.

These tests must pass WITHOUT any real GCP credentials. They assert that the
clients return structured status dictionaries (never raise) and report a
"not configured" style outcome when GCP is unavailable.

Run with::

    pytest -q
"""

from __future__ import annotations

import pandas as pd

from src.data.bigquery_client import BigQueryClient
from src.data.cloud_storage_client import CloudStorageClient


def _force_unconfigured_bq(monkeypatch) -> BigQueryClient:
    client = BigQueryClient(project_id="test-project", dataset="test_ds")
    # Pretend no underlying client can be built (no creds / no lib).
    monkeypatch.setattr(client, "_get_client", lambda: None)
    return client


def _force_unconfigured_gcs(monkeypatch) -> CloudStorageClient:
    client = CloudStorageClient(bucket_name="test-bucket", project_id="test-project")
    monkeypatch.setattr(client, "_get_bucket", lambda: None)
    return client


# --- BigQuery ---------------------------------------------------------------
def test_bigquery_upload_dataframe_unconfigured(monkeypatch) -> None:
    client = _force_unconfigured_bq(monkeypatch)
    df = pd.DataFrame({"a": [1, 2, 3]})
    status = client.upload_dataframe(df, "some_table")
    assert isinstance(status, dict)
    assert status["success"] is False
    assert "not configured" in status["message"].lower()
    assert status["rows"] == 0


def test_bigquery_empty_dataframe() -> None:
    client = BigQueryClient(project_id="test-project", dataset="test_ds")
    status = client.upload_dataframe(pd.DataFrame(), "some_table")
    assert status["success"] is False
    assert status["rows"] == 0


def test_bigquery_market_helpers_unconfigured(monkeypatch) -> None:
    client = _force_unconfigured_bq(monkeypatch)
    df = pd.DataFrame({"Close": [1.0, 2.0]})
    assert client.upload_market_prices(df)["success"] is False
    assert client.upload_market_analytics(df)["success"] is False


def test_bigquery_is_configured_returns_bool(monkeypatch) -> None:
    client = _force_unconfigured_bq(monkeypatch)
    assert client.is_configured() is False


# --- Cloud Storage ----------------------------------------------------------
def test_gcs_upload_dataframe_unconfigured(monkeypatch) -> None:
    client = _force_unconfigured_gcs(monkeypatch)
    df = pd.DataFrame({"a": [1, 2, 3]})
    status = client.upload_dataframe_as_csv(df, "raw/test.csv")
    assert isinstance(status, dict)
    assert status["success"] is False
    assert "not configured" in status["message"].lower()


def test_gcs_empty_dataframe() -> None:
    client = CloudStorageClient(bucket_name="test-bucket")
    status = client.upload_dataframe_as_csv(pd.DataFrame(), "raw/test.csv")
    assert status["success"] is False


def test_gcs_upload_missing_file(tmp_path) -> None:
    client = CloudStorageClient(bucket_name="test-bucket")
    missing = tmp_path / "does_not_exist.csv"
    status = client.upload_file(missing, "raw/x.csv")
    assert status["success"] is False
    assert "does not exist" in status["message"].lower()


def test_gcs_is_configured_returns_bool(monkeypatch) -> None:
    client = _force_unconfigured_gcs(monkeypatch)
    assert client.is_configured() is False
