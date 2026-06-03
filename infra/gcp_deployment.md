# FinSight Alpha - Google Cloud Deployment Guide (Phase 1D)

This guide walks you through deploying FinSight Alpha to Google Cloud:

- **FastAPI backend** -> Cloud Run
- **Streamlit dashboard** -> Cloud Run
- **BigQuery** -> market prices + analytics warehouse
- **Cloud Storage** -> raw CSV files (and future financial PDFs)
- **Artifact Registry** -> Docker image storage
- **Cloud SQL (PostgreSQL)** -> optional app metadata

> Everything here is **optional for local development**. The app runs fully
> locally without any of these resources. Deploy only when you want it live.

---

## 0. Project configuration

| Setting | Value |
| --- | --- |
| Project ID | `finsight-alpha-498208` |
| Project number | `771358783484` |
| Region | `asia-south1` (Mumbai) |
| Artifact Registry repo | `finsight-alpha-repo` |
| BigQuery dataset | `finsight_alpha` |
| Cloud Storage bucket | `finsight-alpha-498208-finsight-alpha-data` |
| API service | `finsight-alpha-api` |
| Dashboard service | `finsight-alpha-dashboard` |
| Runtime service account | `771358783484-compute@developer.gserviceaccount.com` |

> The fastest path is to run the script (`infra/gcp_commands.sh` on macOS/Linux,
> or `infra/gcp_commands_windows.ps1` on Windows), which performs every step
> below. The manual steps are documented here for understanding/debugging.

---

## 1. Prerequisites

1. Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`).
2. Install [Docker](https://docs.docker.com/get-docker/).
3. Authenticate:

```bash
gcloud auth login
gcloud auth application-default login
```

---

## 2. Set the active project

```bash
gcloud config set project finsight-alpha-498208
```

---

## 3. Enable required APIs

```bash
  gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    bigquery.googleapis.com \
    storage.googleapis.com \
    sqladmin.googleapis.com \
    secretmanager.googleapis.com
```

---

## 4. Create the Artifact Registry repository

```bash
gcloud artifacts repositories create finsight-alpha-repo \
  --repository-format=docker \
  --location=asia-south1 \
  --description="FinSight Alpha container images"

# Let Docker authenticate to Artifact Registry:
gcloud auth configure-docker asia-south1-docker.pkg.dev
```

---

## 5. Create the BigQuery dataset

```bash
bq --location=asia-south1 mk --dataset finsight-alpha-498208:finsight_alpha
```

Tables (`market_prices_daily`, `market_analytics_daily`) are auto-created on
first upload via the `BigQueryClient` (it uses `autodetect` schema). See
`sql/bigquery_schema.md` for the intended column layout.

---

## 6. Create the Cloud Storage bucket

```bash
gcloud storage buckets create gs://finsight-alpha-498208-finsight-alpha-data \
  --location=asia-south1
```

Raw exports are written under the `raw/` prefix (e.g. `raw/AAPL.csv`).

---

## 7. Grant IAM permissions to the Cloud Run service account

The Cloud Run services run as the default compute service account. Grant it
access to BigQuery and Cloud Storage:

```bash
SA=771358783484-compute@developer.gserviceaccount.com

gcloud projects add-iam-policy-binding finsight-alpha-498208 \
  --member="serviceAccount:${SA}" --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding finsight-alpha-498208 \
  --member="serviceAccount:${SA}" --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding finsight-alpha-498208 \
  --member="serviceAccount:${SA}" --role="roles/storage.objectAdmin"
```

---

## 8. Build & push the Docker images

```bash
API_IMAGE=asia-south1-docker.pkg.dev/finsight-alpha-498208/finsight-alpha-repo/finsight-alpha-api:latest
DASH_IMAGE=asia-south1-docker.pkg.dev/finsight-alpha-498208/finsight-alpha-repo/finsight-alpha-dashboard:latest

