-- Phase 0 truth reset: tenancy, catalog, licensing, lineage, and pipeline audit.
-- Apply after 001_create_tables.sql with a migration role.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    email          VARCHAR(320) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
    id          BIGSERIAL PRIMARY KEY,
    slug        VARCHAR(96) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role              VARCHAR(32) NOT NULL CHECK (role IN ('owner', 'admin', 'analyst', 'viewer', 'member')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON organization_memberships(user_id);

CREATE TABLE IF NOT EXISTS datasets (
    id            BIGSERIAL PRIMARY KEY,
    dataset_key   VARCHAR(255) NOT NULL UNIQUE,
    name          VARCHAR(255) NOT NULL,
    provider      VARCHAR(255) NOT NULL,
    source_url    TEXT NOT NULL,
    description   TEXT,
    is_simulated  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dataset_versions (
    id                BIGSERIAL PRIMARY KEY,
    dataset_id        BIGINT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    version_hash      VARCHAR(96) NOT NULL,
    upstream_version  VARCHAR(255),
    as_of             TIMESTAMPTZ,
    available_from    TIMESTAMPTZ NOT NULL,
    retrieved_at      TIMESTAMPTZ NOT NULL,
    geography         JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
    quality_checks    JSONB NOT NULL DEFAULT '[]'::jsonb,
    storage_uri       TEXT,
    row_count         INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (dataset_id, version_hash)
);
CREATE INDEX IF NOT EXISTS idx_dataset_versions_asof ON dataset_versions(dataset_id, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_dataset_versions_available ON dataset_versions(available_from DESC);

CREATE TABLE IF NOT EXISTS data_licenses (
    id                      BIGSERIAL PRIMARY KEY,
    name                    VARCHAR(255) NOT NULL,
    license_url             TEXT NOT NULL,
    terms_version           VARCHAR(128),
    commercial_use_allowed  BOOLEAN,
    attribution_required    BOOLEAN,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dataset_licenses (
    id          BIGSERIAL PRIMARY KEY,
    dataset_id  BIGINT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    license_id  BIGINT NOT NULL REFERENCES data_licenses(id) ON DELETE CASCADE,
    UNIQUE (dataset_id, license_id)
);

CREATE TABLE IF NOT EXISTS organization_license_grants (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dataset_id       BIGINT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    status           VARCHAR(32) NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'revoked')),
    permitted_uses   JSONB NOT NULL DEFAULT '[]'::jsonb,
    starts_at        TIMESTAMPTZ,
    ends_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, dataset_id)
);

CREATE TABLE IF NOT EXISTS lineage_edges (
    id                 BIGSERIAL PRIMARY KEY,
    source_version_id  BIGINT NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    target_version_id  BIGINT NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    transformation     TEXT NOT NULL,
    code_version       VARCHAR(128),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_version_id, target_version_id, transformation)
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dataset_id          BIGINT REFERENCES datasets(id) ON DELETE SET NULL,
    pipeline_key        VARCHAR(255) NOT NULL,
    status              VARCHAR(32) NOT NULL CHECK (status IN ('available', 'partial', 'unavailable', 'running', 'failed')),
    started_at          TIMESTAMPTZ NOT NULL,
    completed_at        TIMESTAMPTZ,
    rows_received       INTEGER NOT NULL DEFAULT 0,
    dataset_version_id  BIGINT REFERENCES dataset_versions(id) ON DELETE SET NULL,
    error_type          VARCHAR(255),
    error_message       TEXT,
    metrics             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingestion_org_pipeline ON ingestion_runs(organization_id, pipeline_key, completed_at DESC);

-- Tenant-owned tables use an application-set organization id. The runtime DB
-- role should not own these tables and should not have BYPASSRLS.
ALTER TABLE organization_license_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_license_grants_tenant ON organization_license_grants;
CREATE POLICY organization_license_grants_tenant ON organization_license_grants
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::BIGINT)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::BIGINT);

DROP POLICY IF EXISTS ingestion_runs_tenant ON ingestion_runs;
CREATE POLICY ingestion_runs_tenant ON ingestion_runs
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::BIGINT)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::BIGINT);

COMMIT;
