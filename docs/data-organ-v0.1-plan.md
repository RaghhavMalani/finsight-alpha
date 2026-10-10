# Data Organ v0.1: approved implementation plan

PR #25 was merged normally at `7a69986955368ff3d1c8f369fbd3e37c358567af` after verifying the approved head `0288643b9eaeabb727896dc67d9b0765c4c12567`, all green checks and zero unresolved review threads. `feat/data-organ-v0.1` starts at that new main. Implementation approved on 2026-10-09. Before merge, the archive boundary was advanced to `94eb4f5d4898ed96c35304be29e4a09835bba8e6`: the old nightly workflow had published a third v1 computation, `35b2839947ef7fe71700c3b25efff7ff5b6ca003156b20f6840b95e5add27ebc`, which is retained as immutable history. Reconciliation verifies it without execution.

The approval boundary comes directly from the attached Phase 3 request and `docs/upgrade-plan.md`: inspect existing contracts, propose exact file changes, then obtain approval (completed). The first **implementation** commit will correct prospective computation identity. No model research, inference calibration, momentum-study rerun or execution-engine integration belongs here.

## Findings from inspection

- `src/data/providers/base.py` supplies the existing canonical OHLCV interface; its standardizer drops invalid Close rows. Source diagnostics must inspect captured input before this cleaning, and disclose when only a cleaned provider result is available.
- `src/regime_intelligence/providers.py` already supplies operator-driven PIT loading and ALFRED real-time intervals. It admits day-granular vintages conservatively at the next New York midnight and rejects incomplete histories. Reuse it without changing its scientific semantics.
- `src/regime_intelligence/alpaca.py` discloses IEX coverage and reconstructed market-time availability. It is not witnessed historical publication evidence. French/IIMA current factor captures are correctly `CAPTURE_ONLY`, with immutable capture hashes. Preserve both distinctions.
- The SDK store already checks both clocks, immutable schemas, content hashes and tenant admission. Its sealed runs retain source/version and an input hash, but do not record a complete per-input source-admission map. Future runs need that map; old runs must not acquire invented execution receipts.
- Both `Runner.code_identity()` and `export_plugin_replay.py` hash broad source trees. The run contract also includes Git HEAD. Narrowing file hashes alone would therefore still change identity after an unrelated commit.
- F10 `/data` is currently a placeholder. The existing shell already provides DATA commands and F10; its F5/F7 protections stay intact.
- `pipeline_health.py` already records tenant-scoped ingestion outcomes. Add detailed evidence behind it rather than replace its existing route or database contract.
- The installed exchange-calendar library has XNYS/XNAS/XBOM but no XNSE. Do not substitute BSE or a weekday grid for NSE sessions. Gap denominators require an evidenced, versioned calendar and explicit supported dates.
- Historical guards currently permit only the Phase 2 plugin additions. Phase 3 requires a narrow, tested extension for Data Organ artifacts and source registrations while preserving every older public entry, artifact and frozen research receipt.

## Prospective identity, first implementation commit

Introduce a versioned computation-dependency declaration. It binds the model implementation, the platform routines actually used, the selected engine's transitive local helpers, relevant installed distribution versions, runtime and a manifest hash. No directory glob contributes to identity. Validate paths, missing dependencies, cycles and unresolved/dynamic computation dependencies; trusted local plugins must declare their dependencies explicitly.

Future `plugin-run/2` computation contracts include the scoped code/dependency hashes, admitted input hashes, target/factor hashes, seed, configuration, cutoff and split. Execution Git HEAD remains recorded as execution provenance in the attempt chain and sealed result, outside the computation-identity material. A sealed repeat returns its original execution provenance; a reuse attempt records its own current HEAD separately. An actual dependency change produces a different computation identity.

Keep v1 canonical identity, all three existing v1 run IDs, opening events, registry snapshots, publication links and receipt fingerprints byte-identical. Add dual-version readers rather than reinterpret v1. The archived Phase 2 reference becomes verification-only in the scheduled workflow; a new v2 reference computation requires an explicit operator action and a new recorded attempt. Phase 3 data refreshes must not reopen its holdout. Do not execute that reference during this phase to manufacture a v2 receipt.

Any future opt-in v2 reference publication uses a separate output directory and route; it cannot replace the archived v0.1 receipt or manifest pointer.

Tests must change and commit an unrelated adapter/plugin/source module and prove unchanged v2 identity, unchanged model call counts and unchanged holdout count. Changing a declared engine/helper or admitted input must change identity. Undeclared dependencies must fail closed instead of falling back to a broad tree hash.

