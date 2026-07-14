-- Phase 0 canonical source catalog and internal evaluation grants.
-- Apply after 002_truth_reset.sql. Safe to run repeatedly.
--
-- The seeded grants belong only to the isolated `finsight-internal` tenant.
-- Customer organizations receive no grant implicitly: an administrator must
-- attach a user and explicitly grant the required datasets.

BEGIN;

INSERT INTO organizations (slug, name)
VALUES ('finsight-internal', 'FinSight Internal Evaluation')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO data_licenses (
    name, license_url, terms_version, commercial_use_allowed,
    attribution_required, notes
)
SELECT * FROM (VALUES
    (
        'World Bank Dataset Terms',
        'https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets',
        'retrieved-2026-07-14', TRUE, TRUE,
        'World Bank datasets are generally CC BY 4.0 unless the dataset states otherwise.'
    ),
    (
        'Open-Meteo Data License',
        'https://open-meteo.com/en/licence',
        'retrieved-2026-07-14', FALSE, TRUE,
        'Seeded scope is non-commercial evaluation. A commercial Open-Meteo service plan must be verified before commercial use.'
    ),
    (
        'NASA Earth Science Data and Information Policy',
        'https://www.earthdata.nasa.gov/engage/open-data-services-and-software/data-and-information-policy',
        'retrieved-2026-07-14', TRUE, TRUE,
        'NASA source and imagery attribution requirements still apply.'
    )
) AS incoming(name, license_url, terms_version, commercial_use_allowed, attribution_required, notes)
WHERE NOT EXISTS (
    SELECT 1 FROM data_licenses existing WHERE existing.name = incoming.name
);

INSERT INTO datasets (dataset_key, name, provider, source_url, description, is_simulated)
VALUES
    (
        'open-meteo:era5:daily', 'ERA5 daily agricultural weather',
        'Open-Meteo (ERA5 reanalysis)',
        'https://archive-api.open-meteo.com/v1/archive',
        'Country-centroid rainfall, mean temperature, and FAO-56 ET0. Modeled reanalysis, not a station or national aggregate.',
        FALSE
    ),
    (
        'nasa-gibs:MODIS_Terra_CorrectedReflectance_TrueColor',
        'MODIS Terra corrected-reflectance true-color imagery',
        'NASA Global Imagery Browse Services (GIBS)',
        'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
        'Country bounding-box imagery used as visual context; FinSight does not infer a vegetation score from these pixels.',
        FALSE
    ),
    (
        'world-bank:AG.YLD.CREL.KG', 'Cereal yield',
        'World Bank Indicators API',
        'https://api.worldbank.org/v2/indicator/AG.YLD.CREL.KG',
        'Annual reported cereal yield in kilograms per hectare.', FALSE
    ),
    (
        'world-bank:AG.PRD.CREL.MT', 'Cereal production',
        'World Bank Indicators API',
        'https://api.worldbank.org/v2/indicator/AG.PRD.CREL.MT',
        'Annual reported cereal production in metric tons.', FALSE
    ),
    (
        'world-bank:NY.GDP.MKTP.KD.ZG', 'Real GDP growth',
        'World Bank Indicators API',
        'https://api.worldbank.org/v2/indicator/NY.GDP.MKTP.KD.ZG',
        'Annual real GDP growth rate.', FALSE
    ),
    (
        'world-bank:NE.TRD.GNFS.ZS', 'Trade openness',
        'World Bank Indicators API',
        'https://api.worldbank.org/v2/indicator/NE.TRD.GNFS.ZS',
        'Annual trade in goods and services as a percentage of GDP.', FALSE
    ),
    (
        'world-bank:NE.EXP.GNFS.CD', 'Exports of goods and services',
        'World Bank Indicators API',
        'https://api.worldbank.org/v2/indicator/NE.EXP.GNFS.CD',
        'Annual exports of goods and services in current US dollars.', FALSE
    ),
    (
        'world-bank:NE.IMP.GNFS.CD', 'Imports of goods and services',
        'World Bank Indicators API',
        'https://api.worldbank.org/v2/indicator/NE.IMP.GNFS.CD',
        'Annual imports of goods and services in current US dollars.', FALSE
    )
ON CONFLICT (dataset_key) DO UPDATE SET
    name = EXCLUDED.name,
    provider = EXCLUDED.provider,
    source_url = EXCLUDED.source_url,
    description = EXCLUDED.description,
    is_simulated = EXCLUDED.is_simulated;

INSERT INTO dataset_licenses (dataset_id, license_id)
SELECT dataset.id, license.id
FROM (VALUES
    ('open-meteo:era5:daily', 'Open-Meteo Data License'),
    ('nasa-gibs:MODIS_Terra_CorrectedReflectance_TrueColor', 'NASA Earth Science Data and Information Policy'),
    ('world-bank:AG.YLD.CREL.KG', 'World Bank Dataset Terms'),
    ('world-bank:AG.PRD.CREL.MT', 'World Bank Dataset Terms'),
    ('world-bank:NY.GDP.MKTP.KD.ZG', 'World Bank Dataset Terms'),
    ('world-bank:NE.TRD.GNFS.ZS', 'World Bank Dataset Terms'),
    ('world-bank:NE.EXP.GNFS.CD', 'World Bank Dataset Terms'),
    ('world-bank:NE.IMP.GNFS.CD', 'World Bank Dataset Terms')
) AS mapping(dataset_key, license_name)
JOIN datasets dataset ON dataset.dataset_key = mapping.dataset_key
JOIN data_licenses license ON license.name = mapping.license_name
ON CONFLICT (dataset_id, license_id) DO NOTHING;

-- Required both before and after 004 forces row-level security. The setting is
-- transaction-local and cannot leak to another pooled request.
SELECT set_config(
    'app.organization_id',
    (SELECT id::text FROM organizations WHERE slug = 'finsight-internal'),
    true
);

INSERT INTO organization_license_grants (
    organization_id, dataset_id, status, permitted_uses, starts_at
)
SELECT
    organization.id,
    dataset.id,
    'active',
    '["internal_research", "display", "non_commercial_evaluation"]'::jsonb,
    NOW()
FROM organizations organization
CROSS JOIN datasets dataset
WHERE organization.slug = 'finsight-internal'
  AND dataset.dataset_key IN (
      'open-meteo:era5:daily',
      'nasa-gibs:MODIS_Terra_CorrectedReflectance_TrueColor',
      'world-bank:AG.YLD.CREL.KG',
      'world-bank:AG.PRD.CREL.MT',
      'world-bank:NY.GDP.MKTP.KD.ZG',
      'world-bank:NE.TRD.GNFS.ZS',
      'world-bank:NE.EXP.GNFS.CD',
      'world-bank:NE.IMP.GNFS.CD'
  )
ON CONFLICT (organization_id, dataset_id) DO UPDATE SET
    status = EXCLUDED.status,
    permitted_uses = EXCLUDED.permitted_uses,
    starts_at = COALESCE(organization_license_grants.starts_at, EXCLUDED.starts_at),
    ends_at = NULL;

COMMIT;

-- Verification (set tenant before querying after 004 forces RLS):
-- BEGIN;
-- SELECT set_config('app.organization_id', (
--   SELECT id::text FROM organizations WHERE slug = 'finsight-internal'
-- ), true);
-- SELECT organization.slug, dataset.dataset_key, grant.status, grant.permitted_uses
-- FROM organization_license_grants grant
-- JOIN organizations organization ON organization.id = grant.organization_id
-- JOIN datasets dataset ON dataset.id = grant.dataset_id
-- ORDER BY dataset.dataset_key;
-- COMMIT;
