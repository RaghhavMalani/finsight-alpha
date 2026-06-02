"""Persistence helpers.

Local persistence (CSV + Parquet) is implemented now. Cloud persistence
(BigQuery, Cloud Storage) is stubbed with clear placeholders that will be
activated in Phase 1C/1D. Keeping the function signatures stable now means the
rest of the codebase can call them without changing later.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from src import config
from src.utils.logging_utils import get_logger

logger = get_logger(__name__)


def _safe_filename(name: str) -> str:
    """Make a ticker/name safe for use as a filename (``RELIANCE.NS`` -> ``RELIANCE_NS``)."""
    return name.replace(".", "_").replace("/", "_").replace("\\", "_")


def safe_ticker_stem(ticker: str) -> str:
    """Return the filesystem-safe stem for a ticker (``RELIANCE.NS`` -> ``RELIANCE_NS``)."""
    return _safe_filename(ticker)


def processed_filename(ticker: str) -> str:
    """Standardised processed filename, e.g. ``RELIANCE.NS`` -> ``RELIANCE_NS_processed.csv``."""
    return f"{_safe_filename(ticker)}_processed.csv"


# ---------------------------------------------------------------------------
# Local persistence (active)
# ---------------------------------------------------------------------------
def save_raw_csv(df: pd.DataFrame, ticker: str) -> Path:
    """Save a raw OHLCV frame to ``data/raw/<ticker>.csv``.

    Returns the path written.
    """
    config.ensure_data_dirs()
    path = config.RAW_DATA_DIR / f"{_safe_filename(ticker)}.csv"
    df.to_csv(path, index=False)
    logger.info("Saved raw CSV: %s (%s rows)", path, len(df))
    return path


def save_processed_csv(df: pd.DataFrame, ticker: str) -> Path:
    """Save a processed (analytics-enriched) frame to ``data/processed/<ticker>.csv``."""
    config.ensure_data_dirs()
    path = config.PROCESSED_DATA_DIR / f"{_safe_filename(ticker)}.csv"
    df.to_csv(path, index=False)
    logger.info("Saved processed CSV: %s (%s rows)", path, len(df))
    return path


def save_parquet(df: pd.DataFrame, name: str, directory: Path | None = None) -> Path | None:
    """Save a frame to Parquet in ``data/exports`` (or ``directory``).

    Parquet is columnar and compressed - ideal for analytics and for loading into
    BigQuery later. Requires a Parquet engine (``pyarrow``); if none is installed
    we log a warning and return ``None`` rather than crashing.
    """
    config.ensure_data_dirs()
    target_dir = directory or config.EXPORTS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / f"{_safe_filename(name)}.parquet"
    try:
        df.to_parquet(path, index=False)
    except Exception as exc:  # missing pyarrow/fastparquet, etc.
        logger.warning("Could not write Parquet (%s). Is pyarrow installed?", exc)
        return None
    logger.info("Saved Parquet: %s (%s rows)", path, len(df))
    return path


def load_processed_csv(ticker: str) -> pd.DataFrame:
    """Load a previously saved processed CSV back into a DataFrame.

    Raises
    ------
    FileNotFoundError
        If the processed file does not exist.
    """
    path = config.PROCESSED_DATA_DIR / f"{_safe_filename(ticker)}.csv"
    if not path.exists():
        raise FileNotFoundError(f"No processed data found for '{ticker}' at {path}.")
    return pd.read_csv(path, parse_dates=["Date"])


# ---------------------------------------------------------------------------
# Generic / Phase 1C helpers
# ---------------------------------------------------------------------------
def save_dataframe_csv(df: pd.DataFrame, path: Path) -> Path:
    """Save any DataFrame to ``path`` as CSV, creating parent dirs as needed."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    logger.info("Saved CSV: %s (%s rows)", path, len(df))
    return path


