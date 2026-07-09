# Deploying FinSight Alpha to Azure Container Apps

This deploys the FastAPI backend (which serves the terminal, the login page, and
all APIs) as a single container, backed by **Azure Database for PostgreSQL** for
user accounts, scaled **to zero** when idle, behind **HTTPS** with **user login**.

> Why Container Apps and not Vercel: the app is a long-running ASGI server with
> heavy native deps (torch, faiss). Vercel's serverless functions can't host it
> well. Container Apps runs the container as-is and scales to zero, so idle cost
> is ~nothing.

---

## 0. Prerequisites (once)

- An Azure subscription (the same one with your `Finsight-Alpha-LLM` OpenAI resource).
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed.
- Docker is **not** required locally — `az containerapp up` builds the image in the cloud.

```powershell
az login
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
```

Pick names/region once (edit to taste):

```powershell
$RG="finsight-rg"
$LOC="eastus"                      # match your OpenAI resource region
$ENVNAME="finsight-env"
$APP="finsight-alpha"
$PG="finsight-pg-$(Get-Random)"    # Postgres server name must be globally unique
$PGADMIN="finsight"
$PGPASS="<choose-a-strong-password>"
$DBNAME="finsight"
```

---

## 1. Resource group

```powershell
az group create --name $RG --location $LOC
```

## 2. PostgreSQL (Flexible Server)

```powershell
az postgres flexible-server create `
  --resource-group $RG --name $PG --location $LOC `
  --admin-user $PGADMIN --admin-password $PGPASS `
  --tier Burstable --sku-name Standard_B1ms `
  --storage-size 32 --version 16 `
  --public-access 0.0.0.0          # allow Azure services; tighten later

az postgres flexible-server db create `
  --resource-group $RG --server-name $PG --database-name $DBNAME
```

Build the SQLAlchemy connection string (note `sslmode=require`):

```powershell
$DATABASE_URL="postgresql://${PGADMIN}:${PGPASS}@${PG}.postgres.database.azure.com:5432/${DBNAME}?sslmode=require"
```

## 3. Container Apps environment

```powershell
az containerapp env create --name $ENVNAME --resource-group $RG --location $LOC
```

## 4. Deploy the app (builds from source in the cloud)

Run this from the project root (where the `Dockerfile` is):

```powershell
az containerapp up `
  --name $APP --resource-group $RG --environment $ENVNAME `
  --source . --ingress external --target-port 8000
```

This creates the app and a public HTTPS URL. Now set secrets + scaling.

## 5. Secrets and environment variables

Generate a session signing key (keep it stable so logins survive restarts):

```powershell
$SECRET=[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Max 256}))
```

Store secrets, then reference them as env vars:

```powershell
az containerapp secret set --name $APP --resource-group $RG --secrets `
  azure-openai-key="<YOUR_AZURE_OPENAI_KEY>" `
  database-url="$DATABASE_URL" `
  session-secret="$SECRET"

az containerapp update --name $APP --resource-group $RG --set-env-vars `
  AZURE_OPENAI_API_KEY=secretref:azure-openai-key `
  AZURE_OPENAI_ENDPOINT="https://finsight-resources.services.ai.azure.com/openai/v1/responses" `
  AZURE_OPENAI_DEPLOYMENT="gpt-5-mini" `
  AZURE_OPENAI_API_VERSION="2026-05-01" `
  FINSIGHT_LLM_PROVIDER="azure" `
  DATABASE_URL=secretref:database-url `
  FINSIGHT_SECRET_KEY=secretref:session-secret `
  FINSIGHT_SEC_USER_AGENT="FinSight Alpha (your-email@example.com)"
```

## 6. Scale to zero

```powershell
az containerapp update --name $APP --resource-group $RG `
  --min-replicas 0 --max-replicas 2
```

With `min-replicas 0` you pay ~nothing when idle; the first request after a quiet
period takes ~30–60s to cold-start (large ML image). That's the trade-off you chose.

## 7. Open it

```powershell
az containerapp show --name $APP --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv
```

Visit `https://<that-fqdn>/login`, create an account, and you're in.

---

## Redeploying after code changes

```powershell
az containerapp up --name $APP --resource-group $RG --source . --ingress external --target-port 8000
```

## Verifying the LLM in the cloud

Once awake, hit `https://<fqdn>/health/llm` (you'll need to be logged in — it's
gated). It should report `"auto_resolves_to": "azure"` and `"probe": {"ok": true}`.

## Cost notes

- **Container Apps:** ~$0 while idle (scale-to-zero); you pay per-second only while
  serving. A few cents per active hour on the consumption plan.
- **Postgres Burstable B1ms:** roughly ~$12–15/month (it does **not** scale to
  zero). To pause cost when not demoing: `az postgres flexible-server stop ...`.
- **Azure OpenAI:** per-token, as today. Login gating keeps strangers off your bill.

## Security checklist

- `.env` is git-ignored and `.dockerignore`d — real keys never enter the image.
  All secrets are injected via Container Apps secrets.
- `FINSIGHT_SECRET_KEY` must be set (done above) so session cookies stay valid
  across restarts and replicas.
- Tighten Postgres networking later: replace `--public-access 0.0.0.0` with a
  private endpoint or a tight firewall rule.
- Passwords are PBKDF2-SHA256 hashed; sessions are HMAC-signed httponly cookies
  over HTTPS. This is solid for a small app, not a substitute for an IdP/SSO.
