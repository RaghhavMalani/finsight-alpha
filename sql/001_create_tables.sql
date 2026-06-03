-- FinSight Alpha - PostgreSQL (Cloud SQL) metadata schema.
-- Apply with:  psql "$DATABASE_URL" -f sql/001_create_tables.sql
--
-- This database stores APPLICATION METADATA, not the bulk time-series data
-- (which lives in local files / BigQuery). Think: which assets we track, what
-- ingestion jobs ran, and user watchlists.

-- ---------------------------------------------------------------------------
-- assets: the universe of tradable symbols we know about.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assets (
    id           SERIAL PRIMARY KEY,
    ticker       VARCHAR(32)  NOT NULL UNIQUE,
    name         VARCHAR(255),
    sector       VARCHAR(128),
    country      VARCHAR(64),
    currency     VARCHAR(8),
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_sector  ON assets (sector);
CREATE INDEX IF NOT EXISTS idx_assets_country ON assets (country);

-- ---------------------------------------------------------------------------
-- data_ingestion_jobs: an audit log of each download/processing run.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_ingestion_jobs (
    id              SERIAL PRIMARY KEY,
    provider        VARCHAR(64)  NOT NULL,
    tickers         TEXT         NOT NULL,             -- comma-separated or JSON
    start_date      DATE,
    end_date        DATE,
    rows_downloaded INTEGER      NOT NULL DEFAULT 0,
    status          VARCHAR(32)  NOT NULL DEFAULT 'pending',  -- pending|success|failed
    message         TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_status     ON data_ingestion_jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON data_ingestion_jobs (created_at);

-- ---------------------------------------------------------------------------
-- watchlists: named groups of assets (per user, once auth exists).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watchlists (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    owner       VARCHAR(128),                          -- user id/email later
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlists_owner ON watchlists (owner);

-- ---------------------------------------------------------------------------
-- watchlist_assets: many-to-many join between watchlists and assets.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watchlist_assets (
    id            SERIAL PRIMARY KEY,
    watchlist_id  INTEGER     NOT NULL REFERENCES watchlists (id) ON DELETE CASCADE,
    asset_id      INTEGER     NOT NULL REFERENCES assets (id)     ON DELETE CASCADE,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (watchlist_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_wla_watchlist ON watchlist_assets (watchlist_id);
CREATE INDEX IF NOT EXISTS idx_wla_asset     ON watchlist_assets (asset_id);