## Data boundary and evidence

The Data Organ wraps existing market/PIT providers behind a source catalog and admission envelope; it does not force India macro captures into the frozen US regime-specific dataset contract. Every capture records tenant, source/dataset, asset/series, field schema/units, frequency, feed/adjustment basis, observation window, retrieval clock, evidenced availability rule, release/vintage version, source URL and byte hash, adapter version and licence resolution.

Seal source admissions and their signal identity/content-hash mappings before appending typed signals. Record ingestion attempts and outcomes separately; recovery is idempotent and preserves failures. An admission without successfully appended signals is not reported as completed ingestion. Source/version reuse with different bytes, clocks or schema fails. Invalid observations are quarantined with reason/count evidence rather than admitted as zeros.

Reuse strict SDK timestamp validation before legacy AsOf filtering. Date-only source periods are allowed only with an explicit source convention; caller timestamps without a timezone are rejected. Capture-only availability equals the actual capture clock. Original publication/vintage clocks must come from provider evidence and fixed conservative rules, never an operator's backdate. Earlier official releases may legitimately predate retrieval; the evidence must prove that distinction.

Diagnostics cover missing expected sessions, duplicates/conflicts, invalid values, publication-order gaps, freshness and lag distributions, late revisions, impossible OHLC/volume, large return jumps and missing adjustment evidence. Report threshold/calendar/profile versions and actual denominators. A jump is an anomaly, not a split verdict or an automatic correction. Unsupported fields/calendars give unavailable diagnostics. Source capture age and observation age are separate; capture-only histories do not acquire a historical publication-lag distribution.

Issues have deterministic identities, severity, evidence links, first-seen time and append-only status history. Failed or partial scans cannot silently resolve earlier issues. These are Data Organ hooks for the later Risk Manager; this phase does not build the Phase 7 portfolio/model monitoring product.

## Bounded source scope

| Source | Phase 3 treatment |
|---|---|
| Ken French US factors | Reuse checked capture/parser and existing derived-publication registration. Diagnose source rows/fields and availability quality; retain market-factor labels. |
| IIMA India factors | Reuse checked capture/parser and existing registration. Preserve missing-factor coverage and capture-only vintages. |
| ALFRED UNRATE | One genuine revision observatory, using bounded original real-time history through the existing adapter. Preserve conservative vintage-day admission and publish revision deltas/counts, not a raw observation matrix. |
| BLS LNS14000000 | Add one bounded, key-free official API capture for current-vintage mirror consistency with UNRATE. Same upstream BLS series, not independent economic confirmation. Compare only matched period/unit/seasonal-adjustment/vintage basis. |
| Alpaca IEX | Preserve provider and current local grants/restrictions. Local health only; public coverage explains the restriction and IEX basis. No raw prices or derived vendor series are newly permitted. |
| yfinance US / `.NS` | Preserve existing provider. Disclose adjusted history and post-cleaning coverage limitations. Local only under existing policy; no automatic public health-data grant. |
| NSE bhavcopy | Add an operator-driven, bounded EOD provider under MarketDataProvider. Versioned source captures and official session evidence; raw EOD data and numerical diagnostics stay local unless an explicit grant permits publication. India VIX remains publicly unavailable. |
| RBI / MOSPI | Start with RBI policy-repo releases and MOSPI CPI Combined release metadata/imports. Use evidenced release clocks or label capture-only. No fabricated historical vintages. Public numerical summaries require dataset-specific verified permission; otherwise show unavailable coverage and the reason. |
| India fundamentals | Explicit limited/unavailable PIT coverage; no placeholder fundamentals or imputed values. |

Default comparative factor-health window: 2024-01-01 through 2025-12-31, with source-specific library history also described separately. Default UNRATE revision window: observation periods 2020-01 through 2025-12, using all captured vintage intervals within the selected cutoff. Local raw-price diagnostics are bounded operator-selected imports, not a bulk vendor mirror.

Provider comparison requires the same asset/series, field definition, session/period, units, price basis, feed scope and compatible information vintage. Preserve A and B and their delta. Incompatible pairs report reasons; never silently select or splice one. In particular, adjusted Yahoo equity history versus unadjusted bhavcopy, and consolidated prices versus IEX-only prices, are not automatically comparable. Public v0.1 has the genuine ALFRED/BLS mirror comparison; India price comparison stays local and conditional on compatible evidence.

## India costs

