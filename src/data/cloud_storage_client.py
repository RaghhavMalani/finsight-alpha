"""Cloud Storage client (raw files / PDFs).

Google Cloud Storage (GCS) is an object store - ideal for raw CSV/Parquet
exports and, later, financial PDFs used by the RAG module. This client is
optional: without a bucket / credentials it logs a clear message and no-ops.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from src import config
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)


class CloudStorageClient:
    """Wrapper around ``google-cloud-storage`` with graceful degradation.

    Parameters
    ----------
    bucket_name:
        Target GCS bucket. Defaults to ``config.GCS_BUCKET_NAME``.
    project_id:
        GCP project id. Defaults to ``config.GCP_PROJECT_ID``.
    """

    def __init__(self, bucket_name: str | None = None, project_id: str | None = None) -> None:
        self.bucket_name = bucket_name or config.GCS_BUCKET_NAME
        self.project_id = project_id or config.GCP_PROJECT_ID
        self._client = None

    @property
    def is_configured(self) -> bool:
        """Whether a bucket name is available."""
        return bool(self.bucket_name)

    def _get_bucket(self):
        """Lazily build the client and return the bucket handle, or ``None``."""
        if not self.is_configured:
            logger.info(
                "Cloud Storage not configured (GCS_BUCKET_NAME unset). "
                "Upload is optional in local development."
            )
            return None

        try:
            if self._client is None:
                from google.cloud import storage

                self._client = storage.Client(project=self.project_id)
                logger.info("Cloud Storage client created.")
            return self._client.bucket(self.bucket_name)
        except Exception as exc:  # missing lib / credentials
            logger.warning("Could not create Cloud Storage client: %s", exc)
            return None

    def upload_file(self, local_path: Path | str, destination_blob_name: str) -> bool:
        """Upload a local file to ``gs://{bucket}/{destination_blob_name}``.

        Returns
        -------
        bool
            ``True`` on success, ``False`` if GCS is unavailable / upload failed.
        """
        local_path = Path(local_path)
        if not local_path.exists():
            logger.warning("upload_file: local path does not exist: %s", local_path)
            return False

        bucket = self._get_bucket()
        if bucket is None:
            logger.info(
                "[skip] Would upload %s to gs://%s/%s (GCS not configured).",
                local_path, self.bucket_name or "<unset>", destination_blob_name,
            )
            return False

        try:
            blob = bucket.blob(destination_blob_name)
            blob.upload_from_filename(str(local_path))
            logger.info("Uploaded %s to gs://%s/%s.", local_path, self.bucket_name, destination_blob_name)
            return True
        except Exception as exc:
            logger.warning("Cloud Storage upload failed: %s", exc)
            return False

    def upload_dataframe_as_csv(self, df: pd.DataFrame, destination_blob_name: str) -> bool:
        """Upload a DataFrame directly as a CSV object (no local temp file).

        Returns
        -------
        bool
            ``True`` on success, ``False`` otherwise.
        """
        if df is None or df.empty:
            logger.info("upload_dataframe_as_csv: nothing to upload (empty frame).")
            return False

        bucket = self._get_bucket()
        if bucket is None:
            logger.info(
                "[skip] Would upload DataFrame (%s rows) to gs://%s/%s (GCS not configured).",
                len(df), self.bucket_name or "<unset>", destination_blob_name,
            )
            return False

        try:
            blob = bucket.blob(destination_blob_name)
            blob.upload_from_string(df.to_csv(index=False), content_type="text/csv")
            logger.info(
                "Uploaded DataFrame (%s rows) to gs://%s/%s.",
                len(df), self.bucket_name, destination_blob_name,
            )
            return True
        except Exception as exc:
            logger.warning("Cloud Storage DataFrame upload failed: %s", exc)
            return False
