-- Durable, tenant-owned computation and forecast issuance records.

BEGIN;

CREATE TABLE IF NOT EXISTS analysis_runs (
    id                   BIGSERIAL PRIMARY KEY,
    organization_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id               VARCHAR(96) NOT NULL,
    analysis_type        VARCHAR(96) NOT NULL,
    epistemic_state      VARCHAR(32) NOT NULL,
    as_of                TIMESTAMPTZ NOT NULL,
    data_version         VARCHAR(96) NOT NULL,
    calculation_version  VARCHAR(96) NOT NULL,
    input_hash           VARCHAR(96) NOT NULL,
    result_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, run_id)
);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_org_type
    ON analysis_runs (organization_id, analysis_type, created_at DESC);

CREATE TABLE IF NOT EXISTS forecast_signals (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker           VARCHAR(32) NOT NULL,
    signal_date      TIMESTAMPTZ NOT NULL,
    executable_from  TIMESTAMPTZ NOT NULL,
    horizon_days     INTEGER NOT NULL CHECK (horizon_days > 0),
    model_version    VARCHAR(96) NOT NULL,
    data_version     VARCHAR(96) NOT NULL,
    probability_up   DOUBLE PRECISION,
    signal_label     VARCHAR(64),
    status           VARCHAR(32) NOT NULL DEFAULT 'issued'
        CHECK (status IN ('issued', 'resolved', 'void')),
    outcome_return   DOUBLE PRECISION,
    score            DOUBLE PRECISION,
    resolved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, ticker, signal_date, horizon_days, model_version)
);
CREATE INDEX IF NOT EXISTS idx_forecast_signals_pending
    ON forecast_signals (organization_id, status, executable_from);

ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analysis_runs_tenant ON analysis_runs;
CREATE POLICY analysis_runs_tenant ON analysis_runs
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::BIGINT)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::BIGINT);

ALTER TABLE forecast_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_signals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forecast_signals_tenant ON forecast_signals;
CREATE POLICY forecast_signals_tenant ON forecast_signals
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::BIGINT)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::BIGINT);

COMMIT;
