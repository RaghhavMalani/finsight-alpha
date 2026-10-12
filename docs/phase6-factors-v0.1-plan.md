# Phase 6 FACTORS v0.1 implementation plan

**Status: awaiting explicit implementation approval.** This deliverable is a repository-inspected plan, not implemented functionality. Inspection completed 2026-10-12 against canonical merged `main`, `5b8591d540288e99aaf6ee69163bd4d5a6c6d147`, in an isolated checkout. No source refresh, plugin/model execution, research run, holdout opening, numerical reprojection or deployment was performed while planning.

## 1. Product decision and fixed scope

Ship a **read-only factor evidence workspace** containing the Factor Evidence Catalogue, Registered Output Eligibility Audit, Factor-Zoo Evidence Ledger, Lineage/Evidence Inspector and production FACTORS page. Numerical evidence is referenced from already corrected Phase 5 artifacts. Phase 6 creates metadata, references and availability/claim-readiness records only.

| Frozen state | Required value throughout Phase 6 |
| --- | --- |
| Phase 5 real regimes | CLOSED / MERGED / FROZEN at `5b8591d…` |
| Scheduled Phase 5 refresh | DISABLED |
| Manual regime refresh | AVAILABLE to an operator; never invoked by Phase 6 |
| D6 final-code real proof | DEFERRED; no proof dispatch in this phase |
| Research OS original inference | NOT_CALIBRATED / CLOSED |
| Replacement inference | NOT_CONFIRMED; engine and market replication unauthorized |
| New Phase 6 model executions / holdout openings | 0 / 0 |

Out of scope: security sorts, cross-sectional IC/rank IC, stock turnover, discovery, new test families, new calibration, momentum reruns, real captures, plugin/model runs, providers, security universes, VectorBT, Nautilus, hftbacktest and Kalshi. No scheduler changes or scientific claim promotion. Implementation stops at one review PR, with no automatic merge.

## 2. Current repository findings

| Inspected source | Actual finding / implementation consequence |
| --- | --- |
| `frontend-v2/src/routes/factors.tsx` | Only `WorkspacePlaceholder workspace="factors"`; replace this page, not other workspaces. |
| `frontend-v2/src/app/workspaces.ts` | FACTORS is `/factors`, command `FACT`, visual label F5, phase 6. `RESERVED_KEYS` excludes F5/F7 from `FUNCTION_KEYS`. |
| `frontend-v2/src/app/command/mnemonics.ts` | Bare `FACT`/`FACTORS` preserve current ticker; ticker `FACT` works. `US-MKT FACT` and `IN-MKT FACT` currently fail the market-factor command allowlist. |
| `frontend-v2/src/app/shell/ForgeShell.tsx` | Bar passes ticker context; Ctrl/Cmd-K palette exists; nonreserved function keys are prevented only outside text fields. Preserve this handler unchanged. |
| `frontend-v2/src/app/command/CommandLine.tsx` | Help still calls FACT a future workspace; update only this wording. |
| `backend/routes/factors.py` | Legacy `/factors/{ticker}` creates `MarketDataService("yfinance")`, fetches ETF/ticker history, fits OLS and emits `alpha_annual`. **Never use it for this phase**, even in local mode. Leave it unchanged. |
| `frontend-v2/src/markets/queries.ts` | Existing `useFactors(ticker)` calls that legacy API. F5 gets its own query module; do not reuse `useFactors`. |
| `finsight/plugins/catalog.py`, `engines.py` | Seven built-in row adapters; registration is not proof of a retained real execution. |
| `src/regimes/plugins.py`, `local.py` | Five public and seven local registered SeriesModel classes. Outputs are inherited in several subclasses. |
| `examples/momentum_plugin.py`, Phase 2 receipts | A retained synthetic MomentumModel outside the default seven-engine catalogue; include it explicitly because sealed run contracts register its identity. |
| `src/regimes/publication.py` | Corrected kind-specific factor whitelist exists. F5 consumes these bytes; no new factor regression. |
| `src/replay/publication.py`, frontend Replay reader | Existing CAS publication, SHA/byte checks and manifest-preserving infrastructure can be reused. Generic derived checking alone is insufficient. |
| `scripts/{research,data,regimes}_archive.py` | Existing guards recognize only previous namespaces. New factors metadata needs narrow delegation through all three, retaining their original baselines/checks. |
| `.github/workflows/organs.yml` | All three Phase 5 capture/compute/runtime steps require explicit manual `scope=regimes`; nightly/default scope refreshes Data Organ and verifies Phase 5 only. Leave this file byte-identical. |

There is no tracked AGENTS.md in the canonical tree. The isolated checkout contains no public-regime, local-regime or Data Organ runtime databases under `data/exports/replay-source/`. Published receipts/artifacts verify retained history; their existence must not be presented as the presence of an installed local runtime or raw source bytes.

## 3. Actual admitted factor evidence

### 3.1 Factors and definitions

Both admitted libraries contain **MKT, SMB, HML, MOM and RF**. MKT is the market excess-return factor (Rm−Rf); SMB is size; HML is value; MOM is the source's momentum factor; RF is the risk-free return component, not another stock universe. Captured numeric units are `proportional_return`, not source CSV percentage units. Factor-specific definitions must be authored from the checked adapter/library field mappings; the generic capture description “market factor excess return” must not be incorrectly copied onto SMB/HML/MOM/RF.

No admitted RMW/CMA/QUAL/VOL/LIQ controls exist in the bounded Phase 5 profile. Unrelated legacy modules or source files are not evidence of their admission for this workspace. No stock identifiers, characteristics, decile memberships or stock-level forward-return universe exists in these factor captures.

| Library | Complete captured coverage | Phase 5 analysis coverage | Availability/calendar |
| --- | --- | --- | --- |
| French MKT/SMB/HML/RF | 1926-07-01–2026-08-31, 26,317 rows per field | First actual row 2000-01-03; through 2026-08-31; 6,705 aligned rows | CAPTURE_ONLY; XNYS PACKAGE_EVIDENCE, `exchange_calendars` 4.13.2, not an exchange publication receipt |
| French MOM | 1926-11-03–2026-08-31, 26,216 rows | Same 6,705 aligned rows | CAPTURE_ONLY; separate MOM capture clock |
| IIMA MKT/SMB/HML/MOM/RF | 1993-10-01–2025-12-31, 8,004 rows per field | First actual row 2000-01-03; through 2025-12-31; 6,466 aligned rows | CAPTURE_ONLY; XNSE UNAVAILABLE; observation units; CALENDAR_UNAVAILABLE / STALE_INPUT |

RF is present in source metadata/admitted Data Organ fields, but is not a control or target in the public MOM-on-three-factors assessment. Do not imply that every captured field was consumed by every model.

### 3.2 Exact current Phase 5 captures

| Capture | Captured / available-from clock | Source version ID | Capture SHA-256 |
| --- | --- | --- | --- |
| French daily FF3/RF | `2026-10-10T13:57:41.946719Z` | `9b6452ea996e69777bf913a4ecb73b214c978fa37dbce0db6ccc69ffbbd3cb49` | `2f29e22546069914890a712680a6f81f3680ebc3543b52864484d209ca13a7db` |
| French daily MOM | `2026-10-10T13:59:10.413486Z` | `c2d24c0427f75ebbf047dab76c38a30113f8fb7f6368ca6435197053037c85ac` | `ecf82b116e6ec56d2b79a2f27bd1d1598c217b5c6c25caa55b945bdd8a2c0b78` |
| IIMA daily four-factor/RF | `2026-10-10T13:59:59.414508Z` | `265dfd086705c6c1a229b9dffaa2c6f02412eb7412b92a58e636e0f803998266` | `32af19e5c55f493ee15c794cae145be5381762bbb4b1615227e7c9fc7f5a6f10` |

