"""BigQuery client (analytics warehouse).

BigQuery is where processed daily prices and computed analytics live at scale,
so the dashboard/API can query years of history fast. This client is fully
optional: in local development without GCP credentials, every method logs a
clear message and returns a status dictionary rather than crashing.

Every upload method returns a structured status dict, e.g.::

    {"success": True,  "message": "...", "table": "proj.ds.tbl", "rows": 1234}
    {"success": False, "message": "...", "table": None,          "rows": 0}
"""

from __future__ import annotations

import os
from typing import Any

import pandas as pd

from src import config
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)

# Sensible defaults so the client "just works" against the real project even if
# config did not pick the values up (e.g. a bare script with no .env loaded).
DEFAULT_PROJECT_ID = "finsight-alpha-498208"
DEFAULT_DATASET = "finsight_alpha"


class BigQueryClient:
    """Wrapper around ``google-cloud-bigquery`` with graceful degradation.

    Parameters
    ----------
    project_id:
        GCP project id. Falls back to ``GCP_PROJECT_ID`` env / config, then to
        :data:`DEFAULT_PROJECT_ID`.
    dataset:
        BigQuery dataset name. Falls back to ``BIGQUERY_DATASET`` env / config,
        then to :data:`DEFAULT_DATASET`.
    """

    def __init__(self, project_id: str | None = None, dataset: str | None = None) -> None:
        # Resolve project id and dataset from explicit arg -> env -> config -> default.
        self.project_id = (
            project_id
            or os.getenv("GCP_PROJECT_ID")
            or config.GCP_PROJECT_ID
            or DEFAULT_PROJECT_ID
        )
        self.dataset = (
            dataset
            or os.getenv("BIGQUERY_DATASET")
            or config.BIGQUERY_DATASET
            or DEFAULT_DATASET
        )
        # Table names come from config (which reads env, with defaults).
        self.market_prices_table = config.BIGQUERY_MARKET_PRICES_TABLE
        self.analytics_table = config.BIGQUERY_ANALYTICS_TABLE
        self._client = None  # lazily created on first real use

    # -- configuration / client -------------------------------------------
    def is_configured(self) -> bool:
        """Return ``True`` if a usable BigQuery client can be created.

        This actually attempts to build the client (libraries + credentials +
        project), because a project id alone does not guarantee connectivity.
        """
        return self._get_client() is not None

    def _get_client(self):
        """Lazily build and cache the underlying ``bigquery.Client``.

        Returns ``None`` (and logs) if the library is missing, credentials are
        absent, or the project is unset - so callers never crash locally.
        """
        if self._client is not None:
            return self._client

        if not self.project_id:
            logger.info("BigQuery not configured (no project id).")
            return None

        try:
            from google.cloud import bigquery

            self._client = bigquery.Client(project=self.project_id)
            logger.info("BigQuery client created for project '%s'.", self.project_id)
        except Exception as exc:  # missing lib / credentials / network
            logger.info("BigQuery unavailable (%s). Uploads will be skipped.", exc)
            self._client = None

        return self._client

    # -- dataset -----------------------------------------------------------
    def ensure_dataset_exists(self) -> dict[str, Any]:
        """Create the dataset if it does not already exist.

        Returns a status dict with ``success``, ``message``, and ``dataset``.
        """
        client = self._get_client()
        if client is None:
            return {
                "success": False,
                "message": "BigQuery is not configured. Skipping dataset creation.",
                "dataset": None,
            }

        dataset_id = f"{self.project_id}.{self.dataset}"
        try:
            from google.cloud import bigquery
            from google.api_core.exceptions import Conflict

            try:
                client.get_dataset(dataset_id)  # exists?
            except Exception:
                ds = bigquery.Dataset(dataset_id)
                ds.location = config.REGION if hasattr(config, "REGION") else "asia-south1"
                try:
                    client.create_dataset(ds)
                    logger.info("Created BigQuery dataset '%s'.", dataset_id)
                except Conflict:
                    pass  # created concurrently - fine
            return {
                "success": True,
                "message": "Dataset is ready.",
                "dataset": dataset_id,
            }
        except Exception as exc:
            logger.warning("ensure_dataset_exists failed: %s", exc)
            return {"success": False, "message": str(exc), "dataset": dataset_id}

    # -- uploads -----------------------------------------------------------
    def upload_dataframe(
        self,
        df: pd.DataFrame,
        table_name: str,
        write_disposition: str = "WRITE_APPEND",
    ) -> dict[str, Any]:
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
        dict
            ``{"success", "message", "table", "rows"}``. Never raises.
        """
        if df is None or df.empty:
            return {
                "success": False,
                "message": "No rows to upload (empty DataFrame).",
                "table": None,
                "rows": 0,
            }

        client = self._get_client()
        if client is None:
            return {
                "success": False,
                "message": "BigQuery is not configured. Skipping upload.",
                "table": None,
                "rows": 0,
            }

        table_id = f"{self.project_id}.{self.dataset}.{table_name}"
        try:
            from google.cloud import bigquery

            self.ensure_dataset_exists()
            job_config = bigquery.LoadJobConfig(
                write_disposition=write_disposition,
                autodetect=True,
            )
            job = client.load_table_from_dataframe(df, table_id, job_config=job_config)
            job.result()  # wait for completion
            logger.info("Uploaded %s rows to %s.", len(df), table_id)
            return {
                "success": True,
                "message": "Uploaded dataframe to BigQuery.",
                "table": table_id,
                "rows": int(len(df)),
            }
        except Exception as exc:
            logger.warning("BigQuery upload failed: %s", exc)
            return {
                "success": False,
                "message": f"BigQuery upload failed: {exc}",
                "table": table_id,
                "rows": 0,
            }

    def upload_market_prices(self, df: pd.DataFrame) -> dict[str, Any]:
        """Upload OHLCV market prices to the configured prices table."""
        return self.upload_dataframe(df, self.market_prices_table)

    def upload_market_analytics(self, df: pd.DataFrame) -> dict[str, Any]:
        """Upload computed analytics to the configured analytics table."""
        return self.upload_dataframe(df, self.analytics_table)
