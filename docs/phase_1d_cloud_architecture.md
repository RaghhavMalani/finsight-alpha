# Phase 1D - Cloud Architecture

This document explains how FinSight Alpha is structured for Google Cloud and how
data flows through the system. The design goal is **cloud-optional**: the exact
same codebase runs locally with zero cloud dependencies, and "lights up" cloud
features purely through environment variables.

---

## Components

| Component | Service | Role |
| --- | --- | --- |
| Streamlit dashboard | Cloud Run | Interactive UI (Local or API mode) |
| FastAPI backend | Cloud Run | REST API: fetch, analytics, persistence |
| Market data | yfinance (pluggable) | Source of OHLCV prices |
| BigQuery | `finsight_alpha` dataset | Analytical warehouse (prices + analytics) |
| Cloud Storage | `...-finsight-alpha-data` | Raw CSV files, future financial PDFs |
| Artifact Registry | `finsight-alpha-repo` | Docker image storage |
| Cloud SQL (optional) | PostgreSQL | App metadata (watchlists, jobs) |

---

## High-level diagram

```
                          +---------------------------+
        Browser  ───────▶ |  Cloud Run: Streamlit     |
                          |  app/streamlit_app.py     |
                          +-------------+-------------+
                                        │  (API Mode, HTTP)
                                        ▼
                          +---------------------------+
                          |  Cloud Run: FastAPI       |
                          |  backend/main.py          |
                          +------+-----------+--------+
                                 │           │
              MarketDataService  │           │  optional uploads
              (yfinance)         │           │
                                 ▼           ▼
                    +----------------+   +----------------------------+
                    | Local CSV /    |   |  BigQuery (analytics)      |
                    | Parquet files  |   |  market_prices_daily       |
                    +----------------+   |  market_analytics_daily    |
                                         +----------------------------+
                                         |  Cloud Storage (raw/*.csv) |
                                         +----------------------------+
                                         |  Cloud SQL (optional)      |
                                         +----------------------------+
```

In **Local Mode** the dashboard skips the FastAPI hop entirely and calls
`MarketDataService` in-process, writing only to local files.

---

## Data flow: `POST /market-data/fetch`

1. **Download** - `MarketDataService(provider).get_multiple(...)` returns a long
   OHLCV DataFrame (with a `Provider` column).
2. **Enrich** - per-ticker analytics columns are added: simple/log returns,
   cumulative return, rolling volatility, drawdown.
3. **Save locally** (`save_local`, default on) - raw CSV, processed CSV, and a
   Parquet export per ticker.
4. **BigQuery** (`upload_bigquery`, optional) - raw prices -> `market_prices_daily`,
   enriched analytics -> `market_analytics_daily`.
5. **Cloud Storage** (`upload_cloud_storage`, optional) - each ticker's raw CSV
   is written to `raw/<ticker>.csv`.

Each target reports a structured status dictionary, and the response bundles all
three: `local_save_status`, `bigquery_upload_status`, `cloud_storage_upload_status`.

---

## Graceful degradation

The cloud clients (`BigQueryClient`, `CloudStorageClient`) are designed never to
crash local development:

- They lazily attempt to build the underlying GCP client.
- Missing libraries, credentials, project, dataset, or bucket result in a logged
  message and a `{"success": False, "message": "...not configured..."}` dict.
- Real upload errors are caught and returned as `{"success": False, ...}` too.

This means `upload_bigquery: true` against a machine without credentials simply
returns a "skipped" status - the request still succeeds with local data.

---

## Configuration (environment variables)

| Variable | Purpose | Default |
| --- | --- | --- |
| `GCP_PROJECT_ID` | GCP project | `finsight-alpha-498208` (client default) |
| `REGION` | Deployment region | `asia-south1` |
| `BIGQUERY_DATASET` | BigQuery dataset | `finsight_alpha` |
| `BIGQUERY_MARKET_PRICES_TABLE` | Prices table | `market_prices_daily` |
| `BIGQUERY_ANALYTICS_TABLE` | Analytics table | `market_analytics_daily` |
| `GCS_BUCKET_NAME` | Raw files bucket | `finsight-alpha-498208-finsight-alpha-data` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local SA key path | unset (Cloud Run uses attached SA) |
| `API_BASE_URL` | Dashboard -> API URL | `http://127.0.0.1:8000` |
| `DATABASE_URL` | Cloud SQL connection | unset |

See `.env.example` (local) and `.env.cloud.example` (cloud) for templates.

---

## Why this topology

- **Separate UI and API services** mirror real production: each scales
  independently, and the API can serve future clients (e.g. a React frontend).
- **BigQuery vs Cloud Storage** split: BigQuery for fast analytical queries over
  structured rows; Cloud Storage for cheap raw blobs and future PDFs (RAG).
- **Scale-to-zero Cloud Run** keeps idle cost effectively nil.