docker build -t "$API_IMAGE"  -f infra/Dockerfile.api .
docker build -t "$DASH_IMAGE" -f infra/Dockerfile.streamlit .

docker push "$API_IMAGE"
docker push "$DASH_IMAGE"
```

> Both Dockerfiles bind to the `$PORT` environment variable that Cloud Run
> injects (defaulting to `8080`), via a `sh -c` CMD.

---

## 9. Deploy the FastAPI backend to Cloud Run

```bash
gcloud run deploy finsight-alpha-api \
  --image="$API_IMAGE" \
  --region=asia-south1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="GCP_PROJECT_ID=finsight-alpha-498208,BIGQUERY_DATASET=finsight_alpha,GCS_BUCKET_NAME=finsight-alpha-498208-finsight-alpha-data,MARKET_DATA_PROVIDER=yfinance"

# Capture the deployed URL:
API_URL=$(gcloud run services describe finsight-alpha-api \
  --region=asia-south1 --format="value(status.url)")
echo "$API_URL"
```

---

## 10. Deploy the Streamlit dashboard to Cloud Run

The dashboard needs `API_BASE_URL` set to the deployed API URL so "API Mode"
works:

```bash
gcloud run deploy finsight-alpha-dashboard \
  --image="$DASH_IMAGE" \
  --region=asia-south1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="API_BASE_URL=${API_URL},GCP_PROJECT_ID=finsight-alpha-498208,BIGQUERY_DATASET=finsight_alpha,GCS_BUCKET_NAME=finsight-alpha-498208-finsight-alpha-data"
```

---

## 11. (Optional) Cloud SQL for PostgreSQL

Only needed once app metadata (watchlists, ingestion jobs) moves off local SQL.

```bash
gcloud sql instances create finsight-sql \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-south1

gcloud sql databases create finsight_alpha --instance=finsight-sql
gcloud sql users set-password postgres --instance=finsight-sql --password=CHANGE_ME
```

Then connect Cloud Run with `--add-cloudsql-instances` and set `DATABASE_URL`
to the Unix-socket form shown in `.env.cloud.example`.

---

## 12. Testing the deployment

```bash
# Health check
curl "$API_URL/health"

# Trigger a fetch with cloud uploads
curl -X POST "$API_URL/market-data/fetch" \
  -H "Content-Type: application/json" \
  -d '{"tickers":["AAPL"],"upload_bigquery":true,"upload_cloud_storage":true}'
```

Open the dashboard URL in a browser, choose **API Mode**, point it at `$API_URL`,
and optionally tick the cloud-upload checkboxes.

Verify the data landed:

```bash
bq query --use_legacy_sql=false \
  'SELECT COUNT(*) FROM `finsight-alpha-498208.finsight_alpha.market_prices_daily`'

gcloud storage ls gs://finsight-alpha-498208-finsight-alpha-data/raw/
```

---

## 13. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `PERMISSION_DENIED` on BigQuery/Storage | Service account missing IAM roles (step 7). |
| Container fails to start on Cloud Run | App must listen on `$PORT`. The provided Dockerfiles already do this. |
| `403` pushing to Artifact Registry | Run `gcloud auth configure-docker asia-south1-docker.pkg.dev`. |
| Dashboard "API offline" | `API_BASE_URL` not set / wrong, or API not `--allow-unauthenticated`. |
| BigQuery upload silently skipped | No credentials locally - expected. Set `GOOGLE_APPLICATION_CREDENTIALS` or run on Cloud Run. |
| `bq mk` says dataset exists | Safe to ignore - the script tolerates this. |

---

## 14. Cost notes

- **Cloud Run** scales to zero - you pay only per request/CPU-second.
- **BigQuery** has a generous free tier (storage + 1 TB queries/month).
- **Cloud Storage** standard storage is a few cents/GB/month.
- **Cloud SQL** (if enabled) bills hourly even when idle - stop/delete when unused.

To avoid charges entirely, simply do not deploy: local mode is free.