Current Phase 5 evidence cutoff is `2026-10-10T13:59:59.414508Z`. At that cutoff India's last observation is 284 calendar days old; preserve the sealed stale designation. Staleness is evaluated at the selected evidence cutoff, not silently recomputed using today's wall clock. No XNSE sessions or annualisation are manufactured.

### 3.3 Data Organ metadata is a separate evidence selection

The current `/data/coverage` publication is sealed at `2026-10-11T07:17:30.281432Z`. French and IIMA are ADMITTED with 2,510 and 2,490 admitted field-observations respectively in the bounded **2024–2025 Data Organ profile**, not the larger Phase 5 analysis window. These are not counts of tickers or independent factors.

Its French FF3, MOM and IIMA captures have the same source-byte hashes as above but later capture clocks (`07:17:05.381082Z`, `07:17:12.001296Z`, `07:17:17.781956Z`) and distinct version IDs (`9637d62f…`, `5efcb619…`, `083f4266…`). **Same bytes do not mean same availability evidence.** F5 historical catalogue bundles use the Phase 5 lineage/receipts for their selected cutoff. Do not graft these newer admissions onto older Phase 5 runs. The current Data Organ publication can be linked separately with its own cutoff; it cannot fill missing historical catalogue fields.

French/IIMA have the existing ACTIVE `publish_derived` registrations in `src/data/license_policy.py`; preserve attribution and source/terms URLs. No new permission is inferred or registered. Alpaca, yfinance, NSE bhavcopy and India VIX remain unavailable for public numerical evidence. RBI/MOSPI, macro mirrors and satellites are not factor controls for this release.

## 4. Registered definitions, retained executions and audit semantics

Static inspection of the four reviewed declaration files resolves **20 definitions: 7 built-in row adapters + 1 retained fixture definition + 5 public SeriesModels + 7 local SeriesModels**. These declare **55 current outputs and 9 derived-output channels**. Repeated names in current/derived channels are distinct declarations, not independent discoveries. Audit identity is `(registration, class/version, output_channel, output_name)` with explicit country/asset evidence bindings.

`_HMM` is an abstract implementation base, not an extra registered plugin. Test helpers `MeanModel`, `MeanSeries` and `Consumer` are test-only declarations, not production registrations; list them in inventory exclusions with paths/reasons rather than silently ignoring possible registrations. Future new registration sites or unresolved dynamic declarations must fail the inventory check and require a reviewed inventory update; never import an arbitrary module or execute it to discover outputs.

Audit records include `plugin_id`, `class_path`, `plugin_version`, `output`, `output_channel`, `declared_type`, `declared_unit`, `semantic_unit`, `asset_scope`, `evidence_class`, `source_lineage_ref`, `chronology`, `target_meaning`, `allowed_controls`, `alignment_rule`, `publication_eligibility`, `eligibility_status`, `blockers`, `reason_code`, `reason`, `retained_diagnostic_refs`. Missing declared units stay missing/ambiguous; do not rewrite SDK declarations to make a signal eligible.

Statuses are `ELIGIBLE_RETAINED`, `UNAVAILABLE_INPUT`, `UNAVAILABLE_TYPE`, `UNAVAILABLE_ALIGNMENT`, `UNAVAILABLE_LICENCE`, `REQUIRES_NEW_RESEARCH`, `SYNTHETIC_TEST_ONLY`. Store all applicable blockers; the primary status is a presentation choice, not permission to hide another blocker. `evidence_availability` is separate: an existing volatility artifact does not mean an existing factor-exposure assessment of volatility.

**ELIGIBLE_RETAINED means an existing assessed result can be displayed/referenced. It never authorizes fitting that output as a new dependent variable.** The four public `regimes.factors` outputs describe one retained MOM assessment per market, not four discovered factors. Its categorical neutrality is a retained assessment label; it is not itself a regression target.

### 4.1 Reason/chronology profiles used by every matrix row

| Profile | Asset/evidence/chronology, controls, alignment and exact reason |
| --- | --- |
| R-CAT | Built-in row adapter, asset from a future run contract; no matching retained real adapter run in the checked manifests. State labels/booleans/indices are categorical semantics, even when stored as int. No factor controls/response alignment are admissible in v0.1. |
| R-PROB | GBM/MLP probability output; default declaration float/dimensionless does not establish a return target or calibrated probability. No sealed real run/diagnostic; a future defined prediction-to-return research contract and retained chronology are required. |
| R-VOL | Volatility row adapter has no retained real execution; unit defaults to dimensionless although implementation is volatility. A matched factor sensitivity definition/units and retained diagnostic are absent. |
| R-PARAM | Development-window Hawkes or Monte Carlo parameter/tail summary; not per-observation investment returns. No real retained diagnostic; assigning a dated regression response would fabricate alignment. |
| FIX | `examples.momentum_plugin.MomentumModel`, SDK-FIXTURE/public-fixture; three immutable synthetic v1 runs, each with one historical holdout opening. Existing OLS point factor hook is engineering evidence only; no uncertainty certificate or real-market inference. |
| P-CAT | Public US-MKT/IN-MKT, existing verified Phase 5 lineage and CAPTURE_ONLY clocks; categorical state or convergence flag is not a regression response. Preserve PARAMETER_RETROSPECTIVE path semantics. |
| P-VOL | Public per-observation volatility is retained, but no factor regression of that volatility exists. Target transformation, controls and matched chronology would be a new research contract. No new diagnostic permitted. |
| P-PARAM | Current fitted persistence, half-life, duration or ARCH p-value is a model/window diagnostic. Retention does not supply a factor-aligned response series; p-values are not factor returns. |
| P-PROB | Filtered HMM posterior is retained and explicitly not calibrated. No declared/researched factor assessment of the posterior exists. Do not regress it by default. |
| P-FIT | Reuse MOM target on MKT/SMB/HML only, from the verified same-cutoff factor artifact + lineage + snapshot. Exact observed-date inner join; prior-only rolling window 120, minimum 60; full-window HAC lag 3 remains retrospective/asymptotic. Target MOM is excluded from controls. Public derived grant is present. |
| P-MOM | Retained 12–1 market-factor signal is not the published MOM factor, nor a strategy return. No exposure assessment of that signal exists; replacing it with MOM would be target substitution. Its categorical sign is not a regression response. |
| L | Local SPY/QQQ/IWM definitions; Alpaca IEX/conservative clocks/unadjusted prices and local-only grants. No corresponding sealed local runtime is installed in this checkout and no public grant exists. Do not claim synthetic test fixtures are local market evidence. For a future installed LocalFactors run, target is asset return minus RF, controls MKT/SMB/HML/MOM, aligned by the existing NY session mapping; no new fitting allowed here. |

### 4.2 Eligibility matrix — every current output

Type/unit are declarations, not newly inferred units. `d` = dimensionless; `r` = proportional_return; `v` = per_observation_volatility; `o` = observations. Row-adapter registration keys are the keys in `ENGINES`; fixture is identified by its sealed class path.

