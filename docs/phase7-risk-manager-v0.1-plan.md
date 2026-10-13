# Phase 7 — Risk Manager / Immune System v0.1 plan

Status: **PLAN ONLY — awaiting explicit approval.**

Prepared on 2026-10-13 (Asia/Calcutta). Repository: `RaghhavMalani/finsight-alpha`. Evidence baseline: `16db82c5f2f50b98253df9989c586cd45aa98f6b`, the merge of Phase 6 PR #28. Remote `main` was inspected and matched this exact commit. Phase 6 is CLOSED / MERGED / FROZEN.

This document authorizes no implementation, publication, scientific execution, branch creation, or PR. This planning pass read canonical Git blobs and a temporary audit extraction. The local checkout is a different, older work-in-progress branch, `wip/reality-terrain`, at `1474372364b1913c295129dd401ac9893f1ffe2c`; it contains unrelated untracked work. Its contents are not the Phase 7 evidence baseline and must not be reset or incorporated accidentally.

## Decision proposed for approval

Ship an evidence reader and issue console: **retained evidence → deterministic rules → typed Issues → sealed sweep receipts → F3 feed → evidence inspector**. Start with real Data Organ conditions, retained Phase 5 model diagnostics, and research-contract monitoring. Public portfolio checks remain UNAVAILABLE in v0.1; do not add example portfolios merely to fill empty panels. Real strategy simulator disagreement remains UNAVAILABLE / DEFERRED_PHASE9. Existing synthetic execution comparisons stay explicitly separate.

Retain the authenticated local paper-book desk as a separate risk lab, correct its misleading calculation labels and valuation boundaries, and prevent it from mounting in Replay. Add a separate manual-only risk workflow; preserve `organs.yml` byte-for-byte. Scheduled Phase 7 sweeps start DISABLED. Phase 5 scheduled refresh stays DISABLED, manual refresh AVAILABLE, and D6 final-code proof DEFERRED.

## 1. Current repository findings

The audit inspected the requested frontend/backend risk paths; `src/risk`, `src/analytics/risk_summary.py`, `src/truth`, `finsight/plugins`, `src/regimes`, `src/factors`, `src/data_organ`, and `src/execution`; their retained exports, policies, relevant tests, archive checkers, and workflows. No models, providers, holdouts, reference runs, calibration campaigns, or simulators were executed. No repository-level `AGENTS.md` was found in the inspected working-directory ancestry or canonical tree.

| Finding | Canonical evidence | Planning consequence |
| --- | --- | --- |
| Public F3 is a placeholder | `frontend-v2/src/routes/risk.tsx`, `RiskWorkspace` | Replace only the Replay product branch with the retained-evidence console. |
| Local F3 is substantial | Same route; five files under `frontend-v2/src/components/risk/` | Preserve its book editing, exposures, stress and research tools behind a separate local tab. |
| Paper positions are authenticated, not broker holdings | `frontend-v2/src/lib/demoBook.ts`; `backend/routes/paper.py` | The name `demoBook` is legacy naming; the server holds user-authored paper positions. No real-portfolio claim follows. |
| Some local numbers are proxy or simulated estimates | `frontend-v2/src/lib/book.ts` | Never import its VaR, correlations, NAV proxy or modelled option marks into public evidence. |
| Risk API is provider-on-demand legacy analytics | `backend/routes/risk.py`, `backend/routes/portfolio.py`, `backend/monte_carlo_study.py` | Keep it isolated from Phase 7 ingestion/publication. |
| Data Organ already has genuine issues | `data/exports/data_organ_v0_1/issues.json`, export script, immutable receipts | Normalize existing issues with original references; do not diagnose raw provider rows again. |
| Phase 5 retains real descriptive model evidence | `regimes:*` artifacts, `eval/regimes/v0.1/profile.json` | Read existing convergence, occupancy, OOD, GARCH domains, switches and clocks. |
| Phase 6 is a metadata-only evidence audit | `src/factors/*`, receipt, policy, inventory | Preserve all 24 artifacts and 18 original references; use eligibility and claim boundaries without regressions. |
| Scientific histories are already immutable | RunRegistry snapshots; Research OS exports and attempts | Monitor breaches against actual contracts, rather than alarming on totals. |
| Execution comparisons exist but are synthetic | `eval/certification/forge_v0_2_4/engine_probe_artifact.json`; Reality Ladder artifact | Do not equate an engine test tape with a real market strategy comparison. |
| Existing archive checkers reject unknown namespaces | `scripts/data_archive.py`, `scripts/regimes_archive.py`, `scripts/research_archive.py` | Narrow `risk:*` delegation is required before publication; never weaken their old-entry checks. |

The canonical Replay manifest is `terminal-replay/1`, with **221 artifact entries and 126 route mappings**. Namespace counts include 56 Data Organ entries, 33 regimes entries, 24 factors entries and three plugin-run entries. Its latest publication cutoff is `2026-10-13T07:48:05.159978Z`; this is not the last observation date of every underlying dataset.

### Exact retained evidence anchors

These are audit anchors, not instructions to republish their payloads. Each artifact ID's trailing hash is its file SHA-256; the reader must also validate the existing manifest's byte count, source, licence, scope and cutoff. JSON selectors below are server-owned, not caller input.

| Alias | Exact artifact ID | Allowed input selectors |
| --- | --- | --- |
| D-issues | `data-organ:issues:da23fd6cfa86b53fe1b569ab93ed343f3913ef0691c6036b7f45f91e83f42c30` | `/payload/items` |
| D-health | `data-organ:health:c9353c7baae85b3f2462d70a6855a3d67a954bca7dc6331d8170ea00dfe5c70c` | `/payload/items` |
| D-coverage | `data-organ:coverage:83ab6a4ec9c3b8393fc0a862c73c6265dc1b3b1556d9dd1b5f3262cfb66a43ab` | `/payload/items` |
| D-disagreement | `data-organ:disagreement:4185baf65c0cb49aca214b65bd9833ac603b0bc71df58fd34903b7c5ad0df413` | `/payload/summary`, `/payload/sources` |
| D-lineage | `data-organ:lineage:45a4b8be6b4bc8a6afbe139782b0573d9e1495fc12380f704df91f71df586942` | Reviewed per-source metadata references only |
| M-US | `regimes:snapshot:12235bb5b98eceb46ac7c035e0a0cf94abb23639bc71090b9c4b2a21bf5b85ab` | `/payload/hmm`, `/payload/volatility/garch`, `/payload/issues`, `/payload/module_statuses`, `/payload/state_at`, `/payload/run_ids` |
| M-IN | `regimes:snapshot:188141fd293bf16b0883e0a3faab2a300556fec7cd40a2cc79b4cd60e47f34a6` | Same selectors; country must be INDIA and asset IN-MKT |
| L-US | `regimes:lineage:78641d13868b0cf578015d7838e18ff0f6738b80f28036539176457d07ffa117` | `/payload/runs`, restricted to the bound module |
| L-IN | `regimes:lineage:d0276b992d8e15c48ef506d4dfef6406efe698aa6eb983f3a1d3248ccfbcec70` | Same bound-module restriction |
| F-US-audit | `factors:audit:119acc8600064ce74b97af202edfd97471bef6109256d548b90ba448137c1c8b` | Existing closed Phase 6 audit schema |
| F-IN-audit | `factors:audit:67125260b6284aeca035991913b54c3c8f630db28047f8849662e9df73ea2397` | Existing closed Phase 6 audit schema |
| F-US-ledger | `factors:ledger:df393ccc43960cdd85d43ef4e347335b596a1101c3ac6dfb1567af1967b1cfad` | Existing claim-readiness stages and boundaries |
| F-IN-ledger | `factors:ledger:5f278246a8c821189d3bbe72801c4f5269798348b521744288774c87de97515e` | Same; never copy numerical regression results |

The model anchors are sealed at `2026-10-10T13:59:59.414508Z`. Factors metadata was published at `2026-10-12T14:39:49.953264Z`, but its analytical cutoffs remain the three October 10 cutoffs in `eval/factors/v0.1/policy.json`.

Frozen file anchors additionally include:

| File | SHA-256 | Use |
| --- | --- | --- |
| `data/exports/nervous_system_v0_1/registry.json` | `072b788ca5348f380d62520a7bb0fed6334c7eba09eb7fbd79198a998e748b7b` | Phase 2 runs, attempt chain and openings |
| `data/exports/research_os_v0_1/flagship.json` | `a645b6124441ec892112a3ec41546ed4516b7de5f25baf82320ae6ae7b8812c2` | Original attempts, results and closed gate |
| `data/exports/research_os_v0_1/preregistration.json` | `2a4b3d6c6d8cac215e16b84171a8f5b685d4815f9de717af1aae2ad8db5b85b0` | Registered family and required bindings |
| `data/exports/research_os_v0_1/repeatability.json` | `97d290ece4ee183ae3c207d82bca1d297d1babbd5fc7bf473147a3ae5f4ddc69` | Separate later repeat accounting |
| `data/exports/research_os_v0_1_1/summary.json` | `1328f5d4f78ee539573ff08e6f048556b81f7ca45ad4fdf8b0421c864512d3ef` | NOT_CONFIRMED and denied engine/market-replication authorization |
| `eval/certification/forge_v0_2_4/engine_probe_artifact.json` | `b17e99976d3d0dc3c32c175533397e921053fde20916cbec479554ebe40a5e2a` | Historical synthetic engine verdicts only |

The last file's internal canonical artifact hash is separately `9ee9dabbadaa0e260e942d9c304c3c5dd0571e49470d8e8a4f35a0151c3f3166`. Do not interchange a canonical-object hash and a file-byte hash.

## 2. Exact current F3 Replay and Live behavior

`RiskWorkspace` returns `WorkspacePlaceholder workspace="risk"` when `useDataMode()` is `replay`. It does not mount the local desk in that branch. Replay is the default, including server rendering. `src/replay/mode.tsx` permits Live only on loopback hosts with `VITE_ENABLE_LOCAL_LIVE=true`; mode changes cancel and clear React Query caches. Backend authentication independently gates API calls.

Live wraps `RiskDeskPro` in `ForgeShell`. Its tabs are COMMAND (labelled Live OS), OVERVIEW, EXPOSURES, STRESS, INTELLIGENCE and HEDGES. It reads the shared paper book, server sync status and browser hedge overlays. COMMAND polls `/tape` every 30 seconds and `/news/global/cues?limit=48` every five minutes. INTELLIGENCE queries universe, macro relay, `/risk/structure/{ticker}`, and an ML signal/model-stress path. These are active local analytics requests, not sealed Phase 7 monitoring.

The route has hardcoded limits: 99% VaR 2.5% of its NAV proxy, ES 4%, preset stress 12%, gross leverage 1.5×, sector gross 35%, top position risk share 25%; watch begins at 80% utilization. These thresholds have no Phase 7 approval and must not become its severity policy.

`demoBook.ts` loads an offline localStorage cache but hydrates/saves authenticated `/paper/positions`; an empty server book stays empty. `book.ts` excludes positions with no mark from base valuation. However, its mark map has no provenance clocks or expiry, retains marks across updates, and its `HISTORICAL` branch generates 1,500 Student-t proxy scenarios. Its NAV is a cost-basis-capital proxy; modelled hedge overlays can contain a Black–Scholes option estimate in `mark`. These limitations prevent its use as current quoted portfolio evidence.

The current route also eagerly imports the book modules. `book.ts` subscribes at module initialization, and `subscribeDemoBook()` invokes hydration even before the Live component mounts. In Replay, `api.ts` redirects that request through `readReplayRoute`, so it cannot fetch authenticated `/paper/positions`; the absent Replay route becomes an offline hydration result. The module's retained `hydratePromise` can then prevent a later fresh hydration after switching to Live. The new lazy lab boundary and explicit mode/session hydration reset must fix this without interpreting cached paper positions as real Replay holdings.

`frontend-v2/src/markets/RiskScreen.tsx` is a different Markets analytics screen: single-ticker risk dashboard, on-demand Monte Carlo, factor panel and entered weighted-portfolio analysis. Preserve it; it is not the F3 immune-system feed.

## 3. Current backend risk paths and legacy/local status

