-- Enforce tenant policies even when the runtime connection uses the table
-- owner role (common with managed/serverless PostgreSQL providers).

BEGIN;

ALTER TABLE organization_license_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE ingestion_runs FORCE ROW LEVEL SECURITY;

COMMIT;