| Registration | Current output | Type/unit | Primary eligibility | Reason profile / additional blocker |
| --- | --- | --- | --- | --- |
| hmm | regime | int/d | UNAVAILABLE_TYPE | R-CAT; UNAVAILABLE_INPUT |
| gbm-suite | up_probability | float/d | UNAVAILABLE_INPUT | R-PROB; REQUIRES_NEW_RESEARCH |
| mlp | up_probability | float/d | UNAVAILABLE_INPUT | R-PROB; REQUIRES_NEW_RESEARCH |
| hawkes | fitted_branching_ratio | float/d | UNAVAILABLE_ALIGNMENT | R-PARAM; UNAVAILABLE_INPUT; no admitted real event stream |
| volatility-clustering | realized_volatility | float/d | UNAVAILABLE_INPUT | R-VOL; undeclared semantic unit; REQUIRES_NEW_RESEARCH |
| volatility-clustering | volatility_state | category/d | UNAVAILABLE_TYPE | R-CAT; UNAVAILABLE_INPUT |
| monte-carlo-var | var_return | float/d | UNAVAILABLE_ALIGNMENT | R-PARAM; UNAVAILABLE_INPUT; declaration lacks return unit |
| monte-carlo-var | cvar_return | float/d | UNAVAILABLE_ALIGNMENT | R-PARAM; UNAVAILABLE_INPUT; declaration lacks return unit |
| d0.4.2 | regime | category/d | UNAVAILABLE_TYPE | R-CAT; no retained execution of this row adapter |
| d0.4.2 | vector_complete | bool/d | UNAVAILABLE_TYPE | R-CAT; completeness flag, not an exposure |
| examples.momentum_plugin.MomentumModel | momentum_signal | float/d | SYNTHETIC_TEST_ONLY | FIX; never eligible in a real-view numerator |
| regimes.volatility | volatility_state | category/d | UNAVAILABLE_TYPE | P-CAT |
| regimes.volatility | realized_vol_20 | float/v | REQUIRES_NEW_RESEARCH | P-VOL |
| regimes.volatility | ewma_vol | float/v | REQUIRES_NEW_RESEARCH | P-VOL |
| regimes.volatility | garch_persistence | float/d | UNAVAILABLE_ALIGNMENT | P-PARAM |
| regimes.volatility | garch_half_life | float/o | UNAVAILABLE_ALIGNMENT | P-PARAM; use selected market's disclosed step semantics |
| regimes.volatility | arch_lm_pvalue | float/d | UNAVAILABLE_TYPE | P-PARAM; diagnostic p-value, not a response return |
| regimes.hmm2 | hmm_state | category/d | UNAVAILABLE_TYPE | P-CAT |
| regimes.hmm2 | hmm_posterior | float/d | REQUIRES_NEW_RESEARCH | P-PROB |
| regimes.hmm2 | expected_duration | float/o | UNAVAILABLE_ALIGNMENT | P-PARAM |
| regimes.hmm2 | hmm_converged | bool/d | UNAVAILABLE_TYPE | P-CAT |
| regimes.hmm4 | hmm_state | category/d | UNAVAILABLE_TYPE | P-CAT |
| regimes.hmm4 | hmm_posterior | float/d | REQUIRES_NEW_RESEARCH | P-PROB |
| regimes.hmm4 | expected_duration | float/o | UNAVAILABLE_ALIGNMENT | P-PARAM |
| regimes.hmm4 | hmm_converged | bool/d | UNAVAILABLE_TYPE | P-CAT |
| regimes.factors | market_beta | float/d | ELIGIBLE_RETAINED | P-FIT; reference mkt term, not new fit |
| regimes.factors | r_squared | float/d | ELIGIBLE_RETAINED | P-FIT; existing goodness-of-fit only |
| regimes.factors | intercept | float/r | ELIGIBLE_RETAINED | P-FIT; descriptive intercept, never alpha |
| regimes.factors | neutrality | category/d | ELIGIBLE_RETAINED | P-FIT; snapshot's existing overall label only; categorical target fit prohibited |
| regimes.momentum | momentum_signal | float/d | REQUIRES_NEW_RESEARCH | P-MOM |
| regimes.momentum | momentum_sign | category/d | UNAVAILABLE_TYPE | P-MOM |
| regimes.local.returns | last_return | float/r | UNAVAILABLE_INPUT | L; UNAVAILABLE_LICENCE publicly; no retained factor assessment |
| regimes.local.returns | gap_count | int/d | UNAVAILABLE_TYPE | L; missing runtime/licence; coverage count |
| regimes.local.volatility | volatility_state | category/d | UNAVAILABLE_TYPE | L; missing runtime/licence |
| regimes.local.volatility | realized_vol_20 | float/v | UNAVAILABLE_INPUT | L; no retained factor assessment |
| regimes.local.volatility | ewma_vol | float/v | UNAVAILABLE_INPUT | L; no retained factor assessment |
| regimes.local.volatility | garch_persistence | float/d | UNAVAILABLE_ALIGNMENT | L; missing runtime/licence; window parameter |
| regimes.local.volatility | garch_half_life | float/o | UNAVAILABLE_ALIGNMENT | L; missing runtime/licence; window parameter |
| regimes.local.volatility | arch_lm_pvalue | float/d | UNAVAILABLE_TYPE | L; diagnostic p-value; missing runtime/licence |
| regimes.local.hmm2 | hmm_state | category/d | UNAVAILABLE_TYPE | L; missing runtime/licence |
| regimes.local.hmm2 | hmm_posterior | float/d | UNAVAILABLE_INPUT | L; new diagnostic would require research |
| regimes.local.hmm2 | expected_duration | float/o | UNAVAILABLE_ALIGNMENT | L; missing runtime/licence |
| regimes.local.hmm2 | hmm_converged | bool/d | UNAVAILABLE_TYPE | L; missing runtime/licence |
| regimes.local.hmm4 | hmm_state | category/d | UNAVAILABLE_TYPE | L; missing runtime/licence |
| regimes.local.hmm4 | hmm_posterior | float/d | UNAVAILABLE_INPUT | L; new diagnostic would require research |
| regimes.local.hmm4 | expected_duration | float/o | UNAVAILABLE_ALIGNMENT | L; missing runtime/licence |
| regimes.local.hmm4 | hmm_converged | bool/d | UNAVAILABLE_TYPE | L; missing runtime/licence |
| regimes.local.factors | market_beta | float/d | UNAVAILABLE_INPUT | L; UNAVAILABLE_LICENCE publicly; installed verified result required |
| regimes.local.factors | r_squared | float/d | UNAVAILABLE_INPUT | L; UNAVAILABLE_LICENCE publicly |
| regimes.local.factors | intercept | float/r | UNAVAILABLE_INPUT | L; UNAVAILABLE_LICENCE publicly; never alpha |
| regimes.local.factors | neutrality | category/d | UNAVAILABLE_INPUT | L; reuse existing label only if installed; categorical fit prohibited |
| regimes.local.momentum | momentum_signal | float/d | UNAVAILABLE_INPUT | L; target distinct from MOM; new assessment requires research |
| regimes.local.momentum | momentum_sign | category/d | UNAVAILABLE_TYPE | L; missing runtime/licence |
| regimes.local.seasonality | sessions | int/d | UNAVAILABLE_TYPE | L; coverage count, not investment signal |
| regimes.local.seasonality | cells | int/d | UNAVAILABLE_TYPE | L; grid count, not investment signal |

### 4.3 Eligibility matrix — every derived-output channel

| Registration | Derived output | Type/unit | Eligibility | Exact reason |
| --- | --- | --- | --- | --- |
| regimes.volatility | realized_vol_20 | float/v | REQUIRES_NEW_RESEARCH | P-VOL; producer chain exists, factor assessment does not |
| regimes.volatility | volatility_state | category/d | UNAVAILABLE_TYPE | P-CAT |
| regimes.volatility | garch_conditional_vol | float/v | REQUIRES_NEW_RESEARCH | P-VOL; no retained factor assessment |
| regimes.hmm2 | hmm2_state | category/d | UNAVAILABLE_TYPE | P-CAT; downstream admission does not make a categorical target numerical |
| regimes.local.returns | asset_return | float/r | UNAVAILABLE_INPUT | L; public UNAVAILABLE_LICENCE; cannot build assessment now |
| regimes.local.volatility | realized_vol_20 | float/v | UNAVAILABLE_INPUT | L; missing retained assessment/runtime; public grant absent |
| regimes.local.volatility | volatility_state | category/d | UNAVAILABLE_TYPE | L; missing runtime/licence |
| regimes.local.volatility | garch_conditional_vol | float/v | UNAVAILABLE_INPUT | L; missing retained assessment/runtime; public grant absent |
| regimes.local.hmm2 | hmm2_state | category/d | UNAVAILABLE_TYPE | L; missing runtime/licence |

