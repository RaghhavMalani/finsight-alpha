// Reviewed metadata and immutable references; no diagnostic values.
export const CUTOFFS = [
  "2026-10-10T12:34:47.123204Z",
  "2026-10-10T13:09:33.975258Z",
  "2026-10-10T13:59:59.414508Z",
] as const;
export const SCHEMAS: Record<string, Schema> = {
  audit: {
    type: "object",
    properties: {
      asset_scope: {
        type: "array",
        length: 1,
        items: { type: "string", enum: ["US-MKT", "IN-MKT"] },
      },
      claims: {
        type: "object",
        properties: {
          causal_claim_eligible: { type: "boolean", enum: [false] },
          inference_certified: { type: "boolean", enum: [false] },
          market_claim_eligible: { type: "boolean", enum: [false] },
          precise_edge_confidence: { type: "boolean", enum: [false] },
          trusted_graph: { type: "boolean", enum: [false] },
          validated_alpha: { type: "boolean", enum: [false] },
        },
      },
      country: { type: "string", enum: ["US", "INDIA"] },
      evidence_cutoff: {
        type: "string",
        enum: [
          "2026-10-10T12:34:47.123204Z",
          "2026-10-10T13:09:33.975258Z",
          "2026-10-10T13:59:59.414508Z",
        ],
      },
      input_hash: { type: "string", pattern: "[a-f0-9]{64}" },
      kind: { type: "string", enum: ["audit"] },
      payload: {
        type: "object",
        properties: {
          definitions: {
            type: "array",
            length: 20,
            items: {
              type: "object",
              properties: {
                class_path: {
                  type: "string",
                  enum: [
                    "finsight.plugins.engines.HMM",
                    "finsight.plugins.engines.GBMSuite",
                    "finsight.plugins.engines.MLP",
                    "finsight.plugins.engines.Hawkes",
                    "finsight.plugins.engines.VolatilityClustering",
                    "finsight.plugins.engines.MonteCarloVaR",
                    "finsight.plugins.engines.RegimeD042",
                    "src.regimes.plugins.VolatilityDiagnostics",
                    "src.regimes.plugins.RegimeHMM2",
                    "src.regimes.plugins.RegimeHMM4",
                    "src.regimes.plugins.FactorDiagnostic",
                    "src.regimes.plugins.MomentumView",
                    "src.regimes.local.AssetReturns",
                    "src.regimes.local.LocalVolatility",
                    "src.regimes.local.LocalHMM2",
                    "src.regimes.local.LocalHMM4",
                    "src.regimes.local.LocalFactors",
                    "src.regimes.local.LocalMomentum",
                    "src.regimes.local.IntradaySeasonality",
                    "examples.momentum_plugin.MomentumModel",
                  ],
                },
                declaration_sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                plugin_id: {
                  type: "string",
                  enum: [
                    "hmm",
                    "gbm-suite",
                    "mlp",
                    "hawkes",
                    "volatility-clustering",
                    "monte-carlo-var",
                    "d0.4.2",
                    "regimes.volatility",
                    "regimes.hmm2",
                    "regimes.hmm4",
                    "regimes.factors",
                    "regimes.momentum",
                    "regimes.local.returns",
                    "regimes.local.volatility",
                    "regimes.local.hmm2",
                    "regimes.local.hmm4",
                    "regimes.local.factors",
                    "regimes.local.momentum",
                    "regimes.local.seasonality",
                    "examples.momentum_plugin.MomentumModel",
                  ],
                },
                registration_kind: {
                  type: "string",
                  enum: ["ROW_ADAPTER", "SERIES_MODEL", "RETAINED_FIXTURE"],
                },
                version: { type: "string", enum: ["1"] },
              },
            },
          },
          exclusions: {
            type: "array",
            length: 2,
            items: {
              type: "object",
              properties: {
                class_path: {
                  type: "string",
                  enum: ["src.regimes.plugins._HMM", "tests:MeanModel/MeanSeries/Consumer"],
                },
                reason_code: { type: "string", enum: ["ABSTRACT_BASE", "TEST_HELPERS"] },
              },
            },
          },
          inventory_commit: { type: "string", enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"] },
          items: {
            type: "array",
            length: 64,
            items: {
              type: "object",
              properties: {
                alignment_rule: {
                  type: "string",
                  enum: ["UNAVAILABLE", "EXACT_OBSERVED_DATE_INNER_JOIN"],
                },
                allowed_controls: {
                  oneOf: [
                    { type: "array", length: 0, items: { type: "null" } },
                    {
                      type: "array",
                      length: 3,
                      items: { type: "string", enum: ["mkt", "smb", "hml"] },
                    },
                  ],
                },
                asset_scope: {
                  oneOf: [
                    {
                      type: "array",
                      length: 1,
                      items: { type: "string", enum: ["UNBOUND", "SDK-FIXTURE"] },
                    },
                    {
                      type: "array",
                      length: 2,
                      items: { type: "string", enum: ["US-MKT", "IN-MKT"] },
                    },
                    {
                      type: "array",
                      length: 3,
                      items: { type: "string", enum: ["SPY", "QQQ", "IWM"] },
                    },
                  ],
                },
                blockers: {
                  oneOf: [
                    {
                      type: "array",
                      length: 2,
                      items: {
                        type: "string",
                        enum: [
                          "UNAVAILABLE_TYPE",
                          "UNAVAILABLE_INPUT",
                          "REQUIRES_NEW_RESEARCH",
                          "UNAVAILABLE_ALIGNMENT",
                          "UNAVAILABLE_LICENCE",
                        ],
                      },
                    },
                    {
                      type: "array",
                      length: 1,
                      items: {
                        type: "string",
                        enum: [
                          "UNAVAILABLE_TYPE",
                          "REQUIRES_NEW_RESEARCH",
                          "UNAVAILABLE_ALIGNMENT",
                          "SYNTHETIC_TEST_ONLY",
                        ],
                      },
                    },
                    { type: "array", length: 0, items: { type: "null" } },
                    {
                      type: "array",
                      length: 3,
                      items: {
                        type: "string",
                        enum: [
                          "UNAVAILABLE_TYPE",
                          "UNAVAILABLE_LICENCE",
                          "UNAVAILABLE_INPUT",
                          "UNAVAILABLE_ALIGNMENT",
                        ],
                      },
                    },
                  ],
                },
                chronology: { type: "string", enum: ["NO_RETAINED_REAL_RUN", "CAPTURE_ONLY"] },
                class_path: {
                  type: "string",
                  enum: [
                    "finsight.plugins.engines.HMM",
                    "finsight.plugins.engines.GBMSuite",
                    "finsight.plugins.engines.MLP",
                    "finsight.plugins.engines.Hawkes",
                    "finsight.plugins.engines.VolatilityClustering",
                    "finsight.plugins.engines.MonteCarloVaR",
                    "finsight.plugins.engines.RegimeD042",
                    "src.regimes.plugins.VolatilityDiagnostics",
                    "src.regimes.plugins.RegimeHMM2",
                    "src.regimes.plugins.RegimeHMM4",
                    "src.regimes.plugins.FactorDiagnostic",
                    "src.regimes.plugins.MomentumView",
                    "src.regimes.local.AssetReturns",
                    "src.regimes.local.LocalVolatility",
                    "src.regimes.local.LocalHMM2",
                    "src.regimes.local.LocalHMM4",
                    "src.regimes.local.LocalFactors",
                    "src.regimes.local.LocalMomentum",
                    "src.regimes.local.IntradaySeasonality",
                    "examples.momentum_plugin.MomentumModel",
                  ],
                },
                declared_type: { type: "string", enum: ["int", "float", "category", "bool"] },
                declared_unit: {
                  type: "string",
                  enum: [
                    "dimensionless",
                    "per_observation_volatility",
                    "observations",
                    "proportional_return",
                  ],
                },
                eligibility_status: {
                  type: "string",
                  enum: [
                    "UNAVAILABLE_TYPE",
                    "UNAVAILABLE_INPUT",
                    "UNAVAILABLE_ALIGNMENT",
                    "REQUIRES_NEW_RESEARCH",
                    "ELIGIBLE_RETAINED",
                    "SYNTHETIC_TEST_ONLY",
                  ],
                },
                evidence_class: {
                  type: "string",
                  enum: [
                    "DECLARATION_ONLY",
                    "RETAINED_REAL",
                    "LOCAL_UNAVAILABLE",
                    "SYNTHETIC_TEST_ONLY",
                  ],
                },
                output: {
                  type: "string",
                  enum: [
                    "regime",
                    "up_probability",
                    "fitted_branching_ratio",
                    "realized_volatility",
                    "volatility_state",
                    "var_return",
                    "cvar_return",
                    "vector_complete",
                    "realized_vol_20",
                    "ewma_vol",
                    "garch_persistence",
                    "garch_half_life",
                    "arch_lm_pvalue",
                    "garch_conditional_vol",
                    "hmm_state",
                    "hmm_posterior",
                    "expected_duration",
                    "hmm_converged",
                    "hmm2_state",
                    "market_beta",
                    "r_squared",
                    "intercept",
                    "neutrality",
                    "momentum_signal",
                    "momentum_sign",
                    "last_return",
                    "gap_count",
                    "asset_return",
                    "sessions",
                    "cells",
                  ],
                },
                output_channel: { type: "string", enum: ["current", "derived"] },
                plugin_id: {
                  type: "string",
                  enum: [
                    "hmm",
                    "gbm-suite",
                    "mlp",
                    "hawkes",
                    "volatility-clustering",
                    "monte-carlo-var",
                    "d0.4.2",
                    "regimes.volatility",
                    "regimes.hmm2",
                    "regimes.hmm4",
                    "regimes.factors",
                    "regimes.momentum",
                    "regimes.local.returns",
                    "regimes.local.volatility",
                    "regimes.local.hmm2",
                    "regimes.local.hmm4",
                    "regimes.local.factors",
                    "regimes.local.momentum",
                    "regimes.local.seasonality",
                    "examples.momentum_plugin.MomentumModel",
                  ],
                },
                plugin_version: { type: "string", enum: ["1"] },
                publication_eligibility: {
                  type: "string",
                  enum: ["METADATA_ONLY", "REFERENCES_ONLY"],
                },
                reason: {
                  type: "string",
                  enum: [
                    "Built-in row adapter, asset from a future run contract; no matching retained real adapter run in the checked manifests. State labels/booleans/indices are categorical semantics, even when stored as int. No factor controls/response alignment are admissible in v0.1. R-CAT; UNAVAILABLE_INPUT",
                    "GBM/MLP probability output; default declaration float/dimensionless does not establish a return target or calibrated probability. No sealed real run/diagnostic; a future defined prediction-to-return research contract and retained chronology are required. R-PROB; REQUIRES_NEW_RESEARCH",
                    "Development-window Hawkes or Monte Carlo parameter/tail summary; not per-observation investment returns. No real retained diagnostic; assigning a dated regression response would fabricate alignment. R-PARAM; UNAVAILABLE_INPUT; no admitted real event stream",
                    "Volatility row adapter has no retained real execution; unit defaults to dimensionless although implementation is volatility. A matched factor sensitivity definition/units and retained diagnostic are absent. R-VOL; undeclared semantic unit; REQUIRES_NEW_RESEARCH",
                    "Development-window Hawkes or Monte Carlo parameter/tail summary; not per-observation investment returns. No real retained diagnostic; assigning a dated regression response would fabricate alignment. R-PARAM; UNAVAILABLE_INPUT; declaration lacks return unit",
                    "Built-in row adapter, asset from a future run contract; no matching retained real adapter run in the checked manifests. State labels/booleans/indices are categorical semantics, even when stored as int. No factor controls/response alignment are admissible in v0.1. R-CAT; no retained execution of this row adapter",
                    "Built-in row adapter, asset from a future run contract; no matching retained real adapter run in the checked manifests. State labels/booleans/indices are categorical semantics, even when stored as int. No factor controls/response alignment are admissible in v0.1. R-CAT; completeness flag, not an exposure",
                    "Public US-MKT/IN-MKT, existing verified Phase 5 lineage and CAPTURE_ONLY clocks; categorical state or convergence flag is not a regression response. Preserve PARAMETER_RETROSPECTIVE path semantics. P-CAT",
                    "Public per-observation volatility is retained, but no factor regression of that volatility exists. Target transformation, controls and matched chronology would be a new research contract. No new diagnostic permitted. P-VOL",
                    "Current fitted persistence, half-life, duration or ARCH p-value is a model/window diagnostic. Retention does not supply a factor-aligned response series; p-values are not factor returns. P-PARAM",
                    "Current fitted persistence, half-life, duration or ARCH p-value is a model/window diagnostic. Retention does not supply a factor-aligned response series; p-values are not factor returns. P-PARAM; use selected market's disclosed step semantics",
                    "Current fitted persistence, half-life, duration or ARCH p-value is a model/window diagnostic. Retention does not supply a factor-aligned response series; p-values are not factor returns. P-PARAM; diagnostic p-value, not a response return",
                    "Public per-observation volatility is retained, but no factor regression of that volatility exists. Target transformation, controls and matched chronology would be a new research contract. No new diagnostic permitted. P-VOL; producer chain exists, factor assessment does not",
                    "Public per-observation volatility is retained, but no factor regression of that volatility exists. Target transformation, controls and matched chronology would be a new research contract. No new diagnostic permitted. P-VOL; no retained factor assessment",
                    "Filtered HMM posterior is retained and explicitly not calibrated. No declared/researched factor assessment of the posterior exists. Do not regress it by default. P-PROB",
                    "Public US-MKT/IN-MKT, existing verified Phase 5 lineage and CAPTURE_ONLY clocks; categorical state or convergence flag is not a regression response. Preserve PARAMETER_RETROSPECTIVE path semantics. P-CAT; downstream admission does not make a categorical target numerical",
                    "Reuse MOM target on MKT/SMB/HML only, from the verified same-cutoff factor artifact + lineage + snapshot. Exact observed-date inner join; prior-only rolling window 120, minimum 60; full-window HAC lag 3 remains retrospective/asymptotic. Target MOM is excluded from controls. Public derived grant is present. P-FIT; reference mkt term, not new fit",
                    "Reuse MOM target on MKT/SMB/HML only, from the verified same-cutoff factor artifact + lineage + snapshot. Exact observed-date inner join; prior-only rolling window 120, minimum 60; full-window HAC lag 3 remains retrospective/asymptotic. Target MOM is excluded from controls. Public derived grant is present. P-FIT; existing goodness-of-fit only",
                    "Reuse MOM target on MKT/SMB/HML only, from the verified same-cutoff factor artifact + lineage + snapshot. Exact observed-date inner join; prior-only rolling window 120, minimum 60; full-window HAC lag 3 remains retrospective/asymptotic. Target MOM is excluded from controls. Public derived grant is present. P-FIT; descriptive intercept, never alpha",
                    "Reuse MOM target on MKT/SMB/HML only, from the verified same-cutoff factor artifact + lineage + snapshot. Exact observed-date inner join; prior-only rolling window 120, minimum 60; full-window HAC lag 3 remains retrospective/asymptotic. Target MOM is excluded from controls. Public derived grant is present. P-FIT; snapshot's existing overall label only; categorical target fit prohibited",
                    "Retained 12\u20131 market-factor signal is not the published MOM factor, nor a strategy return. No exposure assessment of that signal exists; replacing it with MOM would be target substitution. Its categorical sign is not a regression response. P-MOM",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; UNAVAILABLE_LICENCE publicly; no retained factor assessment",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; missing runtime/licence; coverage count",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; public UNAVAILABLE_LICENCE; cannot build assessment now",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; missing runtime/licence",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; no retained factor assessment",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; missing runtime/licence; window parameter",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; diagnostic p-value; missing runtime/licence",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; missing retained assessment/runtime; public grant absent",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; new diagnostic would require research",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; UNAVAILABLE_LICENCE publicly; installed verified result required",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; UNAVAILABLE_LICENCE publicly",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; UNAVAILABLE_LICENCE publicly; never alpha",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; reuse existing label only if installed; categorical fit prohibited",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; target distinct from MOM; new assessment requires research",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; coverage count, not investment signal",
                    "Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. L; grid count, not investment signal",
                    "examples.momentum_plugin.MomentumModel, SDK-FIXTURE/public-fixture; three immutable synthetic v1 runs, each with one historical holdout opening. Existing OLS point factor hook is engineering evidence only; no uncertainty certificate or real-market inference. FIX; never eligible in a real-view numerator",
                  ],
                },
                reason_code: {
                  type: "string",
                  enum: [
                    "R-CAT",
                    "R-PROB",
                    "R-PARAM",
                    "R-VOL",
                    "P-CAT",
                    "P-VOL",
                    "P-PARAM",
                    "P-PROB",
                    "P-FIT",
                    "P-MOM",
                    "L",
                    "FIX",
                  ],
                },
                retained_diagnostic_refs: {
                  oneOf: [
                    { type: "array", length: 0, items: { type: "null" } },
                    {
                      type: "array",
                      length: 3,
                      items: {
                        type: "object",
                        properties: {
                          artifact_id: {
                            type: "string",
                            enum: [
                              "regimes:factors:00c5b6870bdb132b46979f25d25f2d3fdaa32a00948d06227b223e9dbe9bfa45",
                              "regimes:snapshot:822c3923932147082aa1f598b51dba6364b99cfc62abd19539f66fbe6175294d",
                              "regimes:lineage:f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905",
                              "regimes:factors:deb8ae9a105a70e4caa479485a56502cc8fbca101a9e005f040720b017a357cf",
                              "regimes:snapshot:dc4ce03af520e76329699e680873d536da0b19d3de5bfbc153d1a67e2a054a70",
                              "regimes:lineage:20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c",
                              "regimes:factors:14bfd98c1ea75247b45135499f955ce0e67bb64e2eb466e8ccc71c2d7836806b",
                              "regimes:snapshot:12235bb5b98eceb46ac7c035e0a0cf94abb23639bc71090b9c4b2a21bf5b85ab",
                              "regimes:lineage:78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117",
                              "regimes:factors:f3a1fb368d8de804557f76780768c79688d8dfe6d7f3b35102dfa892e23e6bcc",
                              "regimes:snapshot:aa5e7dd6733f0854740b20c35b4a142fcbf53edd16cb2fbdbf003b975ef02beb",
                              "regimes:lineage:51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b",
                              "regimes:factors:6bdf5f4453fb2e7522e3b4107d25311b1865283fb55c1f3c62efd567f0801f23",
                              "regimes:snapshot:e7545843ae8222f970c1ff9d6918dea67db9f8474a9f127a4ce25e97cfb46721",
                              "regimes:lineage:50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b",
                              "regimes:factors:3e1cdbdd5545c85cdf5fa91a2235529ee1661d07839a2b8f6f9b3ac4dea416fc",
                              "regimes:snapshot:188141fd293bf16b0883e0a3faab2a300556fec7cd40a2cc79b4cd60e47f34a6",
                              "regimes:lineage:d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70",
                            ],
                          },
                          as_of: {
                            type: "string",
                            enum: [
                              "2026-10-10T12:34:47.123204Z",
                              "2026-10-10T13:09:33.975258Z",
                              "2026-10-10T13:59:59.414508Z",
                            ],
                          },
                          asset: { type: "string", enum: ["US-MKT", "IN-MKT"] },
                          bytes: {
                            type: "integer",
                            enum: [
                              32056, 58374, 22965, 58373, 26783, 58537, 32454, 59401, 20782, 24992,
                              59565,
                            ],
                          },
                          country: { type: "string", enum: ["US", "INDIA"] },
                          json_pointer: {
                            type: "string",
                            enum: [
                              "/payload",
                              "/payload/current/factors/neutrality",
                              "/payload/runs/factors",
                            ],
                          },
                          kind: {
                            type: "string",
                            enum: ["regimes-factors", "regimes-snapshot", "regimes-lineage"],
                          },
                          run_id: { type: "string", pattern: "[a-f0-9]{64}" },
                          scope: { type: "string", enum: ["REAL_DERIVED_REGIMES"] },
                          sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                          source_ids: {
                            type: "array",
                            length: 1,
                            items: {
                              type: "string",
                              enum: ["ken-french:daily-factors", "iima:daily-factors"],
                            },
                          },
                          type: { type: "string", enum: ["replay_artifact"] },
                        },
                      },
                    },
                  ],
                },
                semantic_unit: {
                  oneOf: [
                    {
                      type: "string",
                      enum: [
                        "dimensionless",
                        "per_observation_volatility",
                        "observations",
                        "proportional_return",
                      ],
                    },
                    { type: "null", enum: [null] },
                  ],
                },
                source_lineage_ref: {
                  oneOf: [
                    { type: "null", enum: [null] },
                    {
                      type: "object",
                      properties: {
                        artifact_id: {
                          type: "string",
                          enum: [
                            "regimes:lineage:f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905",
                            "regimes:lineage:20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c",
                            "regimes:lineage:78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117",
                            "regimes:lineage:51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b",
                            "regimes:lineage:50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b",
                            "regimes:lineage:d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70",
                          ],
                        },
                        as_of: {
                          type: "string",
                          enum: [
                            "2026-10-10T12:34:47.123204Z",
                            "2026-10-10T13:09:33.975258Z",
                            "2026-10-10T13:59:59.414508Z",
                          ],
                        },
                        asset: { type: "string", enum: ["US-MKT", "IN-MKT"] },
                        bytes: { type: "integer", enum: [22965, 26783, 20782, 24992] },
                        country: { type: "string", enum: ["US", "INDIA"] },
                        json_pointer: { type: "string", enum: ["/payload/runs/factors"] },
                        kind: { type: "string", enum: ["regimes-lineage"] },
                        run_id: { type: "string", pattern: "[a-f0-9]{64}" },
                        scope: { type: "string", enum: ["REAL_DERIVED_REGIMES"] },
                        sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                        source_ids: {
                          type: "array",
                          length: 1,
                          items: {
                            type: "string",
                            enum: ["ken-french:daily-factors", "iima:daily-factors"],
                          },
                        },
                        type: { type: "string", enum: ["replay_artifact"] },
                      },
                    },
                  ],
                },
                target_meaning: {
                  type: "string",
                  enum: [
                    "Not authorized as a factor regression response",
                    "Assessment of published MOM; not a new regression target",
                  ],
                },
              },
            },
          },
        },
      },
      schema_version: { type: "string", enum: ["factors-evidence/1"] },
      scope: { type: "string", enum: ["READ_ONLY_FACTOR_EVIDENCE"] },
      sources: {
        type: "array",
        length: 1,
        items: { type: "string", enum: ["ken-french:daily-factors", "iima:daily-factors"] },
      },
    },
  },
  catalog: {
    type: "object",
    properties: {
      asset_scope: {
        type: "array",
        length: 1,
        items: { type: "string", enum: ["US-MKT", "IN-MKT"] },
      },
      claims: {
        type: "object",
        properties: {
          causal_claim_eligible: { type: "boolean", enum: [false] },
          inference_certified: { type: "boolean", enum: [false] },
          market_claim_eligible: { type: "boolean", enum: [false] },
          precise_edge_confidence: { type: "boolean", enum: [false] },
          trusted_graph: { type: "boolean", enum: [false] },
          validated_alpha: { type: "boolean", enum: [false] },
        },
      },
      country: { type: "string", enum: ["US", "INDIA"] },
      evidence_cutoff: {
        type: "string",
        enum: [
          "2026-10-10T12:34:47.123204Z",
          "2026-10-10T13:09:33.975258Z",
          "2026-10-10T13:59:59.414508Z",
        ],
      },
      input_hash: { type: "string", pattern: "[a-f0-9]{64}" },
      kind: { type: "string", enum: ["catalog"] },
      payload: {
        type: "object",
        properties: {
          items: {
            type: "array",
            length: 5,
            items: {
              type: "object",
              properties: {
                analysis_coverage: {
                  oneOf: [
                    {
                      type: "object",
                      properties: {
                        first_observed_date: { type: "string", enum: ["2000-01-03"] },
                        last_observed_date: { type: "string", enum: ["2026-08-31", "2025-12-31"] },
                        observations: { type: "integer", enum: [6705, 6466] },
                      },
                    },
                    { type: "null", enum: [null] },
                  ],
                },
                asset_scope: {
                  type: "array",
                  length: 1,
                  items: { type: "string", enum: ["US-MKT", "IN-MKT"] },
                },
                available_from: {
                  type: "string",
                  enum: [
                    "2026-10-10T12:32:33.060894Z",
                    "2026-10-10T12:33:58.849352Z",
                    "2026-10-10T13:07:20.115826Z",
                    "2026-10-10T13:08:46.581264Z",
                    "2026-10-10T13:57:41.946719Z",
                    "2026-10-10T13:59:10.413486Z",
                    "2026-10-10T12:34:47.123204Z",
                    "2026-10-10T13:09:33.975258Z",
                    "2026-10-10T13:59:59.414508Z",
                  ],
                },
                calendar_status: {
                  type: "object",
                  properties: {
                    evidence_ref: {
                      type: "object",
                      properties: {
                        artifact_id: {
                          type: "string",
                          enum: [
                            "regimes:lineage:f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905",
                            "regimes:lineage:20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c",
                            "regimes:lineage:78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117",
                            "regimes:lineage:51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b",
                            "regimes:lineage:50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b",
                            "regimes:lineage:d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70",
                          ],
                        },
                        as_of: {
                          type: "string",
                          enum: [
                            "2026-10-10T12:34:47.123204Z",
                            "2026-10-10T13:09:33.975258Z",
                            "2026-10-10T13:59:59.414508Z",
                          ],
                        },
                        asset: { type: "string", enum: ["US-MKT", "IN-MKT"] },
                        bytes: { type: "integer", enum: [22965, 26783, 20782, 24992] },
                        country: { type: "string", enum: ["US", "INDIA"] },
                        json_pointer: { type: "string", enum: ["/payload/runs/factors"] },
                        kind: { type: "string", enum: ["regimes-lineage"] },
                        run_id: { type: "string", pattern: "[a-f0-9]{64}" },
                        scope: { type: "string", enum: ["REAL_DERIVED_REGIMES"] },
                        sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                        source_ids: {
                          type: "array",
                          length: 1,
                          items: {
                            type: "string",
                            enum: ["ken-french:daily-factors", "iima:daily-factors"],
                          },
                        },
                        type: { type: "string", enum: ["replay_artifact"] },
                      },
                    },
                    mic: { type: "string", enum: ["XNYS", "XNSE"] },
                    status: { type: "string", enum: ["PACKAGE_EVIDENCE", "UNAVAILABLE"] },
                    version: {
                      oneOf: [
                        { type: "string", enum: ["4.13.2"] },
                        { type: "null", enum: [null] },
                      ],
                    },
                  },
                },
                capture_sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                capture_time: {
                  type: "string",
                  enum: [
                    "2026-10-10T12:32:33.060894Z",
                    "2026-10-10T12:33:58.849352Z",
                    "2026-10-10T13:07:20.115826Z",
                    "2026-10-10T13:08:46.581264Z",
                    "2026-10-10T13:57:41.946719Z",
                    "2026-10-10T13:59:10.413486Z",
                    "2026-10-10T12:34:47.123204Z",
                    "2026-10-10T13:09:33.975258Z",
                    "2026-10-10T13:59:59.414508Z",
                  ],
                },
                country: { type: "string", enum: ["US", "INDIA"] },
                definition: {
                  type: "string",
                  enum: [
                    "US:MKT",
                    "US:SMB",
                    "US:HML",
                    "US:MOM",
                    "US:RF",
                    "INDIA:MKT",
                    "INDIA:SMB",
                    "INDIA:HML",
                    "INDIA:MOM",
                    "INDIA:RF",
                  ],
                },
                display_name: {
                  type: "string",
                  enum: [
                    "Market excess return",
                    "Size",
                    "Value",
                    "Momentum",
                    "Risk-free return component",
                  ],
                },
                evidence_quality: {
                  oneOf: [
                    {
                      type: "array",
                      length: 2,
                      items: {
                        type: "string",
                        enum: [
                          "CAPTURE_ONLY",
                          "LIBRARY_COVERAGE_UNAVAILABLE",
                          "NOT_CONSUMED_BY_ASSESSMENT",
                        ],
                      },
                    },
                    {
                      type: "array",
                      length: 3,
                      items: {
                        type: "string",
                        enum: [
                          "CAPTURE_ONLY",
                          "LIBRARY_COVERAGE_UNAVAILABLE",
                          "NOT_CONSUMED_BY_ASSESSMENT",
                          "CALENDAR_UNAVAILABLE",
                          "STALE_INPUT",
                        ],
                      },
                    },
                    { type: "array", length: 1, items: { type: "string", enum: ["CAPTURE_ONLY"] } },
                    {
                      type: "array",
                      length: 4,
                      items: {
                        type: "string",
                        enum: [
                          "CAPTURE_ONLY",
                          "CALENDAR_UNAVAILABLE",
                          "STALE_INPUT",
                          "LIBRARY_COVERAGE_UNAVAILABLE",
                          "NOT_CONSUMED_BY_ASSESSMENT",
                        ],
                      },
                    },
                    {
                      type: "array",
                      length: 5,
                      items: {
                        type: "string",
                        enum: [
                          "CAPTURE_ONLY",
                          "CALENDAR_UNAVAILABLE",
                          "STALE_INPUT",
                          "LIBRARY_COVERAGE_UNAVAILABLE",
                          "NOT_CONSUMED_BY_ASSESSMENT",
                        ],
                      },
                    },
                  ],
                },
                evidence_refs: {
                  type: "array",
                  length: 1,
                  items: {
                    type: "object",
                    properties: {
                      artifact_id: {
                        type: "string",
                        enum: [
                          "regimes:lineage:f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905",
                          "regimes:lineage:20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c",
                          "regimes:lineage:78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117",
                          "regimes:lineage:51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b",
                          "regimes:lineage:50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b",
                          "regimes:lineage:d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70",
                        ],
                      },
                      as_of: {
                        type: "string",
                        enum: [
                          "2026-10-10T12:34:47.123204Z",
                          "2026-10-10T13:09:33.975258Z",
                          "2026-10-10T13:59:59.414508Z",
                        ],
                      },
                      asset: { type: "string", enum: ["US-MKT", "IN-MKT"] },
                      bytes: { type: "integer", enum: [22965, 26783, 20782, 24992] },
                      country: { type: "string", enum: ["US", "INDIA"] },
                      json_pointer: { type: "string", enum: ["/payload/runs/factors"] },
                      kind: { type: "string", enum: ["regimes-lineage"] },
                      run_id: { type: "string", pattern: "[a-f0-9]{64}" },
                      scope: { type: "string", enum: ["REAL_DERIVED_REGIMES"] },
                      sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                      source_ids: {
                        type: "array",
                        length: 1,
                        items: {
                          type: "string",
                          enum: ["ken-french:daily-factors", "iima:daily-factors"],
                        },
                      },
                      type: { type: "string", enum: ["replay_artifact"] },
                    },
                  },
                },
                factor_id: {
                  type: "string",
                  enum: [
                    "us:mkt",
                    "us:smb",
                    "us:hml",
                    "us:mom",
                    "us:rf",
                    "india:mkt",
                    "india:smb",
                    "india:hml",
                    "india:mom",
                    "india:rf",
                  ],
                },
                licence_status: {
                  type: "object",
                  properties: {
                    dataset_key: {
                      type: "string",
                      enum: ["ken-french:daily-factors", "iima:daily-factors"],
                    },
                    licence_ref: {
                      type: "object",
                      properties: {
                        artifact_id: {
                          type: "string",
                          enum: [
                            "regimes:lineage:f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905",
                            "regimes:lineage:20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c",
                            "regimes:lineage:78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117",
                            "regimes:lineage:51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b",
                            "regimes:lineage:50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b",
                            "regimes:lineage:d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70",
                          ],
                        },
                        as_of: {
                          type: "string",
                          enum: [
                            "2026-10-10T12:34:47.123204Z",
                            "2026-10-10T13:09:33.975258Z",
                            "2026-10-10T13:59:59.414508Z",
                          ],
                        },
                        asset: { type: "string", enum: ["US-MKT", "IN-MKT"] },
                        bytes: { type: "integer", enum: [22965, 26783, 20782, 24992] },
                        country: { type: "string", enum: ["US", "INDIA"] },
                        json_pointer: { type: "string", enum: ["/payload/runs/factors"] },
                        kind: { type: "string", enum: ["regimes-lineage"] },
                        run_id: { type: "string", pattern: "[a-f0-9]{64}" },
                        scope: { type: "string", enum: ["REAL_DERIVED_REGIMES"] },
                        sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                        source_ids: {
                          type: "array",
                          length: 1,
                          items: {
                            type: "string",
                            enum: ["ken-french:daily-factors", "iima:daily-factors"],
                          },
                        },
                        type: { type: "string", enum: ["replay_artifact"] },
                      },
                    },
                    permitted_uses: {
                      type: "array",
                      length: 1,
                      items: { type: "string", enum: ["publish_derived"] },
                    },
                    status: { type: "string", enum: ["ACTIVE"] },
                  },
                },
                lineage_status: { type: "string", enum: ["VERIFIED"] },
                observed_coverage: {
                  oneOf: [
                    { type: "null", enum: [null] },
                    {
                      type: "object",
                      properties: {
                        first_observed_date: {
                          type: "string",
                          enum: ["1926-07-01", "1926-11-03", "1993-10-01"],
                        },
                        last_observed_date: { type: "string", enum: ["2026-08-31", "2025-12-31"] },
                        observations: { type: "integer", enum: [26317, 26216, 8004] },
                      },
                    },
                  ],
                },
                publication_scope: { type: "string", enum: ["DERIVED_REFERENCES_ONLY"] },
                role: { type: "string", enum: ["FACTOR_RETURN", "RISK_FREE_COMPONENT"] },
                source: {
                  type: "object",
                  properties: {
                    attribution: {
                      type: "string",
                      enum: [
                        "Kenneth R. French Data Library; Fama and French research factors and momentum.",
                        "Agarwalla, S. K., Jacob, J. and Varma, J. R. (2013), Four factor model in Indian equities market, W.P. No. 2013-09-05, Indian Institute of Management, Ahmedabad.",
                      ],
                    },
                    source_id: {
                      type: "string",
                      enum: ["ken-french:daily-factors", "iima:daily-factors"],
                    },
                    source_urls: {
                      type: "array",
                      length: 1,
                      items: {
                        type: "string",
                        enum: [
                          "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
                          "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
                        ],
                      },
                    },
                    terms_url: {
                      type: "string",
                      enum: [
                        "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
                        "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
                      ],
                    },
                  },
                },
                source_version: { type: "string", pattern: "[a-f0-9]{64}" },
                staleness: {
                  type: "object",
                  properties: {
                    age_calendar_days: {
                      oneOf: [
                        { type: "integer", enum: [40, 283] },
                        { type: "null", enum: [null] },
                      ],
                    },
                    evaluated_at: {
                      type: "string",
                      enum: [
                        "2026-10-10T12:34:47.123204Z",
                        "2026-10-10T13:09:33.975258Z",
                        "2026-10-10T13:59:59.414508Z",
                      ],
                    },
                    last_observed: {
                      oneOf: [
                        { type: "string", enum: ["2026-08-31", "2025-12-31"] },
                        { type: "null", enum: [null] },
                      ],
                    },
                    policy_ref: { type: "string", enum: ["FROZEN_PHASE5_PROFILE"] },
                    status: { type: "string", enum: ["AS_RETAINED", "UNAVAILABLE", "STALE_INPUT"] },
                  },
                },
                supported_uses: {
                  oneOf: [
                    {
                      type: "array",
                      length: 2,
                      items: {
                        type: "string",
                        enum: ["SOURCE_METADATA", "RETAINED_MOM_CONTROL", "RETAINED_MOM_TARGET"],
                      },
                    },
                    {
                      type: "array",
                      length: 1,
                      items: { type: "string", enum: ["SOURCE_METADATA"] },
                    },
                  ],
                },
                units: { type: "string", enum: ["proportional_return"] },
              },
            },
          },
          unavailable_analytics: {
            type: "array",
            length: 5,
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  enum: [
                    "Security deciles",
                    "Cross-sectional IC / rank IC",
                    "Stock turnover / economic claims",
                    "Seven-factor neutrality",
                    "New output exposure / factor discovery",
                  ],
                },
                reason_code: {
                  type: "string",
                  enum: [
                    "NO_SECURITY_UNIVERSE",
                    "COSTS_UNAVAILABLE",
                    "CONTROLS_NOT_ADMITTED",
                    "REQUIRES_NEW_RESEARCH",
                  ],
                },
                required_evidence: {
                  oneOf: [
                    {
                      type: "array",
                      length: 9,
                      items: {
                        type: "string",
                        enum: [
                          "PIT identifiers/membership",
                          "PIT characteristics",
                          "forward returns",
                          "rebalance chronology",
                          "corporate actions",
                          "delistings",
                          "availability clocks",
                          "publication grants",
                          "cost/turnover evidence",
                        ],
                      },
                    },
                    {
                      type: "array",
                      length: 3,
                      items: {
                        type: "string",
                        enum: [
                          "security cross-section",
                          "horizon-specific forward returns",
                          "PIT availability/alignment",
                        ],
                      },
                    },
                    {
                      type: "array",
                      length: 7,
                      items: {
                        type: "string",
                        enum: [
                          "portfolio weights/rebalances",
                          "brokerage",
                          "DP",
                          "spread",
                          "slippage",
                          "turnover",
                          "effective-dated statutory evidence",
                        ],
                      },
                    },
                    {
                      type: "array",
                      length: 2,
                      items: {
                        type: "string",
                        enum: [
                          "licensed QUAL/VOL/LIQ controls",
                          "new approved diagnostic contract",
                        ],
                      },
                    },
                    {
                      type: "array",
                      length: 4,
                      items: {
                        type: "string",
                        enum: [
                          "explicit target/unit/control/alignment contract",
                          "registered research family",
                          "scoped inference eligibility",
                          "retained result",
                        ],
                      },
                    },
                  ],
                },
                status: { type: "string", enum: ["UNAVAILABLE"] },
              },
            },
          },
        },
      },
      schema_version: { type: "string", enum: ["factors-evidence/1"] },
      scope: { type: "string", enum: ["READ_ONLY_FACTOR_EVIDENCE"] },
      sources: {
        type: "array",
        length: 1,
        items: { type: "string", enum: ["ken-french:daily-factors", "iima:daily-factors"] },
      },
    },
  },
  ledger: {
    type: "object",
    properties: {
      asset_scope: {
        type: "array",
        length: 1,
        items: { type: "string", enum: ["US-MKT", "IN-MKT"] },
      },
      claims: {
        type: "object",
        properties: {
          causal_claim_eligible: { type: "boolean", enum: [false] },
          inference_certified: { type: "boolean", enum: [false] },
          market_claim_eligible: { type: "boolean", enum: [false] },
          precise_edge_confidence: { type: "boolean", enum: [false] },
          trusted_graph: { type: "boolean", enum: [false] },
          validated_alpha: { type: "boolean", enum: [false] },
        },
      },
      country: { type: "string", enum: ["US", "INDIA"] },
      evidence_cutoff: {
        type: "string",
        enum: [
          "2026-10-10T12:34:47.123204Z",
          "2026-10-10T13:09:33.975258Z",
          "2026-10-10T13:59:59.414508Z",
        ],
      },
      input_hash: { type: "string", pattern: "[a-f0-9]{64}" },
      kind: { type: "string", enum: ["ledger"] },
      payload: {
        type: "object",
        properties: {
          candidates: {
            type: "array",
            length: 3,
            items: {
              type: "object",
              properties: {
                candidate_id: {
                  type: "string",
                  enum: [
                    "US:retained-mom",
                    "research-os:closed-momentum",
                    "fixture:momentum",
                    "INDIA:retained-mom",
                  ],
                },
                country: { type: "string", enum: ["US", "CROSS_MARKET", "NONE", "INDIA"] },
                evidence_class: {
                  type: "string",
                  enum: ["RETAINED_REAL", "FROZEN_PRIOR", "SYNTHETIC_TEST_ONLY"],
                },
                family_ref: {
                  oneOf: [
                    { type: "null", enum: [null] },
                    {
                      type: "object",
                      properties: {
                        assertion_id: { type: "string", enum: ["REGISTERED_PRIOR_DEFINITION"] },
                        commit: {
                          type: "string",
                          enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"],
                        },
                        json_pointer: { type: "string", enum: ["/family"] },
                        path: {
                          type: "string",
                          enum: ["data/exports/research_os_v0_1/preregistration.json"],
                        },
                        sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                        type: { type: "string", enum: ["frozen_file"] },
                      },
                    },
                  ],
                },
                label: {
                  type: "string",
                  enum: [
                    "Retained MOM factor assessment",
                    "Frozen Research OS momentum study",
                    "Synthetic SDK fixture \u2014 engineering only",
                  ],
                },
                stages: {
                  type: "object",
                  properties: {
                    CLAIM_STATUS: {
                      type: "object",
                      properties: {
                        evidence_refs: {
                          oneOf: [
                            {
                              type: "array",
                              length: 1,
                              items: {
                                type: "object",
                                properties: {
                                  artifact_id: {
                                    type: "string",
                                    enum: [
                                      "regimes:factors:00c5b6870bdb132b46979f25d25f2d3fdaa32a00948d06227b223e9dbe9bfa45",
                                      "regimes:factors:deb8ae9a105a70e4caa479485a56502cc8fbca101a9e005f040720b017a357cf",
                                      "regimes:factors:14bfd98c1ea75247b45135499f955ce0e67bb64e2eb466e8ccc71c2d7836806b",
                                      "regimes:factors:f3a1fb368d8de804557f76780768c79688d8dfe6d7f3b35102dfa892e23e6bcc",
                                      "regimes:factors:6bdf5f4453fb2e7522e3b4107d25311b1865283fb55c1f3c62efd567f0801f23",
                                      "regimes:factors:3e1cdbdd5545c85cdf5fa91a2235529ee1661d07839a2b8f6f9b3ac4dea416fc",
                                    ],
                                  },
                                  as_of: {
                                    type: "string",
                                    enum: [
                                      "2026-10-10T12:34:47.123204Z",
                                      "2026-10-10T13:09:33.975258Z",
                                      "2026-10-10T13:59:59.414508Z",
                                    ],
                                  },
                                  asset: { type: "string", enum: ["US-MKT", "IN-MKT"] },
                                  bytes: { type: "integer", enum: [32056, 32454] },
                                  country: { type: "string", enum: ["US", "INDIA"] },
                                  json_pointer: { type: "string", enum: ["/payload"] },
                                  kind: { type: "string", enum: ["regimes-factors"] },
                                  run_id: { type: "string", pattern: "[a-f0-9]{64}" },
                                  scope: { type: "string", enum: ["REAL_DERIVED_REGIMES"] },
                                  sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                  source_ids: {
                                    type: "array",
                                    length: 1,
                                    items: {
                                      type: "string",
                                      enum: ["ken-french:daily-factors", "iima:daily-factors"],
                                    },
                                  },
                                  type: { type: "string", enum: ["replay_artifact"] },
                                },
                              },
                            },
                            {
                              type: "array",
                              length: 3,
                              items: {
                                type: "object",
                                properties: {
                                  assertion_id: {
                                    type: "string",
                                    enum: [
                                      "CLOSED_PRIOR_VERDICTS",
                                      "NOT_CALIBRATED",
                                      "NOT_CONFIRMED",
                                    ],
                                  },
                                  commit: {
                                    type: "string",
                                    enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"],
                                  },
                                  json_pointer: {
                                    type: "string",
                                    enum: ["/scorecard", "/calibration_status", "/status"],
                                  },
                                  path: {
                                    type: "string",
                                    enum: [
                                      "data/exports/research_os_v0_1/flagship.json",
                                      "data/exports/research_os_v0_1_1/summary.json",
                                    ],
                                  },
                                  sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                  type: { type: "string", enum: ["frozen_file"] },
                                },
                              },
                            },
                            { type: "array", length: 0, items: { type: "null" } },
                          ],
                        },
                        reason: {
                          type: "string",
                          enum: [
                            "BLOCKED: no certified inference or economic confirmation exists.",
                            "Frozen historical process; NOT_CALIBRATED / CLOSED. No Phase 6 confirmation.",
                            "Synthetic SDK plumbing only; not a real market candidate or factor discovery.",
                          ],
                        },
                        reason_code: {
                          type: "string",
                          enum: ["NO_INFERENCE_CERTIFICATION", "CLOSED_PRIOR", "ENGINEERING_ONLY"],
                        },
                        status: { type: "string", enum: ["BLOCKED", "NOT_APPLICABLE"] },
                        underlying_verdict: {
                          oneOf: [
                            { type: "string", enum: ["NOT_CALIBRATED", "NOT_CALIBRATED / CLOSED"] },
                            { type: "null", enum: [null] },
                          ],
                        },
                      },
                    },
                    COSTS: {
                      type: "object",
                      properties: {
                        evidence_refs: {
                          oneOf: [
                            {
                              type: "array",
                              length: 1,
                              items: {
                                type: "object",
                                properties: {
                                  assertion_id: {
                                    type: "string",
                                    enum: ["ILLUSTRATIVE_ALL_IN_UNAVAILABLE"],
                                  },
                                  commit: {
                                    type: "string",
                                    enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"],
                                  },
                                  json_pointer: {
                                    type: "string",
                                    enum: ["/payload/example/all_in_estimated_trading_cost"],
                                  },
                                  path: {
                                    type: "string",
                                    enum: [
                                      "frontend-v2/public/artifacts/replay/data-organ-costs-2b3f6564fc8a9f63a0cb734febe839f25b2e244859f0a7e2d906923df21488f9.json",
                                    ],
                                  },
                                  sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                  type: { type: "string", enum: ["frozen_file"] },
                                },
                              },
                            },
                            {
                              type: "array",
                              length: 3,
                              items: {
                                type: "object",
                                properties: {
                                  assertion_id: {
                                    type: "string",
                                    enum: [
                                      "CLOSED_PRIOR_VERDICTS",
                                      "NOT_CALIBRATED",
                                      "NOT_CONFIRMED",
                                    ],
                                  },
                                  commit: {
                                    type: "string",
                                    enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"],
                                  },
                                  json_pointer: {
                                    type: "string",
                                    enum: ["/scorecard", "/calibration_status", "/status"],
                                  },
                                  path: {
                                    type: "string",
                                    enum: [
                                      "data/exports/research_os_v0_1/flagship.json",
                                      "data/exports/research_os_v0_1_1/summary.json",
                                    ],
                                  },
                                  sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                  type: { type: "string", enum: ["frozen_file"] },
                                },
                              },
                            },
                            { type: "array", length: 0, items: { type: "null" } },
                          ],
                        },
                        reason: {
                          type: "string",
                          enum: [
                            "ECONOMIC UNAVAILABLE. Factor portfolio turnover, brokerage, DP, spread, slippage and tax/statutory inputs are each UNAVAILABLE; missing inputs are not zero. The Data Organ ILLUSTATIVE_EXAMPLE at its own 2026-10-11T07:17:30.281432Z publication cutoff has PARTIAL statutory subtotal and PARTIAL all-in status with a null estimate; it is not a witnessed trade or MOM-factor cost.",
                            "Synthetic SDK plumbing only; not a real market candidate or factor discovery.",
                          ],
                        },
                        reason_code: {
                          type: "string",
                          enum: ["COSTS_UNAVAILABLE", "ENGINEERING_ONLY"],
                        },
                        status: { type: "string", enum: ["UNAVAILABLE", "NOT_APPLICABLE"] },
                        underlying_verdict: {
                          oneOf: [
                            { type: "string", enum: ["ECONOMIC_UNAVAILABLE"] },
                            { type: "null", enum: [null] },
                          ],
                        },
                      },
                    },
                    CROSS_MARKET: {
                      type: "object",
                      properties: {
                        evidence_refs: {
                          oneOf: [
                            { type: "array", length: 0, items: { type: "null" } },
                            {
                              type: "array",
                              length: 3,
                              items: {
                                type: "object",
                                properties: {
                                  assertion_id: {
                                    type: "string",
                                    enum: [
                                      "CLOSED_PRIOR_VERDICTS",
                                      "NOT_CALIBRATED",
                                      "NOT_CONFIRMED",
                                    ],
                                  },
                                  commit: {
                                    type: "string",
                                    enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"],
                                  },
                                  json_pointer: {
                                    type: "string",
                                    enum: ["/scorecard", "/calibration_status", "/status"],
                                  },
                                  path: {
                                    type: "string",
                                    enum: [
                                      "data/exports/research_os_v0_1/flagship.json",
                                      "data/exports/research_os_v0_1_1/summary.json",
                                    ],
                                  },
                                  sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                  type: { type: "string", enum: ["frozen_file"] },
                                },
                              },
                            },
                          ],
                        },
                        reason: {
                          type: "string",
                          enum: [
                            "UNAVAILABLE: no approved retained test, security universe, OOS or economic contract.",
                            "Frozen historical process; NOT_CALIBRATED / CLOSED. No Phase 6 confirmation.",
                            "Synthetic SDK plumbing only; not a real market candidate or factor discovery.",
                          ],
                        },
                        reason_code: {
                          type: "string",
                          enum: ["NO_APPROVED_CONTRACT", "CLOSED_PRIOR", "ENGINEERING_ONLY"],
                        },
                        status: {
                          type: "string",
                          enum: ["UNAVAILABLE", "PARTIAL", "NOT_APPLICABLE"],
                        },
                        underlying_verdict: {
                          oneOf: [
                            { type: "null", enum: [null] },
                            { type: "string", enum: ["INCONCLUSIVE"] },
                          ],
                        },
                      },
                    },
                    DEFINITION: {
                      type: "object",
                      properties: {
                        evidence_refs: {
                          oneOf: [
                            {
                              type: "array",
                              length: 1,
                              items: {
                                oneOf: [
                                  {
                                    type: "object",
                                    properties: {
                                      artifact_id: {
                                        type: "string",
                                        enum: [
                                          "regimes:lineage:f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905",
                                          "regimes:lineage:20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c",
                                          "regimes:lineage:78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117",
                                          "regimes:lineage:51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b",
                                          "regimes:lineage:50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b",
                                          "regimes:lineage:d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70",
                                        ],
                                      },
                                      as_of: {
                                        type: "string",
                                        enum: [
                                          "2026-10-10T12:34:47.123204Z",
                                          "2026-10-10T13:09:33.975258Z",
                                          "2026-10-10T13:59:59.414508Z",
                                        ],
                                      },
                                      asset: { type: "string", enum: ["US-MKT", "IN-MKT"] },
                                      bytes: {
                                        type: "integer",
                                        enum: [22965, 26783, 20782, 24992],
                                      },
                                      country: { type: "string", enum: ["US", "INDIA"] },
                                      json_pointer: {
                                        type: "string",
                                        enum: ["/payload/runs/factors"],
                                      },
                                      kind: { type: "string", enum: ["regimes-lineage"] },
                                      run_id: { type: "string", pattern: "[a-f0-9]{64}" },
                                      scope: { type: "string", enum: ["REAL_DERIVED_REGIMES"] },
                                      sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                      source_ids: {
                                        type: "array",
                                        length: 1,
                                        items: {
                                          type: "string",
                                          enum: ["ken-french:daily-factors", "iima:daily-factors"],
                                        },
                                      },
                                      type: { type: "string", enum: ["replay_artifact"] },
                                    },
                                  },
                                  {
                                    type: "object",
                                    properties: {
                                      assertion_id: {
                                        type: "string",
                                        enum: ["REGISTERED_PRIOR_DEFINITION"],
                                      },
                                      commit: {
                                        type: "string",
                                        enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"],
                                      },
                                      json_pointer: { type: "string", enum: ["/family"] },
                                      path: {
                                        type: "string",
                                        enum: [
                                          "data/exports/research_os_v0_1/preregistration.json",
                                        ],
                                      },
                                      sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                      type: { type: "string", enum: ["frozen_file"] },
                                    },
                                  },
                                ],
                              },
                            },
                            { type: "array", length: 0, items: { type: "null" } },
                          ],
                        },
                        reason: {
                          type: "string",
                          enum: [
                            "Existing source-factor definition and sealed MOM-on-MKT/SMB/HML assessment only.",
                            "Frozen historical process; NOT_CALIBRATED / CLOSED. No Phase 6 confirmation.",
                            "Synthetic SDK plumbing only; not a real market candidate or factor discovery.",
                          ],
                        },
                        reason_code: {
                          type: "string",
                          enum: ["RETAINED_DEFINITION", "CLOSED_PRIOR", "ENGINEERING_ONLY"],
                        },
                        status: { type: "string", enum: ["VERIFIED", "NOT_APPLICABLE"] },
                        underlying_verdict: {
                          oneOf: [
                            { type: "null", enum: [null] },
                            { type: "string", enum: ["NOT_CALIBRATED / CLOSED"] },
                          ],
                        },
                      },
                    },
                    MULTIPLE_TESTING: {
                      type: "object",
                      properties: {
                        evidence_refs: {
                          oneOf: [
                            { type: "array", length: 0, items: { type: "null" } },
                            {
                              type: "array",
                              length: 3,
                              items: {
                                type: "object",
                                properties: {
                                  assertion_id: {
                                    type: "string",
                                    enum: [
                                      "CLOSED_PRIOR_VERDICTS",
                                      "NOT_CALIBRATED",
                                      "NOT_CONFIRMED",
                                    ],
                                  },
                                  commit: {
                                    type: "string",
                                    enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"],
                                  },
                                  json_pointer: {
                                    type: "string",
                                    enum: ["/scorecard", "/calibration_status", "/status"],
                                  },
                                  path: {
                                    type: "string",
                                    enum: [
                                      "data/exports/research_os_v0_1/flagship.json",
                                      "data/exports/research_os_v0_1_1/summary.json",
                                    ],
                                  },
                                  sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                  type: { type: "string", enum: ["frozen_file"] },
                                },
                              },
                            },
                          ],
                        },
                        reason: {
                          type: "string",
                          enum: [
                            "UNAVAILABLE: no approved retained test, security universe, OOS or economic contract.",
                            "Frozen historical process; NOT_CALIBRATED / CLOSED. No Phase 6 confirmation.",
                            "Synthetic SDK plumbing only; not a real market candidate or factor discovery.",
                          ],
                        },
                        reason_code: {
                          type: "string",
                          enum: ["NO_APPROVED_CONTRACT", "CLOSED_PRIOR", "ENGINEERING_ONLY"],
                        },
                        status: {
                          type: "string",
                          enum: ["UNAVAILABLE", "PARTIAL", "NOT_APPLICABLE"],
                        },
                        underlying_verdict: {
                          oneOf: [
                            { type: "null", enum: [null] },
                            { type: "string", enum: ["NOT_CALIBRATED / CLOSED"] },
                          ],
                        },
                      },
                    },
                    OUT_OF_SAMPLE: {
                      type: "object",
                      properties: {
                        evidence_refs: {
                          oneOf: [
                            { type: "array", length: 0, items: { type: "null" } },
                            {
                              type: "array",
                              length: 3,
                              items: {
                                type: "object",
                                properties: {
                                  assertion_id: {
                                    type: "string",
                                    enum: [
                                      "CLOSED_PRIOR_VERDICTS",
                                      "NOT_CALIBRATED",
                                      "NOT_CONFIRMED",
                                    ],
                                  },
                                  commit: {
                                    type: "string",
                                    enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"],
                                  },
                                  json_pointer: {
                                    type: "string",
                                    enum: ["/scorecard", "/calibration_status", "/status"],
                                  },
                                  path: {
                                    type: "string",
                                    enum: [
                                      "data/exports/research_os_v0_1/flagship.json",
                                      "data/exports/research_os_v0_1_1/summary.json",
                                    ],
                                  },
                                  sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                  type: { type: "string", enum: ["frozen_file"] },
                                },
                              },
                            },
                          ],
                        },
                        reason: {
                          type: "string",
                          enum: [
                            "UNAVAILABLE: no approved retained test, security universe, OOS or economic contract.",
                            "Frozen historical process; NOT_CALIBRATED / CLOSED. No Phase 6 confirmation.",
                            "Synthetic SDK plumbing only; not a real market candidate or factor discovery.",
                          ],
                        },
                        reason_code: {
                          type: "string",
                          enum: ["NO_APPROVED_CONTRACT", "CLOSED_PRIOR", "ENGINEERING_ONLY"],
                        },
                        status: {
                          type: "string",
                          enum: ["UNAVAILABLE", "PARTIAL", "NOT_APPLICABLE"],
                        },
                        underlying_verdict: {
                          oneOf: [
                            { type: "null", enum: [null] },
                            { type: "string", enum: ["NOT_CALIBRATED / CLOSED"] },
                          ],
                        },
                      },
                    },
                    RAW_TEST: {
                      type: "object",
                      properties: {
                        evidence_refs: {
                          oneOf: [
                            {
                              type: "array",
                              length: 1,
                              items: {
                                type: "object",
                                properties: {
                                  artifact_id: {
                                    type: "string",
                                    enum: [
                                      "regimes:factors:00c5b6870bdb132b46979f25d25f2d3fdaa32a00948d06227b223e9dbe9bfa45",
                                      "regimes:factors:deb8ae9a105a70e4caa479485a56502cc8fbca101a9e005f040720b017a357cf",
                                      "regimes:factors:14bfd98c1ea75247b45135499f955ce0e67bb64e2eb466e8ccc71c2d7836806b",
                                      "regimes:factors:f3a1fb368d8de804557f76780768c79688d8dfe6d7f3b35102dfa892e23e6bcc",
                                      "regimes:factors:6bdf5f4453fb2e7522e3b4107d25311b1865283fb55c1f3c62efd567f0801f23",
                                      "regimes:factors:3e1cdbdd5545c85cdf5fa91a2235529ee1661d07839a2b8f6f9b3ac4dea416fc",
                                    ],
                                  },
                                  as_of: {
                                    type: "string",
                                    enum: [
                                      "2026-10-10T12:34:47.123204Z",
                                      "2026-10-10T13:09:33.975258Z",
                                      "2026-10-10T13:59:59.414508Z",
                                    ],
                                  },
                                  asset: { type: "string", enum: ["US-MKT", "IN-MKT"] },
                                  bytes: { type: "integer", enum: [32056, 32454] },
                                  country: { type: "string", enum: ["US", "INDIA"] },
                                  json_pointer: { type: "string", enum: ["/payload"] },
                                  kind: { type: "string", enum: ["regimes-factors"] },
                                  run_id: { type: "string", pattern: "[a-f0-9]{64}" },
                                  scope: { type: "string", enum: ["REAL_DERIVED_REGIMES"] },
                                  sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                  source_ids: {
                                    type: "array",
                                    length: 1,
                                    items: {
                                      type: "string",
                                      enum: ["ken-french:daily-factors", "iima:daily-factors"],
                                    },
                                  },
                                  type: { type: "string", enum: ["replay_artifact"] },
                                },
                              },
                            },
                            {
                              type: "array",
                              length: 3,
                              items: {
                                type: "object",
                                properties: {
                                  assertion_id: {
                                    type: "string",
                                    enum: [
                                      "CLOSED_PRIOR_VERDICTS",
                                      "NOT_CALIBRATED",
                                      "NOT_CONFIRMED",
                                    ],
                                  },
                                  commit: {
                                    type: "string",
                                    enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"],
                                  },
                                  json_pointer: {
                                    type: "string",
                                    enum: ["/scorecard", "/calibration_status", "/status"],
                                  },
                                  path: {
                                    type: "string",
                                    enum: [
                                      "data/exports/research_os_v0_1/flagship.json",
                                      "data/exports/research_os_v0_1_1/summary.json",
                                    ],
                                  },
                                  sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                  type: { type: "string", enum: ["frozen_file"] },
                                },
                              },
                            },
                            { type: "array", length: 0, items: { type: "null" } },
                          ],
                        },
                        reason: {
                          type: "string",
                          enum: [
                            "PARTIAL descriptive Newey-West diagnostics. NOT CALIBRATED; not PASS, SIGNIFICANT or SURVIVED.",
                            "Frozen historical process; NOT_CALIBRATED / CLOSED. No Phase 6 confirmation.",
                            "Synthetic SDK plumbing only; not a real market candidate or factor discovery.",
                          ],
                        },
                        reason_code: {
                          type: "string",
                          enum: ["DIAGNOSTIC_ASYMPTOTIC", "CLOSED_PRIOR", "ENGINEERING_ONLY"],
                        },
                        status: { type: "string", enum: ["PARTIAL", "NOT_APPLICABLE"] },
                        underlying_verdict: {
                          oneOf: [
                            { type: "string", enum: ["NOT_CALIBRATED", "NOT_CALIBRATED / CLOSED"] },
                            { type: "null", enum: [null] },
                          ],
                        },
                      },
                    },
                    REGIME_ROBUSTNESS: {
                      type: "object",
                      properties: {
                        evidence_refs: {
                          oneOf: [
                            { type: "array", length: 0, items: { type: "null" } },
                            {
                              type: "array",
                              length: 3,
                              items: {
                                type: "object",
                                properties: {
                                  assertion_id: {
                                    type: "string",
                                    enum: [
                                      "CLOSED_PRIOR_VERDICTS",
                                      "NOT_CALIBRATED",
                                      "NOT_CONFIRMED",
                                    ],
                                  },
                                  commit: {
                                    type: "string",
                                    enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"],
                                  },
                                  json_pointer: {
                                    type: "string",
                                    enum: ["/scorecard", "/calibration_status", "/status"],
                                  },
                                  path: {
                                    type: "string",
                                    enum: [
                                      "data/exports/research_os_v0_1/flagship.json",
                                      "data/exports/research_os_v0_1_1/summary.json",
                                    ],
                                  },
                                  sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                                  type: { type: "string", enum: ["frozen_file"] },
                                },
                              },
                            },
                          ],
                        },
                        reason: {
                          type: "string",
                          enum: [
                            "UNAVAILABLE: no approved retained test, security universe, OOS or economic contract.",
                            "Frozen historical process; NOT_CALIBRATED / CLOSED. No Phase 6 confirmation.",
                            "Synthetic SDK plumbing only; not a real market candidate or factor discovery.",
                          ],
                        },
                        reason_code: {
                          type: "string",
                          enum: ["NO_APPROVED_CONTRACT", "CLOSED_PRIOR", "ENGINEERING_ONLY"],
                        },
                        status: {
                          type: "string",
                          enum: ["UNAVAILABLE", "PARTIAL", "NOT_APPLICABLE"],
                        },
                        underlying_verdict: {
                          oneOf: [
                            { type: "null", enum: [null] },
                            { type: "string", enum: ["INCONCLUSIVE"] },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          claim_boundaries: {
            type: "object",
            properties: {
              claims: {
                type: "object",
                properties: {
                  causal_claim_eligible: { type: "boolean", enum: [false] },
                  inference_certified: { type: "boolean", enum: [false] },
                  market_claim_eligible: { type: "boolean", enum: [false] },
                  precise_edge_confidence: { type: "boolean", enum: [false] },
                  trusted_graph: { type: "boolean", enum: [false] },
                  validated_alpha: { type: "boolean", enum: [false] },
                },
              },
              d6: { type: "string", enum: ["DISABLED / DEFERRED"] },
              new_captures: { type: "integer", enum: [0] },
              new_holdout_openings: { type: "integer", enum: [0] },
              new_model_runs: { type: "integer", enum: [0] },
              new_research_attempts: { type: "integer", enum: [0] },
              replacement: { type: "string", enum: ["NOT_CONFIRMED"] },
              research_os: { type: "string", enum: ["NOT_CALIBRATED / CLOSED"] },
            },
          },
        },
      },
      schema_version: { type: "string", enum: ["factors-evidence/1"] },
      scope: { type: "string", enum: ["READ_ONLY_FACTOR_EVIDENCE"] },
      sources: {
        type: "array",
        length: 1,
        items: { type: "string", enum: ["ken-french:daily-factors", "iima:daily-factors"] },
      },
    },
  },
  lineage: {
    type: "object",
    properties: {
      asset_scope: {
        type: "array",
        length: 1,
        items: { type: "string", enum: ["US-MKT", "IN-MKT"] },
      },
      claims: {
        type: "object",
        properties: {
          causal_claim_eligible: { type: "boolean", enum: [false] },
          inference_certified: { type: "boolean", enum: [false] },
          market_claim_eligible: { type: "boolean", enum: [false] },
          precise_edge_confidence: { type: "boolean", enum: [false] },
          trusted_graph: { type: "boolean", enum: [false] },
          validated_alpha: { type: "boolean", enum: [false] },
        },
      },
      country: { type: "string", enum: ["US", "INDIA"] },
      evidence_cutoff: {
        type: "string",
        enum: [
          "2026-10-10T12:34:47.123204Z",
          "2026-10-10T13:09:33.975258Z",
          "2026-10-10T13:59:59.414508Z",
        ],
      },
      input_hash: { type: "string", pattern: "[a-f0-9]{64}" },
      kind: { type: "string", enum: ["lineage"] },
      payload: {
        type: "object",
        properties: {
          edges: {
            oneOf: [
              {
                type: "array",
                length: 14,
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string", pattern: "[a-f0-9]{64}" },
                    relationship: {
                      type: "string",
                      enum: ["DECLARED_PRODUCER", "SOURCE_VERSION", "CAPTURE_SHA", "ADMISSION"],
                    },
                    to: { type: "string", pattern: "[a-f0-9]{64}" },
                  },
                },
              },
              {
                type: "array",
                length: 11,
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string", pattern: "[a-f0-9]{64}" },
                    relationship: {
                      type: "string",
                      enum: ["DECLARED_PRODUCER", "SOURCE_VERSION", "CAPTURE_SHA", "ADMISSION"],
                    },
                    to: { type: "string", pattern: "[a-f0-9]{64}" },
                  },
                },
              },
            ],
          },
          nodes: {
            oneOf: [
              {
                type: "array",
                length: 9,
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", pattern: "[a-f0-9]{64}" },
                    kind: {
                      type: "string",
                      enum: [
                        "SEALED_FACTOR_RUN",
                        "SEALED_PRODUCER",
                        "SOURCE_VERSION",
                        "CAPTURE_SHA",
                        "ADMISSION",
                      ],
                    },
                    reason_code: {
                      type: "string",
                      enum: ["EXISTING_PHASE5_RUN", "NO_RAW_SOURCE_VALUES"],
                    },
                    ref: {
                      type: "object",
                      properties: {
                        artifact_id: {
                          type: "string",
                          enum: [
                            "regimes:lineage:f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905",
                            "regimes:lineage:20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c",
                            "regimes:lineage:78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117",
                          ],
                        },
                        as_of: {
                          type: "string",
                          enum: [
                            "2026-10-10T12:34:47.123204Z",
                            "2026-10-10T13:09:33.975258Z",
                            "2026-10-10T13:59:59.414508Z",
                          ],
                        },
                        asset: { type: "string", enum: ["US-MKT"] },
                        bytes: { type: "integer", enum: [22965, 26783] },
                        country: { type: "string", enum: ["US"] },
                        json_pointer: { type: "string", enum: ["/payload/runs/factors"] },
                        kind: { type: "string", enum: ["regimes-lineage"] },
                        run_id: { type: "string", pattern: "[a-f0-9]{64}" },
                        scope: { type: "string", enum: ["REAL_DERIVED_REGIMES"] },
                        sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                        source_ids: {
                          type: "array",
                          length: 1,
                          items: { type: "string", enum: ["ken-french:daily-factors"] },
                        },
                        type: { type: "string", enum: ["replay_artifact"] },
                      },
                    },
                    status: { type: "string", enum: ["VERIFIED", "CAPTURE_ONLY"] },
                  },
                },
              },
              {
                type: "array",
                length: 6,
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", pattern: "[a-f0-9]{64}" },
                    kind: {
                      type: "string",
                      enum: [
                        "SEALED_FACTOR_RUN",
                        "SEALED_PRODUCER",
                        "SOURCE_VERSION",
                        "CAPTURE_SHA",
                        "ADMISSION",
                      ],
                    },
                    reason_code: {
                      type: "string",
                      enum: ["EXISTING_PHASE5_RUN", "NO_RAW_SOURCE_VALUES"],
                    },
                    ref: {
                      type: "object",
                      properties: {
                        artifact_id: {
                          type: "string",
                          enum: [
                            "regimes:lineage:51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b",
                            "regimes:lineage:50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b",
                            "regimes:lineage:d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70",
                          ],
                        },
                        as_of: {
                          type: "string",
                          enum: [
                            "2026-10-10T12:34:47.123204Z",
                            "2026-10-10T13:09:33.975258Z",
                            "2026-10-10T13:59:59.414508Z",
                          ],
                        },
                        asset: { type: "string", enum: ["IN-MKT"] },
                        bytes: { type: "integer", enum: [20782, 24992] },
                        country: { type: "string", enum: ["INDIA"] },
                        json_pointer: { type: "string", enum: ["/payload/runs/factors"] },
                        kind: { type: "string", enum: ["regimes-lineage"] },
                        run_id: { type: "string", pattern: "[a-f0-9]{64}" },
                        scope: { type: "string", enum: ["REAL_DERIVED_REGIMES"] },
                        sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                        source_ids: {
                          type: "array",
                          length: 1,
                          items: { type: "string", enum: ["iima:daily-factors"] },
                        },
                        type: { type: "string", enum: ["replay_artifact"] },
                      },
                    },
                    status: { type: "string", enum: ["VERIFIED", "CAPTURE_ONLY"] },
                  },
                },
              },
            ],
          },
          source_values: { type: "string", enum: ["LOCAL_ONLY"] },
          withdrawals: {
            type: "array",
            length: 6,
            items: {
              type: "object",
              properties: {
                receipt_ref: {
                  type: "object",
                  properties: {
                    assertion_id: { type: "string", enum: ["SIX_UNSAFE_WITHDRAWALS"] },
                    commit: { type: "string", enum: ["5b8591d540288e99aaf6ee69163bd4d5a6c6d147"] },
                    json_pointer: { type: "string", enum: ["/publication_correction"] },
                    path: { type: "string", enum: ["data/exports/regimes_v0_1/receipt.json"] },
                    sha256: { type: "string", pattern: "[a-f0-9]{64}" },
                    type: { type: "string", enum: ["frozen_file"] },
                  },
                },
                replacement_artifact: {
                  type: "string",
                  enum: [
                    "regimes:factors:deb8ae9a105a70e4caa479485a56502cc8fbca101a9e005f040720b017a357cf",
                    "regimes:factors:3e1cdbdd5545c85cdf5fa91a2235529ee1661d07839a2b8f6f9b3ac4dea416fc",
                    "regimes:factors:00c5b6870bdb132b46979f25d25f2d3fdaa32a00948d06227b223e9dbe9bfa45",
                    "regimes:factors:f3a1fb368d8de804557f76780768c79688d8dfe6d7f3b35102dfa892e23e6bcc",
                    "regimes:factors:14bfd98c1ea75247b45135499f955ce0e67bb64e2eb466e8ccc71c2d7836806b",
                    "regimes:factors:6bdf5f4453fb2e7522e3b4107d25311b1865283fb55c1f3c62efd567f0801f23",
                  ],
                },
                withdrawn_artifact: {
                  type: "string",
                  enum: [
                    "regimes:factors:00fdd3d3af1badeea9c9973a5f7de8728b1148d571e97fba0fb0fd3af8b9735f",
                    "regimes:factors:63cfb15e0bd116d3d113b00b1b311eedb787be67ca010f0858efb9b6ab97bbbd",
                    "regimes:factors:69ee78e0bdeb958ffcbfed8d91473516fa0a66730bd79fc7ae300e63db5f4ab9",
                    "regimes:factors:a328dfaec014a5885ff3752c729a147aada32865d28d65d2058a1b8209eaa74f",
                    "regimes:factors:d61658e8b6464ae72a377c6555c4da7770ab80a926a1ed07b7041c1ac6155447",
                    "regimes:factors:ed2d357cf6be6f2cac2293314252a478378d66c942ffaf8f746e173973985960",
                  ],
                },
              },
            },
          },
        },
      },
      schema_version: { type: "string", enum: ["factors-evidence/1"] },
      scope: { type: "string", enum: ["READ_ONLY_FACTOR_EVIDENCE"] },
      sources: {
        type: "array",
        length: 1,
        items: { type: "string", enum: ["ken-french:daily-factors", "iima:daily-factors"] },
      },
    },
  },
};
export const KNOWN_IDS: Record<string, Record<string, string>> = {
  "INDIA|2026-10-10T12:34:47.123204Z": {
    catalog: "factors:catalog:fde299849a44bc9afc7caf6d3ae13d779113cb9cc245a453940379f411064a12",
    audit: "factors:audit:06a0f8e8b40cf414fbefb6ed792d6b074fd6495cf468c884621ec5b3ffd7a98f",
    ledger: "factors:ledger:4819acf11a3ea2d8c3d85cfbef91d5cc74dc5116ebd28fe71734ad046bd203da",
    lineage: "factors:lineage:ad17e83d21cdf36277f1d82c4ec763385707a458b6085435e8957b5b771aee50",
  },
  "INDIA|2026-10-10T13:09:33.975258Z": {
    catalog: "factors:catalog:b24c4a05b4aaecb764e229b2f6727687956f98937784d0d11620350cf435ba6c",
    audit: "factors:audit:629c4d7c7cbbf018eac13f673ce0e4e1e405e28853b2458b66357139c8ff28a3",
    ledger: "factors:ledger:bf9fb88dab193db165623e221f69de93d7489062e55718b94a8dc7357d7fae4a",
    lineage: "factors:lineage:ff623234dd342df83f579579bfe950a66fb180324c097c6b91927daf22ea0583",
  },
  "INDIA|2026-10-10T13:59:59.414508Z": {
    catalog: "factors:catalog:68dd2701b5c9efaa519672ebc818e1678920c3db05aac1fa697588684dffb71c",
    audit: "factors:audit:67125260b6284aeca035991913b54c3c8f630db28047f8849662e9df73ea2397",
    ledger: "factors:ledger:5f278246a8c821189d3bbe72801c4f5269798348b521744288774c87de97515e",
    lineage: "factors:lineage:4e7998320adab5c6a469a17f71ae7900bfaa02cc5933a5a0768ff7fe8adc7143",
  },
  "US|2026-10-10T12:34:47.123204Z": {
    catalog: "factors:catalog:a786689a0a602d3ea4f488fb650deb56ed32cb1de94bec1dab7e4424b3dc4911",
    audit: "factors:audit:e1b890fb31c1d6cefcb5b903cf5c844f522fb3c0195aa58a4798e6df0e6afdad",
    ledger: "factors:ledger:a0cb01f81fa016a204cb7bbc4d9615edd319478c4658698e6e1ee39000abb4bc",
    lineage: "factors:lineage:548d54d17174a1fc8b16cab809dea687fb6e2929cbe418124ffb12ef893eb8be",
  },
  "US|2026-10-10T13:09:33.975258Z": {
    catalog: "factors:catalog:fccce905d6846445c42d0331da82c55390e5f3782c24f66ec34ad0d15a72df87",
    audit: "factors:audit:d59a7a001238fbf3557eb8215dd9c86482b5c9fac9ea2ad19d7851346ab6f44f",
    ledger: "factors:ledger:0f329b0ae12316ed84db4f8af03284532fee553e2b5ad0d8261b00a605fc5b19",
    lineage: "factors:lineage:2d6c19f404ede509c206560cb792a7e00c636f41d50dc3617a97f75c5ad3aff2",
  },
  "US|2026-10-10T13:59:59.414508Z": {
    catalog: "factors:catalog:238aaae552b87e2963fc78fb636c6769bd1a1f51794e56b07ec1fc175ab8a031",
    audit: "factors:audit:119acc8600064ce74b97af202edfd97471bef6109256d548b90ba448137c1c8b",
    ledger: "factors:ledger:df393ccc43960cdd85d43ef4e347335b596a1101c3ac6dfb1567af1967b1cfad",
    lineage: "factors:lineage:59660205152f053ac73dab2c96359bdda9a91ed58e1a7063c582d7db1c27cfa4",
  },
};
export const KNOWN_BUNDLES: Record<
  string,
  Record<string, { refs: Record<string, ArtifactRef> }>