| Path | Current behavior | Phase 7 decision |
| --- | --- | --- |
| `GET /risk/dashboard/{ticker}` | `MarketDataService("yfinance")`; daily close returns, Gaussian/Cornish–Fisher/MC tails, rolling vol/beta, stress; 252 annualization and 10-day square-root scaling | Legacy authenticated Markets/local analytics only. Never an EvidenceReader input. |
| `GET /risk/structure/{ticker}` | Fetches yfinance before market-structure analysis | Legacy local intelligence only. |
| `GET /risk/montecarlo/{ticker}` | Calls `backend/monte_carlo_study.py`, which fetches yfinance and runs a GBM study | Legacy on-demand lab only; not a monitor or certificate. |
| `POST /portfolio/risk` | Fetches yfinance for supplied weighted tickers; silently skips provider failures, renormalizes surviving weights; requires 30 overlapping closes; uses 252 | Legacy local compatibility only. Its partial-holding result is not full-portfolio evidence. |
| `GET/PUT /paper/positions` | Session-bound stored paper positions; no fabricated default book | Preserve user editing; no public holdings export. |

`backend/main.py` gates non-public API paths with session validation. Phase 7 adds a distinct `/risk-manager/*` read-only router; it neither changes nor wraps the four legacy computation endpoints. An authenticated GET must never execute a sweep, construct a registry database, discover runtime paths, or fetch providers.

## 4. Current real Issue-like evidence

The latest Data Organ issue payload contains **27 original records: 8 HIGH, 13 MEDIUM, 6 INFO**, all carrying upstream OPEN status. They are not 27 newly established current Phase 7 incidents.

The eight HIGH sources are ALFRED UNRATE (missing configured operator credential), Alpaca IEX (no admitted operator capture/public grant), yfinance (no admitted capture/public grant), NSE bhavcopy (calendar/capture absent), India VIX (publication grant absent), RBI repo and MOSPI CPI (no witnessed release import or verified grant), and India fundamentals (dataset/field coverage and permission absent). Preserve their upstream severity and exact safe explanation.

MEDIUM includes successive IIMA unsupported-calendar diagnostics and successive BLS quarantined-observation diagnostics. Latest D-health has current IIMA calendar UNAVAILABLE with `missing_sessions=null`, and BLS `quarantined=1`. Older MEDIUM records remain referenced historical evidence; their disappearance from a latest diagnostic is not an upstream resolution event. Six INFO records describe historical import/code failures for sources with later admitted evidence. They must never be promoted to current HIGH just because the original record still says OPEN.

Generation matters:

- `Service.issue()` appends `ISSUE_EVENT` with identity derived from source, kind and reason.
- `export_data_organ_replay.py` instead groups failed attempts by source/reason and publishes `id=hash([source, reason])`; severity is HIGH if no admitted source exists, otherwise INFO.
- Partial health IDs use `hash([diagnostic_id, "health"])`, so successive diagnostics produce different original IDs. Their first-seen clocks come from witnessed issue/attempt events, not observation dates.
- The exporter preserves prior evidence when runtime history is incomplete. There is no general source Issue resolution contract to assume.

Choose **B: deterministic normalization with original records retained by reference**. References alone do not solve diagnostic-revision duplication or provide one cross-category schema. Normalization must preserve every original ID, severity, first/last-seen clock and occurrence count in origin metadata. It may group compatible successive health observations into one Phase 7 incident; it must not rewrite D-issues, manufacture upstream resolutions, parse arbitrary reason strings into new diagnoses, or copy provider rows.

Use the latest checked Data Organ diagnostic to distinguish CURRENT, HISTORICAL_ONLY and UNCONFIRMED observations. Current IIMA/BLS health records join to their exact diagnostic IDs. Historical source failures with later admission appear in the history inspector at their original INFO severity. Cross-phase XNSE limitations link to this source-health incident and coverage entries instead of creating a second contradictory DATA alert.

D-disagreement retains **71 pairs, zero differences, maximum absolute delta zero**, from `2026-10-10T05:48:29.580442+00:00`. Its own text says it is a retained prior ALFRED/BLS mirror comparison whose current refresh is unavailable. This is PARTIAL monitoring: a same-upstream mirror check, not independent vendor confirmation or current market-price agreement. D-health mostly declares HISTORICAL_WINDOW; old observation ages must not be relabelled current staleness.

## 5. Current RunRegistry and research-hygiene evidence

`src/truth/run_registry.py` retains tenant-scoped sealed runs and hash-chained attempt events. `HOLDOUT_OPENED` is recorded before model access. Same-run reopen is rejected and its rejection event retained. The constructor and its read helpers open a writing SQLite transaction and initialize tables; Phase 7 readers must inspect retained JSON or an independently opened read-only database, not construct RunRegistry as a read adapter. `src/truth/ledger.py` is the older SQL analysis/forecast ledger; it does not replace the immutable run history.

The Phase 2 snapshot has three runs and three witnessed openings, one per run, sharing one family. Two retained runs already contain a HIGH `REPEATED_HOLDOUT_OPENING` engineering warning with the same original warning ID. Preserve that fact in the SYNTHETIC_TEST_ONLY partition. Do not erase the upstream warning, invent a CRITICAL real-research violation, or assert that a different registered run was an illegal same-run reopen.

Original Research OS flagship has 139 attempts/events: one FREEZE plus 46 START, 46 HOLDOUT_OPEN and 46 SUCCESS events; `holdout_openings=46`. Its preregistered family has 46 named correlated US/India trial slots, HOLM/BH correction declarations and `independent_trials=null`, with an explicit dependence disclosure. The later **repeatability artifact separately records 48 total openings**. These are different historical scopes. Preserve both; never replace the flagship's 46 with 48 or claim that 46 is the complete later history.

Research OS registry provides immutable objects, transactional attempt chains, preregistration and freeze bindings. Original gate remains NOT_CALIBRATED / CLOSED; the replacement summary is NOT_CONFIRMED and denies engine and market-replication authorization. Phase 6 claim-readiness stages are metadata assertions, not PASS/SURVIVED/alpha certificates. These are strong monitoring inputs for required bindings, family completeness, chronology and claims. A closed gate faithfully disclosed is a boundary, not misconduct.

Historical counts are informational. A finding requires a breached registered rule: unbound/early holdout access, missing required preregistration, missing included trial slots in a claimed correction, or a publication asserting certification/alpha despite closed gates or false flags. Rejected reopen attempts are not successful extra openings.

## 6. Current model-risk evidence

Retained Phase 5 model snapshots and their matching lineage can support these descriptive checks today:

- HMM convergence: stored `converged`, iteration count, and `|last likelihood change| < 0.01`; reaching the 100-iteration cap alone is not convergence.
- State occupancy: stored shares/counts and retained policy's share `<0.05` or count `<30`.
- Instability: retained `recent_switches >5` in a 20-observation window.
- OOD: retained `ood` and squared Mahalanobis distances versus stored chi-square limit at quantile 0.999; do not recompute features or fit parameters.
- GARCH: retained convergence, fit_status, identification/domain and half-life validity; asymptotic diagnostics only.
- Model/input age: retained observation clock compared with an explicit evidence evaluation cutoff under the 45/120-calendar-day policy.
- Missing modules and lineage: actual module_statuses and sealed producer/source joins.

At the latest two-country cutoff, all four HMM fits are converged and `ood=false`; recent switches are US HMM2=0, US HMM4=3, India HMM2=0, India HMM4=0. State occupancies exceed the retained minima. Both GARCH fits are CONVERGED with VALID half-life domains. Do not invent current convergence/OOD alerts. India already has HIGH STALE_INPUT and MEDIUM CALENDAR_UNAVAILABLE evidence; US is below the stale threshold at the retained cutoff.

HMM paths explicitly say PARAMETER_RETROSPECTIVE: parameters were estimated through the cutoff. Filtered recursion does not make the historical path as-known-then. HMM posterior and volatility window-sufficiency confidence remain uncalibrated. India quantities are per observation, not fabricated XNSE sessions.

**PSI/KS: UNAVAILABLE today.** Stored declarations, fitted means/covariances, posterior tails and available series do not establish a reviewed, non-overlapping training/reference versus current comparison distribution contract, feature semantics, sampling/dependence policy and PIT chronology. No general retained PSI/KS diagnostic or distribution-monitoring contract was found in the inspected namespaces. Do not create reference distributions from a full-window fit or apply two-sample tests indiscriminately to computation/event plugins.

**Calibration drift: UNAVAILABLE today.** No admitted matched prediction/outcome stream, baseline calibration certificate, target/horizon contract and comparable current window exists for these model panels. Research OS calibration studies assess inference methods; their closed outcomes do not calibrate HMM posteriors. Preserve their results without executing new calibration.

**Abstention compliance: PARTIAL.** Existing OOD can justify a visible diagnostic boundary and suppression of unsupported predictive claims. There is no retained production consumer decision/abstention receipt proving compliance. Show the compliance check UNAVAILABLE; do not claim the whole manifold is supported because `ood=false`.

## 7. Current portfolio-risk evidence

Public Replay has no authenticated portfolio, immutable holdings contract, book cash/NAV receipt, security quote-coverage receipt or matched daily portfolio return contract. Public derived market series and market-factor regimes cannot be substituted for those inputs. Therefore public real VaR/CVaR, concentration, portfolio factor exposure, liquidity and quoted-mark coverage are all UNAVAILABLE for the portfolio scope.

Do **not** seed public US/India example portfolios in v0.1. Their additional position, price-permission, calendar, weighting, FX, mark-coverage and result contracts would enlarge the milestone while adding no real user protection. Keep their future evidence class reserved. An approved later example must explicitly identify EXAMPLE_PORTFOLIO, publish derived outputs only, exclude unquoted positions with coverage Issues, and never appear in the real issue count.

Reusable calculation code is limited:

| Component | What exists | Reuse boundary |
| --- | --- | --- |
| `src/risk/var_cvar.py` | Historical quantile/tail mean; Gaussian mean/std tails; MC quantile wrappers; decimal return losses clamped nonnegative | Future pure numerical building blocks only, behind a new validated input/result contract. No call from a Phase 7 sweep. |
| `tests/test_var_cvar.py` | Positivity and CVaR≥VaR checks on a small example | Does not prove mark coverage, PIT, confidence validation, finite-input behavior, horizon/calendar or portfolio semantics. |
| `finsight.plugins.engines.MonteCarloVaR` | Development-fit mean/std, fixed seed GBM, unit notional one-session result | Existing plugin code, not a retained real portfolio result. No execution authorized. |
| `book.ts` | Priced paper positions, proxy vol/correlation, seeded Student-t/normal scenario tails | Local model estimate only. The HISTORICAL label must change to a proxy-scenario label. |
| `risk_summary.py` | 15%/30% annual-volatility buckets; old VaR/CVaR placeholders | Legacy summary; neither Issue policy nor a Phase 7 estimator. |

For any future admitted VaR result, require horizon and unit, confidence, exact method/quantile convention, immutable return and quoted-mark evidence, observation window, weighting/rebalancing and currency assumptions, covariance/return assumptions, priced/excluded-position counts, valuation basis and unavailable positions. No certification badge. No silent square-root-time scaling. India needs actual session evidence before any session horizon or annualization.

Existing Phase 6 four ELIGIBLE_RETAINED channels are views of a MOM-on-MKT/SMB/HML assessment, not security-level holdings betas. Reuse its original evidence as context only. Portfolio weighting or new regression is unavailable. Concentration requires explicit positions and a denominator contract; liquidity requires admitted spreads/depth/participation or another reviewed contract, not inferred volume.

## 8. Current simulator-disagreement evidence

There is more than just execution code. Forge v0.2.4's sealed artifact contains **23 comparisons: 22 PASS and one intentional NOT_COMPARABLE** (`QUEUE_MODEL_NOT_IN_COMMON_CAPABILITY_SET`). Its certification summary is MIXED: VectorBT and Nautilus reached C4 for their declared scopes; hftbacktest and legacy HFT remain C0 with failed certification evidence. These are actual retained engineering outcomes on synthetic semantic tapes.

Reality Ladder v0.2.4.1 uses deterministic synthetic regimes, fixed seeds and a fixed dual moving-average strategy. Shared L1/L2 assumptions agree; later costs, latency and stress checkpoints deliberately use different assumptions. Their differences are not unexplained simulator disagreement.

Plan real market/portfolio simulator monitoring as **UNAVAILABLE / DEFERRED_PHASE9**. An optional history reference may show the existing synthetic comparison statuses and capability scope in RETAINED_SYNTHETIC, outside real counts. Do not copy tapes, fills or raw execution traces into public risk artifacts, and do not run engines, replay workers or a certification campaign. A source file mentioning comparison tolerances does not establish a current real-strategy comparison contract.

## 9. Availability matrix for every roadmap check

AVAILABLE means retained inputs permit the stated bounded rule now, not that a Phase 7 implementation already exists. PARTIAL identifies its measured scope and exact remaining gap. UNAVAILABLE is always explicit, with null measures; it is never counted as a clear check.