Public P-* definitions bind separately to US-MKT and IN-MKT at each retained cutoff. L definitions bind only to the profile's SPY/QQQ/IWM scope, never to India proxies. Row adapters have no invented asset binding. Classification in the matrices concerns eligibility for a factor assessment, not whether a different Phase 5 module successfully computed.

## 5. Existing numerical evidence reusable without computation

The only real retained factor assessment is **published MOM on MKT/SMB/HML**, per market, across three genuine cutoffs: `2026-10-10T12:34:47.123204Z`, `2026-10-10T13:09:33.975258Z`, `2026-10-10T13:59:59.414508Z`. Six corrected factors artifacts exist. There are ten current sealed computations and thirty unique run bindings across the three historical market cutoffs; these are not Phase 6 runs.

Current binding examples:

| Country | Corrected factor artifact ID | Sealed factor run ID |
| --- | --- | --- |
| US | `regimes:factors:14bfd98c1ea75247b45135499f955ce0e67bb64e2eb466e8ccc71c2d7836806b` | `133fe71fc4b36347b23515f1043644afc1c39d8972d70bcb45f8d1332434702c` |
| India | `regimes:factors:3e1cdbdd5545c85cdf5fa91a2235529ee1661d07839a2b8f6f9b3ac4dea416fc` | `e5602e885e3910167eb6120a90e4a0a62fc776f4d2f73c6118b4311b78210e38` |

F5 audit entry → exact corrected factor artifact + same-cutoff snapshot/lineage → sealed factor run → producer/admission/capture/version/licence identities. Numerical charts read the referenced artifact directly through the existing SHA-checked reader and Phase 5 factor validator. Snapshot references supply existing overall categorical labels; do not recreate a neutrality classification from coefficients. No Phase 6 numerical copies, reserialization under new identities, fits, new controls or aggregate decomposition are needed.

The synthetic MomentumModel's retained OLS point-exposure hook can be linked in a clearly separate engineering inspector. It cannot satisfy any real catalogue/claim stage. Source/class registration without a completed retained assessment stays unavailable.

## 6. Unavailable roadmap items and exact unblock requirements

| Item | Current blocker | Evidence required by a separate approved milestone |
| --- | --- | --- |
| Decile/security sorts | Only aggregate factor returns; no security cross-section | Stable identifiers/universe membership and PIT characteristics at each sort date, explicit tie/missing rules and rebalance chronology |
| Cross-sectional IC / rank IC | No matched security characteristics and forward returns | Above plus horizon-specific forward returns and observed/available clocks, no future joins or survivorship filtering |
| Stock turnover / cost-adjusted sorts | No stock portfolio/rebalances or witnessed trading-cost basis | Portfolio weights/rebalances, corporate actions and delistings, price/mark conventions, turnover and broker/spread/slippage/DP/statutory evidence |
| Seven-factor neutrality | QUAL/VOL/LIQ not admitted | Licensed, defined controls and appropriate chronology; a new approved diagnostic contract |
| Factor neutrality on other outputs | No existing verified matched assessment; several output types incompatible | Explicit target/unit/transform/control/alignment/research contract and retained result, never automatic fitting |
| Factor-zoo survival funnel | No registered Phase 6 candidate family, valid p-values, OOS/cost contract or recorded campaign | Separately approved frozen family, recorded attempts, calibrated/scoped inference eligibility, OOS access rules and economics |
| Historical as-known-then factor vintage claims | Current libraries are CAPTURE_ONLY | Witnessed historical releases/vintages and genuine availability clocks; cannot backdate current captures |

A stock universe also requires corporate-action and delisting handling, source licensing/publication rights and complete cost/turnover inputs. Merely adding prices would not unblock these analytics. Unsupported UI panels show the exact unavailable reason and required evidence, with no zero-valued chart or run button.

## 7. Catalogue schema and selection rules

Catalogue row keys are exactly: `factor_id`, `display_name`, `country`, `source`, `definition`, `units`, `asset_scope`, `role`, `observed_coverage`, `analysis_coverage`, `capture_time`, `available_from`, `evidence_quality`, `calendar_status`, `licence_status`, `publication_scope`, `staleness`, `source_version`, `capture_sha256`, `lineage_status`, `supported_uses`, `evidence_refs`.

- Stable IDs are country/source/field, not tickers. Role separates a factor return from RF.
- `observed_coverage`/`analysis_coverage`: `{first_observed_date,last_observed_date,observations}`; only date bounds/counts, not observations. These names also remain compatible with the unchanged generic Replay validator, which forbids a bare `last` price-like key.
- `capture_time` and `available_from` are the selected version's evidenced clocks. For CAPTURE_ONLY they coincide; missing clocks are null plus an unavailable reason, not an observation-date fallback.
- `evidence_quality` preserves existing vocabulary including CAPTURE_ONLY, CALENDAR_UNAVAILABLE and STALE_INPUT. `calendar_status` includes MIC/status/version/reference, never a synthesized sessions array.
- `staleness`: `{evaluated_at,last_observed,age_calendar_days,status,policy_ref}`. Selected-cutoff semantics remain explicit.
- Source version/capture/admission references come from that cutoff's verified lineage. No newest-source substitution.
- Supported uses are enumerated metadata/retained-diagnostic uses only. Training/display/publication rights are separate; `publish_derived` does not grant raw dissemination.

`country` is the closed enum US/INDIA. `asset_scope` is a bounded list of reviewed scope IDs, not arbitrary tickers. `source` is `{source_id,attribution,source_urls,terms_url}` with exact values from the unchanged source registration; `definition` is a reviewed definition ID, with display text from the checked local definition map. Dates are ISO dates, clocks are timezone-qualified UTC timestamps, counts are nonnegative safe integers and hashes are lowercase 64-character SHA-256. `calendar_status` is `{mic,status,version,evidence_ref}`; missing version/reference is null with the existing unavailable status. `licence_status` is `{dataset_key,status,permitted_uses,licence_ref}`; `publication_scope` and `supported_uses` are closed enums. `evidence_quality` is a bounded list of preserved status IDs, never arbitrary provider annotations. `role` is FACTOR_RETURN/RISK_FREE_COMPONENT. Any nullable field has an explicit status/reason in its associated evidence record. Audit `semantic_unit` is nullable, with UNIT_UNDECLARED/UNIT_AMBIGUOUS reasons; neither ambiguity nor a declared dimensionless default is silently repaired.

Build all three historical catalogue selections from their own sealed receipts/lineage. Static Data Organ profiles provide source definitions, not a new admission. If a required metadata field cannot be established for that cutoff, record it unavailable; do not splice another country, source or later capture.

## 8. Factor-Zoo Claim-Readiness Ledger

Ledger candidates are existing evidence subjects, not discovered signals: the US retained MOM assessment, the India retained MOM assessment, the frozen Research OS momentum study, and a separate synthetic fixture engineering record. Every row declares its kind/scope and whether it belongs to a registered research family. No Phase 6 family is created.

Stage keys: `DEFINITION`, `RAW_TEST`, `MULTIPLE_TESTING`, `OUT_OF_SAMPLE`, `COSTS`, `REGIME_ROBUSTNESS`, `CROSS_MARKET`, `CLAIM_STATUS`. Each stage is `{status,reason_code,reason,evidence_refs,underlying_verdict}` where status is VERIFIED/PARTIAL/UNAVAILABLE/NOT_APPLICABLE/BLOCKED. VERIFIED means the asserted evidence/contract has been checked; it does not mean the scientific test passed. Underlying negative/inconclusive verdicts must remain visible.

