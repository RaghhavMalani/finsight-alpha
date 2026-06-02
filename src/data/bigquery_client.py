"""BigQuery client (analytics warehouse).

BigQuery is where processed daily prices and computed analytics will live at
scale, so the dashboard/API can query years of history fast. This client is
fully optional: in local development without GCP credentials, every method logs
a clear message and no-ops rather than crashing.
"""

from __future__ import annotations

import pandas as pd

from src import config
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)


class BigQueryClient:
    """Wrapper around ``google-cloud-bigquery`` with graceful degradation.

    Parameters
    ----------
    project_id:
        GCP project id. Defaults to ``config.GCP_PROJECT_ID``.
    dataset:
        BigQuery dataset name. Defaults to ``config.BIGQUERY_DATASET``.
    """

    def __init__(self, project_id: str | None = None, dataset: str | None = None) -> None:
        self.project_id = project_id or config.GCP_PROJECT_ID
        self.dataset = dataset or config.BIGQUERY_DATASET
        self._client = None  # lazily created on first use

    @property
    def is_configured(self) -> bool:
        """Whether a project id is available to talk to BigQuery."""
        return bool(self.project_id)

    def _get_client(self):
        """Lazily build and cache the underlying ``bigquery.Client``.

        Returns ``None`` (and logs) if the library is missing, credentials are
        absent, or the project is unset - so callers never crash locally.
        """
        if self._client is not None:
            return self._client

        if not self.is_configured:
            logger.info(
                "BigQuery not configured (GCP_PROJECT_ID unset). "
                "Upload is optional in local development."
            )
            return None

        try:
            from google.cloud import bigquery

            self._client = bigquery.Client(project=self.project_id)
            logger.info("BigQuery client created for project '%s'.", self.project_id)
        except Exception as exc:  # missing lib / credentials
            logger.warning("Could not create BigQuery client: %s", exc)
            self._client = None

        return self._client

    def ensure_dataset_exists(self) -> bool:
        """Create the dataset if it does not already exist.

        Returns
        -------
        bool
            ``True`` if the dataset exists/was created, ``False`` otherwise.
        """
        client = self._get_client()
        if client is None:
            return False

        try:
            from google.cloud import bigquery
            from google.api_core.exceptions import Conflict

            dataset_id = f"{self.project_id}.{self.dataset}"
            try:
                client.get_dataset(dataset_id)
                logger.info("BigQuery dataset '%s' already exists.", dataset_id)
            except Exception:
                ds = bigquery.Dataset(dataset_id)
                try:
                    client.create_dataset(ds)
                    logger.info("Created BigQuery dataset '%s'.", dataset_id)
                except Conflict:
                    pass  # created concurrently - fine
            return True
        except Exception as exc:
            logger.warning("ensure_dataset_exists failed: %s", exc)
            return False

    def upload_dataframe(
        self,
        df: pd.DataFrame,
        table_name: str,
        write_disposition: str = "WRITE_APPEND",
    ) -> bool:
        """Upload a DataFrame to ``{project}.{dataset}.{table_name}``.

        Parameters
        ----------
        df:
            The frame to upload.
        table_name:
            Destination table (within the configured dataset).
        write_disposition:
            ``"WRITE_APPEND"`` (default) or ``"WRITE_TRUNCATE"``.

        Returns
        -------
        bool
            ``True`` on success, ``False`` if BigQuery is unavailable or the
            load failed. Never raises.
        """
        if df is None or df.empty:
            logger.info("upload_dataframe: nothing to upload (empty frame).")
            return False

        client = self._get_client()
        if client is None:
            logger.info(
                "[skip] Would upload %s rows to BigQuery table %s.%s "
                "(BigQuery not configured).",
                len(df), self.dataset, table_name,
            )
            return False

        try:
            from google.cloud import bigquery

            self.ensure_dataset_exists()
            table_id = f"{self.project_id}.{self.dataset}.{table_name}"
            job_config = bigquery.LoadJobConfig(
                write_disposition=write_disposition,
                autodetect=True,
            )
            job = client.load_table_from_dataframe(df, table_id, job_config=job_config)
            job.result()  # wait for completion
            logger.info("Uploaded %s rows to %s.", len(df), table_id)
            return True
        except Exception as exc:
            logger.warning("BigQuery upload failed: %s", exc)
            return False