| Roadmap check | Public v0.1 availability | Retained input / precise limitation | Planned result |
| --- | --- | --- | --- |
| Portfolio VaR | UNAVAILABLE | No portfolio/quoted marks/aligned return contract | NO_PORTFOLIO_CONTRACT |
| Portfolio CVaR | UNAVAILABLE | Same; legacy numerical code alone is insufficient | NO_PORTFOLIO_CONTRACT |
| Concentration | UNAVAILABLE | No public explicit holdings/denominator | HOLDINGS_CONTRACT_ABSENT |
| Portfolio factor exposures | UNAVAILABLE | Retained MOM regression has no security-to-position mapping | SECURITY_FACTOR_MAPPING_ABSENT |
| Liquidity | UNAVAILABLE | No licensed book-level liquidity/input/threshold contract | LIQUIDITY_EVIDENCE_ABSENT |
| Quoted marks only / unpriced coverage | UNAVAILABLE publicly; PARTIAL local lab | Base browser excludes unmarked holdings; no immutable quote provenance/expiry; modelled hedges are not quotes | PUBLIC_BOOK_ABSENT; local coverage warning |
| PSI | UNAVAILABLE | Reference/current distributions, bins, compatible feature and chronology contract absent | DRIFT_REFERENCE_CONTRACT_ABSENT |
| KS | UNAVAILABLE | Comparable samples and dependence/eligibility contract absent | DRIFT_COMPARISON_CONTRACT_ABSENT |
| Calibration drift | UNAVAILABLE | No independently supported baseline/current outcome calibration | CALIBRATION_REFERENCE_ABSENT |
| OOD inputs | PARTIAL | Real retained HMM-only OOD diagnostics; no live stream/general plugin manifold | Evaluate retained HMM flags; disclose scope |
| Abstain outside supported manifold | PARTIAL | OOD boundary exists; consumer decision/abstention receipts absent | Show diagnostic boundary + compliance UNAVAILABLE |
| Regime change/instability | PARTIAL | Retained switches/occupancy, parameter-retrospective paths | Diagnose retained windows only; no prospective detector claim |
| Model convergence/domain | AVAILABLE within retained HMM/GARCH scopes | Stored fit and domain flags + verified lineage | Exact rules, currently clear at latest cutoff |
| Model staleness | AVAILABLE at pinned evaluation cutoff | Stored state_at; inherited 45/120 day policy | India stale; clocks displayed |
| Data staleness | PARTIAL | Data Organ freshness_status and clocks; most windows HISTORICAL_WINDOW | Preserve classification; no new raw-data health interpretation |
| Data gaps | PARTIAL | US factor missing_sessions=0; India calendar absent; macro sessions not applicable | US retained gap check measured; India UNAVAILABLE |
| Provider disagreement | PARTIAL | Retained 71-pair ALFRED/BLS mirror, current refresh unavailable | Descriptive mirror only; market-price disagreement UNAVAILABLE |
| Source/capture/grant health | AVAILABLE as derived monitoring | Existing HIGH/MEDIUM/INFO issue records | Normalize and retain origin severity |
| Holdout-opening hygiene | AVAILABLE for closed histories; PARTIAL globally | Verified Phase 2 and Research OS records; no universal private registry export | Contract checks + exact historical totals |
| Tests in each family | AVAILABLE for frozen Research OS; PARTIAL across plugins | Explicit 46 trial IDs; Phase 2 family/openings; no universal correction family | Count declared slots including unavailable results; never invent independent count |
| Unpreregistered claims | AVAILABLE for required frozen bindings; PARTIAL globally | Preregistration, freeze, results, claims and Phase 6 ledger | Require violations of a declared obligation |
| Simulator disagreement | UNAVAILABLE for real strategies | Only retained synthetic semantic comparisons | DEFERRED_PHASE9; separate historical reference |
| Sweep/lineage/publication integrity | AVAILABLE as an engineering contract audit | Immutable artifact and receipt bytes, source/grant bindings | Fail closed; preserve last valid feed |

## 10. Proposed canonical Issue schema

Use closed, recursively validated Python and TypeScript schemas: `risk-issue/1`, `risk-observation/1`, `risk-coverage/1`, `risk-state/1`, `risk-sweep/1`, `risk-policy/1`. Reject unknown fields, coercion of booleans to integers, duplicate JSON keys, NaN/Infinity, invalid clocks and arbitrary selectors. Dates are UTC ISO-8601 with explicit timezone; rendering may show the user's timezone with a UTC inspector value.

Exact enums:

| Type | Values |
| --- | --- |
| Category | PORTFOLIO, MODEL, DATA, RESEARCH_HYGIENE, SIMULATOR, SYSTEM |
| Severity | CRITICAL, HIGH, MEDIUM, LOW, INFO |
| Issue status | OPEN, RESOLVED |
| Observation currency | CURRENT, HISTORICAL_ONLY, UNCONFIRMED |
| Availability | AVAILABLE, PARTIAL, UNAVAILABLE |
| Rule outcome | CLEAR, FINDING, NOT_EVALUATED |
| Transition | NEW, UNCHANGED, UPDATED, RESOLVED |
| Sweep status | SUCCEEDED, PARTIAL, FAILED |
| Scope kind | PUBLIC_PLATFORM, MODEL, SOURCE, RESEARCH_FAMILY, PORTFOLIO, SIMULATOR_COMPARISON |
| Country | US, INDIA, CROSS_MARKET, NONE |
| Evidence class | REAL_RETAINED, LOCAL_REAL, LOCAL_PAPER_BOOK, LOCAL_MODEL_ESTIMATE, EXAMPLE_PORTFOLIO, RETAINED_SYNTHETIC, SYNTHETIC_TEST_ONLY, UNAVAILABLE |
| Source clock quality | PUBLICATION_TIMESTAMP, RECEIVE_TIMESTAMP_CAPTURED, CONSERVATIVE_MARKET_TIME, CONSERVATIVE_VINTAGE_DAY, CAPTURE_ONLY, NOT_APPLICABLE, UNAVAILABLE |
| Remediation state | REQUIRED, BLOCKED_EXTERNAL, DEFERRED, INFORMATIONAL |

Every Issue has exactly these fields:

| Field | Contract |
| --- | --- |
| `schema_version`, `issue_id`, `rule_id`, `rule_version` | Literal schema; stable `risk-issue:<sha256>`; reviewed rule name and semantic version |
| `category`, `severity`, `status`, `currency`, `availability`, `evidence_class` | Exact enums above |
| `scope` | Closed object `{kind, subject_id, evidence_family, stable_scope_key}`; no user-private identifier publicly |
| `country`, `asset`, `model` | Country enum; nullable reviewed asset/model IDs. Public model assets are US-MKT/IN-MKT, not ticker substitutions |
| `title`, `reason_code`, `reason` | Reviewed bounded strings; title ≤120 characters, reason ≤600; reason_code is a rule-specific enum |
| `first_seen_at`, `first_seen_ref` | Actual first Phase 7 witnessed detection time and immutable observation/attempt identity |
| `evidence_at`, `evidence_cutoff` | Latest triggering evidence clock, nullable only for missing evidence; pinned admissibility cutoff |
| `resolved_at`, `resolution_ref` | Both null while OPEN; witnessed resolution time and positive clearing observation when RESOLVED |
| `occurrences`, `observation_ids` | Count of distinct triggering observation fingerprints, not sweeps; bounded immutable observation references |
| `evidence_refs` | Closed EvidenceRef array; at least one policy/coverage proof for missing-evidence Issues, real evidence otherwise |
| `source_quality` | Closed `{clock_quality, lineage_status, permission_status, limitation_codes}`; lineage VERIFIED/PARTIAL/UNAVAILABLE/INVALID, permission DERIVED_ALLOWED/METADATA_ONLY/LOCAL_ONLY/UNAVAILABLE |
| `remediation` | Closed `{state, requirement_code, text, evidence_required}`; no execution command or automatic remediation action |
| `claim_flags` | Exactly six literal false booleans listed in section 14 |
| `origin_records` | Bounded references to original Issue IDs with exact original severity/status/first_seen_at/last_seen_at/occurrences; original timestamps are nullable where upstream never retained them |
| `last_observation_id`, `policy_sha256` | Current immutable observation reference and the policy used for this revision |

EvidenceRef is a discriminated closed union. REPLAY_ARTIFACT binds `{type, artifact_id, kind, sha256, bytes, as_of, available_at, selector_id, source_ids, run_id}`. FROZEN_FILE binds `{type, commit, path_id, sha256, bytes, selector_id, assertion_id}`. RISK_OBSERVATION binds its content ID and containing sweep. POLICY_ASSERTION binds policy hash and check_id. `path_id` and `selector_id` resolve through reviewed maps; the browser/server never accept filesystem paths, URLs or JSON pointers from query strings. Run IDs are null only when the evidence type has no run.

An Observation records identity tuple, outcome, currency, evidence_refs, evidence_at/cutoff, witnessed_at, policy hash, fingerprint and previous-observation reference. It contains only rule-specific whitelisted assertions, not an arbitrary `details` dictionary. The Issue is its reduced current view, not an editable ticket.

A Coverage record has `{check_id, category, scope, availability, outcome, reason_code, reason, evidence_class, evaluated_at, evidence_at, evidence_refs, remediation}`. All planned checks must appear, including unmeasured checks. Not-evaluated coverage produces a typed availability Issue under R-COVERAGE; it does not masquerade as a measured risk breach.

## 11. Issue lifecycle and reducer semantics

The reducer is pure: previous sealed state + ordered observations + reviewed policy → new state and transitions. It does not fetch or execute anything. Ordering is stable by identity tuple and observation fingerprint, not arrival order or severity color.

| Prior state / new observation | Transition | Required behavior |
| --- | --- | --- |
| No Issue; supported finding or explicit availability gap | NEW | OPEN; first_seen_at is this real detection clock; occurrences=1 for its first distinct triggering observation. |
| Same condition and same observation fingerprint | UNCHANGED | Preserve all Issue fields and occurrence count; no new publication merely because the clock ticked. |
| Same identity, genuinely revised supporting evidence or changed supported severity | UPDATED | Append observation, preserve first_seen; increment occurrences once for a new triggering observation. |
| OPEN; complete, compatible, changed evidence proves predicate false | RESOLVED | Append positive clearing observation; set resolved_at to detection time and resolution_ref; retain old observations. |
| RESOLVED; compatible new evidence triggers again | UPDATED | Reopen the same identity; resolved_at/resolution_ref become null in current view, old resolution remains history; preserve original first_seen. |
| Source or rule unavailable after a prior finding | UNCHANGED for incident; coverage/failure may update separately | Keep prior Issue OPEN and flagged unconfirmed in the display overlay. Absence is never clearing evidence. |
| Policy change alone would clear an incident | UPDATED, not RESOLVED | Record policy-reclassification limitation; do not claim actual evidence improved. Resolution remains unproven until changed compatible evidence clears it. |
| Failed global sweep/publication | No successful clearing transitions | Retain last valid state; publish/retain failure receipt and SYSTEM Issue if safe; show failure prominently. |

Observation fingerprints exclude witness/publication timestamps and unrelated manifest changes. Resolution requires successful evaluation of the **same subject, evidence family, rule semantics and complete required inputs**, with different relevant evidence and the clearing predicate recorded. Merely omitting an old Issue, withdrawing its evidence, changing a selector, losing permission or returning an empty list cannot resolve it.

Data Organ historical OPEN records keep their original OPEN status in origin metadata. Phase 7 may mark their observational currency HISTORICAL_ONLY; that is not a fabricated resolution. A current source-health incident may resolve only from a later complete matching diagnostic with no triggering condition, even if old source Issues remain in an append-only history. Failed or incomplete newer diagnostics cannot do so.

There are no ACKNOWLEDGED/SNOOZED/MUTED server states in v0.1. View filters are presentation preferences and cannot remove Issues or alter scientific evidence. No fake imported Phase 7 transitions are created for October 9–12; history begins with the actual first sweep and offers separately labelled upstream history.

## 12. Exact rule catalogue

Policy location proposed: `eval/risk_manager/v0.1/policy.json`. Each rule entry records rule/semantic version, required check IDs, selector IDs, subject/family scheme, predicate, unit, inherited-policy reference, severity mapping, publication mode, remediation and limitations. Null statistical thresholds mean **evaluation disabled**, not a threshold to fill later from observed results.

Catalogue notation: **P** = safe derived metadata allowed after original grants/bindings validate; **L** = authenticated local only; **H** = synthetic history outside real counts. All rules use their inputs' available_at ≤ the pinned evidence cutoff. All first-seen timestamps are witnessed detection timestamps. No rule below authorizes scientific computation.

### Data rules

