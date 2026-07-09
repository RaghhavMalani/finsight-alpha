#!/bin/bash
# FinSight Alpha - API-only GCP Deployment Script (Bash / macOS / Linux).
#
# Deploys the FastAPI backend to Cloud Run and provisions optional BigQuery and
# Cloud Storage resources. The backend serves the browser terminal from the same
# service, so there is no separate dashboard container.
#
# Usage (from the project root):
#   PROJECT_ID=your-project PROJECT_NUMBER=123456789 REGION=asia-south1 bash infra/gcp_commands.sh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
PROJECT_NUMBER="${PROJECT_NUMBER:-}"
REGION="${REGION:-asia-south1}"
REPO_NAME="${REPO_NAME:-finsight-alpha-repo}"
API_SERVICE_NAME="${API_SERVICE_NAME:-finsight-alpha-api}"
BQ_DATASET="${BQ_DATASET:-finsight_alpha}"
GCS_BUCKET_NAME="${GCS_BUCKET_NAME:-${PROJECT_ID}-finsight-alpha-data}"

if [[ -z "${PROJECT_ID}" || -z "${PROJECT_NUMBER}" ]]; then
  echo "Set PROJECT_ID and PROJECT_NUMBER before running this script." >&2
  exit 1
fi

SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"
API_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${API_SERVICE_NAME}:latest"

echo "======================================================================"
echo " FinSight Alpha - Google Cloud API deployment"
echo " Project: ${PROJECT_ID}  Region: ${REGION}"
echo "======================================================================"

echo "[1/10] Setting gcloud project..."
gcloud config set project "${PROJECT_ID}"

echo "[2/10] Enabling required Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  bigquery.googleapis.com \
  storage.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com

echo "[3/10] Creating Artifact Registry repository '${REPO_NAME}'..."
gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="FinSight Alpha container images" || \
  echo "  (repository may already exist - continuing)"

echo "[4/10] Configuring Docker auth for ${REGION}-docker.pkg.dev..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo "[5/10] Creating BigQuery dataset '${BQ_DATASET}'..."
bq --location="${REGION}" mk --dataset "${PROJECT_ID}:${BQ_DATASET}" || \
  echo "  (dataset may already exist - continuing)"

echo "[6/10] Creating Cloud Storage bucket 'gs://${GCS_BUCKET_NAME}'..."
gcloud storage buckets create "gs://${GCS_BUCKET_NAME}" \
  --location="${REGION}" || \
  echo "  (bucket may already exist - continuing)"

echo "[7/10] Granting IAM roles to ${SERVICE_ACCOUNT}..."
for ROLE in roles/bigquery.dataEditor roles/bigquery.jobUser roles/storage.objectAdmin; do
  echo "  -> ${ROLE}"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="${ROLE}" >/dev/null
 done

echo "[8/10] Building FastAPI image..."
docker build -t "${API_IMAGE}" -f infra/Dockerfile.api .

echo "[9/10] Pushing FastAPI image..."
docker push "${API_IMAGE}"

echo "[10/10] Deploying FastAPI to Cloud Run..."
gcloud run deploy "${API_SERVICE_NAME}" \
  --image="${API_IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},BIGQUERY_DATASET=${BQ_DATASET},GCS_BUCKET_NAME=${GCS_BUCKET_NAME},MARKET_DATA_PROVIDER=yfinance"

API_BASE_URL=$(gcloud run services describe "${API_SERVICE_NAME}" \
  --region="${REGION}" --format="value(status.url)")

echo "  API deployed at: ${API_BASE_URL}"
echo "  Terminal URL: ${API_BASE_URL}/terminal"

echo "  Testing ${API_BASE_URL}/health ..."
curl -fsS "${API_BASE_URL}/health" || echo "  (health check failed - inspect logs)"

echo "======================================================================"
echo " Deployment complete"
echo " API URL:      ${API_BASE_URL}"
echo " Terminal URL: ${API_BASE_URL}/terminal"
echo "======================================================================"