Implement a Decimal-based, effective-dated component calculator, initially for NSE cash-equity delivery and non-delivery trades. Separate STT, exchange charges, SEBI turnover fees, GST and its evidenced tax base, stamp duty, applicable additional levies, and explicitly supplied brokerage/DP/spread/slippage assumptions. Every statutory/exchange component carries a cited document, source hash, publication/capture quality and effective interval; no current schedule is extrapolated backward.

Unknown dates, instruments, schedules or component bases are unavailable. Missing broker/spread inputs produce a clearly partial statutory result, never a zero-cost total. State the rounding policy and do not claim contract-note equivalence without evidence. Do not modify the closed Research OS cost assumptions or rerun its study. Derivatives and personal capital-gains taxation are outside this v0.1 calculator.

## Exact proposed file changes

Paths below are repository-relative. No existing files are proposed for deletion.

### Add

| Exact path | Purpose |
|---|---|
| `finsight/plugins/dependencies.py` | Versioned scoped computation manifests, transitive declarations and validation. |
| `src/data_organ/__init__.py` | Public Data Organ API. |
| `src/data_organ/contracts.py` | Source/capture/admission/diagnostic/issue/coverage contracts. |
| `src/data_organ/catalog.py` | Explicit US/India source, field, cadence, calendar and permission profiles. |
| `src/data_organ/registry.py` | Tenant-scoped immutable admissions, source-version seals, attempts and issue history in local DuckDB. |
| `src/data_organ/adapters.py` | Bridges to existing Alpaca, ALFRED, French/IIMA and market providers; bounded BLS mirror capture. |
| `src/data_organ/india.py` | Evidenced RBI/MOSPI release import and metadata coverage; no guessed availability. |
| `src/data_organ/calendars.py` | Bounded XNYS and official NSE calendar evidence, hashes and supported windows. |
| `src/data_organ/diagnostics.py` | Health, anomaly and comparable-provider discrepancy calculations. |
| `src/data_organ/revisions.py` | Genuine vintage predecessor reads, deltas and revision-grid projection. |
| `src/data_organ/lineage.py` | Signal → admission → source version/capture inspection, licence-aware metadata. |
| `src/data_organ/service.py` | Operator ingestion, read-only F10 projections and recovery. |
| `src/data_organ/publication.py` | Typed, positive-whitelist, grant-checked derived Replay projection and retained publication history. |
| `src/data_organ/costs.py` | Effective-dated India component calculator. |
| `src/data/providers/nse_provider.py` | NSE EOD adapter implementing the existing market-provider interface. |
| `backend/routes/data_organ.py` | Authenticated tenant-scoped GET views for local admitted health/revision/coverage/lineage/issues; no fetch-on-GET or anonymous raw endpoint. |
| `scripts/collect_data_organ.py` | Bounded operator collection/import into ignored local storage. |
| `scripts/export_data_organ_replay.py` | Idempotent data diagnostics, issue history and derived Replay publication; no model run. |
| `scripts/verify_data_organ.py` | Read-only source/admission/permission/publication/history audit. |
| `scripts/data_archive.py` | Phase 3 boundary audit retaining all pre-Phase-3 public artifacts, manifest entries and original policy decisions. |
| `eval/data-organ/v0.1/source-catalog.json` | Versioned bounded source/diagnostic/window profiles with cited evidence. |
| `eval/data-organ/v0.1/india-cost-schedules.json` | Only evidence-supported fee records and explicitly supported effective intervals. |
| `frontend-v2/src/data-organ/DataWorkspace.tsx` | F10 source-health, coverage, revisions, disagreements and issue-history views. |
| `frontend-v2/src/data-organ/RevisionObservatory.tsx` | Observation/vintage scrubber with conservative clock labels and derived changes. |
| `frontend-v2/src/data-organ/LineageInspector.tsx` | Source/admission/clock/permission inspection without raw vendor values. |
| `frontend-v2/src/data-organ/contracts.ts` | Fail-closed typed Replay validators and positive field whitelist. |
| `frontend-v2/src/data-organ/query.ts` | Shared SHA Replay reads plus tenant-authenticated local reads. |
| `frontend-v2/src/data-organ/data-organ.css` | Existing Forge reference tokens and responsive F10 layout. |
| `frontend-v2/scripts/verify-data.mjs` | Static contracts, Replay attacks and Chrome/Edge/Firefox QA. |
| `tests/plugins/test_dependencies.py` | Scoped identity/provenance/legacy preservation metamorphic tests. |
| `tests/data_organ/test_admission.py` | Source, tenant, immutable version, timezone and availability attacks. |
| `tests/data_organ/test_diagnostics.py` | Calendar gaps, stale/invalid/duplicate data, jumps and provider compatibility attacks. |
| `tests/data_organ/test_revisions.py` | Future append, old cutoff, actual-vintage and backdating tests. |
| `tests/data_organ/test_costs.py` | Effective boundaries, payer/base/units/rounding and missing-component cases. |
| `tests/data_organ/test_lineage.py` | Signal/admission/source joins and substitution/tenant isolation. |
| `tests/data_organ/test_publication.py` | Raw-field and rehashed semantic forgeries, wrong grants, source/version changes and archive preservation. |
| `tests/data_organ/test_api.py` | Authentication, tenant boundaries and read-only/no-upstream GET behavior. |
| `docs/data-organ-guide.md` | Source coverage, limitations, costs, operation, genuine findings and recording instructions. |
| `docs/screenshots/phase3-data-1440.png` | Actual production Replay desktop capture. |
| `docs/screenshots/phase3-data-390.png` | Actual production Replay mobile capture. |