| Rule ID | Exact input and policy/predicate; units | Availability / severity / permission | Remediation and limitations |
| --- | --- | --- | --- |
| R-DATA-ATTEMPT/1 | D-issues SOURCE_ATTEMPT_FAILED joined to D-coverage by exact source; reference original failure events. Normalize existing status/severity, rather than recreating the exporter policy. Unit: issue/event count | AVAILABLE; inherited HIGH/INFO; P metadata | Witness required capture, operator configuration or reviewed grant under Data Organ. Admission may change current applicability; no arbitrary reason-text escalation. |
| R-DATA-HEALTH/1 | D-issues PARTIAL_SOURCE_HEALTH joined by diagnostic_id to D-health; group revisions by source + stable analysis window + health family. Unit: quarantine count/calendar status | AVAILABLE for source limitations; inherited MEDIUM; P | Correct input admission/quarantine or provide official calendar evidence externally. Preserve historical diagnostics; do not count each revision as a new incident. |
| R-DATA-FRESHNESS/1 | D-health freshness_status; raise only when upstream status is STALE. Preserve historical/unknown classification. Upstream health profile: daily age >7 days; BLS_U3 >65 days, at capture age_reference. Unit: calendar seconds/days | PARTIAL; MEDIUM for explicit STALE; P | New admitted source evidence under Data Organ; HISTORICAL_WINDOW is not current staleness. No wall-clock recasting or stronger local threshold. |
| R-DATA-GAPS/1 | D-health missing_sessions >0 only when calendar_status=AVAILABLE, exact window/source/calendar bound. Unit: missing evidenced sessions | PARTIAL; MEDIUM; P | Supply complete admitted window or explain known omission in reviewed source policy. Calendar absent means NOT_EVALUATED, not zero; macro NOT_APPLICABLE is disclosed, not missing exchange sessions. |
| R-DATA-MIRROR/1 | D-disagreement summary `different >0`, whose existing difference predicate is absolute delta >1e-12 on compatible exact vintages; current summary is already projected, so no recomputation. Unit: pairs; original source-native delta | PARTIAL; LOW descriptive discrepancy; P | Investigate source/vintage mismatch via Data Organ. Same BLS upstream, retained October 10 comparison, not independent confirmation. Public market-price comparison remains unavailable. |

XNSE absence is represented by existing R-DATA-HEALTH and model coverage references, not a duplicate Phase 7 source interpretation. Robust MAD counts, jumps and non-monotonic capture order stay source diagnostics unless an upstream reviewed rule actually makes them Issues; do not invent HIGH economic anomalies from their counts.

### Model rules

| Rule ID | Exact input and policy/predicate; units | Availability / severity / permission | Remediation and limitations |
| --- | --- | --- | --- |
| R-MODEL-HMM-CONVERGENCE/1 | M-US/M-IN `/payload/hmm/{hmm2,hmm4}/converged` plus matching L-US/L-IN module run. False triggers; require retained convergence_rule. Unit: boolean/iterations | AVAILABLE in four retained fits; MEDIUM inherited; P | Separately reviewed model repair/research; F3 cannot refit. All current fits clear. No cap-as-convergence shortcut. |
| R-MODEL-OCCUPANCY/1 | Same HMM block occupancy and occupancy_counts; any state share <0.05 OR count <30; inherit profile. Unit: share and observations | AVAILABLE within retained fits; LOW; P | Review state identification separately. Short/uneven states are a descriptive limitation, not calibrated failure probability. |
| R-MODEL-INSTABILITY/1 | Same HMM recent_switches >5 and switch_window=20; exact retained profile/run. Unit: transitions per 20 observations | AVAILABLE as retained diagnostic; MEDIUM; P | Review model/window evidence separately. Retrospective fitted path, not prospective regime-change certification. |
| R-MODEL-OOD/1 | Same HMM `ood=true`, joined to retained ood_limit and current distances; retain q=0.999 and feature dimension. Unit: squared standardized distance | PARTIAL, HMM only; LOW inherited; P | Mark supported-manifold diagnostic exceeded, suppress unsupported predictive use; separate admission/abstention evidence needed. No new feature calculations or posterior calibration. |
| R-MODEL-GARCH-CONVERGENCE/1 | M-US/M-IN `/payload/volatility/garch`: fit_status=UNCONVERGED or converged=false, matching volatility run. Unit: boolean | AVAILABLE; LOW inherited from `src/regimes/plugins.py`; P | Separate optimizer/model review; no reruns. Read original status, not optimizer success text alone; do not upgrade the original LOW warning to the HMM MEDIUM policy. |
| R-MODEL-GARCH-DOMAIN/1 | Same block fit_status in BOUNDARY/UNIDENTIFIED or half_life_domain invalid. Inherited BOUNDARY=1e-4; identification rule alpha−1.96×robust SE>0, persistence domain (0,1); read stored outcome. Unit: status | AVAILABLE; LOW for boundary/identification limitations; P | Keep invalid half-life absent. Asymptotic identification diagnostic is not a hypothesis-test certificate. |
| R-MODEL-AGE/1 | M-US/M-IN state_at and pinned evaluation cutoff; age=(cutoff−state_at)/86400. >120 HIGH; >45 and ≤120 MEDIUM; ≤45 CLEAR. Unit: calendar days, no rounding before comparison | AVAILABLE; inherited thresholds; P | New retained evidence through an independently approved source/model workflow. No Phase 5 refresh from sweep. Old source age at its original cutoff remains visible. |
| R-MODEL-LINEAGE/1 | Snapshot run_ids + matching lineage module/source/producer/profile hashes and cutoff joins; a required join INVALID triggers | AVAILABLE structural audit; CRITICAL for substituted evidence; P safe metadata | Restore exact immutable binding or withdraw unsafe new publication. Missing permitted source is coverage, not automatically corruption. |
| R-MODEL-ABSTENTION/1 | Required retained consumer decision receipt vs OOD/manifold contract; violation only if declared unsupported use occurred | UNAVAILABLE now; threshold=null; proposed HIGH for evidenced hard breach; P metadata | Need a reviewed decision/abstention contract and retained receipts. No automatic trading or execution action. |
| R-MODEL-PSI/1 | Required immutable reference/current feature-distribution contract, bins, sufficient samples, PIT cutoff and task applicability | UNAVAILABLE; threshold=null; no numerical severity authorized; P absence metadata | Separate preregistered monitoring design and retained inputs; F3 must not create distributions or new runs. |
| R-MODEL-KS/1 | Required compatible independent/dependence-aware reference/current samples with eligible task and chronology | UNAVAILABLE; threshold=null; no numerical severity authorized; P absence metadata | Same evidence/design gap; computation adapters are not automatically eligible. |
| R-MODEL-CALIBRATION/1 | Required certified baseline, prediction/outcome/horizon identity, comparison window and sample policy | UNAVAILABLE; threshold=null; no drift severity authorized; P absence metadata | Independent calibration evidence would need separate approval; HMM posteriors and Research OS inference trials do not satisfy it. |

For R-MODEL-AGE the initial evaluation cutoff is the consumed evidence bundle's authoritative cutoff (latest selected published source cutoff), not the operator's wall clock. Comparing clocks is a risk rule, not a model rerun. At the canonical October 13 cutoff US remains below 45 days; India exceeds 120. Later calendar-time-only sweeps require an explicit versioned evaluation epoch; v0.1 does not silently change identity each day.

### Research-hygiene rules

| Rule ID | Exact input and policy/predicate; units | Availability / severity / permission | Remediation and limitations |
| --- | --- | --- | --- |
| R-RESEARCH-OPENING/1 | Phase 2 registry events/runs; Research OS flagship/repeatability attempts, preregistration and freeze receipts. Trigger actual successful access outside its bound frozen contract, before permitted chronology, or prohibited same-run reopening. Unit: authorized access events | AVAILABLE for frozen scopes; HIGH hard breach; P real research metadata, H for SDK fixture scope | Restore audit/binding or withdraw unsupported downstream claim; never erase opening. 3/46/48 totals alone do not trigger. Rejected access is not an opening. |
| R-RESEARCH-FAMILY/1 | Research OS preregistration `/family/trial_ids` joined to every retained result slot/attempt; claimed correction missing a declared slot or omitting failed/unavailable trials triggers. Unit: declared and accounted test counts | AVAILABLE for Research OS; HIGH when correction claims incomplete family; P | Supply complete retained accounting, or remove corrected claim. Independent_trials=null remains a disclosed limitation, not a guessed count or automatic breach. |
| R-RESEARCH-PREREG/1 | Result run preregistration/freeze bindings and required contract map. Trigger a claimed confirmatory/registered result lacking a required binding or whose freeze follows its outcome. Unit: hashes/clocks/boolean | AVAILABLE for declared frozen scopes; HIGH; P | Provide witnessed pre-outcome contract or withdraw confirmatory claim; retrospective registration does not repair chronology. Descriptive computations have no invented preregistration obligation. |
| R-RESEARCH-GATE/1 | Flagship calibration_status, replacement summary, Phase 6 ledger and explicitly listed publication claim assertions. Trigger certification/engine-authorized claim contradicting CLOSED/NOT_CONFIRMED or its required certificate. Unit: claim boolean/status | AVAILABLE; HIGH hard breach; P | Correct new claim/publication and retain violation history. Faithfully disclosed closed gate produces coverage/boundary information, not a violation. |
| R-RESEARCH-CLAIMS/1 | Exact six-flag map from checked publications and reviewed claim assertion fields; true flag or asserted alpha/causal/trusted-graph/precise-edge claim without its required authority | AVAILABLE for enumerated artifacts; CRITICAL if unsafe Phase 7 publication crosses invariant, HIGH for an evidenced external contract breach; P | Block Phase 7 publication; preserve prior false flags and offending hash. No keyword scan treating a title or quoted historical claim as a scientific assertion. |
| R-RESEARCH-FIXTURE-WARNING/1 | Exact two original repeated-family warnings in the sealed Phase 2 synthetic registry; original severity/status/IDs | AVAILABLE historical engineering evidence; inherited HIGH; H only | Disclose repeated fixture access limitation; do not escalate or count as real alpha/research violation. |

### Portfolio, simulator and system rules

| Rule ID | Exact input and policy/predicate; units | Availability / severity / permission | Remediation and limitations |
| --- | --- | --- | --- |
| R-PORTFOLIO-MARKS/1 | An explicitly bound book + quote-coverage receipt; any nonzero position without eligible quoted mark produces coverage Issue; excluded from valuation. Unit: position count | Public UNAVAILABLE; local PARTIAL; MEDIUM coverage; L | Need source/observation/receipt provenance and quoted status. No entry/reference/modelled price substitution; missing cash means NAV unavailable. |
| R-PORTFOLIO-VAR/1 | Required sealed holdings, marks, returns, method/horizon/confidence/window/result contract | UNAVAILABLE; limit=null; no breach severity enabled; P absence only | Admit contract separately; never call legacy API or MC plugin from sweep. |
| R-PORTFOLIO-CVAR/1 | Same, with tail convention and priced-subset/excluded positions disclosed | UNAVAILABLE; limit=null; P absence only | Same; no fake zero tail risk. |
| R-PORTFOLIO-CONCENTRATION/1 | Required actual/example positions, quoted valuation and reviewed concentration denominator/limit | UNAVAILABLE; limit=null; P absence only | No import of browser's 35%/25% limits. Local descriptive concentration stays an estimate until its policy is reviewed. |
| R-PORTFOLIO-FACTORS/1 | Required security mapping and holdings weighting contract; Phase 6 eligible retained references are context, not substitutes | UNAVAILABLE; limit=null; P absence only | Separate mapping/research authorization; no new regression. |
| R-PORTFOLIO-LIQUIDITY/1 | Required source/clock/permission-bound liquidity measure and trading-size policy | UNAVAILABLE; limit=null; P absence only | No volume-only inference, arbitrary liquidation horizon or new provider fetch. |
| R-SIMULATOR-DISAGREEMENT/1 | Required sealed same-strategy/tape/cutoff/assumption comparison with capability intersection, engine fingerprints and contracted per-metric tolerances | Real UNAVAILABLE / DEFERRED_PHASE9; tolerance=null; P absence | No engines run. NOT_COMPARABLE is not disagreement; differing L1/L4 assumptions cannot be compared as matched execution. |
| R-SIMULATOR-HISTORY/1 | Frozen Forge certification `/comparisons` and per-engine verdict assertions; status differing from expected_status would be an engineering finding | AVAILABLE synthetic history; H, outside real counts | Reference original contract verdicts only. Preserve 22 PASS, intentional NOT_COMPARABLE and failed engine certifications; no new tolerance or market claim. |
| R-SYSTEM-INTEGRITY/1 | All consumed artifact/receipt/schema/hash/byte/source/permission/cutoff joins plus prior state chain; any invariant mismatch | AVAILABLE; CRITICAL for corruption/substitution; P sanitized metadata | Stop publication; retain failure evidence and last valid state. No permissive fallback. |
| R-SYSTEM-SWEEP/1 | Actual read/evaluation/publication attempt receipt; FAILED or required-reader failure triggers, not an empty issue count. Unit: failed attempt/state | AVAILABLE once implemented; HIGH operational failure, CRITICAL only with proven integrity breach; P sanitized metadata | Repair missing reader/publication dependency and rerun manual sweep; never clear prior Issues from failure. |
| R-COVERAGE/1 | One coverage slot per required catalogue check/subject; availability UNAVAILABLE or PARTIAL creates/updates an explicit gap Issue where not already represented by an upstream incident | AVAILABLE as coverage accounting; INFO for intentionally unsupported/deferred checks; inherit upstream severity for an already evidenced condition; P | Exact missing-evidence contract and unblock requirement. No second alert for the same upstream source-health condition. Gap count is separate from measured real breach count. |

