# FinSight Alpha - GCP Deployment Script (Windows PowerShell).
#
# Deploys the FastAPI backend and Streamlit dashboard to Google Cloud Run, and
# provisions BigQuery + Cloud Storage. Steps that create resources tolerate
# "already exists" errors so the script is safe to re-run.
#
# Usage (from the project root, in PowerShell):
#   ./infra/gcp_commands_windows.ps1
#
# Prerequisites: gcloud CLI and Docker Desktop installed, and `gcloud auth login` done.

# ---------------------------------------------------------------------------
# Configuration (no secrets here - safe to commit)
# ---------------------------------------------------------------------------
$env:PROJECT_ID="finsight-alpha-498208"
$env:PROJECT_NUMBER="771358783484"
$env:REGION="asia-south1"
$env:REPO_NAME="finsight-alpha-repo"
$env:API_SERVICE_NAME="finsight-alpha-api"
$env:DASHBOARD_SERVICE_NAME="finsight-alpha-dashboard"
$env:BQ_DATASET="finsight_alpha"
$env:GCS_BUCKET_NAME="finsight-alpha-498208-finsight-alpha-data"
$env:SERVICE_ACCOUNT="771358783484-compute@developer.gserviceaccount.com"

# Fully-qualified image names in Artifact Registry.
$apiImage = "$($env:REGION)-docker.pkg.dev/$($env:PROJECT_ID)/$($env:REPO_NAME)/$($env:API_SERVICE_NAME):latest"
$dashboardImage = "$($env:REGION)-docker.pkg.dev/$($env:PROJECT_ID)/$($env:REPO_NAME)/$($env:DASHBOARD_SERVICE_NAME):latest"

Write-Host "======================================================================"
Write-Host " FinSight Alpha - Google Cloud deployment"
Write-Host " Project: $($env:PROJECT_ID)  Region: $($env:REGION)"
Write-Host "======================================================================"

# ---------------------------------------------------------------------------
# 1. Set the active gcloud project
# ---------------------------------------------------------------------------
Write-Host "[1/13] Setting gcloud project..."
gcloud config set project $env:PROJECT_ID

# ---------------------------------------------------------------------------
# 2. Enable required APIs
# ---------------------------------------------------------------------------
Write-Host "[2/13] Enabling required Google Cloud APIs..."
gcloud services enable `
  run.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  bigquery.googleapis.com `
  storage.googleapis.com `
  sqladmin.googleapis.com `
  secretmanager.googleapis.com

