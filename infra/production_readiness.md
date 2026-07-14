# Phase 0 production contract

Production must set all of the following. The API refuses to boot when the
durability and session requirements are absent.

```text
APP_ENV=production
DATABASE_URL=postgresql+psycopg2://...
FINSIGHT_SECRET_KEY=<at least 32 random characters>
CORS_ORIGINS=https://your-terminal.example
SENTRY_DSN=https://...
```

Apply the metadata migrations before shifting traffic:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/001_create_tables.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/002_truth_reset.sql
```

The runtime database role must not own the tenant tables and must not have
`BYPASSRLS`; the application sets `app.organization_id` inside tenant-scoped
transactions. Use a separate migration role for DDL.

Required probes:

- `/health` is liveness only.
- `/health/ready` checks runtime configuration and database connectivity.
- `/health/pipelines` is authenticated and reports the latest ingestion run
  for the active organization.

External evidence is fetched by backend ingestion endpoints only. A provider
failure must be returned as `UNAVAILABLE`; it must never be replaced by a demo,
static extract, or generated series.