R-COVERAGE is category-specific through the check's category and stable scope; it does not force all absent checks into SYSTEM. Unavailable PSI/KS/calibration/portfolio/simulator rules are disabled numerical evaluators with explicit coverage outputs, not future numerical implementations hidden in this plan. No thresholds are learned from current outputs.

### Closed reason-code inventory

The following is the complete proposed finding/gap reason-code enum. A rule may emit only its assigned codes; explanatory text cannot create an additional code or severity. CLEAR observations use `reason_code=null`; Issues never do.

| Rule / scope | Permitted reason codes |
| --- | --- |
| R-DATA-ATTEMPT | SOURCE_ATTEMPT_FAILED, UNKNOWN_ORIGIN |
| R-DATA-HEALTH | PARTIAL_SOURCE_HEALTH, UNKNOWN_ORIGIN |
| R-DATA-FRESHNESS / GAPS / MIRROR | SOURCE_STALE, EVIDENCED_SESSION_GAPS, MIRROR_DISCREPANCY |
| R-MODEL-HMM-CONVERGENCE / OCCUPANCY / INSTABILITY / OOD | HMM_UNCONVERGED, LOW_STATE_OCCUPANCY, REGIME_INSTABILITY, MODEL_OOD_DIAGNOSTIC |
| R-MODEL-GARCH-CONVERGENCE / DOMAIN / AGE / LINEAGE | GARCH_UNCONVERGED, GARCH_BOUNDARY, GARCH_UNIDENTIFIED, GARCH_INVALID_DOMAIN, STALE_INPUT, INPUT_LINEAGE_INVALID |
| R-MODEL-ABSTENTION | UNSUPPORTED_MANIFOLD_USE |
| R-RESEARCH-OPENING | HOLDOUT_CONTRACT_BREACH, HOLDOUT_CHRONOLOGY_BREACH, PROHIBITED_HOLDOUT_REOPEN |
| R-RESEARCH-FAMILY / PREREG | INCOMPLETE_CORRECTION_FAMILY, REQUIRED_PREREGISTRATION_ABSENT, PREREGISTRATION_BINDING_INVALID, PREREGISTRATION_AFTER_OUTCOME |
| R-RESEARCH-GATE / CLAIMS | CLOSED_GATE_CLAIM, CLAIM_AUTHORITY_ABSENT, SCIENTIFIC_FLAG_PROMOTION |
| R-RESEARCH-FIXTURE-WARNING | REPEATED_HOLDOUT_OPENING |
| R-PORTFOLIO-MARKS | UNPRICED_POSITION, QUOTE_PROVENANCE_ABSENT, QUOTE_COVERAGE_LOST, MODELLED_VALUE_USED_AS_QUOTE |
| R-SIMULATOR-DISAGREEMENT / HISTORY | CONTRACTED_SIMULATOR_DISAGREEMENT, HISTORICAL_ENGINE_VERDICT_MISMATCH |
| R-SYSTEM-INTEGRITY / SWEEP | ARTIFACT_INTEGRITY_BREACH, HISTORY_CHAIN_INVALID, PUBLICATION_PERMISSION_INVALID, PUBLICATION_SCHEMA_INVALID, REQUIRED_READER_FAILED, RULE_EVALUATION_FAILED, PUBLICATION_FAILED |
| R-COVERAGE: public portfolio | NO_PORTFOLIO_CONTRACT, PUBLIC_BOOK_ABSENT, HOLDINGS_CONTRACT_ABSENT, SECURITY_FACTOR_MAPPING_ABSENT, LIQUIDITY_EVIDENCE_ABSENT, QUOTE_PROVENANCE_ABSENT, NAV_CASH_EVIDENCE_ABSENT |
| R-COVERAGE: models | DRIFT_REFERENCE_CONTRACT_ABSENT, DRIFT_COMPARISON_CONTRACT_ABSENT, DRIFT_TASK_UNSUPPORTED, CALIBRATION_REFERENCE_ABSENT, ABSTENTION_RECEIPTS_ABSENT, MODEL_DIAGNOSTIC_ABSENT, INSUFFICIENT_SAMPLE_EVIDENCE |
| R-COVERAGE: data | CALENDAR_UNAVAILABLE, CURRENT_COMPARISON_UNAVAILABLE, INDEPENDENT_PROVIDER_COMPARISON_ABSENT, HISTORICAL_WINDOW_ONLY, SOURCE_SCHEMA_UNSUPPORTED |
| R-COVERAGE: research / simulators / system | REQUIRED_RESEARCH_HISTORY_ABSENT, FAMILY_CONTRACT_ABSENT, DEFERRED_PHASE9, SYNTHETIC_COMPARISON_ONLY, NO_SUCCESSFUL_SWEEP, REQUIRED_READER_FAILED |

R-MODEL-PSI/KS/CALIBRATION and the unavailable portfolio evaluators emit no numerical finding code in v0.1; only their R-COVERAGE codes are enabled. Unexpected input schema/code is a reader failure with a retained safe reason, not a newly invented finding. Remediation `requirement_code` equals the assigned reason code; `evidence_required` contains a closed list of reviewed evidence-map/check identifiers.

## 13. Severity policy

Preserve INFO/LOW/MEDIUM/HIGH from existing source/model Issues. Add CRITICAL only for witnessed immutable-evidence or unsafe-publication invariant breaches. The proposed policy is reviewed with this plan and versioned before implementation; it cannot rewrite original severities.

| Severity | Deterministic meaning |
| --- | --- |
| CRITICAL | Artifact/lineage/history corruption or substitution, leaked/prohibited publication, or Phase 7 scientific-claim invariant breach; new publication is blocked. |
| HIGH | Existing major source unavailability, >120-day retained model-input age, or proven hard contract breach/required sweep failure. |
| MEDIUM | Existing partial source coverage, evidenced gaps/staleness (>45 days through 120), HMM convergence limitation, or local unpriced coverage. |
| LOW | Retained nonblocking occupancy/OOD/GARCH convergence or domain limitation, or compatible descriptive mirror discrepancy. |
| INFO | Historical information, intentionally unsupported/deferred checks, faithful closed-gate disclosure, and source records whose actual severity is INFO. |

Do not infer severity from negative p-values, posterior confidence, scary history counts, available UI colors or a source name. OOD remains LOW under the existing Phase 5 rule even when the UI blocks an unsupported interpretation. An unsupported optional check has INFO gap severity and UNAVAILABLE coverage, not a HIGH measured failure. Changing severity requires a new reviewed policy revision and observation attribution.

## 14. Evidence-class and scientific-claim policy

REAL_RETAINED means witnessed non-synthetic retained evidence in its stated scope; it does not mean current, independently calibrated, investable or user holdings. LOCAL_REAL is reserved for authenticated genuinely admitted private evidence; paper holdings are instead LOCAL_PAPER_BOOK and browser estimates LOCAL_MODEL_ESTIMATE. EXAMPLE_PORTFOLIO is explicit public example identity only and is not shipped in v0.1. RETAINED_SYNTHETIC covers frozen synthetic execution studies; SYNTHETIC_TEST_ONLY covers engineering fixtures and sabotage. UNAVAILABLE covers absence metadata without a pretend measurement.

Every Issue, coverage record and panel states its evidence class. Real incident counts include only supported CURRENT findings in REAL_RETAINED (and separately labelled LOCAL_REAL in an authenticated future local view). Availability gaps, historical-only records, synthetic warnings, examples and local model estimates have distinct totals. They cannot be mixed into a badge saying real risk incidents. Witnessed registry metadata about a fixture does not make the fixture's scientific findings real.

Every Phase 7 Issue/state/sweep carries exactly these false booleans:

`inference_certified`, `market_claim_eligible`, `causal_claim_eligible`, `validated_alpha`, `trusted_graph`, `precise_edge_confidence`.

Older envelopes containing only three or four flags remain byte-identical. The adapter supplies the six-field Phase 7 boundary with missing upstream capabilities **unavailable**, not independently assessed or silently true. Inspectors distinguish explicit upstream false from an absent upstream field. No schema conversion upgrades an old claim. The shared Replay manifest's existing three-field claims contract is left unchanged; the new risk artifacts carry all six.

## 15. Issue identity and deduplication

Identity format:

`risk-issue:SHA256(canonical_json(["risk-identity/1", rule_id, rule_semantic_version, category, scope.kind, subject_id, evidence_family, stable_scope_key, evidence_class]))`

Canonical JSON means strict typed values, sorted object keys, UTF-8 and no implicit string coercion. Identifier inputs are normalized through reviewed mappings. Exclude publication time, witness time, evidence hash, last observation date, display reason text, severity, status, policy minor version and unrelated HEAD. A genuinely changed rule meaning needs a new semantic version and explicit predecessor linkage, not accidental silent reuse.

Examples of stable subjects/families:

- DATA: source ID, health/attempt condition, reviewed source window/field scope. Repeated partial diagnostics change observations, not Issue identity.
- MODEL: country + asset + module/config semantic identity, profile family and feature meaning; fit run IDs are evidence revisions. Do not conflate HMM2 and HMM4.
- RESEARCH_HYGIENE: frozen preregistration/family ID + violated contract clause. Phase 2's synthetic repeated family remains its own partition.
- PORTFOLIO: opaque local book ID + explicit book class; never a publication timestamp or publicly reversible tenant identifier.
- SIMULATOR: engine pair ordered canonically + strategy/assumption family + capability scope.
- SYSTEM: public workspace + reader/publication subsystem. Changing an error message does not create unlimited new alert identities.

Upstream identifiers are immutable aliases, not assumed globally compatible. Source-attempt conditions are mapped by reviewed source/kind/reason-family bindings, with an UNKNOWN_ORIGIN reason retained rather than text-based guessing. If origins cannot be safely grouped, preserve separate referenced records and mark normalization PARTIAL. Correlated source limitations can share a `stable_scope_key` and UI root-cause grouping without suppressing separate model-age facts.

Occurrence counts count distinct relevant evidence observations. Source occurrence counts stay in origin metadata. Identical sweeps do not increment either count. The initial import creates one actual Phase 7 detection; it does not manufacture one risk transition for each old upstream occurrence.

## 16. Sweep architecture

Add a new package `src/risk_manager/`, rather than expanding legacy `src/risk/` into a universal RiskManager class.

1. **EvidenceReaders** snapshot the published manifest and explicit frozen file map, read bytes, validate grants/schema/hash/joins and expose bounded typed assertions. No path discovery, writable runtime creation or provider calls.
2. **Rules** evaluate only those assertions. Permitted work is comparisons, typed contract checks, count accounting and explicit clock differences; no scientific fitting, testing, regression, feature engineering or simulation.
3. **IssueReducer** produces stable current views, coverage and deterministic transitions.
4. **RiskSweepReceipt** seals input inventory, scoped evaluator code hash, policy hash, prior state/receipt, observations, transition counts, zero-operation evidence and actual witness/publication clocks.
5. **Publisher** preflights closed public projections, writes owned content-addressed files and commits the manifest pointer atomically. Verification is separate from export.

Implement EvidenceReaders for Data Organ, regimes, research histories, Phase 6 metadata and synthetic execution-history references. Portfolio reader returns explicit absence publicly. Optional local portfolio view does not feed the public publisher. Open explicit runtime databases only with read-only immutable semantics if later needed; default v0.1 reads retained files.

The reader map enumerates allowed artifact kinds/selector IDs and exact frozen references. Subsequent Data Organ publications are admitted only through existing validation with immutable history; matching current selection is captured once at sweep start. A manifest change during reading forces a restart or failure, never a mixed unrecorded snapshot. Historical risk views use their sealed input inventories, not today's latest routes.