### Change

| Exact path | Bounded change |
|---|---|
| `finsight/plugins/model.py` | Add dependency declarations for future computations. |
| `finsight/plugins/engines.py` | Declare each existing wrapper's actual engine/helper dependencies; scientific implementations stay unchanged. |
| `finsight/plugins/runner.py` | v2 scoped code identity, separate execution provenance and verified input-lineage metadata. |
| `finsight/plugins/store.py` | Add read-only verified signal/admission reference lookup; keep v1 payload/schema/read semantics. |
| `finsight/plugins/replay.py` | Dual-version projection support; preserve existing publications and v1 receipts. |
| `finsight/plugins/__init__.py` | Export the new dependency declaration API. |
| `scripts/export_plugin_replay.py` | Existing reference defaults to archive verification; future v2 execution is explicit and fully recorded. |
| `src/data/providers/__init__.py` | Register the NSE provider without changing default provider/fallback behavior. |
| `src/data/license_policy.py` | Narrow UNRATE/BLS derived registrations with attribution/terms/source URLs. Preserve all existing entries, grant resolution and restrictions. RBI/MOSPI permissions are not assumed. |
| `src/data/pipeline_health.py` | Expose admitted Data Organ run-summary references through existing tenant health summaries. |
| `backend/main.py` | Register the authenticated Data Organ router. |
| `scripts/research_archive.py` | Bind finished Phase 2 history and delegate only approved Data Organ publication/policy additions to the new audit. No blanket unfreeze. |
| `tests/plugins/test_archive_boundary.py` | Verify the prospective extension and retain attacks on old artifact/policy substitutions. |
| `frontend-v2/src/routes/data.tsx` | Replace the placeholder with F10 and validated section/source/cutoff URL state. |
| `frontend-v2/src/app/workspaces.ts` | Retire the DATA placeholder copy only; preserve key behavior. |
| `frontend-v2/src/app/command/mnemonics.ts` | Allow existing factor-series DATA navigation without changing exchanges or other commands. |
| `frontend-v2/src/plugins/contracts.ts` | Read v2 identity/provenance without reinterpreting v1; no Agents/Observatory redesign. |
| `frontend-v2/scripts/verify-plugins.mjs` | Add v2 contract checks; existing checked v1 scenes remain unchanged. |
| `frontend-v2/scripts/verify-shell.mjs` | Add DATA navigation/URL cases; keep F5/F7 assertions. |
| `frontend-v2/scripts/verify-replay.mjs` | Include genuine F10 routes and raw-field/publication attacks. |
| `.github/workflows/ci.yml` | Add Data Organ historical/permission/browser verifiers; retain full suite. |
| `.github/workflows/organs.yml` | Verify archived Phase 2 reference, refresh bounded data health, preserve issue history and publish only derived Data Organ paths. No implicit plugin holdout. |
| `.gitattributes` | LF/canonical treatment for new policy/evidence/derived text only. |
| `docs/plugin-guide.md` | Explain prospective v2 identity, lineage and frozen v1 provenance. |
| `frontend-v2/public/replay-manifest.json` | Append only Data Organ health/revision/disagreement/coverage/lineage/issue routes and entries, retaining all old entries and manifest claims. |

### Generated files after approval