# ---------------------------------------------------------------------------
# 3. Create the Artifact Registry Docker repository (ignore if it exists)
# ---------------------------------------------------------------------------
Write-Host "[3/13] Creating Artifact Registry repository '$($env:REPO_NAME)'..."
gcloud artifacts repositories create $env:REPO_NAME `
  --repository-format=docker `
  --location=$env:REGION `
  --description="FinSight Alpha container images"

# ---------------------------------------------------------------------------
# 4. Configure Docker to authenticate to Artifact Registry
# ---------------------------------------------------------------------------
Write-Host "[4/13] Configuring Docker auth..."
gcloud auth configure-docker "$($env:REGION)-docker.pkg.dev" --quiet

# ---------------------------------------------------------------------------
# 5. Create the BigQuery dataset (ignore if it exists)
# ---------------------------------------------------------------------------
Write-Host "[5/13] Creating BigQuery dataset '$($env:BQ_DATASET)'..."
bq --location=$env:REGION mk --dataset "$($env:PROJECT_ID):$($env:BQ_DATASET)"

# ---------------------------------------------------------------------------
# 6. Create the Cloud Storage bucket (ignore if it exists)
# ---------------------------------------------------------------------------
Write-Host "[6/13] Creating Cloud Storage bucket 'gs://$($env:GCS_BUCKET_NAME)'..."
gcloud storage buckets create "gs://$($env:GCS_BUCKET_NAME)" --location=$env:REGION

# ---------------------------------------------------------------------------
# 7. Grant the Cloud Run service account access to BigQuery + Cloud Storage
# ---------------------------------------------------------------------------
Write-Host "[7/13] Granting IAM roles to $($env:SERVICE_ACCOUNT)..."
foreach ($role in @("roles/bigquery.dataEditor", "roles/bigquery.jobUser", "roles/storage.objectAdmin")) {
    Write-Host "  -> $role"
    gcloud projects add-iam-policy-binding $env:PROJECT_ID `
      --member="serviceAccount:$($env:SERVICE_ACCOUNT)" `
      --role="$role" | Out-Null
}

# ---------------------------------------------------------------------------
# 8. Build the FastAPI image
# ---------------------------------------------------------------------------
Write-Host "[8/13] Building FastAPI image..."
docker build -t $apiImage -f infra/Dockerfile.api .

# ---------------------------------------------------------------------------
# 9. Push the FastAPI image
# ---------------------------------------------------------------------------
Write-Host "[9/13] Pushing FastAPI image..."
docker push $apiImage

# ---------------------------------------------------------------------------
# 10. Deploy the FastAPI backend to Cloud Run
# ---------------------------------------------------------------------------
Write-Host "[10/13] Deploying FastAPI to Cloud Run..."
gcloud run deploy $env:API_SERVICE_NAME `
  --image=$apiImage `
  --region=$env:REGION `
  --platform=managed `
  --allow-unauthenticated `
  --set-env-vars="GCP_PROJECT_ID=$($env:PROJECT_ID),BIGQUERY_DATASET=$($env:BQ_DATASET),GCS_BUCKET_NAME=$($env:GCS_BUCKET_NAME),MARKET_DATA_PROVIDER=yfinance"

# Fetch the deployed API URL into $env:API_BASE_URL.
$env:API_BASE_URL = (gcloud run services describe $env:API_SERVICE_NAME --region=$env:REGION --format="value(status.url)")
Write-Host "  API deployed at: $($env:API_BASE_URL)"

# Quick health check.
Write-Host "  Testing $($env:API_BASE_URL)/health ..."
try { Invoke-RestMethod -Uri "$($env:API_BASE_URL)/health" } catch { Write-Host "  (health check failed - inspect logs)" }

# ---------------------------------------------------------------------------
# 11. Build the Streamlit image
# ---------------------------------------------------------------------------
Write-Host "[11/13] Building Streamlit image..."
docker build -t $dashboardImage -f infra/Dockerfile.streamlit .

# ---------------------------------------------------------------------------
# 12. Push the Streamlit image
# ---------------------------------------------------------------------------
Write-Host "[12/13] Pushing Streamlit image..."
docker push $dashboardImage

# ---------------------------------------------------------------------------
# 13. Deploy the Streamlit dashboard (wired to the API via API_BASE_URL)
# ---------------------------------------------------------------------------
Write-Host "[13/13] Deploying Streamlit dashboard to Cloud Run..."
gcloud run deploy $env:DASHBOARD_SERVICE_NAME `
  --image=$dashboardImage `
  --region=$env:REGION `
  --platform=managed `
  --allow-unauthenticated `
  --set-env-vars="API_BASE_URL=$($env:API_BASE_URL),GCP_PROJECT_ID=$($env:PROJECT_ID),BIGQUERY_DATASET=$($env:BQ_DATASET),GCS_BUCKET_NAME=$($env:GCS_BUCKET_NAME)"

$dashboardUrl = (gcloud run services describe $env:DASHBOARD_SERVICE_NAME --region=$env:REGION --format="value(status.url)")

Write-Host "======================================================================"
Write-Host " Deployment complete!"
Write-Host " API URL:       $($env:API_BASE_URL)"
Write-Host " Dashboard URL: $dashboardUrl"
Write-Host "======================================================================"