def save_dataframe_parquet(df: pd.DataFrame, path: Path) -> Path | None:
    """Save any DataFrame to ``path`` as Parquet (returns ``None`` if no engine)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        df.to_parquet(path, index=False)
    except Exception as exc:  # pyarrow/fastparquet missing
        logger.warning("Could not write Parquet %s (%s).", path, exc)
        return None
    logger.info("Saved Parquet: %s (%s rows)", path, len(df))
    return path


def save_processed_dataframe(df: pd.DataFrame, ticker: str) -> Path:
    """Save a processed frame using the standardised ``*_processed.csv`` name."""
    config.ensure_data_dirs()
    path = config.PROCESSED_DATA_DIR / processed_filename(ticker)
    return save_dataframe_csv(df, path)


def load_processed_ticker_data(ticker: str) -> pd.DataFrame | None:
    """Load processed data for one ticker, or ``None`` if not present.

    Tries the standardised ``<ticker>_processed.csv`` first, then falls back to
    the plain ``<ticker>.csv`` (used by the Phase 1A/1B batch pipeline). Returns
    ``None`` instead of raising so callers/API can respond with a clean 404.
    """
    candidates = [
        config.PROCESSED_DATA_DIR / processed_filename(ticker),
        config.PROCESSED_DATA_DIR / f"{_safe_filename(ticker)}.csv",
    ]
    for path in candidates:
        if path.exists():
            try:
                return pd.read_csv(path, parse_dates=["Date"])
            except Exception as exc:
                logger.warning("Failed to read %s: %s", path, exc)
                return None
    return None


def load_all_processed_data() -> pd.DataFrame:
    """Load and concatenate every processed CSV in ``data/processed``.

    Returns a long-format frame (empty if no files). Adds a ``Ticker`` column
    inferred from the filename when the CSV does not already contain one.
    """
    config.ensure_data_dirs()
    frames: list[pd.DataFrame] = []
    for path in sorted(config.PROCESSED_DATA_DIR.glob("*.csv")):
        try:
            sub = pd.read_csv(path, parse_dates=["Date"])
        except Exception as exc:
            logger.warning("Skipping unreadable file %s: %s", path, exc)
            continue
        if "Ticker" not in sub.columns:
            stem = path.stem.replace("_processed", "")
            sub["Ticker"] = stem
        frames.append(sub)

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


# ---------------------------------------------------------------------------
# Cloud persistence (placeholders - activated in Phase 1C/1D)
# ---------------------------------------------------------------------------
def upload_to_bigquery(
    df: pd.DataFrame,
    table_name: str,
    dataset: str | None = None,
) -> None:
    """Placeholder: upload a frame to a BigQuery table.

    Activated in Phase 1C/1D. The real implementation will:
      1. Build a ``bigquery.Client(project=config.GCP_PROJECT_ID)``.
      2. Resolve ``{dataset}.{table_name}`` (dataset defaults to
         ``config.BIGQUERY_DATASET``).
      3. Call ``client.load_table_from_dataframe(df, table_id, job_config=...)``
         with an explicit schema and ``WRITE_APPEND``/``WRITE_TRUNCATE``.
    For now this is a no-op so calling it never breaks the app.
    """
    dataset = dataset or config.BIGQUERY_DATASET
    logger.info(
        "[placeholder] Would upload %s rows to BigQuery table %s.%s "
        "(activated in Phase 1C/1D).",
        len(df), dataset, table_name,
    )


def upload_to_cloud_storage(
    local_path: Path,
    bucket_name: str | None = None,
    destination_blob: str | None = None,
) -> None:
    """Placeholder: upload a local file to Google Cloud Storage.

    Activated in Phase 1C/1D. The real implementation will:
      1. Build ``storage.Client(project=config.GCP_PROJECT_ID)``.
      2. Get the bucket (defaults to ``config.GCS_BUCKET_NAME``).
      3. ``bucket.blob(destination_blob).upload_from_filename(local_path)``.
    For now this is a no-op so calling it never breaks the app.
    """
    bucket_name = bucket_name or config.GCS_BUCKET_NAME
    destination_blob = destination_blob or Path(local_path).name
    logger.info(
        "[placeholder] Would upload %s to gs://%s/%s (activated in Phase 1C/1D).",
        local_path, bucket_name or "<unset-bucket>", destination_blob,
    )
