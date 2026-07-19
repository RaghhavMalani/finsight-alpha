# Phase 0 production runbook

Production topology:

- `finsight-alpha-web.vercel.app`: Vite frontend (`frontend-v2`)
- `finsight-alpha-mocha.vercel.app`: FastAPI backend (repository root)
- Neon Postgres through the Vercel Marketplace: durable authentication,
  organizations, dataset catalog, versions, grants, lineage, and pipeline runs
- Frontend `/api/*` rewrite: same-origin browser access to the FastAPI backend

## 1. Provision and connect Postgres

From the linked API project at the repository root:

```powershell
vercel integration add neon --name finsight-production-db --environment production
```

The integration must create a pooled `DATABASE_URL` on the API project. Do not
copy the URL into the frontend project and never commit it.

## 2. Apply and verify migrations

Pull production variables into a temporary, ignored environment file, load
`DATABASE_URL` into the current process, and run:

```powershell
python scripts/apply_production_migrations.py
```

The command applies `001` through `004` and must finish by verifying eight
authoritative datasets and eight scoped internal-evaluation grants. The seed
does not restore the retired Kaggle/Tesla or simulated alternative-data rows.

## 3. Configure the API project

Required production variables:

| Variable | Production value |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | Injected by the Neon integration |
| `FINSIGHT_SECRET_KEY` | Stable random value of at least 32 characters |
| `CORS_ORIGINS` | `https://finsight-alpha-web.vercel.app` |
| `FRONTEND_URL` | `https://finsight-alpha-web.vercel.app` |
| `DEFAULT_ORGANIZATION_SLUG` | `finsight-internal` until the frontend exposes tenant selection |
| `SENTRY_DSN` | Optional if Sentry is used; otherwise Vercel captures structured exception logs |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` when Sentry is enabled |

Provider keys remain optional. Missing upstream data must resolve to
`UNAVAILABLE`; it must never select a simulated replacement.

## 4. Deploy API and frontend

Deploy the repository root to the `finsight-alpha` Vercel project. Deploy
`frontend-v2` to `finsight-alpha-web`. The frontend rewrite in
`frontend-v2/vercel.json` must continue to target the production API.

## 5. Activate the production owner

1. Register through the deployed frontend with a strong password.
2. Pull `DATABASE_URL` into the local process without printing it.
3. Attach that existing user to the licensed internal tenant:

```powershell
python scripts/activate_production_owner.py --email OWNER_EMAIL
```

This verifies all eight grants before adding the owner membership. A personal
organization or any other tenant remains unlicensed and receives redacted
`UNAVAILABLE` evidence with `NOT_GRANTED`, not the underlying observations.
The backend defaults to `finsight-internal` only after verifying that the user
is a member; a forged organization header is still rejected. Replace this
temporary default with a frontend organization selector before customer rollout.

## 6. Production verification

- `/health` returns 200.
- `/health/ready` reports production, PostgreSQL, and durable storage.
- Login survives a new deployment because users are stored in Postgres.
- Agriculture and trade evidence show `ACTIVE`, permitted uses, source,
  content-hash version, as-of, retrieval/availability time, geography, lineage,
  and quality checks for the licensed tenant.
- Calling the same endpoints from an unlicensed tenant returns redacted
  `UNAVAILABLE` evidence.
- Direct satellite access returns 403 unless the tenant's NASA grant is active.
- `/health/pipelines` shows tenant-scoped durable ingestion runs.
- GitHub Actions passes backend, frontend, and truth-contract jobs on the exact
  deployed commit.

## Exit condition

Phase 0 is operationally complete only when every item above is verified on the
production URLs. Local tests or the presence of a migration file are not
substitutes for a live database, active grant, successful deployment, and
production evidence response.
