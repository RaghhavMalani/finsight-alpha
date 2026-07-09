# FinSight Alpha - API-only GCP Deployment Script (Windows PowerShell).
#
# Deploys the FastAPI backend to Cloud Run and provisions optional BigQuery and
# Cloud Storage resources. The backend serves the browser terminal from the same
# service, so there is no separate dashboard container.
#
# Usage (from the project root):
#   $env:PROJECT_ID="your-project"; $env:PROJECT_NUMBER="123456789"; ./infra/gcp_commands_windows.ps1

$ErrorActionPreference = "Stop"

$projectId = $env:PROJECT_ID
$projectNumber = $env:PROJECT_NUMBER
$region = if ($env:REGION) { $env:REGION } else { "asia-south1" }
$repoName = if ($env:REPO_NAME) { $env:REPO_NAME } else { "finsight-alpha-repo" }
$apiServiceName = if ($env:API_SERVICE_NAME) { $env:API_SERVICE_NAME } else { "finsight-alpha-api" }
$bqDataset = if ($env:BQ_DATASET) { $env:BQ_DATASET } else { "finsight_alpha" }

if (-not $projectId -or -not $projectNumber) {
    throw "Set PROJECT_ID and PROJECT_NUMBER before running this script."
}

$gcsBucketName = if ($env:GCS_BUCKET_NAME) { $env:GCS_BUCKET_NAME } else { "$projectId-finsight-alpha-data" }
$serviceAccount = if ($env:SERVICE_ACCOUNT) { $env:SERVICE_ACCOUNT } else { "$projectNumber-compute@developer.gserviceaccount.com" }
$apiImage = "$region-docker.pkg.dev/$projectId/$repoName/$apiServiceName`:latest"

Write-Host "======================================================================"
Write-Host " FinSight Alpha - Google Cloud API deployment"
Write-Host " Project: $projectId  Region: $region"
Write-Host "======================================================================"

Write-Host "[1/10] Setting gcloud project..."
gcloud config set project $projectId

Write-Host "[2/10] Enabling required Google Cloud APIs..."
gcloud services enable `
  run.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  bigquery.googleapis.com `
  storage.googleapis.com `
  sqladmin.googleapis.com `
  secretmanager.googleapis.com

Write-Host "[3/10] Creating Artifact Registry repository '$repoName'..."
try {
    gcloud artifacts repositories create $repoName `
      --repository-format=docker `
      --location=$region `
      --description="FinSight Alpha container images"
} catch {
    Write-Host "  (repository may already exist - continuing)"
}

Write-Host "[4/10] Configuring Docker auth..."
gcloud auth configure-docker "$region-docker.pkg.dev" --quiet

Write-Host "[5/10] Creating BigQuery dataset '$bqDataset'..."
try { bq --location=$region mk --dataset "$projectId`:$bqDataset" } catch { Write-Host "  (dataset may already exist - continuing)" }

Write-Host "[6/10] Creating Cloud Storage bucket 'gs://$gcsBucketName'..."
try { gcloud storage buckets create "gs://$gcsBucketName" --location=$region } catch { Write-Host "  (bucket may already exist - continuing)" }

Write-Host "[7/10] Granting IAM roles to $serviceAccount..."
foreach ($role in @("roles/bigquery.dataEditor", "roles/bigquery.jobUser", "roles/storage.objectAdmin")) {
    Write-Host "  -> $role"
    gcloud projects add-iam-policy-binding $projectId `
      --member="serviceAccount:$serviceAccount" `
      --role="$role" | Out-Null
}

Write-Host "[8/10] Building FastAPI image..."
docker build -t $apiImage -f infra/Dockerfile.api .

Write-Host "[9/10] Pushing FastAPI image..."
docker push $apiImage

Write-Host "[10/10] Deploying FastAPI to Cloud Run..."
gcloud run deploy $apiServiceName `
  --image=$apiImage `
  --region=$region `
  --platform=managed `
  --allow-unauthenticated `
  --set-env-vars="GCP_PROJECT_ID=$projectId,BIGQUERY_DATASET=$bqDataset,GCS_BUCKET_NAME=$gcsBucketName,MARKET_DATA_PROVIDER=yfinance"

$apiBaseUrl = (gcloud run services describe $apiServiceName --region=$region --format="value(status.url)")
Write-Host "  API deployed at: $apiBaseUrl"
Write-Host "  Terminal URL: $apiBaseUrl/terminal"

Write-Host "  Testing $apiBaseUrl/health ..."
try { Invoke-RestMethod -Uri "$apiBaseUrl/health" } catch { Write-Host "  (health check failed - inspect logs)" }

Write-Host "======================================================================"
Write-Host " Deployment complete"
Write-Host " API URL:      $apiBaseUrl"
Write-Host " Terminal URL: $apiBaseUrl/terminal"
Write-Host "======================================================================"