| Candidate | Stage treatment |
| --- | --- |
| US/India retained MOM assessment | DEFINITION VERIFIED from frozen profile; descriptive exposure reference exists. RAW_TEST PARTIAL, with DIAGNOSTIC_ASYMPTOTIC disclosure, no new p-value; MULTIPLE_TESTING/OOS/COSTS UNAVAILABLE; regime-specific factor refits not public in the corrected factor artifact, so REGIME_ROBUSTNESS UNAVAILABLE; CROSS_MARKET UNAVAILABLE because separate descriptive fits are not a registered replication test; CLAIM_STATUS BLOCKED. |
| Frozen Research OS | Link `data/exports/research_os_v0_1/{manifest,freeze-receipt,preregistration,flagship}.json` and v0.1.1 manifest/summary hashes. Definition and recorded historical process may be VERIFIED, while inferential stages are PARTIAL/BLOCKED under the actual closed gate. Preserve existing multiplicity/OOS records as history; do not reinterpret their existence as a Phase 6 pass. Research OS records 46 historical openings; preserve them, do not add any. |
| Synthetic MomentumModel | SYNTHETIC_TEST_ONLY, engineering scope. Factor hook is a point diagnostic; all real claim stages NOT_APPLICABLE/BLOCKED. Historical three v1 openings remain separate from zero new Phase 6 openings. |

The frozen Research OS verdicts remain STATISTICAL/REGIME_DEPENDENCE/CROSS_MARKET INCONCLUSIVE and ECONOMIC UNAVAILABLE. Original NOT_CALIBRATED/CLOSED and replacement NOT_CONFIRMED are always displayed. No universal certification exists. No fabricated funnel counts; availability counts may be shown only with named denominators (“registered outputs audited”, not “factors survived”). UNAVAILABLE is neither failure nor survival.

VERIFIED/PARTIAL stages must carry immutable evidence references and a specific assertion/selector. No evidence means UNAVAILABLE, not a guessed stage. Reference-only historical documents use commit-pinned repository links and byte hashes; Replay does not download huge research files or recompute results to render a status.

## 9. Costs

Reference the existing Data Organ cost artifact with its own cutoff and `ILLUSTRATIVE_EXAMPLE` meaning, never as a witnessed trade or MOM-factor trading cost. The current illustration has a partial statutory subtotal, missing GST base, and null all-in estimate with missing brokerage/spread/slippage/DP. Do not call the statutory subtotal an all-in estimate or transfer cash-equity fees to a factor portfolio without turnover/portfolio evidence.

Phase 6 calculates no new transaction costs. Required component statuses are explicit for brokerage, DP, spread, slippage, turnover and tax/statutory inputs. Missing components remain null/unavailable; partial costs cannot satisfy an economic survival stage. No historical extrapolation of effective-dated statutory schedules.

## 10. Public artifact schemas

Introduce **only four kinds**: `factors-catalog`, `factors-audit`, `factors-ledger`, `factors-lineage`. Proposed identities are `factors:(catalog|audit|ledger|lineage):<sha256>`; URLs `/artifacts/replay/factors-<kind>-<sha256>.json`; schema `factors-evidence/1`, scope `READ_ONLY_FACTOR_EVIDENCE`. Schema definitions are mirrored in Python and TypeScript, with exact keys at every level.

Common envelope keys: `schema_version`, `kind`, `scope`, `country`, `asset_scope`, `evidence_cutoff`, `input_hash`, `sources`, `claims`, `payload`. Envelope `kind` is the short enum catalog/audit/ledger/lineage; manifest entry `kind` is exactly `factors-` plus that value. The exact claim keys are `inference_certified`, `market_claim_eligible`, `causal_claim_eligible`, `validated_alpha`, `trusted_graph`, `precise_edge_confidence`, all false. `sources` is a bounded list of reviewed source IDs. Kind mapping/scope/source must match the manifest entry; country and retained evidence cutoff must match the explicit route and selected bundle. `input_hash` hashes reviewed declaration/policy metadata and referenced immutable evidence bytes, not a broad tree/Git HEAD hash. This is metadata-publication identity, not a new model computation identity.

| Kind | Exact payload structure |
| --- | --- |
| catalog | `{items,unavailable_analytics}`; rows exactly §7; unavailable analytics `{id,status,reason_code,required_evidence}` |
| audit | `{inventory_commit,definitions,items,exclusions}`; definitions `{plugin_id,class_path,version,registration_kind,declaration_sha256}`; item keys exactly §4 audit record; exclusion `{class_path,reason_code}` |
| ledger | `{candidates,claim_boundaries}`; candidate `{candidate_id,label,country,evidence_class,family_ref,stages}`; stage keys exactly §8; boundaries enumerate closed/not-confirmed gates and false flags |
| lineage | `{nodes,edges,withdrawals,source_values}`; nodes `{id,kind,status,ref,reason_code}`; edges `{from,to,relationship}`; withdrawals are immutable withdrawn/replacement/receipt references; `source_values` must equal `LOCAL_ONLY` |

Reference union is closed:

- ArtifactRef: `{type:"replay_artifact",artifact_id,sha256,bytes,kind,scope,country,asset,as_of,source_ids,run_id,json_pointer}`. Exact safe namespaces/kinds, hash matches ID/manifest, selector from reviewed enum, no arbitrary URL. `run_id` nullable only for non-run metadata.
- FileRef: `{type:"frozen_file",path,commit,sha256,json_pointer,assertion_id}`. Paths/selectors/commit are explicitly allowed by the frozen evidence inventory; safe relative path, no traversal, arbitrary external file or runtime database.

Audit records refer to factor/snapshot/lineage artifacts; new four-kind artifacts contain **no coefficient values, returns, residuals, fitted paths, predictions, p-value vectors or observation arrays**. Coverage/count integers, bounded metadata clocks and enum statuses are the only newly emitted quantitative metadata. Existing numerical evidence remains authoritative under its original ID.

Export two countries × three retained cutoffs × four kinds: **at most 24 new CAS artifacts**, plus a current metadata receipt and content-addressed receipt copy. Four canonical current routes per country, `/factor-evidence/<kind>?country=US|INDIA`, point to that country's latest retained-cutoff bundle. Add exact historical routes `/factor-evidence/<kind>?as_of=<encoded-cutoff>&country=US|INDIA`, serialized with the existing `canonicalRoute` query sorting/encoding. The receipt binds the same route-to-artifact map for offline verification; the browser resolves historical selection from the manifest alone and need not fetch a nonpublic receipt or a fifth index artifact. All four selected kinds must agree on country/evidence_cutoff. Existing Phase 5 history artifacts are unchanged.

Keep **metadata publication time separate from retained evidence cutoff**. Each newly added manifest entry uses its actual first metadata publication clock for `observed_at`, `available_at` and `as_of`; the envelope's `evidence_cutoff` and referenced Phase 5 entries retain their original clocks. The unchanged generic validator requires `observed_at <= available_at <= entry.as_of <= manifest.as_of`. Advance only the manifest's global `as_of` to the new publication clock, alongside reviewed additions, without changing any old entry/route. The receipt records that clock. It is not inserted into deterministic CAS metadata or used as a new numerical computation date. Unchanged repeat exports preserve the first publication clock and write nothing. Never backdate Phase 6 availability to October 10 to satisfy the validator.

## 11. Licence and reconstruction boundary