> = {
  INDIA: {
    "2026-10-10T12:34:47.123204Z": {
      refs: {
        factors: {
          artifact_id:
            "regimes:factors:f3a1fb368d8de804557f76780768c79688d8dfe6d7f3b35102dfa892e23e6bcc",
          as_of: "2026-10-10T12:34:47.123204Z",
          asset: "IN-MKT",
          bytes: 32454,
          country: "INDIA",
          json_pointer: "/payload",
          kind: "regimes-factors",
          run_id: "4a0a1084b59aa33570f86b78a9a52ec5fb355a919b7649d77d644951b232c838",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "f3a1fb368d8de804557f76780768c79688d8dfe6d7f3b35102dfa892e23e6bcc",
          source_ids: ["iima:daily-factors"],
          type: "replay_artifact",
        },
        lineage: {
          artifact_id:
            "regimes:lineage:51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b",
          as_of: "2026-10-10T12:34:47.123204Z",
          asset: "IN-MKT",
          bytes: 20782,
          country: "INDIA",
          json_pointer: "/payload/runs/factors",
          kind: "regimes-lineage",
          run_id: "4a0a1084b59aa33570f86b78a9a52ec5fb355a919b7649d77d644951b232c838",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b",
          source_ids: ["iima:daily-factors"],
          type: "replay_artifact",
        },
        snapshot: {
          artifact_id:
            "regimes:snapshot:aa5e7dd6733f0854740b20c35b4a142fcbf53edd16cb2fbdbf003b975ef02beb",
          as_of: "2026-10-10T12:34:47.123204Z",
          asset: "IN-MKT",
          bytes: 59401,
          country: "INDIA",
          json_pointer: "/payload/current/factors/neutrality",
          kind: "regimes-snapshot",
          run_id: "4a0a1084b59aa33570f86b78a9a52ec5fb355a919b7649d77d644951b232c838",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "aa5e7dd6733f0854740b20c35b4a142fcbf53edd16cb2fbdbf003b975ef02beb",
          source_ids: ["iima:daily-factors"],
          type: "replay_artifact",
        },
      },
    },
    "2026-10-10T13:09:33.975258Z": {
      refs: {
        factors: {
          artifact_id:
            "regimes:factors:6bdf5f4453fb2e7522e3b4107d25311b1865283fb55c1f3c62efd567f0801f23",
          as_of: "2026-10-10T13:09:33.975258Z",
          asset: "IN-MKT",
          bytes: 32454,
          country: "INDIA",
          json_pointer: "/payload",
          kind: "regimes-factors",
          run_id: "46df1ebd01052186fea1974308f3cfa72a5992c6d14d994f80e30be6fd35f4ba",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "6bdf5f4453fb2e7522e3b4107d25311b1865283fb55c1f3c62efd567f0801f23",
          source_ids: ["iima:daily-factors"],
          type: "replay_artifact",
        },
        lineage: {
          artifact_id:
            "regimes:lineage:50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b",
          as_of: "2026-10-10T13:09:33.975258Z",
          asset: "IN-MKT",
          bytes: 24992,
          country: "INDIA",
          json_pointer: "/payload/runs/factors",
          kind: "regimes-lineage",
          run_id: "46df1ebd01052186fea1974308f3cfa72a5992c6d14d994f80e30be6fd35f4ba",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b",
          source_ids: ["iima:daily-factors"],
          type: "replay_artifact",
        },
        snapshot: {
          artifact_id:
            "regimes:snapshot:e7545843ae8222f970c1ff9d6918dea67db9f8474a9f127a4ce25e97cfb46721",
          as_of: "2026-10-10T13:09:33.975258Z",
          asset: "IN-MKT",
          bytes: 59401,
          country: "INDIA",
          json_pointer: "/payload/current/factors/neutrality",
          kind: "regimes-snapshot",
          run_id: "46df1ebd01052186fea1974308f3cfa72a5992c6d14d994f80e30be6fd35f4ba",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "e7545843ae8222f970c1ff9d6918dea67db9f8474a9f127a4ce25e97cfb46721",
          source_ids: ["iima:daily-factors"],
          type: "replay_artifact",
        },
      },
    },
    "2026-10-10T13:59:59.414508Z": {
      refs: {
        factors: {
          artifact_id:
            "regimes:factors:3e1cdbdd5545c85cdf5fa91a2235529ee1661d07839a2b8f6f9b3ac4dea416fc",
          as_of: "2026-10-10T13:59:59.414508Z",
          asset: "IN-MKT",
          bytes: 32454,
          country: "INDIA",
          json_pointer: "/payload",
          kind: "regimes-factors",
          run_id: "e5602e885e3910167eb6120a90e4a0a62fc776f4d2f73c6118b4311b78210e38",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "3e1cdbdd5545c85cdf5fa91a2235529ee1661d07839a2b8f6f9b3ac4dea416fc",
          source_ids: ["iima:daily-factors"],
          type: "replay_artifact",
        },
        lineage: {
          artifact_id:
            "regimes:lineage:d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70",
          as_of: "2026-10-10T13:59:59.414508Z",
          asset: "IN-MKT",
          bytes: 24992,
          country: "INDIA",
          json_pointer: "/payload/runs/factors",
          kind: "regimes-lineage",
          run_id: "e5602e885e3910167eb6120a90e4a0a62fc776f4d2f73c6118b4311b78210e38",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70",
          source_ids: ["iima:daily-factors"],
          type: "replay_artifact",
        },
        snapshot: {
          artifact_id:
            "regimes:snapshot:188141fd293bf16b0883e0a3faab2a300556fec7cd40a2cc79b4cd60e47f34a6",
          as_of: "2026-10-10T13:59:59.414508Z",
          asset: "IN-MKT",
          bytes: 59565,
          country: "INDIA",
          json_pointer: "/payload/current/factors/neutrality",
          kind: "regimes-snapshot",
          run_id: "e5602e885e3910167eb6120a90e4a0a62fc776f4d2f73c6118b4311b78210e38",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "188141fd293bf16b0883e0a3faab2a300556fec7cd40a2cc79b4cd60e47f34a6",
          source_ids: ["iima:daily-factors"],
          type: "replay_artifact",
        },
      },
    },
  },
  US: {
    "2026-10-10T12:34:47.123204Z": {
      refs: {
        factors: {
          artifact_id:
            "regimes:factors:00c5b6870bdb132b46979f25d25f2d3fdaa32a00948d06227b223e9dbe9bfa45",
          as_of: "2026-10-10T12:34:47.123204Z",
          asset: "US-MKT",
          bytes: 32056,
          country: "US",
          json_pointer: "/payload",
          kind: "regimes-factors",
          run_id: "b17d06fe8e27c430c21a9f341e5eb3d66df221955a468a655c6bf6f0d47b8d18",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "00c5b6870bdb132b46979f25d25f2d3fdaa32a00948d06227b223e9dbe9bfa45",
          source_ids: ["ken-french:daily-factors"],
          type: "replay_artifact",
        },
        lineage: {
          artifact_id:
            "regimes:lineage:f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905",
          as_of: "2026-10-10T12:34:47.123204Z",
          asset: "US-MKT",
          bytes: 22965,
          country: "US",
          json_pointer: "/payload/runs/factors",
          kind: "regimes-lineage",
          run_id: "b17d06fe8e27c430c21a9f341e5eb3d66df221955a468a655c6bf6f0d47b8d18",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905",
          source_ids: ["ken-french:daily-factors"],
          type: "replay_artifact",
        },
        snapshot: {
          artifact_id:
            "regimes:snapshot:822c3923932147082aa1f598b51dba6364b99cfc62abd19539f66fbe6175294d",
          as_of: "2026-10-10T12:34:47.123204Z",
          asset: "US-MKT",
          bytes: 58374,
          country: "US",
          json_pointer: "/payload/current/factors/neutrality",
          kind: "regimes-snapshot",
          run_id: "b17d06fe8e27c430c21a9f341e5eb3d66df221955a468a655c6bf6f0d47b8d18",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "822c3923932147082aa1f598b51dba6364b99cfc62abd19539f66fbe6175294d",
          source_ids: ["ken-french:daily-factors"],
          type: "replay_artifact",
        },
      },
    },
    "2026-10-10T13:09:33.975258Z": {
      refs: {
        factors: {
          artifact_id:
            "regimes:factors:deb8ae9a105a70e4caa479485a56502cc8fbca101a9e005f040720b017a357cf",
          as_of: "2026-10-10T13:09:33.975258Z",
          asset: "US-MKT",
          bytes: 32056,
          country: "US",
          json_pointer: "/payload",
          kind: "regimes-factors",
          run_id: "19d5998747b9fb50f34f22b04cc35a591b9c34f45ad87a05695bdddd5d8e8f98",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "deb8ae9a105a70e4caa479485a56502cc8fbca101a9e005f040720b017a357cf",
          source_ids: ["ken-french:daily-factors"],
          type: "replay_artifact",
        },
        lineage: {
          artifact_id:
            "regimes:lineage:20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c",
          as_of: "2026-10-10T13:09:33.975258Z",
          asset: "US-MKT",
          bytes: 26783,
          country: "US",
          json_pointer: "/payload/runs/factors",
          kind: "regimes-lineage",
          run_id: "19d5998747b9fb50f34f22b04cc35a591b9c34f45ad87a05695bdddd5d8e8f98",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c",
          source_ids: ["ken-french:daily-factors"],
          type: "replay_artifact",
        },
        snapshot: {
          artifact_id:
            "regimes:snapshot:dc4ce03af520e76329699e680873d536da0b19d3de5bfbc153d1a67e2a054a70",
          as_of: "2026-10-10T13:09:33.975258Z",
          asset: "US-MKT",
          bytes: 58373,
          country: "US",
          json_pointer: "/payload/current/factors/neutrality",
          kind: "regimes-snapshot",
          run_id: "19d5998747b9fb50f34f22b04cc35a591b9c34f45ad87a05695bdddd5d8e8f98",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "dc4ce03af520e76329699e680873d536da0b19d3de5bfbc153d1a67e2a054a70",
          source_ids: ["ken-french:daily-factors"],
          type: "replay_artifact",
        },
      },
    },
    "2026-10-10T13:59:59.414508Z": {
      refs: {
        factors: {
          artifact_id:
            "regimes:factors:14bfd98c1ea75247b45135499f955ce0e67bb64e2eb466e8ccc71c2d7836806b",
          as_of: "2026-10-10T13:59:59.414508Z",
          asset: "US-MKT",
          bytes: 32056,
          country: "US",
          json_pointer: "/payload",
          kind: "regimes-factors",
          run_id: "133fe71fc4b36347b23515f1043644afc1c39d8972d70bcb45f8d1332434702c",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "14bfd98c1ea75247b45135499f955ce0e67bb64e2eb466e8ccc71c2d7836806b",
          source_ids: ["ken-french:daily-factors"],
          type: "replay_artifact",
        },
        lineage: {
          artifact_id:
            "regimes:lineage:78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117",
          as_of: "2026-10-10T13:59:59.414508Z",
          asset: "US-MKT",
          bytes: 26783,
          country: "US",
          json_pointer: "/payload/runs/factors",
          kind: "regimes-lineage",
          run_id: "133fe71fc4b36347b23515f1043644afc1c39d8972d70bcb45f8d1332434702c",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117",
          source_ids: ["ken-french:daily-factors"],
          type: "replay_artifact",
        },
        snapshot: {
          artifact_id:
            "regimes:snapshot:12235bb5b98eceb46ac7c035e0a0cf94abb23639bc71090b9c4b2a21bf5b85ab",
          as_of: "2026-10-10T13:59:59.414508Z",
          asset: "US-MKT",
          bytes: 58537,
          country: "US",
          json_pointer: "/payload/current/factors/neutrality",
          kind: "regimes-snapshot",
          run_id: "133fe71fc4b36347b23515f1043644afc1c39d8972d70bcb45f8d1332434702c",
          scope: "REAL_DERIVED_REGIMES",
          sha256: "12235bb5b98eceb46ac7c035e0a0cf94abb23639bc71090b9c4b2a21bf5b85ab",
          source_ids: ["ken-french:daily-factors"],
          type: "replay_artifact",
        },
      },
    },
  },
};
export const KNOWN_METADATA_ENTRIES: Record<string, unknown> = {
  "factors:audit:06a0f8e8b40cf414fbefb6ed792d6b074fd6495cf468c884621ec5b3ffd7a98f": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 89884,
    input_hash: "7c681f9ae790e8af802b35444b95dd232f7731dbca8cc4f771bd1008161e3df3",
    kind: "factors-audit",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "06a0f8e8b40cf414fbefb6ed792d6b074fd6495cf468c884621ec5b3ffd7a98f",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-audit-06a0f8e8b40cf414fbefb6ed792d6b074fd6495cf468c884621ec5b3ffd7a98f.json",
  },
  "factors:audit:119acc8600064ce74b97af202edfd97471bef6109256d548b90ba448137c1c8b": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 89995,
    input_hash: "f33328de5f4e2691b4aee639aa8c54ec79e04cf1aaca516d80bce7334d54fb7e",
    kind: "factors-audit",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "119acc8600064ce74b97af202edfd97471bef6109256d548b90ba448137c1c8b",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-audit-119acc8600064ce74b97af202edfd97471bef6109256d548b90ba448137c1c8b.json",
  },
  "factors:audit:629c4d7c7cbbf018eac13f673ce0e4e1e405e28853b2458b66357139c8ff28a3": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 89884,
    input_hash: "14d0fd3fc7bff413536bcd8ba7bf18814820b8668a56ff439729c17dee59ef63",
    kind: "factors-audit",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "629c4d7c7cbbf018eac13f673ce0e4e1e405e28853b2458b66357139c8ff28a3",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-audit-629c4d7c7cbbf018eac13f673ce0e4e1e405e28853b2458b66357139c8ff28a3.json",
  },
  "factors:audit:67125260b6284aeca035991913b54c3c8f630db28047f8849662e9df73ea2397": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 89884,
    input_hash: "9f913fdf35a3b1ed5876b95a88eaadfcfa7121c6179a3f87bb7d0af953114ddd",
    kind: "factors-audit",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "67125260b6284aeca035991913b54c3c8f630db28047f8849662e9df73ea2397",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-audit-67125260b6284aeca035991913b54c3c8f630db28047f8849662e9df73ea2397.json",
  },
  "factors:audit:d59a7a001238fbf3557eb8215dd9c86482b5c9fac9ea2ad19d7851346ab6f44f": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 89995,
    input_hash: "38d3338832abd4a0c7ef9c8363189bc70d42f714f667195f5e4c6650285274f9",
    kind: "factors-audit",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "d59a7a001238fbf3557eb8215dd9c86482b5c9fac9ea2ad19d7851346ab6f44f",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-audit-d59a7a001238fbf3557eb8215dd9c86482b5c9fac9ea2ad19d7851346ab6f44f.json",
  },
  "factors:audit:e1b890fb31c1d6cefcb5b903cf5c844f522fb3c0195aa58a4798e6df0e6afdad": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 89995,
    input_hash: "b01589d9041f649a5b330d550a5ec026d85fd55778ae7702b4ab107a2fbd9486",
    kind: "factors-audit",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "e1b890fb31c1d6cefcb5b903cf5c844f522fb3c0195aa58a4798e6df0e6afdad",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-audit-e1b890fb31c1d6cefcb5b903cf5c844f522fb3c0195aa58a4798e6df0e6afdad.json",
  },
  "factors:catalog:238aaae552b87e2963fc78fb636c6769bd1a1f51794e56b07ec1fc175ab8a031": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 16890,
    input_hash: "c77bf5d77c8b1af55e458976c213a8c7597a8d257b9fb710e4eabc827440f162",
    kind: "factors-catalog",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "238aaae552b87e2963fc78fb636c6769bd1a1f51794e56b07ec1fc175ab8a031",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-catalog-238aaae552b87e2963fc78fb636c6769bd1a1f51794e56b07ec1fc175ab8a031.json",
  },
  "factors:catalog:68dd2701b5c9efaa519672ebc818e1678920c3db05aac1fa697588684dffb71c": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 17252,
    input_hash: "e1a2517a95c802025f839b47a2e7e1f9b099ce89e884de539535f7c6f8e3fa39",
    kind: "factors-catalog",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "68dd2701b5c9efaa519672ebc818e1678920c3db05aac1fa697588684dffb71c",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-catalog-68dd2701b5c9efaa519672ebc818e1678920c3db05aac1fa697588684dffb71c.json",
  },
  "factors:catalog:a786689a0a602d3ea4f488fb650deb56ed32cb1de94bec1dab7e4424b3dc4911": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 16604,
    input_hash: "59c5b9ed43b4bcc6860e3ba2068633c684f99fd934d7136b12e35c64fc187b25",
    kind: "factors-catalog",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "a786689a0a602d3ea4f488fb650deb56ed32cb1de94bec1dab7e4424b3dc4911",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-catalog-a786689a0a602d3ea4f488fb650deb56ed32cb1de94bec1dab7e4424b3dc4911.json",
  },
  "factors:catalog:b24c4a05b4aaecb764e229b2f6727687956f98937784d0d11620350cf435ba6c": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 17252,
    input_hash: "dc6c0afa33458ab3d3624efc6f56a0ace9c49edca3a955db669415fc7cd896f9",
    kind: "factors-catalog",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "b24c4a05b4aaecb764e229b2f6727687956f98937784d0d11620350cf435ba6c",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-catalog-b24c4a05b4aaecb764e229b2f6727687956f98937784d0d11620350cf435ba6c.json",
  },
  "factors:catalog:fccce905d6846445c42d0331da82c55390e5f3782c24f66ec34ad0d15a72df87": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 16890,
    input_hash: "e48b8ed5a459f463c3614dc40f1dafd4634c37cfedf3697a645d8615822e5b0e",
    kind: "factors-catalog",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "fccce905d6846445c42d0331da82c55390e5f3782c24f66ec34ad0d15a72df87",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-catalog-fccce905d6846445c42d0331da82c55390e5f3782c24f66ec34ad0d15a72df87.json",
  },
  "factors:catalog:fde299849a44bc9afc7caf6d3ae13d779113cb9cc245a453940379f411064a12": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 16970,
    input_hash: "42c356470cdf1c2480231e28f74001526672fc04e5a403658b1367ec7a722679",
    kind: "factors-catalog",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "fde299849a44bc9afc7caf6d3ae13d779113cb9cc245a453940379f411064a12",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-catalog-fde299849a44bc9afc7caf6d3ae13d779113cb9cc245a453940379f411064a12.json",
  },
  "factors:ledger:0f329b0ae12316ed84db4f8af03284532fee553e2b5ad0d8261b00a605fc5b19": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 15193,
    input_hash: "907ab6992be4278595445d677275d0a23c8aa10480dfb4d503e45938d674f668",
    kind: "factors-ledger",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "0f329b0ae12316ed84db4f8af03284532fee553e2b5ad0d8261b00a605fc5b19",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-ledger-0f329b0ae12316ed84db4f8af03284532fee553e2b5ad0d8261b00a605fc5b19.json",
  },
  "factors:ledger:4819acf11a3ea2d8c3d85cfbef91d5cc74dc5116ebd28fe71734ad046bd203da": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 15187,
    input_hash: "0a5af7f9c023fe38db293e712dac1410788e09311c5863a70f4d0d5e3f1c809d",
    kind: "factors-ledger",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "4819acf11a3ea2d8c3d85cfbef91d5cc74dc5116ebd28fe71734ad046bd203da",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-ledger-4819acf11a3ea2d8c3d85cfbef91d5cc74dc5116ebd28fe71734ad046bd203da.json",
  },
  "factors:ledger:5f278246a8c821189d3bbe72801c4f5269798348b521744288774c87de97515e": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 15187,
    input_hash: "fca01ff0b22a88e0497dd9265b089db2d1d3906e8077f7344adc426b39d62d55",
    kind: "factors-ledger",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "5f278246a8c821189d3bbe72801c4f5269798348b521744288774c87de97515e",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-ledger-5f278246a8c821189d3bbe72801c4f5269798348b521744288774c87de97515e.json",
  },
  "factors:ledger:a0cb01f81fa016a204cb7bbc4d9615edd319478c4658698e6e1ee39000abb4bc": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 15193,
    input_hash: "042e52d3eddc529fbdd026719451c11587d8af1bb05c91719b0fcfe7936a4fa7",
    kind: "factors-ledger",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "a0cb01f81fa016a204cb7bbc4d9615edd319478c4658698e6e1ee39000abb4bc",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-ledger-a0cb01f81fa016a204cb7bbc4d9615edd319478c4658698e6e1ee39000abb4bc.json",
  },
  "factors:ledger:bf9fb88dab193db165623e221f69de93d7489062e55718b94a8dc7357d7fae4a": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 15187,
    input_hash: "16cfab4a88b65dd74693be3ef5ed1e2b00f67e9d2abb554d27376794adef7a2d",
    kind: "factors-ledger",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "bf9fb88dab193db165623e221f69de93d7489062e55718b94a8dc7357d7fae4a",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-ledger-bf9fb88dab193db165623e221f69de93d7489062e55718b94a8dc7357d7fae4a.json",
  },
  "factors:ledger:df393ccc43960cdd85d43ef4e347335b596a1101c3ac6dfb1567af1967b1cfad": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 15193,
    input_hash: "62245e8a2ae26bc3bfb673d4ce3e4f768a39c633e907465f692454d9b768e6c6",
    kind: "factors-ledger",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "df393ccc43960cdd85d43ef4e347335b596a1101c3ac6dfb1567af1967b1cfad",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-ledger-df393ccc43960cdd85d43ef4e347335b596a1101c3ac6dfb1567af1967b1cfad.json",
  },
  "factors:lineage:2d6c19f404ede509c206560cb792a7e00c636f41d50dc3617a97f75c5ad3aff2": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 12015,
    input_hash: "00f6d05b36cf9e3d7463f41edaa25e866374be226d171ddb0ecdfcf6b70d8695",
    kind: "factors-lineage",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "2d6c19f404ede509c206560cb792a7e00c636f41d50dc3617a97f75c5ad3aff2",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-lineage-2d6c19f404ede509c206560cb792a7e00c636f41d50dc3617a97f75c5ad3aff2.json",
  },
  "factors:lineage:4e7998320adab5c6a469a17f71ae7900bfaa02cc5933a5a0768ff7fe8adc7143": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 9484,
    input_hash: "17a712638df033520a09c36940fe9903c407a23f451e90fddf19301429127ff1",
    kind: "factors-lineage",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "4e7998320adab5c6a469a17f71ae7900bfaa02cc5933a5a0768ff7fe8adc7143",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-lineage-4e7998320adab5c6a469a17f71ae7900bfaa02cc5933a5a0768ff7fe8adc7143.json",
  },
  "factors:lineage:548d54d17174a1fc8b16cab809dea687fb6e2929cbe418124ffb12ef893eb8be": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 12015,
    input_hash: "22d2562c1970255f16cf2dc72bf244c8d8977468855085978d5c154434542e91",
    kind: "factors-lineage",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "548d54d17174a1fc8b16cab809dea687fb6e2929cbe418124ffb12ef893eb8be",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-lineage-548d54d17174a1fc8b16cab809dea687fb6e2929cbe418124ffb12ef893eb8be.json",
  },
  "factors:lineage:59660205152f053ac73dab2c96359bdda9a91ed58e1a7063c582d7db1c27cfa4": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 12015,
    input_hash: "248e2df5221f9f6762457ac2f91e94ef563a40fd315db7d79ab6e99c610abae6",
    kind: "factors-lineage",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "59660205152f053ac73dab2c96359bdda9a91ed58e1a7063c582d7db1c27cfa4",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-lineage-59660205152f053ac73dab2c96359bdda9a91ed58e1a7063c582d7db1c27cfa4.json",
  },
  "factors:lineage:ad17e83d21cdf36277f1d82c4ec763385707a458b6085435e8957b5b771aee50": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 9484,
    input_hash: "5b29046ddd1ff556bf11c1fe238c324c2ec53be2f776f6520f2428fa9611df95",
    kind: "factors-lineage",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "ad17e83d21cdf36277f1d82c4ec763385707a458b6085435e8957b5b771aee50",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-lineage-ad17e83d21cdf36277f1d82c4ec763385707a458b6085435e8957b5b771aee50.json",
  },
  "factors:lineage:ff623234dd342df83f579579bfe950a66fb180324c097c6b91927daf22ea0583": {
    as_of: "2026-10-12T14:39:49.953264Z",
    available_at: "2026-10-12T14:39:49.953264Z",
    bytes: 9484,
    input_hash: "66bf7b71ba4729b5966ff3b05b61b42a9f34c56712420eca373d71af7757c364",
    kind: "factors-lineage",
    licence: {
      dataset_key: "project:factor-evidence",
      permitted_uses: ["publish_derived"],
      status: "FIRST_PARTY",
      valid_through: null,
    },
    observed_at: "2026-10-12T14:39:49.953264Z",
    reason: null,
    scope: "READ_ONLY_FACTOR_EVIDENCE",
    sha256: "ff623234dd342df83f579579bfe950a66fb180324c097c6b91927daf22ea0583",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/factors-lineage-ff623234dd342df83f579579bfe950a66fb180324c097c6b91927daf22ea0583.json",
  },
};
export const KNOWN_ENTRIES: Record<string, unknown> = {
  "regimes:factors:f3a1fb368d8de804557f76780768c79688d8dfe6d7f3b35102dfa892e23e6bcc": {
    as_of: "2026-10-10T12:34:47.123204Z",
    available_at: "2026-10-10T12:34:47.123204Z",
    bytes: 32454,
    input_hash: "96170b05e185d44c33b81378935e6787fee53416fd6f1c01949d002d28278b16",
    kind: "regimes-factors",
    licence: {
      attribution:
        "Agarwalla, S. K., Jacob, J. and Varma, J. R. (2013), Four factor model in Indian equities market, W.P. No. 2013-09-05, Indian Institute of Management, Ahmedabad.",
      basis:
        "Public research-factor library with requested citation; attributed derived research publication. No raw Prowess redistribution.",
      dataset_key: "iima:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/"],
      status: "ACTIVE",
      terms_url: "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
      valid_through: null,
    },
    observed_at: "2026-10-10T12:34:47.123204Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "f3a1fb368d8de804557f76780768c79688d8dfe6d7f3b35102dfa892e23e6bcc",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-factors-f3a1fb368d8de804557f76780768c79688d8dfe6d7f3b35102dfa892e23e6bcc.json",
  },
  "regimes:lineage:51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b": {
    as_of: "2026-10-10T12:34:47.123204Z",
    available_at: "2026-10-10T12:34:47.123204Z",
    bytes: 20782,
    input_hash: "96170b05e185d44c33b81378935e6787fee53416fd6f1c01949d002d28278b16",
    kind: "regimes-lineage",
    licence: {
      attribution:
        "Agarwalla, S. K., Jacob, J. and Varma, J. R. (2013), Four factor model in Indian equities market, W.P. No. 2013-09-05, Indian Institute of Management, Ahmedabad.",
      basis:
        "Public research-factor library with requested citation; attributed derived research publication. No raw Prowess redistribution.",
      dataset_key: "iima:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/"],
      status: "ACTIVE",
      terms_url: "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
      valid_through: null,
    },
    observed_at: "2026-10-10T12:34:47.123204Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-lineage-51e04e6234e98938497f40a643a1122976410c8cca01065a5d372911eb09a73b.json",
  },
  "regimes:snapshot:aa5e7dd6733f0854740b20c35b4a142fcbf53edd16cb2fbdbf003b975ef02beb": {
    as_of: "2026-10-10T12:34:47.123204Z",
    available_at: "2026-10-10T12:34:47.123204Z",
    bytes: 59401,
    input_hash: "96170b05e185d44c33b81378935e6787fee53416fd6f1c01949d002d28278b16",
    kind: "regimes-snapshot",
    licence: {
      attribution:
        "Agarwalla, S. K., Jacob, J. and Varma, J. R. (2013), Four factor model in Indian equities market, W.P. No. 2013-09-05, Indian Institute of Management, Ahmedabad.",
      basis:
        "Public research-factor library with requested citation; attributed derived research publication. No raw Prowess redistribution.",
      dataset_key: "iima:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/"],
      status: "ACTIVE",
      terms_url: "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
      valid_through: null,
    },
    observed_at: "2026-10-10T12:34:47.123204Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "aa5e7dd6733f0854740b20c35b4a142fcbf53edd16cb2fbdbf003b975ef02beb",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-snapshot-aa5e7dd6733f0854740b20c35b4a142fcbf53edd16cb2fbdbf003b975ef02beb.json",
  },
  "regimes:factors:6bdf5f4453fb2e7522e3b4107d25311b1865283fb55c1f3c62efd567f0801f23": {
    as_of: "2026-10-10T13:09:33.975258Z",
    available_at: "2026-10-10T13:09:33.975258Z",
    bytes: 32454,
    input_hash: "8df3b9b0d4a1354fc29e44be7a0cfa5d35c51df39aee8a667bf169057a4c6069",
    kind: "regimes-factors",
    licence: {
      attribution:
        "Agarwalla, S. K., Jacob, J. and Varma, J. R. (2013), Four factor model in Indian equities market, W.P. No. 2013-09-05, Indian Institute of Management, Ahmedabad.",
      basis:
        "Public research-factor library with requested citation; attributed derived research publication. No raw Prowess redistribution.",
      dataset_key: "iima:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/"],
      status: "ACTIVE",
      terms_url: "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:09:33.975258Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "6bdf5f4453fb2e7522e3b4107d25311b1865283fb55c1f3c62efd567f0801f23",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-factors-6bdf5f4453fb2e7522e3b4107d25311b1865283fb55c1f3c62efd567f0801f23.json",
  },
  "regimes:lineage:50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b": {
    as_of: "2026-10-10T13:09:33.975258Z",
    available_at: "2026-10-10T13:09:33.975258Z",
    bytes: 24992,
    input_hash: "8df3b9b0d4a1354fc29e44be7a0cfa5d35c51df39aee8a667bf169057a4c6069",
    kind: "regimes-lineage",
    licence: {
      attribution:
        "Agarwalla, S. K., Jacob, J. and Varma, J. R. (2013), Four factor model in Indian equities market, W.P. No. 2013-09-05, Indian Institute of Management, Ahmedabad.",
      basis:
        "Public research-factor library with requested citation; attributed derived research publication. No raw Prowess redistribution.",
      dataset_key: "iima:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/"],
      status: "ACTIVE",
      terms_url: "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:09:33.975258Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-lineage-50aeb8624442222ba139282bc4f4f0adafbf386b0f3ee62f13f84f6fae3bb19b.json",
  },
  "regimes:snapshot:e7545843ae8222f970c1ff9d6918dea67db9f8474a9f127a4ce25e97cfb46721": {
    as_of: "2026-10-10T13:09:33.975258Z",
    available_at: "2026-10-10T13:09:33.975258Z",
    bytes: 59401,
    input_hash: "8df3b9b0d4a1354fc29e44be7a0cfa5d35c51df39aee8a667bf169057a4c6069",
    kind: "regimes-snapshot",
    licence: {
      attribution:
        "Agarwalla, S. K., Jacob, J. and Varma, J. R. (2013), Four factor model in Indian equities market, W.P. No. 2013-09-05, Indian Institute of Management, Ahmedabad.",
      basis:
        "Public research-factor library with requested citation; attributed derived research publication. No raw Prowess redistribution.",
      dataset_key: "iima:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/"],
      status: "ACTIVE",
      terms_url: "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:09:33.975258Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "e7545843ae8222f970c1ff9d6918dea67db9f8474a9f127a4ce25e97cfb46721",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-snapshot-e7545843ae8222f970c1ff9d6918dea67db9f8474a9f127a4ce25e97cfb46721.json",
  },
  "regimes:factors:3e1cdbdd5545c85cdf5fa91a2235529ee1661d07839a2b8f6f9b3ac4dea416fc": {
    as_of: "2026-10-10T13:59:59.414508Z",
    available_at: "2026-10-10T13:59:59.414508Z",
    bytes: 32454,
    input_hash: "7c9cb93042c86c2e2e684eb033195a1fe30c651c46da48ab230ac2561bc4c98b",
    kind: "regimes-factors",
    licence: {
      attribution:
        "Agarwalla, S. K., Jacob, J. and Varma, J. R. (2013), Four factor model in Indian equities market, W.P. No. 2013-09-05, Indian Institute of Management, Ahmedabad.",
      basis:
        "Public research-factor library with requested citation; attributed derived research publication. No raw Prowess redistribution.",
      dataset_key: "iima:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/"],
      status: "ACTIVE",
      terms_url: "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:59:59.414508Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "3e1cdbdd5545c85cdf5fa91a2235529ee1661d07839a2b8f6f9b3ac4dea416fc",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-factors-3e1cdbdd5545c85cdf5fa91a2235529ee1661d07839a2b8f6f9b3ac4dea416fc.json",
  },
  "regimes:lineage:d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70": {
    as_of: "2026-10-10T13:59:59.414508Z",
    available_at: "2026-10-10T13:59:59.414508Z",
    bytes: 24992,
    input_hash: "7c9cb93042c86c2e2e684eb033195a1fe30c651c46da48ab230ac2561bc4c98b",
    kind: "regimes-lineage",
    licence: {
      attribution:
        "Agarwalla, S. K., Jacob, J. and Varma, J. R. (2013), Four factor model in Indian equities market, W.P. No. 2013-09-05, Indian Institute of Management, Ahmedabad.",
      basis:
        "Public research-factor library with requested citation; attributed derived research publication. No raw Prowess redistribution.",
      dataset_key: "iima:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/"],
      status: "ACTIVE",
      terms_url: "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:59:59.414508Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-lineage-d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70.json",
  },
  "regimes:snapshot:188141fd293bf16b0883e0a3faab2a300556fec7cd40a2cc79b4cd60e47f34a6": {
    as_of: "2026-10-10T13:59:59.414508Z",
    available_at: "2026-10-10T13:59:59.414508Z",
    bytes: 59565,
    input_hash: "7c9cb93042c86c2e2e684eb033195a1fe30c651c46da48ab230ac2561bc4c98b",
    kind: "regimes-snapshot",
    licence: {
      attribution:
        "Agarwalla, S. K., Jacob, J. and Varma, J. R. (2013), Four factor model in Indian equities market, W.P. No. 2013-09-05, Indian Institute of Management, Ahmedabad.",
      basis:
        "Public research-factor library with requested citation; attributed derived research publication. No raw Prowess redistribution.",
      dataset_key: "iima:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/"],
      status: "ACTIVE",
      terms_url: "https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:59:59.414508Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "188141fd293bf16b0883e0a3faab2a300556fec7cd40a2cc79b4cd60e47f34a6",
    sources: ["iima:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-snapshot-188141fd293bf16b0883e0a3faab2a300556fec7cd40a2cc79b4cd60e47f34a6.json",
  },
  "regimes:factors:00c5b6870bdb132b46979f25d25f2d3fdaa32a00948d06227b223e9dbe9bfa45": {
    as_of: "2026-10-10T12:34:47.123204Z",
    available_at: "2026-10-10T12:34:47.123204Z",
    bytes: 32056,
    input_hash: "906a2ee1e18c5c418bce21b95bdb4dabee64b25c8b1e5228ea8eae8e7a105327",
    kind: "regimes-factors",
    licence: {
      attribution: "Kenneth R. French Data Library; Fama and French research factors and momentum.",
      basis:
        "Public research-return library; attributed derived research publication. No raw CRSP redistribution.",
      dataset_key: "ken-french:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html"],
      status: "ACTIVE",
      terms_url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      valid_through: null,
    },
    observed_at: "2026-10-10T12:34:47.123204Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "00c5b6870bdb132b46979f25d25f2d3fdaa32a00948d06227b223e9dbe9bfa45",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-factors-00c5b6870bdb132b46979f25d25f2d3fdaa32a00948d06227b223e9dbe9bfa45.json",
  },
  "regimes:lineage:f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905": {
    as_of: "2026-10-10T12:34:47.123204Z",
    available_at: "2026-10-10T12:34:47.123204Z",
    bytes: 22965,
    input_hash: "906a2ee1e18c5c418bce21b95bdb4dabee64b25c8b1e5228ea8eae8e7a105327",
    kind: "regimes-lineage",
    licence: {
      attribution: "Kenneth R. French Data Library; Fama and French research factors and momentum.",
      basis:
        "Public research-return library; attributed derived research publication. No raw CRSP redistribution.",
      dataset_key: "ken-french:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html"],
      status: "ACTIVE",
      terms_url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      valid_through: null,
    },
    observed_at: "2026-10-10T12:34:47.123204Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-lineage-f3aa3edb9df9862b3d705a56470cf7b44a88740204f25cda7307bb92b2401905.json",
  },
  "regimes:snapshot:822c3923932147082aa1f598b51dba6364b99cfc62abd19539f66fbe6175294d": {
    as_of: "2026-10-10T12:34:47.123204Z",
    available_at: "2026-10-10T12:34:47.123204Z",
    bytes: 58374,
    input_hash: "906a2ee1e18c5c418bce21b95bdb4dabee64b25c8b1e5228ea8eae8e7a105327",
    kind: "regimes-snapshot",
    licence: {
      attribution: "Kenneth R. French Data Library; Fama and French research factors and momentum.",
      basis:
        "Public research-return library; attributed derived research publication. No raw CRSP redistribution.",
      dataset_key: "ken-french:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html"],
      status: "ACTIVE",
      terms_url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      valid_through: null,
    },
    observed_at: "2026-10-10T12:34:47.123204Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "822c3923932147082aa1f598b51dba6364b99cfc62abd19539f66fbe6175294d",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-snapshot-822c3923932147082aa1f598b51dba6364b99cfc62abd19539f66fbe6175294d.json",
  },
  "regimes:factors:deb8ae9a105a70e4caa479485a56502cc8fbca101a9e005f040720b017a357cf": {
    as_of: "2026-10-10T13:09:33.975258Z",
    available_at: "2026-10-10T13:09:33.975258Z",
    bytes: 32056,
    input_hash: "ec1e9b6b19b6841e560fce80d02ceae9d63ecf69e0d2e348dab29f512726723f",
    kind: "regimes-factors",
    licence: {
      attribution: "Kenneth R. French Data Library; Fama and French research factors and momentum.",
      basis:
        "Public research-return library; attributed derived research publication. No raw CRSP redistribution.",
      dataset_key: "ken-french:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html"],
      status: "ACTIVE",
      terms_url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:09:33.975258Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "deb8ae9a105a70e4caa479485a56502cc8fbca101a9e005f040720b017a357cf",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-factors-deb8ae9a105a70e4caa479485a56502cc8fbca101a9e005f040720b017a357cf.json",
  },
  "regimes:lineage:20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c": {
    as_of: "2026-10-10T13:09:33.975258Z",
    available_at: "2026-10-10T13:09:33.975258Z",
    bytes: 26783,
    input_hash: "ec1e9b6b19b6841e560fce80d02ceae9d63ecf69e0d2e348dab29f512726723f",
    kind: "regimes-lineage",
    licence: {
      attribution: "Kenneth R. French Data Library; Fama and French research factors and momentum.",
      basis:
        "Public research-return library; attributed derived research publication. No raw CRSP redistribution.",
      dataset_key: "ken-french:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html"],
      status: "ACTIVE",
      terms_url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:09:33.975258Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-lineage-20c8dbe98f5b464c1f6ee0650c618e52f5881ff3d6acd5a0bf6fd8bcdf2c726c.json",
  },
  "regimes:snapshot:dc4ce03af520e76329699e680873d536da0b19d3de5bfbc153d1a67e2a054a70": {
    as_of: "2026-10-10T13:09:33.975258Z",
    available_at: "2026-10-10T13:09:33.975258Z",
    bytes: 58373,
    input_hash: "ec1e9b6b19b6841e560fce80d02ceae9d63ecf69e0d2e348dab29f512726723f",
    kind: "regimes-snapshot",
    licence: {
      attribution: "Kenneth R. French Data Library; Fama and French research factors and momentum.",
      basis:
        "Public research-return library; attributed derived research publication. No raw CRSP redistribution.",
      dataset_key: "ken-french:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html"],
      status: "ACTIVE",
      terms_url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:09:33.975258Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "dc4ce03af520e76329699e680873d536da0b19d3de5bfbc153d1a67e2a054a70",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-snapshot-dc4ce03af520e76329699e680873d536da0b19d3de5bfbc153d1a67e2a054a70.json",
  },
  "regimes:factors:14bfd98c1ea75247b45135499f955ce0e67bb64e2eb466e8ccc71c2d7836806b": {
    as_of: "2026-10-10T13:59:59.414508Z",
    available_at: "2026-10-10T13:59:59.414508Z",
    bytes: 32056,
    input_hash: "ce3992311dfbc8aaa8789450f3eac4972e6df0176b995c5be1d96d5be8ffe037",
    kind: "regimes-factors",
    licence: {
      attribution: "Kenneth R. French Data Library; Fama and French research factors and momentum.",
      basis:
        "Public research-return library; attributed derived research publication. No raw CRSP redistribution.",
      dataset_key: "ken-french:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html"],
      status: "ACTIVE",
      terms_url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:59:59.414508Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "14bfd98c1ea75247b45135499f955ce0e67bb64e2eb466e8ccc71c2d7836806b",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-factors-14bfd98c1ea75247b45135499f955ce0e67bb64e2eb466e8ccc71c2d7836806b.json",
  },
  "regimes:lineage:78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117": {
    as_of: "2026-10-10T13:59:59.414508Z",
    available_at: "2026-10-10T13:59:59.414508Z",
    bytes: 26783,
    input_hash: "ce3992311dfbc8aaa8789450f3eac4972e6df0176b995c5be1d96d5be8ffe037",
    kind: "regimes-lineage",
    licence: {
      attribution: "Kenneth R. French Data Library; Fama and French research factors and momentum.",
      basis:
        "Public research-return library; attributed derived research publication. No raw CRSP redistribution.",
      dataset_key: "ken-french:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html"],
      status: "ACTIVE",
      terms_url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:59:59.414508Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-lineage-78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117.json",
  },
  "regimes:snapshot:12235bb5b98eceb46ac7c035e0a0cf94abb23639bc71090b9c4b2a21bf5b85ab": {
    as_of: "2026-10-10T13:59:59.414508Z",
    available_at: "2026-10-10T13:59:59.414508Z",
    bytes: 58537,
    input_hash: "ce3992311dfbc8aaa8789450f3eac4972e6df0176b995c5be1d96d5be8ffe037",
    kind: "regimes-snapshot",
    licence: {
      attribution: "Kenneth R. French Data Library; Fama and French research factors and momentum.",
      basis:
        "Public research-return library; attributed derived research publication. No raw CRSP redistribution.",
      dataset_key: "ken-french:daily-factors",
      permitted_uses: ["publish_derived"],
      source_urls: ["https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html"],
      status: "ACTIVE",
      terms_url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      valid_through: null,
    },
    observed_at: "2026-10-10T13:59:59.414508Z",
    reason: null,
    scope: "REAL_DERIVED_REGIMES",
    sha256: "12235bb5b98eceb46ac7c035e0a0cf94abb23639bc71090b9c4b2a21bf5b85ab",
    sources: ["ken-french:daily-factors"],
    status: "AVAILABLE",
    url: "/artifacts/replay/regimes-snapshot-12235bb5b98eceb46ac7c035e0a0cf94abb23639bc71090b9c4b2a21bf5b85ab.json",
  },
};
export type Country = "US" | "INDIA";
export type Kind = "catalog" | "audit" | "ledger" | "lineage";
export type ArtifactRef = {
  type: "replay_artifact";
  artifact_id: string;
  sha256: string;
  bytes: number;
  kind: string;
  scope: string;
  country: string;
  asset: string;
  as_of: string;
  source_ids: string[];
  run_id: string;
  json_pointer: string;
};
export type Coverage = {
  first_observed_date: string;
  last_observed_date: string;
  observations: number;
};
export type CatalogItem = {
  factor_id: string;
  display_name: string;
  definition: string;
  role: string;
  units: string;
  observed_coverage: Coverage | null;
  analysis_coverage: Coverage | null;
  capture_time: string;
  available_from: string;
  source_version: string;
  capture_sha256: string;
  source: { source_id: string; attribution: string; source_urls: string[] };
  evidence_quality: string[];
  calendar_status: { mic: string; status: string; version: string | null };
  licence_status: { status: string; permitted_uses: string[] };
  staleness: { age_calendar_days: number | null; status: string };
};
export type AuditItem = {
  class_path: string;
  plugin_id: string;
  plugin_version: string;
  output: string;
  output_channel: string;
  declared_type: string;
  semantic_unit: string;
  asset_scope: string[];
  evidence_class: string;
  chronology: string;
  alignment_rule: string;
  allowed_controls: string[];
  eligibility_status: string;
  reason: string;
  reason_code: string;
  blockers: string[];
  target_meaning: string;
  retained_diagnostic_refs: ArtifactRef[];
};
export type EvidenceRef =
  | ArtifactRef
  | {
      type: "frozen_file";
      path: string;
      commit: string;
      sha256: string;
      json_pointer: string;
      assertion_id: string;
    };