Sweep fingerprint binds selected evidence hashes/cutoffs, evaluation cutoff, policy hash, relevant evaluator source manifest and scope. Unrelated HEAD and unrelated additions do not trigger publication. Execution HEAD remains provenance outside that identity. Initial no-op detection compares this fingerprint with the last successful receipt before obtaining a new witness clock.

A failed required read never returns `issues=[]`. Retain an append-only failure attempt and safe error code. Where the publisher remains trustworthy, emit a FAILED risk-sweep referencing the last valid state and containing a canonical R-SYSTEM-SWEEP/INTEGRITY Issue; do not advance the successful state route. If publication itself cannot safely write, retain the failure in the workflow's checked run artifact/log and leave pointers untouched. The UI shows missing/failed latest receipt or load failure and the last verified feed, never a zero-count success. Recovery closes the failure Issue only from a later successful compatible changed repair proof.

If the publication transport is itself unavailable, a static public page cannot know about an unpublished failure immediately. It must label the visible receipt "last published sweep" with its actual clock, not assert current operational success. The failure remains in the independent workflow attempt evidence and is linked by the next safe publication. No fabricated public failure receipt or successful timestamp is used to conceal that transport limitation.

No evidence DB, credential, provider response, unrestricted trace, raw portfolio, model object or exception stack enters a public receipt. Sanitization uses typed reason codes and reviewed messages, not truncation of arbitrary secrets.

## 17. Scheduler and idempotence design

Choose a separate `.github/workflows/risk.yml` with **workflow_dispatch only**, a `scope` choice containing `risk`, and no `schedule` block. Keep the existing `.github/workflows/organs.yml` byte-identical: its schedule continues to do Data Organ work and its Phase 5 steps retain exactly `github.event_name == 'workflow_dispatch' && inputs.scope == 'regimes'`.

This avoids an existing hazard: adding `risk` to organs.yml without changing its `inputs.scope != 'regimes'` Data Organ conditions would fetch providers on a risk sweep. A separate workflow makes that accidental coupling impossible and does not require an exception to Phase 6's frozen workflow bytes.

Risk workflow: read-only preflight → explicit retained-evidence sweep → public projection validation → freeze/zero-operation checks → allowlisted commit only when files differ. No provider secrets, capture stages, calibration canary, general scientific runner or engine environments. Concurrency serializes publication with existing checked-organs publication by using the same repository/branch publication lock; no cancelling an in-progress writer. Detect remote branch movement before pushing; reject/re-evaluate the new bundle rather than force-push.

Manual proof required before any later scheduling proposal:

1. Dispatch `risk.yml`, `scope=risk`, against the approved implementation head and current retained evidence. Retain input hashes, result, transition list and before/after histories.
2. Immediate identical repeat: zero NEW/UPDATED/RESOLVED transitions, unchanged first_seen and occurrences, zero new files, no manifest rewrite and no unnecessary commit. Record UNCHANGED in workflow output without appending a redundant repository publication.
3. Prove zero provider requests/captures, model/plugin/SeriesModel runs, factor fits, research attempts, holdout openings and simulator calls. Verify registry/frozen evidence hashes and event counts before/after; self-reported receipt zeros alone are insufficient.
4. In an isolated SYNTHETIC_TEST_ONLY fixture, change exactly one relevant evidence revision: assert exactly one expected transition and no unrelated changes. Restore/resolve/reopen scenarios need complete clearing evidence; missing-source variant must preserve the original Issue.
5. Inject failed reader, corrupt bytes and interrupted publication: last successful state remains addressable, failure retained, no false resolution or empty green feed.
6. Repeat the changed fixture and prove a no-op. Prove unrelated HEAD, manifest key order and unrelated source additions do not cause transitions.

Keep scheduled sweeps DISABLED in the v0.1 acceptance state even after manual proof unless separately reviewed scheduling is approved. A later schedule must define whether its evaluation epoch is evidence-only or explicit calendar-time; any time-only transition is tested and disclosed. Phase 7 scheduling cannot authorize D6 or scheduled regimes.

## 18. Minimum public artifact schemas

Choose **two kinds**, not five independent dashboards: `risk-state` and `risk-sweep`, with IDs `risk:state:<file-sha256>` and `risk:sweep:<file-sha256>`. State contains summary, current Issues, coverage, compiled policy projection and evidence-reference index. Sweep contains observations/transitions, immutable parent links, bounded history index and execution/publication receipt. This covers inspector/history without copying original lineage or inventing a separate numerical risk summary.

Common envelope exact fields: `{schema_version, kind, input_hash, evidence_cutoff, published_at, scope, sources, licence, claim_flags, payload}`. Scope literal `RETAINED_RISK_EVIDENCE`; first-party metadata grant `project:risk-manager-evidence` with publish_derived permits only the new authored projection, not additional vendor rights. All borrowed numerical assertions require their own original permitted grants; prefer references over numerical copying.

State payload exact fields: `{state_id, sweep_fingerprint, evaluation_cutoff, policy, issues, coverage, counts, evidence_index, historical_origin_counts, prior_state_ref}`. `counts` is an array of closed `{partition, category, severity, count}` rows. **Do not use object keys HIGH/LOW:** existing shared raw-price guards reject normalized `high`/`low` keys. Array enum values allow strict reuse of frozen validators unchanged. Counts are verified from the partitioned Issues, not trusted independently. `historical_origin_counts` likewise uses arrays of typed count rows; it is not an unchecked arbitrary dictionary.

Compiled policy projection exact fields: `{schema_version, version, sha256, rules}`; each rule exposes only ID/version, check IDs, typed predicates/units, threshold names, inherited policy refs, severity semantics, missing-input codes, limitations and remediation. It has no sample arrays or execution instructions. The full reviewed local policy remains frozen by hash.

Successful/partial sweep payload exact fields: `{sweep_id, fingerprint, status, prior_sweep_ref, state_ref, started_at, completed_at, published_at, evaluation_cutoff, inputs, evaluator_source_hash, policy_sha256, observations, transitions, transition_counts, operation_proofs, history_index, failure}`. Failure is null on success. FAILED variant requires last_valid_state_ref plus bounded failure Issue and failure evidence; it cannot claim successful empty state or clearing transitions.

Manifest entries use existing `ReplayEntry` fields unchanged. Artifact envelope/manifest publication clocks describe first public availability; manifest entry observed_at/available_at/as_of describe the derived publication itself, **not** underlying old observations. Risk evidence_cutoff separately pins admitted evidence. Manifest top-level as_of is monotone max of retained publication times and never regresses.

Add only `/risk-manager/state`, `/risk-manager/sweep`, and pinned variants `/risk-manager/state?sweep_id=<id>` and `/risk-manager/sweep?sweep_id=<id>`. These do not overwrite the page route `/risk`. State and receipt references avoid cyclic content hashes: compute Issue observations/state first, then receipt referencing state, then manifest; state binds fingerprint rather than its future receipt file hash. Within the state, observation/first-seen references use immutable observation content IDs plus the sweep fingerprint; the receipt index later resolves their containing receipt, without inserting that future file hash into state bytes. Parent links always refer backward.

History is append-only, bounded per response and traversable through verified previous receipts. Do not rewrite old state files to add later history. Reject orphan files, mismatched state/receipt pairs, forged counts, arbitrary evidence links and unknown kinds. No fabricated Phase 7 test state/sweep is published under the production risk namespace. Explicitly referenced genuine upstream synthetic history may appear only in the separate historical/synthetic partition; this does not admit synthetic test inputs as real monitoring evidence.

## 19. Licence and privacy boundaries

Public output is first-party derived issue metadata with original source attribution and immutable evidence pointers. No raw vendor prices, quote arrays, licensed provider rows, raw security holdings, tenant/user identifiers, credentials, runtime databases, model objects or unrestricted model/execution traces. Hash references are not permission to make a private file downloadable.

Public frozen-file references expose only reviewed repository-relative path IDs and hash/assertion metadata. The backend may verify a retained flagship file locally; it must not serve its whole 843 KiB result/attempt payload through a generic evidence endpoint. Inspector renders the whitelisted assertion, its file hash and registered provenance. Synthetic execution history publishes at most derived status/count/reference metadata, never the raw synthetic tape encoded inside an evidence string.

Data Organ restricted-source records retain safe unavailability reasons, without provider credentials or missing-secret values. Existing source-grant assertions are retained policy evidence, not a new legal grant. Do not modify `src/data/license_policy.py`, French/IIMA grants or source attribution. A malformed/expired/missing relevant grant disables that assertion and preserves the last valid Issue; raw data cannot be used as fallback.

Each public kind gets its own positive field/type/enum/length whitelist and nested validation. Generic blacklist guards are additional checks. Base64/JSON/string carriers of provider arrays, arbitrary HTML/URLs and raw exception text are prohibited even if their key is named `evidence`.

## 20. Phase 0–6 freeze strategy

Add a subset-aware Phase 7 inventory pinned to **16db82c5f2f50b98253df9989c586cd45aa98f6b**. Generate it from canonical Git blobs, never from this older local worktree. Freeze:

- Each of the 221 existing manifest entries and its referenced public file individually; all 126 existing route mappings individually. New risk routes/artifacts are additions, not whole-manifest equality.
- Immutable old receipts, content-addressed exports, Research OS preregistration/freeze/attempt/result histories, Phase 2 registry/run/opening records and all original model/source bindings.
- Phase 5's existing 684-file freeze, 33 regime entries and 11 regime routes; fixed analytical profile and source/licence bindings. Existing protected sources remain unchanged.
- Phase 6's 24 metadata artifacts, 18 retained references, policy/inventory/ledger/receipt identities and source selectors; no factor result reauthoring.
- All six unsafe Phase 5 withdrawal mappings, with unsafe files/URLs still absent. Copy the exact mapping assertions from Phase 6's policy, do not regenerate numerical replacements.
- `organs.yml` raw/canonical frozen bytes and D6 gate state; all prior screenshots and evidence artifacts.

Preserve the existing Phase 5 freeze base `5b8591d540288e99aaf6ee69163bd4d5a6c6d147`; do not move it to Phase 7. Add a new freeze, not a repaired old one. Evidence bytes use raw SHA; source text uses the established newline convention where the prior checker explicitly does. Do not normalize old JSON to tidy formatting.

Existing Data Organ latest pointer aliases and `/data/*` routes have an established separately validated publication mechanism. During a Phase 7 implementation diff, freeze their canonical baseline mappings exactly; the risk publisher may not change them. Independent later Data Organ publication can advance only under that original mechanism, preserving every original entry and pinned risk input. This distinction allows legitimate scheduled Data Organ history without giving Phase 7 permission to retarget old routes.

Narrowly update `data_archive.py`, `regimes_archive.py` and `research_archive.py` to delegate only the two approved risk kinds and canonical risk routes to `risk_archive.py`. Their old-entry, source-policy, withdrawal and public-file checks still execute. Keep `factors_archive.py` and frozen frontend Replay validators/client unchanged if the generic existing contracts suffice, as the proposed schema does. Add explicit sabotage proving all old checkers still reject old-evidence changes and unknown risk kinds; never accept an arbitrary `startswith("risk:")` payload without closed validation.

The safe design needs no edits to frozen scientific sources, no new numerical output, no evidence withdrawal beyond the already frozen six, and no exception to organs.yml. If implementation discovers an unavoidable protected-source change, stop at that bounded design conflict for explicit amendment; do not weaken the old freeze.

## 21. Exact files to ADD after approval

Only this plan is added in the current turn. Proposed implementation files:

