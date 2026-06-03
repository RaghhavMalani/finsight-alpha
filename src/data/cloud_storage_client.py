"""Cloud Storage client (raw files / PDFs).

Google Cloud Storage (GCS) is an object store - ideal for raw CSV/Parquet
exports and, later, financial PDFs used by the RAG module. This client is
optional: without a bucket / credentials it logs a clear message and returns a
status dictionary rather than crashing.

Every upload method returns a structured status dict, e.g.::

    {"success": True,  "message": "...", "bucket": "my-bucket", "blob": "raw/x.csv"}
    {"success": False, "message": "...", "bucket": None,        "blob": None}
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pandas as pd

from src import config
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

# Sensible default bucket so the client targets the real project bucket even if
# config did not pick the value up from a .env file.
DEFAULT_BUCKET_NAME = "finsight-alpha-498208-finsight-alpha-data"


class CloudStorageClient:
    """Wrapper around ``google-cloud-storage`` with graceful degradation.

    Parameters
    ----------
    bucket_name:
        Target GCS bucket. Falls back to ``GCS_BUCKET_NAME`` env / config, then
        to :data:`DEFAULT_BUCKET_NAME`.
    project_id:
        GCP project id. Falls back to ``GCP_PROJECT_ID`` env / config.
    """

    def __init__(self, bucket_name: str | None = None, project_id: str | None = None) -> None:
        self.bucket_name = (
            bucket_name
            or os.getenv("GCS_BUCKET_NAME")
            or config.GCS_BUCKET_NAME
            or DEFAULT_BUCKET_NAME
        )
        self.project_id = project_id or os.getenv("GCP_PROJECT_ID") or config.GCP_PROJECT_ID
        self._client = None

    # -- configuration / client -------------------------------------------
    def is_configured(self) -> bool:
        """Return ``True`` if a usable bucket handle can be obtained."""
        return self._get_bucket() is not None

    def _get_bucket(self):
        """Lazily build the client and return the bucket handle, or ``None``."""
        if not self.bucket_name:
            logger.info("Cloud Storage not configured (no bucket name).")
            return None

        try:
            if self._client is None:
                from google.cloud import storage

                self._client = storage.Client(project=self.project_id)
                logger.info("Cloud Storage client created.")
            return self._client.bucket(self.bucket_name)
        except Exception as exc:  # missing lib / credentials / network
            logger.info("Cloud Storage unavailable (%s). Uploads will be skipped.", exc)
            return None

    # -- uploads -----------------------------------------------------------
    def upload_file(self, local_path: Path | str, destination_blob_name: str) -> dict[str, Any]:
        """Upload a local file to ``gs://{bucket}/{destination_blob_name}``.

        Returns
        -------
        dict
            ``{"success", "message", "bucket", "blob"}``. Never raises.
        """
        local_path = Path(local_path)
        if not local_path.exists():
            return {
                "success": False,
                "message": f"Local file does not exist: {local_path}",
                "bucket": None,
                "blob": None,
            }

        bucket = self._get_bucket()
        if bucket is None:
            return {
                "success": False,
                "message": "Cloud Storage is not configured. Skipping upload.",
                "bucket": None,
                "blob": None,
            }

        try:
            blob = bucket.blob(destination_blob_name)
            blob.upload_from_filename(str(local_path))
            logger.info(
                "Uploaded %s to gs://%s/%s.", local_path, self.bucket_name, destination_blob_name
            )
            return {
                "success": True,
                "message": "Uploaded file to Cloud Storage.",
                "bucket": self.bucket_name,
                "blob": destination_blob_name,
            }
        except Exception as exc:
            logger.warning("Cloud Storage upload failed: %s", exc)
            return {
                "success": False,
                "message": f"Cloud Storage upload failed: {exc}",
                "bucket": self.bucket_name,
                "blob": destination_blob_name,
            }

    def upload_dataframe_as_csv(
        self, df: pd.DataFrame, destination_blob_name: str
    ) -> dict[str, Any]:
        """Upload a DataFrame directly as a CSV object (no local temp file).

        Returns
        -------
        dict
            ``{"success", "message", "bucket", "blob"}``. Never raises.
        """
        if df is None or df.empty:
            return {
                "success": False,
                "message": "No rows to upload (empty DataFrame).",
                "bucket": None,
                "blob": None,
            }

        bucket = self._get_bucket()
        if bucket is None:
            return {
                "success": False,
                "message": "Cloud Storage is not configured. Skipping upload.",
                "bucket": None,
                "blob": None,
            }

        try:
            blob = bucket.blob(destination_blob_name)
            blob.upload_from_string(df.to_csv(index=False), content_type="text/csv")
            logger.info(
                "Uploaded DataFrame (%s rows) to gs://%s/%s.",
                len(df), self.bucket_name, destination_blob_name,
            )
            return {
                "success": True,
                "message": "Uploaded dataframe (CSV) to Cloud Storage.",
                "bucket": self.bucket_name,
                "blob": destination_blob_name,
            }
        except Exception as exc:
            logger.warning("Cloud Storage DataFrame upload failed: %s", exc)
            return {
                "success": False,
                "message": f"Cloud Storage upload failed: {exc}",
                "bucket": self.bucket_name,
                "blob": destination_blob_name,
            }