export type Candidate = {
  candidate_id: string;
  label: string;
  country: string;
  evidence_class: string;
  stages: Record<
    string,
    {
      status: string;
      reason_code: string;
      reason: string;
      underlying_verdict: string | null;
      evidence_refs: EvidenceRef[];
    }
  >;
};
export type Envelope<T> = {
  schema_version: string;
  kind: Kind;
  scope: string;
  country: Country;
  evidence_cutoff: string;
  claims: Record<string, false>;
  payload: T;
};
export type Catalog = Envelope<{
  items: CatalogItem[];
  unavailable_analytics: {
    id: string;
    status: string;
    reason_code: string;
    required_evidence: string[];
  }[];
}>;
export type Audit = Envelope<{ items: AuditItem[]; definitions: unknown[]; exclusions: unknown[] }>;
export type Ledger = Envelope<{ candidates: Candidate[] }>;
export type Lineage = Envelope<{
  nodes: { id: string; kind: string; status: string; reason_code: string }[];
  edges: { from: string; to: string; relationship: string }[];
  withdrawals: unknown[];
  source_values: string;
}>;
type Schema = {
  oneOf?: Schema[];
  type?: string;
  properties?: Record<string, Schema>;
  length?: number;
  items?: Schema;
  enum?: unknown[];
  pattern?: string;
};
export function stable(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => JSON.stringify(k) + ":" + stable(x))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
export function closedSchema(v: unknown, s: Schema): void {
  if (s.oneOf) {
    for (const choice of s.oneOf) {
      try {
        closedSchema(v, choice);
        return;
      } catch {
        /* next reviewed shape */
      }
    }
    throw new Error("Unreviewed metadata union");
  }
  if (s.type === "object") {
    if (
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      stable(Object.keys(v).sort()) !== stable(Object.keys(s.properties!).sort())
    )
      throw new Error("Unknown metadata field");
    for (const [k, x] of Object.entries(s.properties!))
      closedSchema((v as Record<string, unknown>)[k], x);
  } else if (s.type === "array") {
    if (!Array.isArray(v) || v.length !== s.length) throw new Error("Unknown metadata array");
    v.forEach((x) => closedSchema(x, s.items!));
  } else if (s.type === "integer") {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
      throw new Error("Invalid coverage count");
  } else if (s.type === "null") {
    if (v !== null) throw new Error("Unavailable evidence substituted");
  } else if (s.type === "boolean") {
    if (typeof v !== "boolean") throw new Error("Claim substitution");
  } else if (s.type === "string") {
    if (
      typeof v !== "string" ||
      v.length > 1200 ||
      (s.pattern && !new RegExp("^(?:" + s.pattern + ")$").test(v))
    )
      throw new Error("Invalid metadata text");
  } else throw new Error("Unknown schema");
  if (s.enum && !s.enum.some((x) => stable(x) === stable(v)))
    throw new Error("Unreviewed metadata value");
}
export function validateMetadata<T>(v: unknown, k: Kind, c: Country, cutoff: string): Envelope<T> {
  closedSchema(v, SCHEMAS[k]);
  const e = v as Envelope<T>;
  if (
    e.kind !== k ||
    e.country !== c ||
    e.evidence_cutoff !== cutoff ||
    Object.values(e.claims).some((x) => x !== false)
  )
    throw new Error("Selection or claim mismatch");
  const refs = KNOWN_BUNDLES[c]?.[cutoff]?.refs;
  if (!refs) throw new Error("Unknown cutoff");
  function walk(x: unknown) {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      if (
        (x as Record<string, unknown>).type === "replay_artifact" &&
        !Object.values(refs).some((r) => stable(r) === stable(x))
      )
        throw new Error("Unreviewed numerical reference");
      Object.values(x).forEach(walk);
    }
  }
  walk(v);
  return e;
}