| Path | Purpose |
| --- | --- |
| `src/risk_manager/__init__.py` | Bounded public package surface |
| `src/risk_manager/contracts.py` | Closed typed Issues, observations, coverage, receipts and refs |
| `src/risk_manager/evidence.py` | File/Replay EvidenceReaders and exact selector resolution |
| `src/risk_manager/policy.py` | Frozen reviewed policy loading and validation |
| `src/risk_manager/rules.py` | Catalogue evaluators; unavailable numerical evaluators stay disabled |
| `src/risk_manager/reducer.py` | Pure identity/lifecycle/occurrence reducer |
| `src/risk_manager/sweep.py` | Bounded orchestration, fingerprint/no-op and failure receipts |
| `src/risk_manager/publication.py` | Two positive public schemas, transaction/preflight |
| `src/risk_manager/service.py` | Read-only published selection for authenticated API |
| `backend/routes/risk_manager.py` | GET-only `/risk-manager/*` endpoints |
| `eval/risk_manager/v0.1/policy.json` | Exact reviewed rules, severity, source and unavailable codes |
| `eval/risk_manager/v0.1/evidence-map.json` | Reviewed selectors/current anchors/frozen assertions |
| `eval/risk_manager/v0.1/phase0-6-freeze.json` | Canonical subset inventory and withdrawal assertions |
| `scripts/run_risk_sweep.py` | Explicit retained-only manual command; no network/refresh options |
| `scripts/export_risk_replay.py` | Explicit public projection step |
| `scripts/verify_risk_manager.py` | Read-only boundary/history/publication verifier |
| `scripts/risk_archive.py` | Narrow risk namespace/route/old-subset validation |
| `.github/workflows/risk.yml` | Manual-only scope=risk proof and allowlisted publication |
| `frontend-v2/src/risk-manager/contracts.ts` | Recursive frontend schema/enum validators |
| `frontend-v2/src/risk-manager/client.ts` | Pinned state/receipt/ref loader using existing Replay reader |
| `frontend-v2/src/risk-manager/RiskWorkspace.tsx` | New F3 console container |
| `frontend-v2/src/risk-manager/IssueFeed.tsx` | Accessible feed/filter/navigation |
| `frontend-v2/src/risk-manager/IssueInspector.tsx` | Rule/policy/lineage/origin/remediation inspector |
| `frontend-v2/src/risk-manager/CoverageMatrix.tsx` | Explicit measured/partial/unavailable checks |
| `frontend-v2/src/risk-manager/SweepHistory.tsx` | Sealed receipt/transition history |
| `frontend-v2/src/components/risk/LocalRiskLab.tsx` | Existing Live desk extracted without removing capabilities |
| `frontend-v2/scripts/verify-risk-manager.mjs` | Real Replay browser QA plus isolated sabotage contexts |
| `tests/risk_manager/test_contracts.py` | Contract/privacy/identity tests |
| `tests/risk_manager/test_evidence.py` | Exact joins/grants/chronology and missing-evidence checks |
| `tests/risk_manager/test_rules.py` | Rule semantics and retained facts |
| `tests/risk_manager/test_reducer.py` | No-op/update/resolve/reopen/failure tests |
| `tests/risk_manager/test_sweep.py` | Zero scientific operations, clocks, idempotence and concurrency |
| `tests/risk_manager/test_publication.py` | Atomic writes, positive whitelists and sabotage |
| `tests/risk_manager/test_archive.py` | Earlier-phase subset/withdrawal preservation |
| `tests/risk_manager/test_api.py` | Auth, selectors, no GET execution, unavailable/failure behavior |
| `docs/phase7-risk-manager-v0.1.md` | Implemented scope, measured validation and operational status |

Generated files are content-addressed, so their exact basename is determined by bytes, not invented now: `data/exports/risk_manager_v0_1/state-<sha256>.json`, `sweep-<sha256>.json`, and `manifest.json`; public `frontend-v2/public/artifacts/replay/risk-state-<sha256>.json` and `risk-sweep-<sha256>.json`. Public receipt is the risk-sweep kind, not a third kind. Proof receipts/screenshots belong in `docs/screenshots/phase7-risk-{real-desktop,real-mobile,inspector,coverage,history,failure}.png` and `docs/phase7-risk-manager-v0.1.md`; failure/sabotage images must be labelled as test evidence.

## 22. Exact files to CHANGE after approval

| Path | Bounded change |
| --- | --- |
| `frontend-v2/src/routes/risk.tsx` | Route to new Replay console and separately lazy-loaded local lab; preserve F3 path/instrument context |
| `frontend-v2/src/lib/book.ts` | Correct local proxy method labels/types, separate modelled hedge scenario overlays from quoted book, track/invalidate supported quote provenance; no scientific estimator change |
| `frontend-v2/src/lib/demoBook.ts` | Prevent Replay initialization from consuming the one-time Live hydration; reset hydration/cache ownership on mode/session boundaries while preserving stored paper positions |
| `frontend-v2/src/components/risk/RiskLiveCommandCenter.tsx` | Pass actual quote metadata if available; surface failed/unsupported quote coverage; no public monitoring import |
| `frontend-v2/src/components/risk/BookDrawer.tsx` | Explicit paper-book/coverage/quoted-subset labels |
| `frontend-v2/src/components/risk/PaperBook.tsx` | Same local evidence/coverage disclosure |
| `frontend-v2/src/components/risk/RiskIntelligenceLab.tsx` | Explicit legacy on-demand local lab boundary; never auto-mount in immune console |
| `backend/main.py` | Register new GET-only router under existing auth gate |
| `scripts/data_archive.py` | Narrow risk kind/route delegation, all prior checks preserved |
| `scripts/regimes_archive.py` | Same narrow delegation, withdrawals and old routes preserved |
| `scripts/research_archive.py` | Same; permit monotone new risk publication time without changing old contracts |
| `frontend-v2/public/replay-manifest.json` | Only add checked risk entries/routes and monotone publication as_of |
| `.github/workflows/ci.yml` | Add risk verification/tests/browser checks; no retained scientific campaign |
| `frontend-v2/scripts/verify-shell.mjs` | Replace F3 placeholder assertion with real risk-console assertion |
| `frontend-v2/scripts/verify-replay.mjs` | Validate new risk additions and preserve old Replay behavior |

Keep legacy backend risk/portfolio modules, `src/risk/*`, `risk_summary.py`, plugin implementations, Phase 5/6 scientific sources, `organs.yml`, shared Replay `client.ts`/`contracts.ts`, `src/data/license_policy.py`, and all old evidence bytes unchanged. If quote provenance required by local coverage is absent in an existing API response, show UNAVAILABLE rather than extending provider fetches in this milestone. No global formatting/dependency/lockfile churn is planned.

## 23. Exact files to DELETE

**None.** Do not delete the Live desk, Markets risk panels, old source issues, frozen screenshots, receipts, run history, old model code or unrelated local work. Extracting the local route component changes its location but retains its functions; the original route remains.

## 24. F3 UI design

Use the existing dense ForgeShell terminal language: flat dark panels, compact typography, clear severity text and restrained existing amber/red/cyan accents. Do not redesign the shell, add charts with no evidence, or add a health score. Reuse `components/risk/Panel.tsx` only as a visual container where its keyboard/accessibility behavior fits; calculations and local hooks never enter the public component tree.

Desktop layout: status strip → main Issue feed (about two-thirds width) and selected Issue inspector (one-third) → coverage matrix → sealed sweep history. Feed fields: severity, category, subject, title, evidence class, first Phase 7 seen, latest evidence time, currency and status. Filters cover category/severity/country/status/evidence class; preserve selection by stable ID, use deterministic severity/time/ID sorting and show the partition in the count label.

Inspector shows: why the Issue exists, exact rule/version, threshold and units, observed assertion, evidence cutoff, public availability time, original upstream first/last seen and severity, immutable refs/run/lineage/grants, missing inputs, limitations, and remediation/unblock evidence. Do not expose a raw arbitrary JSON dump. Country and asset selectors cannot relabel market factors as SPY/NIFTY holdings.

Coverage matrix includes Portfolio, Models, Data, Research hygiene and Simulators, plus System sweep health. Each check has AVAILABLE/PARTIAL/UNAVAILABLE **and** CLEAR/FINDING/NOT_EVALUATED. AVAILABLE refers to evaluation coverage, not a green category. No overall green status while checks are not evaluated. Healthy measured subchecks can say "No finding at this evidence cutoff"; the workspace headline remains "PARTIAL COVERAGE" when required roadmap checks are missing.

Mobile stacks status/feed/inspector/coverage/history; row selection opens a focus-managed inspector sheet. Use keyboard selection, visible focus, semantic table/list labels, Esc close, F3 native navigation and screen-reader severity/status text. Severity color is supplementary. A failed sweep produces a persistent labelled banner with last-success clock and verified prior feed; a load failure never produces an empty success state.

## 25. Live paper-book coexistence

Local F3 opens the same read-only immune-system evidence console by default, with a separate **LOCAL PAPER BOOK / RISK LAB** tab. Entering it requires the existing loopback flag and authenticated API; no local queries run merely because the immune console is open. Preserve book editing, exposures, stress scenarios, hedges and intelligence tools.

Required honesty fixes during approved implementation:

- Rename displayed HISTORICAL VaR to "Seeded fat-tail scenario estimate"; disclose seed, proxy vol/correlation and fixed 252 assumption as a local model setting. MC and Gaussian estimates remain labelled estimates, without certification.
- Display cost-basis capital as a proxy, not true broker NAV; do not present percentages against it as verified NAV limits. Entry may remain cost basis/P&L input, never a mark substitution.
- Distinguish stored paper holdings, eligible quoted subset, excluded positions and hypothetical/modelled hedge overlay. Black–Scholes `modelPut().price` and futures/reference-derived hedge values are scenario estimates; they cannot enter quoted book valuation or a current holdings count as witnessed option quotes.
- Use actual quote metadata/quoted eligibility if available, invalidate failed/removed coverage, and show unavailable provenance when absent. No `Date.now()` pretending to be a provider quote observation timestamp; no arbitrary freshness threshold invented for the lab.
- Guard offline cache/session changes so another account's cached book is not shown as authenticated current evidence. Reset lab state on mode/session boundary; preserve server storage and existing offline disclosure.

Safely reuse Panel, book editing/drawer interaction, quoted-subset row rendering and existing local stress/hedge presentation after these labels/boundaries. Reuse no local risk math in the public sweep. The public console must not import `book.ts`, `demoBook.ts`, `RiskLiveCommandCenter` or `RiskIntelligenceLab`; lazy-load the local lab only upon authorized selection.

## 26. Backend/API plan

`GET /risk-manager/state` returns the last checked published state selection. `GET /risk-manager/sweep` returns the latest checked receipt, including a failed latest attempt referencing prior state. Optional `sweep_id` must be an exact listed sealed ID; unknown returns explicit UNAVAILABLE/404, never falls back to another cutoff. No caller-controlled evidence ID/path/selector, tenant override or provider parameter.

The service reads only explicit application artifact roots, validates state/receipt/hash/grant consistency, and serves the same approved projections as Replay. It does not create SQLite, call existing risk endpoints, auto-export, execute a risk sweep or infer local portfolios. Use existing authentication behavior; no new public backend exception is necessary for static Replay.

A malformed published chain returns a typed error with a safe reason. Consumer retains its last verified state and labels the update failed. No `catch → []`, zero counts, 200 empty success response or legacy provider fallback. No sweep POST endpoint in v0.1: the explicit operator CLI/workflow is the publication boundary. Local lab keeps its existing separate authenticated endpoints.

## 27. Replay plan and chronology

Use the existing checked manifest loader and exported SHA-256 helper. The new risk client applies the same manifest byte/SHA checks and a strict raw-text decoder before parsing its two kinds, so duplicate JSON keys can actually be rejected; calling the existing `readReplayArtifact` alone would lose duplicate-key evidence in its JSON.parse step. Existing non-risk references may still use `readReplayArtifact` and their original validators. Do not change frozen shared validators/client for convenience. Resolve the receipt/state pair from a single manifest snapshot; derive count partitions only from validated state. Prefer refs already verified/cached; fetch original model/factor lineage lazily for the inspector.

Separate clocks everywhere:

| Clock | Meaning |
| --- | --- |
| FIRST_SEEN (`first_seen_at`) | Actual first Phase 7 witnessed finding; initial import is detected now, not in 1926/2025 or at an old source event |
| Origin first seen | Original Data Organ/registry event time, preserved separately and clearly labelled |
| EVIDENCE_AT (`evidence_at`) | Relevant latest retained evidence's actual timestamp; null with precise reason if no measurement exists |
| EVIDENCE_CUTOFF (`evidence_cutoff`) | Bound admission cutoff for this rule/sweep; references cannot be available later |
| Evaluation cutoff | Explicit clock for age predicates; part of fingerprint, not implicit current browser time |
| PUBLICATION_TIME (`published_at`) | First availability of this new artifact; cannot be earlier than its actual witness/seal |
| RESOLVED_AT | When changed compatible evidence was witnessed to clear the rule, not an old market date |

On initial sweep, non-synthetic source facts use their exact retained cutoff while detection/publication occur later. A missing portfolio coverage Issue may refer to the reviewed policy and manifest's absence, with no invented evidence_at. Imported historical origin metadata never becomes a fabricated risk history.

Historic sweep selection loads that sweep's exact state/inputs/policy, not today's latest Data Organ route. Mode/country/cutoff changes cancel old requests and clear stale selection; checksum/permission failure cannot leave newly selected content labelled valid. No polling, live API/provider calls, model execution or cache-driven local book hydration in Replay. Public screenshots must load real published risk artifacts with unmodified responses.

## 28. Test and sabotage matrix

These are proposed implementation tests, not executed by this planning turn. Use pure rule fixtures and isolated engineering tests; no retained scientific campaign. Every synthetic test is labelled and excluded from production publication.