- `data/exports/data_organ_v0_1/receipt.json`, `catalog.json`, `health.json`, `revisions.json`, `disagreement.json`, `coverage.json`, `lineage.json`, `issues.json`, `costs.json` and `manifest.json`, plus content-addressed historical receipt/summary copies. These contain permitted derived evidence and source identities, not raw market files or runtime databases.
- `frontend-v2/public/artifacts/replay/data-organ-{health,revisions,disagreement,coverage,lineage,issues,costs}-<sha256>.json`. Hashes come from actual licensed projections after capture; old revisions/publications remain retained.
- Raw captures, vintage matrices, OHLCV, Parquet stores and DuckDB/SQLite runtime files stay in ignored operator storage. Test-only synthetic sabotage fixtures cannot become public findings.

## UI and verification

Use `forge-reference.html` tokens and the existing shell. F10 defaults to public Replay with no keys/login/API/vendor requests. Show source health, coverage/permission, a real UNRATE revision scrubber, compatible comparison, source lineage and issue history. Render restricted, partial, stale, capture-only and unavailable evidence distinctly. Local Live uses existing authentication/grants and reads installed evidence; ingestion stays operator-driven. Keep text-focus rules and F5/F7 browser behavior.

Run all historical verifiers and full Linux pytest; lint, TypeScript, production build and every verify script; Chrome/Edge/Firefox at 1440/390; native DATA/palette/key navigation; real offline Replay with zero failed requests/vendor traffic. Sabotage future vintages, backdating, stripped timezone, duplicate identities with changed bytes, missing sessions, unresolved adjustments, provider incompatibility/disagreement, wrong tenant/grant, raw fields and rehashed semantic/clock/permission forgeries.

Verify the three Phase 2 v1 run IDs, registry chains, receipts and all earlier public bytes/entries against merged main. Source-policy audit must retain old function semantics and entries and admit only the reviewed narrow additions. Capture genuine production F10 screenshots. Write the three-sentence Postable result only after diagnostics finish, from observed counts/windows/limitations in the final receipt. Record health/coverage, UNRATE vintage scrub, mirror comparison, lineage and issue history; never manufacture a clean report or an alpha finding.

## Logical implementation sequence after approval

1. Scoped identity/provenance and v1 archive-only refresh, with unrelated-commit metamorphic tests.
2. Source admission, verified lineage, diagnostics, revision predecessor logic, coverage and issue histories.
3. Bounded US/India adapters, official calendar evidence, narrow permissions and effective-dated India costs.
4. Derived publication, scheduled data refresh and F10 integration using existing tokens/contracts.
5. Full sabotage/browser/historical/Linux verification, genuine screenshots and one Phase 3 review PR. Do not merge that new PR automatically.

## Primary references checked during planning

- [ALFRED UNRATE](https://alfred.stlouisfed.org/series?seid=UNRATE) identifies BLS, source code LNS14000000 and “Public Domain: Citation Requested.” The general graph copyright banner is not a grant for arbitrary FRED series.
- [FRED real-time periods](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html) documents the observation versus information-vintage distinction.
- [BLS copyright information](https://www.bls.gov/opub/copyright-information.htm) permits attributed use of its public-domain material, with exceptions for protected imagery.
- [BLS API FAQ](https://www.bls.gov/developers/api_faqs.htm) documents the unregistered v1 API and its 25-query daily limit. The proposed one-series bounded capture uses that version, caches snapshots and does not require signup.
- [NSE statutory levies](https://www.nseindia.com/static/invest/first-time-investor-sebi-turnover-fees-stt-other-levies) explicitly separates rates and effective dates, including the April 2026 STT boundary. Exchange charges and exact tax bases still require their applicable primary circulars before schedule admission.
- [NSE consolidated circulars](https://www.nseindia.com/static/resources/consolidated-master-circulars) provides the official circular index for fee/session evidence.
- [MOSPI EnviStats reproduction notice](https://mospi.gov.in/sites/default/files/reports_and_publication/statistical_publication/EnviStats/FrontMatter.pdf) is publication-specific and distinguishes third-party material. It does not establish permission for CPI or all MOSPI/RBI data. Dataset-specific macro permission remains unresolved at this planning boundary.

## Approved implementation guardrails

- Missing scheduled credentials, providers, calendar evidence or grants record UNAVAILABLE/failed attempts and retain prior evidence; no invisible fallback.
- Unsupported NSE windows never use weekdays/XBOM. Evidenced calendar version changes diagnostic identity; sabotage both conditions.
- Public revision/disagreement projections are aggregated and positively whitelisted to prevent reconstructing licensed prices.
- Show statutory subtotal separately from all-in estimated cost; absent brokerage, spread, slippage or DP keeps all-in partial/unavailable.
- Unresolved dynamic imports fail closed in v2 dependency declarations, without broad-tree fallback.
