# Phase 0 production contract

The API refuses to boot in production without durable PostgreSQL, a stable
session key, and explicit browser origins.

```text
APP_ENV=production
DATABASE_URL=postgresql://...
FINSIGHT_SECRET_KEY=<at least 32 random characters>
CORS_ORIGINS=https://finsight-alpha-web.vercel.app
FRONTEND_URL=https://finsight-alpha-web.vercel.app
```

Apply and verify all migrations before shifting traffic:

```powershell
python scripts/apply_production_migrations.py
```

Migration `004` forces PostgreSQL row-level security even when a managed
provider uses the owning role at runtime. Tenant-scoped transactions set
`app.organization_id`; application queries also filter by organization id.

Required probes:

- `/health` is liveness only.
- `/health/ready` checks runtime configuration and database connectivity.
- `/health/pipelines` is authenticated and reports the latest ingestion run
  for the active organization.
- Vercel structured exception logs include a client-visible correlation id.
  Setting `SENTRY_DSN` additionally enables Sentry capture and tracing.

External evidence is fetched by backend ingestion endpoints only. A provider
failure must be returned as `UNAVAILABLE`; it must never be replaced by a demo,
static extract, or generated series. A missing, expired, or unverified tenant
grant also redacts the evidence and returns `UNAVAILABLE`.

See `docs/PROD_RUNBOOK.md` for deployment and owner activation.