| Family | Required tests/sabotage | Pass condition |
| --- | --- | --- |
| Contract | Unknown nested keys, duplicate JSON keys, bool-as-count, null/NaN/Infinity, oversized strings/refs, wrong enum, invalid timestamps | Fail closed with precise safe reason |
| Identity | Different publication/witness clock, reason text, severity, irrelevant HEAD; same semantic scope | Same Issue ID; changed module/scope/class/semantics cannot collide |
| Chronology | Backdated first_seen, source available after cutoff, metadata clock confused with observation, origin clock substitution | Rejected; all clocks remain separately attributable |
| Data normalization | 27-origin baseline; 8 HIGH/13 MEDIUM/6 INFO; current vs old partial diagnostics; same revised condition | Original facts retained, stable current incidents, no INFO escalation or fabricated resolution |
| Model facts | Current converged/OOD-false fits; exact >45/>120, >5, <0.05/<30 boundaries; India observation units | Exact inherited behavior; no new fit or session substitute |
| Drift/calibration | Missing/overlapping reference samples, incompatible task/features, no outcome certificate | NOT_EVALUATED / UNAVAILABLE, never a number or CLEAR |
| Research | 3 SDK openings; original 46/later 48; declared 46 trial slots; unavailable/failed trials; missing required prereg; closed-gate claim | Counts alone not violations; exact breached clause creates Issue; fixture warnings remain separate |
| Claims | Toggle each of all six flags, use 0 instead of false, omit field, promote posterior/calibration label | Publication rejected; original envelopes unchanged |
| Reducer | Repeat, revision, positive complete clearing evidence, reopen, missing-source disappearance, policy-only clearance | Exact NEW/UNCHANGED/UPDATED/RESOLVED rules and immutable prior history |
| Failure | Required reader throws, truncated manifest, permission loss, zero-issue fallback, failed first-ever sweep | Retained failure/System Issue; last success preserved or explicit no successful feed; never green |
| Publication | Interrupt after staging, wrong pair, orphan file, crash before/after manifest replacement, simultaneous publishers | Atomic visibility; roll back only newly owned unpublished files; no deletion of old evidence |
| Positive whitelist | Inject prices/holdings/rows/traces/credentials inside nested fields, encoded strings/base64, rich selectors, arbitrary URL | Every public kind rejects; no reconstruction-capable payload |
| Permission/lineage | Wrong source country/run/profile/cutoff/hash/bytes/grant, expired licence, producer mismatch | Diagnostic unavailable or integrity failure; no fallback computation |
| Freeze | Mutate each earlier subset, receipt/run/opening count, Phase 6 selector, withdrawal URL, organs condition | All old verifiers plus new verifier reject |
| No execution | Spy/fail imports or calls to providers, Runner, SeriesRunner, model.fit/predict, factor regressions, research runners, holdout(), simulators | Zero calls and unchanged scientific evidence/event counts |
| API | Unauthenticated request, arbitrary path/tenant/selector, unknown sweep, GET side effects | Existing auth respected; read only; explicit unavailable/errors |
| Portfolio isolation | Inject sample positions/localStorage in public browser; quote missing/removed; modelled hedge | Replay unaffected; quoted book excludes ineligible marks; local overlays stay separate |
| Synthetic execution | Intentional NOT_COMPARABLE; differing cost/stress assumptions; attempt to count history as real | No false disagreement; DEFERRED_PHASE9 real coverage persists |
| Scheduler | Workflow AST/static guard and no-op dispatch proof | No risk schedule; organs bytes/gate unchanged; no provider/science stages |

Use existing historical verifiers in their read-only modes. Do not run `verify_research_os.py --full-calibration`, the Phase 2 reference exporter, regime refresh, a calibration canary or engine replay as part of risk publication. Existing broader CI engineering fixture suites remain distinct from new retained research execution; the risk dispatch is stricter and runs no scientific campaign.

## 29. Browser QA matrix

| Context | Required checks |
| --- | --- |
| Real Replay, Chrome/Edge/Firefox, 1440×900 and 390×844 | F3 route/nav, partial-coverage headline, real Data Organ conditions, India staleness, no portfolio values, honest counts/clocks, no mocks |
| Real Replay, 1920×1080 and keyboard-only | Feed/inspector layout, sorting/filter persistence, F3 and existing shell keys, focus/Esc, reduced motion |
| Real evidence inspector | Exact pinned source/run/country/cutoff/grant and upstream history; lazy bounded lineage; no raw rows |
| Real history | Actual first sweep and subsequent sealed receipts only; no manufactured old NEW/RESOLVED events |
| Isolated sabotage browser contexts | Hash mismatch, malformed payload, missing grant, failed sweep, unavailable reference; label test scenes explicitly |
| Loopback Live + authenticated test account | Console does not mount lab; explicit lab tab, empty/priced/unpriced paper book, offline disclosure, proxy labels, modelled hedge separation |
| Mode/session switches | Cache/request cancellation, no stale book or private data in Replay, no cross-account cache bleed |
| Public production route | Same-origin static artifact traffic only, no `/paper`, `/tape`, `/risk/*`, `/portfolio`, ML/macro/provider traffic or background polling |
| Regression | Existing Data, FACTORS, REGIMES, Research/Forge history and Markets/local risk behaviors preserved |

First honest public F3 screenshot: **PARTIAL COVERAGE**, actual sweep/publication and evidence clocks; current retained source/grant failures at their existing HIGH severity; IIMA calendar/BLS quarantine limitations; India retained model-input staleness; measured convergence/OOD subchecks without fabricated alerts; research gate CLOSED with original historical opening scopes; PSI/KS/calibration, public portfolio and real simulator checks explicitly UNAVAILABLE. The inspector explains that the data are retained, not current live holdings. Raw upstream issue inventory is labelled 27 (8 HIGH/13 MEDIUM/6 INFO); normalized current-incident counts are computed by policy and are not asserted to equal 27. Historical INFO and synthetic repeated-opening warnings are separate. No screenshot values/history are specified as invented fixtures.

## 30. Performance budgets

Proposed release budgets, to be measured against the existing Phase 6 workspace pattern:

- Each new public state/sweep file ≤128 KiB uncompressed. Initial selected risk data ≤256 KiB uncompressed; total initial workspace data, including manifest, ≤512 KiB. Inspectors fetch referenced evidence lazily; do not eagerly download both 90 KiB factor audits or full research files.
- Incremental F3 Replay code ≤64 KiB gzip. No added chart/3D/estimator dependency; legacy local lab excluded from initial public chunk.
- Sweep on baseline retained evidence ≤30 seconds and ≤256 MiB added peak memory; manual workflow timeout 10 minutes. Limits exceed normal bounded metadata needs and cause explicit failure rather than partial truncation.
- UI filter/select interaction ≤100 ms at 1,000 Issues; main-thread synchronous validation slices ≤50 ms. Paginate/virtualize history and feed if measured growth requires it; never silently drop Issues to meet the budget.
- History index ≤20 receipts per page, origin refs ≤100 per Issue page with verified continuation; whole immutable history remains reachable. A hard schema size cap must fail publication, not truncate evidence or hide findings.
- Zero Replay polling and zero provider/API requests; identical successful sweep has zero artifact writes/commits.

Counts, transfer size, cold/warm load and hash/validation time are recorded in actual browser/proof receipts. These are engineering budgets, not measured promises from this planning pass.

## 31. Risks and containment

| Risk | Containment |
| --- | --- |
| Planning accidentally uses older local branch | All findings pinned to canonical SHA; implementation must start from approved main without resetting unrelated work. |
| Missing diagnostics presented as healthy | Complete coverage slots + explicit NOT_EVALUATED + separate gap totals; no overall health score. |
| Source historical Issues inflate current risk | Preserve upstream status/severity with currency and latest-diagnostic joins; no fake resolutions. |
| Retrospective HMM path mistaken for prospective monitoring | Persistent parameter-retrospective/capture-only label; retained-only scope and no drift/calibration inference. |
| Local proxy VaR/NAV/options bleed into public feed | Separate package/import boundary, explicit lab tab, quoted subset and modelled overlay separation. |
| Synthetic execution or fixture warning becomes real risk | Separate evidence partitions and count validation; real simulator check remains deferred. |
| Whole-manifest equality blocks lawful additions | Per-entry/route freeze plus narrow delegated risk schemas; all original pins remain. |
| Broad archive exception weakens old checks | Exact kind/route whitelist, mutation tests, immutable previous bases and no protected scientific-source changes. |
| Implicit DB construction/fetch/model run | Retained-file readers, no writable registry constructors, zero-operation spies and before/after evidence proofs. |
| Failed sweep erases alerts | Failure receipt + unchanged prior state; never infer clearing from absence. |
| Repeated wall-clock publication creates noise | Fingerprint excludes witness/publication time; explicit evaluation-cutoff contract and no-op short circuit. |
| Concurrent Data Organ publication mixes sources | One input manifest snapshot, shared writer lock, reject branch movement, atomic commit. |
| Original source permissions don't cover new exposure | Metadata/ref-first projection; original grant checks; public whitelist rejects reconstructable inputs. |
| History grows beyond file budget | Bounded verified pages, append-only state/receipt chain, no history rewriting/truncation. |

## 32. Implementation sequence after explicit approval

1. Establish an implementation checkout from canonical approved main; protect unrelated local work. Add canonical subset freeze and read-only baseline inventory. No implementation branch/PR is created during this planning turn.
2. Freeze policy, reason codes, evidence map, schemas and identity/lifecycle examples. Validate exact original classes and clocks, including 46-versus-48 scope and synthetic engine history.
3. Implement EvidenceReaders, deterministic rules and reducer with pure tests; prove no imports/calls execute scientific/provider workflows.
4. Implement sweep receipts/failure/no-op handling and the two closed publication projections. Add narrow archive delegations and sabotage before publishing any new risk artifacts.
5. Run first explicit retained-only local/manual sweep, validate all zero-operation/freeze evidence, and repeat unchanged. Retain actual first-seen/publication clocks.
6. Build Replay F3 feed/inspector/coverage/history against those actual artifacts. Preserve existing shell, original source inspectors and factor metadata.
7. Extract/preserve local risk lab, add explicit tab/lazy boundary and required proxy/quoted-mark/modelled-hedge labels and coverage behavior. Keep legacy APIs isolated.
8. Add GET-only router and manual risk workflow. Perform exact manual proof and bounded changed-evidence/failure tests; scheduled risk remains disabled.
9. Complete targeted backend/frontend, archive, publication sabotage, unmocked real browser QA, local lab regression and performance measurements; document actual outcomes and unresolved limits.
10. Present the concrete implementation and proof for review. Any later scheduling or expansion of portfolio/drift/calibration/simulator capability is a separate decision, never implied by v0.1 completion.

## 33. Acceptance gates and approval stop

Phase 7 v0.1 can be accepted only when all these gates pass:

1. **Evidence truth:** every Issue joins exact retained evidence or an explicit absence proof; Data Organ severity/history is preserved; no demo holdings, fabricated first-seen or fake history.
2. **Coverage honesty:** every roadmap check has a coverage slot, unavailable reason and unblock contract; not checked and no finding are distinct; no green category from missing inputs.
3. **Stable lifecycle:** repeated identical evidence produces no new transitions/occurrences/files; genuine changes produce only expected transitions; missing/failed sources cannot resolve old Issues.
4. **Scientific boundary:** all six flags false; no provider capture, training, regression, holdout, Phase 2 reference, Research OS rerun/calibration, Phase 5 rerun/D6, engine campaign, World/God's Eye, RL or live trading.
5. **Freeze:** all canonical prior entries/routes/evidence identities retained; Phase 5 six withdrawals and Phase 6 24 artifacts/18 refs verified; old guard delegation remains narrow.
6. **Failure retention:** first-ever or later failed sweep is visibly failed, evidence retained, previous valid state accessible; no false zero-issue success.
7. **Publication:** only approved derived kind/field/selector/grant projections; all licence/privacy/reconstruction sabotage passes; transaction/concurrency behavior verified.
8. **F3 product:** real unmocked Replay is an issue workspace with status/feed/inspector/coverage/history; browser regressions and measured budgets pass.
9. **Local separation:** authenticated paper lab preserved with explicit estimates, no current-mark substitution or modelled hedge in quoted book, no private/local imports/queries in Replay.
10. **Operations:** approved manual scope=risk proof passes; scheduled Risk Sweep DISABLED / manual AVAILABLE; `organs.yml` and Phase 5 manual-only gate unchanged; D6 final-code proof DEFERRED.

Approval of this plan would authorize only the bounded implementation sequence above. It would not authorize new scientific evidence, example-portfolio publication, simulator work or scheduling. **Stop here for explicit plan approval; do not create an implementation branch or implementation PR yet.**
