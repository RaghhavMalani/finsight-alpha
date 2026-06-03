#!/bin/bash
# FinSight Alpha - GCP Deployment Script (Bash / macOS / Linux).
#
# This script deploys the FastAPI backend and Streamlit dashboard to Google
# Cloud Run, and provisions BigQuery + Cloud Storage. It is safe and idempotent:
# steps that create resources tolerate "already exists" errors.
#
# Usage (from the project root):
#   bash infra/gcp_commands.sh
#
# Prerequisites: gcloud CLI and Docker installed, and `gcloud auth login` done.

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (no secrets here - safe to commit)
# ---------------------------------------------------------------------------
PROJECT_ID="finsight-alpha-498208"
PROJECT_NUMBER="771358783484"
REGION="asia-south1"
REPO_NAME="finsight-alpha-repo"
API_SERVICE_NAME="finsight-alpha-api"
DASHBOARD_SERVICE_NAME="finsight-alpha-dashboard"
BQ_DATASET="finsight_alpha"
GCS_BUCKET_NAME="finsight-alpha-498208-finsight-alpha-data"
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Fully-qualified image names in Artifact Registry.
API_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${API_SERVICE_NAME}:latest"
DASHBOARD_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${DASHBOARD_SERVICE_NAME}:latest"

echo "======================================================================"
echo " FinSight Alpha - Google Cloud deployment"
echo " Project: ${PROJECT_ID}  Region: ${REGION}"
echo "======================================================================"

# ---------------------------------------------------------------------------
# 1. Set the active gcloud project
# ---------------------------------------------------------------------------
echo "[1/13] Setting gcloud project..."
gcloud config set project "${PROJECT_ID}"

# ---------------------------------------------------------------------------
# 2. Enable required APIs
# ---------------------------------------------------------------------------
echo "[2/13] Enabling required Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  bigquery.googleapis.com \
  storage.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com

# ---------------------------------------------------------------------------
# 3. Create the Artifact Registry Docker repository (ignore if it exists)
# ---------------------------------------------------------------------------
echo "[3/13] Creating Artifact Registry repository '${REPO_NAME}'..."
gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="FinSight Alpha container images" || \
  echo "  (repository may already exist - continuing)"

# ---------------------------------------------------------------------------
# 4. Configure Docker to authenticate to Artifact Registry
# ---------------------------------------------------------------------------
echo "[4/13] Configuring Docker auth for ${REGION}-docker.pkg.dev..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ---------------------------------------------------------------------------
# 5. Create the BigQuery dataset (ignore if it exists)
# ---------------------------------------------------------------------------
echo "[5/13] Creating BigQuery dataset '${BQ_DATASET}'..."
bq --location="${REGION}" mk --dataset "${PROJECT_ID}:${BQ_DATASET}" || \
  echo "  (dataset may already exist - continuing)"

# ---------------------------------------------------------------------------
# 6. Create the Cloud Storage bucket (ignore if it exists)
# ---------------------------------------------------------------------------
echo "[6/13] Creating Cloud Storage bucket 'gs://${GCS_BUCKET_NAME}'..."
gcloud storage buckets create "gs://${GCS_BUCKET_NAME}" \
  --location="${REGION}" || \
  echo "  (bucket may already exist - continuing)"

# ---------------------------------------------------------------------------
# 7. Grant the Cloud Run service account access to BigQuery + Cloud Storage
# ---------------------------------------------------------------------------
echo "[7/13] Granting IAM roles to ${SERVICE_ACCOUNT}..."
for ROLE in roles/bigquery.dataEditor roles/bigquery.jobUser roles/storage.objectAdmin; do
  echo "  -> ${ROLE}"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="${ROLE}" >/dev/null
done

# ---------------------------------------------------------------------------
# 8. Build the FastAPI image
# ---------------------------------------------------------------------------
echo "[8/13] Building FastAPI image..."
docker build -t "${API_IMAGE}" -f infra/Dockerfile.api .

# ---------------------------------------------------------------------------
# 9. Push the FastAPI image
# ---------------------------------------------------------------------------
echo "[9/13] Pushing FastAPI image..."
docker push "${API_IMAGE}"

# ---------------------------------------------------------------------------
# 10. Deploy the FastAPI backend to Cloud Run
# ---------------------------------------------------------------------------
echo "[10/13] Deploying FastAPI to Cloud Run..."
gcloud run deploy "${API_SERVICE_NAME}" \
  --image="${API_IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},BIGQUERY_DATASET=${BQ_DATASET},GCS_BUCKET_NAME=${GCS_BUCKET_NAME},MARKET_DATA_PROVIDER=yfinance"

# Fetch the deployed API URL.
API_BASE_URL=$(gcloud run services describe "${API_SERVICE_NAME}" \
  --region="${REGION}" --format="value(status.url)")
echo "  API deployed at: ${API_BASE_URL}"

# Quick health check (non-fatal).
echo "  Testing ${API_BASE_URL}/health ..."
curl -fsS "${API_BASE_URL}/health" || echo "  (health check failed - inspect logs)"

# ---------------------------------------------------------------------------
# 11. Build the Streamlit image
# ---------------------------------------------------------------------------
echo "[11/13] Building Streamlit image..."
docker build -t "${DASHBOARD_IMAGE}" -f infra/Dockerfile.streamlit .

# ---------------------------------------------------------------------------
# 12. Push the Streamlit image
# ---------------------------------------------------------------------------
echo "[12/13] Pushing Streamlit image..."
docker push "${DASHBOARD_IMAGE}"

# ---------------------------------------------------------------------------
# 13. Deploy the Streamlit dashboard (wired to the API via API_BASE_URL)
# ---------------------------------------------------------------------------
echo "[13/13] Deploying Streamlit dashboard to Cloud Run..."
gcloud run deploy "${DASHBOARD_SERVICE_NAME}" \
  --image="${DASHBOARD_IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="API_BASE_URL=${API_BASE_URL},GCP_PROJECT_ID=${PROJECT_ID},BIGQUERY_DATASET=${BQ_DATASET},GCS_BUCKET_NAME=${GCS_BUCKET_NAME}"

DASHBOARD_URL=$(gcloud run services describe "${DASHBOARD_SERVICE_NAME}" \
  --region="${REGION}" --format="value(status.url)")

echo "======================================================================"
echo " Deployment complete!"
echo " API URL:       ${API_BASE_URL}"
echo " Dashboard URL: ${DASHBOARD_URL}"
echo "======================================================================"