New authored inventories/statuses are first-party metadata. Source-derived numerical references retain their original licence and attribution; an authored metadata licence never launders permission for a referenced source. Export/validation resolve every referenced source grant from the unchanged policy, validate the original manifest licence, and reject restricted/local data from public references. Public unresolved local registrations may publish reviewed code metadata and reason codes, not private runtime/tenant IDs or local result contents.

Reject unknown keys recursively, including hidden arrays/dictionaries inside annotation fields. Use enumerated reason/definition identifiers and reviewed authored text; never stringify provider rows into prose or forward arbitrary provider JSON. Hashes/IDs are strict patterns, date fields typed, URLs restricted to the actual registered attribution/source URLs, text bounded and not a JSON transport. Generic `assert_derived` is supplemental only.

No daily rebased index, dated aggregates/fitted-residual combinations or alias such as `signal_value` is allowed in Phase 6 kinds. The only numerical chart dependency is the existing corrected Phase 5 factor artifact, validated again with its strict whitelist. Reject identity/selector substitution to a richer snapshot path or legacy raw decomposition even when its bytes are hash-valid. Withdrawn factors can appear only as identifiers in withdrawal-history nodes, never as loadable/chart references.

## 12. Phase 5 freeze and archive strategy

Add `eval/factors/v0.1/phase5-freeze.json`, derived from canonical `5b8591d…`, recording exact protected Git/evidence paths and hashes, all 33 regime manifest entries, existing `/regimes/*` route bindings, three cutoffs/run bindings, six correction mappings, four retained receipt copies, current receipt, eight screenshot hashes, profile hash, numerical source/dependency files and `organs.yml`. Evidence bytes use raw byte SHA and existing `-text` treatment; textual source comparisons respect canonical Git representation without changing frozen hashes or normalising sealed files.

Anchors inspected:

- Current Replay manifest SHA `fd963896c7b78085d6866ff13ba0087f84c63d7b4ba121b462c90275b81832b8` (manifest additions allowed only through reviewed namespace delegation).
- Correction receipt `2c9a7690069a14a2926d66c8e9548ff737b9d9f911effb2eacdb461535615feb`.
- Original receipts `bcf4e50d35c85c454333b9414733528f0d8197eb38f642825488e7de05eb53bb`, `e307e1edc2fcb0119e74247e9846b6a75603bd94ac3a7a24b54a8be180a69169`, `40683751fad2a6ae3b2bdb930d2e085951d8b3973a74806b7c2b60333d44a93f`.
- Profile `b12b8ed73cf664e2058b03be3554d8a558ae0b69e94c5b7d117b45aff7d35496`.

Six withdrawal pairs, prefixes below for readability; full IDs come from the unchanged correction receipt and are mandatory in the freeze inventory:

| Country/cutoff | Withdrawn factor hash prefix | Replacement hash prefix |
| --- | --- | --- |
| US 12:34:47 | 69ee78e0bdeb | 00c5b6870bdb |
| India 12:34:47 | a328dfaec014 | f3a1fb368d8d |
| US 13:09:33 | 00fdd3d3af1b | deb8ae9a105a |
| India 13:09:33 | ed2d357cf6be | 6bdf5f4453fb |
| US 13:59:59 | d61658e8b646 | 14bfd98c1ea7 |
| India 13:59:59 | 63cfb15e0bd1 | 3e1cdbdd5545 |

`scripts/factors_archive.py` compares against this fixed baseline and verifies only Phase 6 additions/references. Reject changed/deleted old artifacts/receipts/screenshots, changed regime routes/entries, newly republished/copied regime evidence, new `regimes:*` artifacts, old unsafe direct URLs, aliases/redirects to unsafe bytes, and orphan factor files not in the manifest/receipt. Retain withdrawal enforcement through `verify_corrections`; never invoke `correct()`.

Earlier verifiers retain original boundaries: research frozen commits, Data Organ `94eb4f5…`, regimes `1a0d03d…`. Modify only their reviewed addition/route dispatch to delegate exact `factors:*` identities and `/factor-evidence/*` routes to the new checker. No broad “allow unknown prefixes” exemption, moving old baselines or pruning history. Keep the original Phase 2 three runs/openings and Research OS historical counts intact.

Data Organ may continue its already-approved scheduled CAS additions and current `/data/*` pointers under its existing checker. These cannot replace Phase 5 bindings or become historical factor evidence. A future explicit Phase 5 refresh/proof is outside this phase and would need a separately reviewed freeze/baseline update before its new evidence could enter F5.

## 13. Backend / API plan

Add `backend/routes/factor_evidence.py`, prefix `/factor-evidence`; GET-only `/{catalog|audit|ledger|lineage}` with validated `country` and optional exact retained `as_of`. Register separately in `backend/main.py`. No `/factors/{ticker}` reuse, redirects, provider calls or write/refresh/fit/export HTTP endpoints.

Public deployments return 503 for this local API; public F5 uses static Replay. Local API requires authenticated organization/user, organization-aware cache keys and valid display grants for any installed local evidence. Source files and identifiers cannot be chosen by caller-provided paths. Unknown kind/country is 422; missing selected evidence/runtime is 404; invalid hash/schema/lineage/reference binding is 409. No fallback to latest or public data after a failed local selection.

Service reads published metadata and existing sealed references. For optional installed local diagnostics, inspect already existing registry files in strict read-only mode (`SQLite mode=ro`, DuckDB `read_only=True`) with explicit tenant ownership. Never create a missing database/directory, instantiate a writable runner/service/registry to inspect absence, restore a registry or append an audit event. Missing local runtime is availability evidence, not a reason to run LocalFactors. Public numerical grants do not imply a local tenant display grant.

No runtime exists in this checkout. The required shipped local case is honest UNAVAILABLE. An existing verified local factor result may be referenced only through a reviewed local-only reference contract and verified tenant/licence/lineage; none is promised in the initial screenshots. Public export scans only the checked immutable whitelist, never arbitrary local databases.

## 14. Replay and metadata export

`scripts/export_factors_replay.py` reads the fixed inventory, policy and existing evidence. It has no `--network`, compute, fit, capture or refresh option. First preflight every schema/reference/hash/country/cutoff/licence/freeze condition; then build all metadata in a staging area, install only the new Phase 6 CAS files/receipt, and atomically switch the manifest as the publication commit point. Validation failure leaves current publication untouched; interrupted staging leaves the previous manifest active. Resume/recovery is restricted to verified newly created Phase 6 staging files, never historical/runtime files. Do not call `ReplayPublisher.finish()`, whose shared implementation deletes unlisted files, or any Phase 5 publisher/correction entry point. Reuse safe canonical-byte/hash/read helpers only.

Receipt binds the metadata policy/declaration hashes, source references, existing run IDs and corrections, emitted artifact IDs and `new_model_runs=0`, `new_holdout_openings=0`, `new_captures=0`. It records actual exporter execution provenance separately from deterministic metadata identity. Repeating unchanged export returns UNCHANGED and writes zero bytes/receipts/manifests; unrelated Git HEAD does not create metadata/model computation identity. No SDK fingerprint change is needed.

Artifact evidence_cutoff is the selected retained cutoff, not a claim of a new computation or original historic publication. The newly authored metadata's provenance remains Phase 6; existing numerical/source availability clocks are preserved. Do not invent historical Phase 6 publication timestamps.

Browser queries cache by mode/country/cutoff/artifact hash. Validate bundle consistency and each referenced artifact's exact identity, scope, source, asset, cutoff and run, not just SHA. Unknown cutoffs/invalid lineage clear all retained numerical panels; do not leave a chart from the previous selection. Catalogue unavailability and invalid-reference status may remain readable with numerical content withheld.

## 15. UI and shell plan

Use `docs/forge-reference.html`, current shell and existing tokens (`#050607`, `#0B0D10`, `#F0A929`, Inter/JetBrains Mono). No new terminal shell or Agents redesign.

