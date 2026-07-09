# FinSight Alpha - Google Cloud Deployment Guide

This guide deploys the current FinSight Alpha product to Google Cloud:

- FastAPI backend -> Cloud Run
- Browser terminal -> served by the FastAPI service at `/terminal`
- BigQuery -> optional market prices and analytics warehouse
- Cloud Storage -> optional raw files and document storage
- Artifact Registry -> Docker image storage
- Cloud SQL (PostgreSQL) -> optional app metadata

Everything here is optional for local development. The app runs locally without
cloud resources.

---

## 0. Project Configuration

Set these values in your shell before running the scripts:

| Setting | Example |
| --- | --- |
| `PROJECT_ID` | `your-gcp-project-id` |
| `PROJECT_NUMBER` | `123456789012` |
| `REGION` | `asia-south1` |
| `REPO_NAME` | `finsight-alpha-repo` |
| `API_SERVICE_NAME` | `finsight-alpha-api` |
| `BQ_DATASET` | `finsight_alpha` |
| `GCS_BUCKET_NAME` | `your-project-finsight-alpha-data` |

The fastest path is to run one of the scripts:

```bash
PROJECT_ID=your-project PROJECT_NUMBER=123456789012 REGION=asia-south1 bash infra/gcp_commands.sh
```

```powershell
$env:PROJECT_ID="your-project"
$env:PROJECT_NUMBER="123456789012"
$env:REGION="asia-south1"
./infra/gcp_commands_windows.ps1
```

---

## 1. Prerequisites

1. Install the Google Cloud CLI.
2. Install Docker.
3. Authenticate:

```bash
gcloud auth login
gcloud auth application-default login
```

---

## 2. Enable Required APIs

```bash
gcloud config set project "$PROJECT_ID"

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

## 3. Create Artifact Registry

```bash
gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --description="FinSight Alpha container images"

gcloud auth configure-docker "$REGION-docker.pkg.dev"
```

---

## 4. Create Optional Data Stores

BigQuery:

```bash
bq --location="$REGION" mk --dataset "$PROJECT_ID:$BQ_DATASET"
```

Cloud Storage:

```bash
gcloud storage buckets create "gs://$GCS_BUCKET_NAME" --location="$REGION"
```

Grant the Cloud Run runtime service account access:

```bash
SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

for ROLE in roles/bigquery.dataEditor roles/bigquery.jobUser roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA}" \
    --role="$ROLE"
done
```

---

## 5. Build And Push The API Image

```bash
API_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$API_SERVICE_NAME:latest"

docker build -t "$API_IMAGE" -f infra/Dockerfile.api .
docker push "$API_IMAGE"
```

---

## 6. Deploy FastAPI To Cloud Run

```bash
gcloud run deploy "$API_SERVICE_NAME" \
  --image="$API_IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID,BIGQUERY_DATASET=$BQ_DATASET,GCS_BUCKET_NAME=$GCS_BUCKET_NAME,MARKET_DATA_PROVIDER=yfinance"

API_URL=$(gcloud run services describe "$API_SERVICE_NAME" \
  --region="$REGION" --format="value(status.url)")

echo "$API_URL"
echo "$API_URL/terminal"
```

---

## 7. Test The Deployment

```bash
curl "$API_URL/health"
```

Open the terminal at:

```text
$API_URL/terminal
```

Trigger a sample market-data fetch:

```bash
curl -X POST "$API_URL/market-data/fetch" \
  -H "Content-Type: application/json" \
  -d '{"tickers":["AAPL"],"upload_bigquery":true,"upload_cloud_storage":true}'
```

Verify cloud writes if enabled:

```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) FROM \`$PROJECT_ID.$BQ_DATASET.market_prices_daily\`"

gcloud storage ls "gs://$GCS_BUCKET_NAME/raw/"
```

---

## 8. Optional Cloud SQL

Only needed once app metadata moves off local SQLite.

```bash
gcloud sql instances create finsight-sql \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region="$REGION"

gcloud sql databases create finsight_alpha --instance=finsight-sql
gcloud sql users set-password postgres --instance=finsight-sql --password=CHANGE_ME
```

Then connect Cloud Run with `--add-cloudsql-instances` and set `DATABASE_URL`.

---

## 9. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `PERMISSION_DENIED` on BigQuery/Storage | Service account missing IAM roles. |
| Container fails to start on Cloud Run | App must listen on `$PORT`; `infra/Dockerfile.api` does. |
| `403` pushing to Artifact Registry | Run `gcloud auth configure-docker $REGION-docker.pkg.dev`. |
| Terminal loads but API calls fail | Check auth, cookies, CORS, and same-origin URL. |
| BigQuery upload skipped locally | Expected without credentials. Use ADC or run on Cloud Run. |

---

## 10. Cost Notes

- Cloud Run scales to zero.
- BigQuery has a free tier, but large queries can cost money.
- Cloud Storage is low cost for small data volumes.
- Cloud SQL bills while running, even when idle.

Do not deploy if you want zero cloud cost.