Header: US / INDIA, exact retained cutoff, Replay / Local evidence mode, CAPTURE_ONLY and other quality/calendar/staleness badges. Sections: Evidence Catalogue, Output Eligibility Audit, Retained Exposure Diagnostics, Claim-Readiness Ledger, Claim Boundaries, Lineage Drawer. Desktop prioritizes catalogue/audit with a selected evidence inspector; mobile stacks the same content and keeps provenance/status visible. Show reason and unblock requirements for unsupported analytics, without decorative scores, fake zeros or disabled “run study” actions.

Retained charts show safe rolling MKT/SMB/HML coefficients and the existing full-window HAC diagnostics/R²/stability, labelled MOM factor, not ticker alpha. Show source attribution, number of observations, analytical window and asymptotic/retrospective limitations. No factor-return chart or new reconstructed cumulative index. India never acquires a session/calendar label from a generic chart formatter.

Route validates `country=US|INDIA`, `at=<exact retained cutoff>`, `panel=<catalog|audit|ledger>` and optional existing ticker context. `US-MKT FACT`/`IN-MKT FACT` become permitted command cases and explicitly pass country US/INDIA respectively. Bare FACT, workspace bar and palette retain shell ticker context; the page keeps that context separate from the explicitly selected country/factor subject. A stock ticker displays “No retained ticker assessment” and must not relabel the MOM factor chart as that ticker. Selecting a country/retained MOM record is an explicit evidence subject selection, never a silent ticker proxy.

F5 remains browser refresh, F7 caret browsing. `FUNCTION_KEYS`, reserved-key list and ForgeShell key handler remain unchanged. Update FACT's completed-workspace wording and test the actual mounted factors destination before issuing another command; preserve the prior destination-hydration QA fix.

## 16. Exact files to ADD during approved implementation

No application files are added by this planning task. The implementation add list is bounded as follows:

| Files | Purpose |
| --- | --- |
| `src/factors/__init__.py`, `contracts.py` | Typed metadata/envelope/reference/status schemas, no computation interface |
| `src/factors/inventory.py` | Reviewed static declaration/inheritance inventory and completeness check |
| `src/factors/evidence.py` | Read-only fixed-baseline artifact/file reference resolution and bindings |
| `src/factors/service.py` | Catalogue, eligibility, ledger and lineage metadata assembly; no execution |
| `src/factors/publication.py` | Four strict positive whitelist projections and transactional metadata-only export |
| `backend/routes/factor_evidence.py` | Authenticated read-only API, distinct from legacy factors endpoint |
| `scripts/factors_archive.py`, `verify_factors.py`, `export_factors_replay.py` | New addition boundary, read-only verification, explicit metadata exporter |
| `eval/factors/v0.1/policy.json`, `output-inventory.json`, `phase5-freeze.json`, `ledger-map.json` | Versioned schemas/limits, all 64 declaration channels, frozen Phase 5 inventory and explicit evidence assertions/selectors |
| `frontend-v2/src/factors/contracts.ts`, `query.ts`, `FactorsWorkspace.tsx`, `EvidenceCatalogue.tsx`, `OutputAudit.tsx`, `RetainedDiagnostics.tsx`, `EvidenceLedger.tsx`, `LineageDrawer.tsx`, `factors.css` | Scoped F5 UI, parsing, reference loading and styles |
| `frontend-v2/scripts/verify-factors.mjs` | Static and three-browser integrity/availability/traffic/sabotage QA |
| `tests/factors/test_inventory.py`, `test_evidence.py`, `test_publication.py`, `test_archive.py`, `test_api.py`, `test_ledger.py`, `test_no_execution.py` | Completeness, safe references, archives, APIs, readiness and no-execution boundaries |
| `docs/phase6-factors-v0.1.md` | Final shipped behavior, limitations and read-only verification instructions |
| `docs/screenshots/phase6-factors-us-1440.png`, `phase6-factors-india-1440.png`, `phase6-factors-us-390.png`, `phase6-factors-india-390.png`, `phase6-factors-lineage-1440.png`, `phase6-factors-unavailable-390.png` | Real production Replay screenshots; no synthetic placeholder numbers |
| `data/exports/factors_v0_1/receipt.json`, `receipt-<sha256>.json`; `frontend-v2/public/artifacts/replay/factors-<kind>-<sha256>.json` | Generated **metadata-only** outputs; ≤24 initial CAS artifacts; no raw/runtime files |

This plan itself is the sole current addition: `docs/phase6-factors-v0.1-plan.md`.

## 17. Exact files to CHANGE during approved implementation

| File | Narrow change |
| --- | --- |
| `frontend-v2/src/routes/factors.tsx` | Validated search parameters and FactorsWorkspace in place of placeholder |
| `frontend-v2/src/app/workspaces.ts` | FACTORS future/phase wording only; retain F5/F7 reservation |
| `frontend-v2/src/app/command/mnemonics.ts` | Permit FACT for US-MKT/IN-MKT; keep exchange/other command semantics |
| `frontend-v2/src/app/command/CommandLine.tsx` | Completed FACT help wording; EXEC remains future |
| `frontend-v2/scripts/verify-shell.mjs` | Factor-series commands and actual factors destination readiness; preserve all key/assertion coverage |
| `backend/main.py` | Import/include only the new factor_evidence router |
| `scripts/research_archive.py`, `data_archive.py`, `regimes_archive.py` | Exact factors namespace/route delegation; no historical baseline/check relaxation |
| `.github/workflows/ci.yml` | Add factors verifier, dedicated tests and frontend checks to existing full gates; no source/capture workflow dispatch |
| `.gitattributes` | Add Phase 6 receipts/CAS generated metadata `-text` coverage only, preserving existing patterns |
| `frontend-v2/public/replay-manifest.json` | Append only Phase 6 entries/current-and-historical routes and advance global `as_of` only for actual first metadata publication; retain every Phase 5/current historical binding; no other manifest metadata change |

No change to legacy `backend/routes/factors.py`, Markets useFactors, ForgeShell keyboard handler, src/data licence policy, finsight/plugins SDK, src/regimes numerical/publication/profile code, Phase 5 profile, corrected artifacts, receipts, screenshots or `organs.yml`. If implementation needs another file, amend the approved file plan before expanding scope.

## 18. Exact files to DELETE

**None.** Unsafe Phase 5 files are already withdrawn and must remain absent. No history cleanup, fixture deletion, source pruning or screenshot replacement. New metadata export stages temporary files outside retained evidence; no recursive cleanup of runtime/history paths.

## 19. Test and sabotage matrix

| Boundary | Required checks |
| --- | --- |
| Inventory completeness | Resolve all 20 definitions/55 current/9 derived declarations and inherited types; no abstract/test class promoted; new unknown registration or unresolved dynamic declaration fails closed; incompatible records retained |
| Evidence reuse | Exact corrected factor/snapshot/lineage/run/country/cutoff joins; no numerical copying into new kinds; MOM target excluded from controls; no false signal-to-return equivalence |
| Raw/reconstruction | Raw/target aliases, fitted-residual pairs, nested unknown fields, provider rows, numeric arrays, JSON-string payload smuggling and richer snapshot selectors rejected in each of four kinds |
| Source/licence/tenant | Substitute country/source/capture/source-version/grant/tenant/run/schema; reject; public grant never assumed from local display permission or FIRST_PARTY label |
| Chronology | Unknown cutoff, later capture with identical bytes, cutoff alias and stale lineage fail closed; no current-data backfill into old selection |
| Synthetic/real | Synthetic fixture referenced as real or counted as eligible real candidate rejected; row declarations alone cannot establish execution |
| Claims/ledger | VERIFIED/PARTIAL without immutable evidence rejected; closed/not-confirmed gate remains; missing family/multiplicity/OOS cannot produce funnel counts; UNAVAILABLE neither failure nor survivor |
| Costs/calendar | Missing costs cannot be zero or satisfy economics; partial statutory != all-in; India observation semantics; no XNSE/weekdays/XBOM or annualised defaults |
| Archives | Byte/hash mutation or deletion of any Phase 5/older protected file, changed routes, copied/new regime artifact, withdrawn/orphan URL, modified D6 workflow, baseline advancement all fail |
| No execution/writes | Patch `Runner.run`, `SeriesRunner.compute`, Model fit/predict, SeriesModel compute, holdout operations, Pipeline run_market, collectors, legacy factor route/provider/network, correction/export-regimes entry points to raise. All Phase 6 GET/export/verifier paths still operate on retained metadata. Hash runtime databases/journals before/after; no new events/files/directories |
| Atomicity/idempotence | Invalid dependency fails before any publish; interrupted staged export leaves current pointer intact; unchanged repeat zero writes; unrelated HEAD changes no identity change; receipt zero-run/open/capture flags cannot be forged without read-only evidence audit |
| API/auth | Production 503, anonymous 401, missing evidence 404, malformed 422, invalid lineage 409; organization isolation; no write route; missing DB never created |

Phase 6 adds no model/holdout tests that execute a real fixture/reference campaign. Existing full CI engineering tests retain their established isolated fixtures; these are not new retained study runs. New Phase 6 tests prove that its code paths never invoke those engines. Preserve historical opening counts; assert **zero incremental Phase 6 openings**, not a false global zero.

## 20. Browser QA and screenshots

Chrome, Edge and Firefox production builds, desktop 1440 and mobile 390: catalogue/audit/ledger, both countries/all three cutoffs, real retained diagnostics, statuses/claims, lineage drawer, URL/back/forward and no overflow. Keep F5 refresh/F7 browser behavior, focus exclusions, FACT/FACTORS, US-MKT FACT/IN-MKT FACT, ticker context, palette/bar navigation and all other existing shell checks.

Unmocked Replay must load only same-origin static manifest/artifacts/assets: zero failed requests, zero API requests and zero vendor/upstream traffic. Cache/load retained evidence lazily; API and legacy `/factors/{ticker}` calls are a hard failure. Separate sabotage contexts for changed SHA/bytes, unknown schema/selector/cutoff, invalid lineage, source/licence/tenant substitution and synthetic promotion. No stale prior chart after any failure.

Local evidence is a separate authenticated/missing-runtime case, never a mock presented as a real scene. Test API unavailable/auth states with clearly identified harness responses. Real screenshots come from built unmocked Replay and disclose country/factor meaning, partial/unavailable stages, source clocks and quality; preserve the eight Phase 5 screenshots byte-for-byte.

Vercel validation after implementation uses the new final commit's deployed bytes: compare manifest/new four-kind artifacts and referenced Phase 5 artifacts to Git; six unsafe URLs remain 404/410; preserve preview protection. Verify protected hosted US/India and mobile scenes without exposing credentials or sending them outside the deployment origin.

## 21. Performance and risks

Current safe factor artifacts are 32,056 bytes US / 32,454 bytes India. Reuse SHA-keyed cache; lazy-load one factor artifact per selected market/cutoff and lineage only on drawer open. No loading all thirty run trees, full research JSON files, source matrices or local SQLite/DuckDB into the browser. Reuse existing chart components/dependencies; no new scientific dependency, polling, WebSocket or scheduler.

Proposed guardrails: ≤128 KiB each new uncompressed metadata artifact; ≤512 KiB initial F5 data downloads excluding shared app assets; ≤64 KiB gzipped incremental workspace JS; no eager loading all historical cutoffs; source count/audit count bounded by reviewed inventory. Measure production bundles and request waterfall before claiming these gates pass. Paginate/group audit rows accessibly if instances expand; controls remain usable at 390 px.

Primary risks and responses:

- **Same source bytes/new clock:** bind exact version/admission/cutoff, not capture hash alone.
- **Legacy computation API collision:** distinct factor-evidence prefix/query; no provider fallback.
- **Missing local databases:** immutable public references suffice; local evidence remains unavailable, never hydrated by a run.
- **Incomplete registration metadata:** static inheritance resolution and explicit review; dimensionless defaults are not silently “fixed”.
- **Metadata privilege laundering/reconstruction:** four recursive positive schemas and exact original-reference grants/selectors; no observation payload transport.
- **Circular archive delegation:** new checker validates only Phase 6 additions/references; existing verifier calls remain acyclic. Whole Phase 6 freeze verification runs once at the top-level CI verifier.
- **Scheduled Data Organ main advancement:** preserve legitimate appended bytes/pointers under its checker; never rebind old regime evidence. Reconcile before review if main advances.
- **UI sounds healthier than evidence:** availability/claim-readiness terminology, explicit closed gate, no survivor funnel or alpha label.

## 22. Implementation sequence and acceptance gates

1. **Approval first.** This plan must be explicitly approved. Only then create a separate Phase 6 implementation branch from current `main`, retain `5b8591d…` as the fixed Phase 5 freeze, and reconcile any later legitimate Data Organ history without changing that freeze.
2. **Freeze/inventory.** Add baseline hashes, all 64 declaration channels and status/reason/source mappings. Tests fail on omitted/invented declarations or altered Phase 5 evidence.
3. **Reference contracts.** Implement read-only evidence loading, per-kind schemas, source/tenant/cutoff/licence bindings, ledger assertions and archive delegation. No model adapters or runtime creation.
4. **Metadata publication.** Preflight/build/stage at most 24 metadata artifacts and receipts; verify exact numerical references, no raw series, zero model/open/capture operations and unchanged repeat zero writes.
5. **Read-only API.** Implement authenticated metadata/installed-evidence inspection and missing-runtime behavior; prove no providers, registry writes or legacy factors endpoint calls.
6. **F5 UI.** Replace placeholder, add exact command allowlist/help changes, preserve browser keys, show real safe retained diagnostics and honest unavailable analytics.
7. **Adversarial and full verification.** Run dedicated tests, every historical read-only verifier, full Linux suites, frontend lint/type/format/static checks, production build, all browser/shell/Replay checks and performance measurements. No real captures/reference/model campaigns; no D6 dispatch.
8. **Review PR.** Include actual observed inventory/availability, six real screenshots and final-head Vercel served-byte evidence. Report zero new model runs/holdout openings/captures, unchanged Phase 5 hashes, and D6 still disabled/deferred. Stop unmerged for review.

Acceptance requires all of the following:

- All five product components ship with evidence-backed US/India catalogue and explicit audit records for every declared output/channel.
- Only existing sealed assessments are ELIGIBLE_RETAINED; incompatible/local/synthetic/new-research cases remain visible and separate.
- No new per-observation numerical series or duplicate numerical truth in Phase 6 artifacts.
- Every VERIFIED/PARTIAL ledger stage has an immutable reference and its actual verdict; no fabricated family/funnel/confirmation.
- All Phase 0–5 evidence, Phase 5 numerical source/profile bindings, receipts, corrected/withdrawn mappings and screenshots remain frozen; existing archives pass under narrow new namespace delegation.
- No new captures, real plugin/model/research executions, registry mutations or holdout openings from Phase 6 code paths; metadata export is idempotent.
- `organs.yml` remains byte-identical with manual-only regime gating; D6 proof stays deferred.
- Full Linux, production/static, Chrome/Edge/Firefox, Replay traffic/integrity, accessibility/layout, performance and final-head Vercel byte checks pass with recorded results.

**Planning stop:** the next action is user review/approval of this file. Do not implement, publish artifacts, dispatch workflows or create an implementation PR before that approval.
