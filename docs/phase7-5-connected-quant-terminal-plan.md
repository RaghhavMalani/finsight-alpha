# Phase 7.5 — Connected Quant Terminal: approval plan

Status: PLAN ONLY — awaiting explicit user approval. Prepared 2026-10-27 IST from the merged product. No Phase 7.5 implementation branch, implementation files or PR have been created.

The objective is continuity across MARKET → REGIMES → FACTORS → RISK → DATA → RESEARCH → OBSERVATORY. This milestone improves investigation, navigation and presentation of existing admitted evidence. It does not add scientific research, a security master, economic portfolio, execution system or hosted backend.

## 1. Current merged baseline SHA

PR [#29](https://github.com/RaghhavMalani/finsight-alpha/pull/29) merged as `b7095641db01ca534499e0909a0b91d6a2796ac5`, preserving reviewed feature head `603d9f5e7525dd91e2aba2b38ec5f9a74ed9f425` and its tree. The first authorized default-branch Risk dispatch then created current remote main `e65e6651ccbe758e490b2b48c240aac514cab7c6`, tree `40d82855f27388fd290e7ff34a7e8f9ec51cc22b`. This is the product/evidence baseline for this plan, superseding the historical SHAs and origin counts in the brief.

Local documentation-only commit `6f99daa7cdb636aae79f3e2d8fa5b99994afdd2d` adds Phase 7 closure documentation/proof on top of that main. It is not pushed: automatic approval review rejected a direct documentation push to main without explicit authorization. The plan itself is an uncommitted review artifact. Original workspace `D:/Personal_Projects/Finance/finsight-alpha` remains on the user's unrelated WIP branch; all work uses the already attached Phase 7 worktree, detached from its former feature branch.

Current production: [FinSight](https://finsight-alpha-web.vercel.app), deployment `dpl_9NuaDZijDKinAUcV94BnuE6VBKyo`, READY / production, exact `gitSource.sha` and GitHub metadata `e65e665…`. Its 427,665-byte global manifest is byte-identical to current Git: SHA `856dad3dd43eca28db7c4a157916b609c9687e7b5849bcc6979a526977fc2834`, 339 artifacts / 146 routes, 319 AVAILABLE / 20 UNAVAILABLE.

Audit evidence lives in `.tmp/phase75-plan-audit/`: `production-deployment.json`, `deployment-capability-probes.json`, `browser-audit.json` and 27 screenshots, `targeted-browser-audit.json`, `current-load-budgets.json`, `factor-selected-mom-load.json`, and three independent source audits (`context-audit.md`, `evidence-audit.md`, `capability-source-audit.md`). Current observations below distinguish browser reproduction, source inspection and proposed behavior. The prior A–O assessment remains historical context; it is not substituted for this audit.

## 2. Phase 7 operational-closure result

CODE CLOSED / MERGED; MANUAL DISPATCH VERIFIED; IDENTICAL REPEAT VERIFIED; RISK/REGIME SCHEDULES DISABLED; D6 DISABLED / DEFERRED; SCIENTIFIC CLAIMS FALSE.

| Proof | Verified result |
|---|---|
| First manual dispatch | [40376046937](https://github.com/RaghhavMalani/finsight-alpha/actions/runs/40376046937), `risk.yml`, main, `scope=risk`, SUCCESS, actual checkout `b709564…` |
| Separate immediate repeat | [40376316769](https://github.com/RaghhavMalani/finsight-alpha/actions/runs/40376316769), same input/default branch, SUCCESS, actual checkout `e65e665…` |
| State ID | `e6d16376485283423f5f2fd7eb1ee9bbc4d8bd92b8cb4142f9f38c005df08f62` |
| Sweep ID | `ab2776d927361b3a6848594e0f73ddc3395ac3cbb3eeabf042cdbbef798499e0` |
| Fingerprint | `c05dc93f0594ad16ce0093822735d5eebea367f6fd759caeb373d7abac168a3c` |
| Evidence cutoff | `2026-10-26T06:25:24.443276Z`; publication `2026-10-26T18:15:28.744789Z` |
| Issues / origins | 35 Issues: 13 current real / 8 historical / 13 unavailable / 1 synthetic; 53 Data origins: 9 HIGH / 38 MEDIUM / 6 INFO |
| Coverage | 77 checks: 50 AVAILABLE / 14 PARTIAL / 13 UNAVAILABLE; 34 CLEAR / 22 FINDING / 21 NOT_EVALUATED |
| First transitions | 1 NEW / 34 UPDATED / 0 RESOLVED; 35 new observations/occurrences; eight legitimate publication writes |
| Second dispatch | 0 NEW / UPDATED / RESOLVED, occurrences, artifact writes, manifest rewrites or commits |

The repeat was proved from identical complete Git trees, manifests, all Risk bytes, nine immutable receipts, full reconstructed Issue lifecycles and 203 observations. All 34 older Issue IDs/first anchors and eight older receipts survive exactly. October 23 remains immutable history: 34 Issues / 47 origins / 76 checks. The new epoch does not rewrite it.

All eight operation increments are zero: provider captures, model runs, plugin runs, SeriesModel runs, factor fits, research attempts, holdout openings and simulator runs. The enforced guard and before/after inventory hash agree: `9fc53ec0d8eba8aa16a89838b512ccee7e845e425835ec1e188a786a0bfb3d7d`. Existing scheduled Data remains unchanged; only Risk and regime scheduling are disabled. See [closure document](phase7-risk-manager-v0.1.md#operational-closure-verified-after-merge) and [independent operational proof](qa/phase7-postmerge-operational-proof.json). No additional production sweep is required or authorized by this plan.

## 3. Current shell/navigation architecture

TanStack Start/Router owns file routes and TanStack Query owns request caching (`frontend-v2/src/router.tsx`, `routes/__root.tsx`). `app/workspaces.ts` maps F1–F10 to workspaces. F5/F7 remain reserved browser keys; do not hijack refresh/developer tooling. Native links, command entry and palette coexist.

`app/shell/ForgeShell.tsx` supplies navigation, command line, ticker/mode and global manifest clock. Risk and Factors duplicate the shell with bounded manifest readers. Agents adds its own banner; World/Observatory have specialized full-width content. Most wrappers constrain main to 1360px. Shell links and hotkeys preserve only `ticker`.

Proposed: add `app/terminal/TerminalShell.tsx`; migrate unpinned route wrappers to it. Keep the frozen ForgeShell and nine protected reader/source files byte-identical (§43). RiskShell/FactorsShell become small adapters injecting their existing bounded readers. One shell consumes typed context, capability labels, unified search and compact layout. Mode changes continue using the existing guarded mode/session APIs.

## 4. Current URL/query/context architecture

| Workspace | Current persisted state | Important gap |
|---|---|---|
| Market | ticker and market subroute | chart view is component state; shell ticker store can disagree with route |
| Regimes | asset/ticker, mode, at through route/search handling | shell ignores `asset`; lower Dynamics navigator also writes native history independently |
| Factors | ticker, country, at, panel | country and ticker can contradict; selected factor/drawer local |
| Risk | no declared investigation search codec | Issue, sweep, panel, filters and search are local state |
| Data | country, source, section, bounded annual cutoff | annual observation window is not evidence/publication cutoff; selected lineage item is array-index local state |
| Observatory | scene and ticker | selected cutoff/optimization step local; step is not a market date |
| Agents | existing run/filter/node routes | ID namespace must stay separate from model/scientific runs |
| Research | placeholder | no current research result deep-link workspace |

`replay/mode.tsx` is an in-memory external store, default Replay/SPY. Local Live requires loopback plus the explicit build flag; URL context must never elevate mode. Global manifest `as_of`, selected evidence cutoff, actual observation/state date and model training iteration are distinct clocks.

## 5. Reproduced context-loss bugs

The following were reproduced against production at `e65e665…`. Chrome/Edge/Firefox all reproduce B1, B3, B4 and B5; Chrome additionally exercises B2 and B6. Source references are relative to `frontend-v2/src`.

| ID | Exact current reproduction / result | Source |
|---|---|---|
| B1 | Open `/dynamics?ticker=US-MKT`; choose IN-MKT in Market group. URL becomes `?asset=IN-MKT` and inner dashboard India, but shell stays US-MKT. FACTORS opens US, not India. | `regimes/RegimeIntelligence.tsx:235`; `app/shell/ForgeShell.tsx:33,84,112` |
| B2 | `/risk`: set Issue country INDIA and severity HIGH; URL remains `/risk`; refresh restores ALL/ALL. Issue/sweep/panel use the same local-state pattern. | `risk-manager/RiskWorkspace.tsx:21–32`; `routes/risk.tsx` |
| B3 | `/factors?ticker=in-mkt` normalizes ticker to IN-MKT while defaulting country US. Explicit `ticker=IN-MKT&country=US` also renders US evidence under India shell context. | `routes/factors.tsx:6–7` |
| B4 | Select India Factors audit and first Oct10 cutoff; click REGIMES. Only `ticker=IN-MKT` survives; selected cutoff/panel disappear. | duplicated shell ticker-only links |
| B5 | From India context, palette “Open Model Observatory” navigates to `scene=hmm&ticker=SPY`; SPY trace is unavailable. | `app/command/ForgeCommandPalette.tsx:203–214` |
| B6 | Bare `/data` resolves `country=ALL`. This disproves the historic bare-Data-default-US claim. The actual bug is losing country/source/window/section on cross-workspace links. | `routes/data.tsx:11–13` |

Source-confirmed, not asserted as reproduced browser failures: lower Dynamics uses independent `history.pushState`/popstate (`DynamicsNavigator.tsx:116–149`); Observatory cutoff/cursor and Factor drawer selection reset because they are local. These become explicit back/forward/refresh acceptance tests. Do not generalize historical observations beyond this evidence.

## 6. Existing command grammar

`app/command/mnemonics.ts:23–59` uppercases tokens, accepts one optional trailing GO / `<GO>`, then either a workspace command/label or `TICKER [EXCHANGE] FUNCTION`. Current functions include DES, GP, OMON, FA, REG, GE, RISK, FACT, EXEC, RES, OBS, AGENTS and DATA; exchanges include US/UN/UQ/UP/IN/IS/IB. Listing resolution rejects known venue conflicts/ambiguous unsupported listings.

US-MKT / IN-MKT are already distinguished from securities and reject exchange qualifiers. Their supported function subset is explicit. Existing listing validation is useful and must be retained. `US REG`, `RISK HIGH`, `DATA IIMA`, `ISSUE <id>`, namespaced RUN and cross-market command forms are not supported today.

## 7. Current search mechanisms

CommandLine and palette share the mnemonic parser, but palette separately searches static commands; duplicate Observatory actions preserve context differently. Market TickerSearch is a separate keyboard combobox with a 250ms debounce. In Replay, frozen `markets/queries.ts:78–108` searches bounded INSTRUMENTS metadata; only Local Live may call asset search. Risk and Agents have workspace list filters. There is no unified Issue/source/model/run/factor/research entity index.

Unify the global palette, command entry and Market search presentation around one service/target contract. Keep table-local filters as filters. Preserve frozen listing/query code and guarded Local Live behavior rather than replacing it with a new API search system.

## 8. Current Risk deep-link capability

Risk verifies exact public state/sweep/coverage/observation refs and navigates complete receipt history. However, inspector actions verify evidence in place; they are not cross-workspace links (`IssueInspector.tsx:195–244`). No URL chooses an Issue or sweep. All 35 current Issue `model` fields are null: a MODEL category does not identify one producing run.

A concrete valid link is India stale-model Issue `risk-issue:79f6ba16cdecab29bddcd01f7a635612d459a07c9cf5dfbecc13c7b20bfbc5e4` → exact `regimes:snapshot:188141fd293bf16b0883e0a3faab2a300556fec7cd40a2cc79b4cd60e47f34a6`, IN-MKT, cutoff `2026-10-10T13:59:59.414508Z`. Its ref.run_id is null because the snapshot contains five runs. Open that snapshot; never select one run by guesswork.

## 9. Current Data/Regimes/Factors cross-links

Data lineage shows exact signal → admission → source-version → capture IDs; its selectable row is currently an array index and its external link is a primary source URL. Factor lineage displays declared nodes/edges as text. Factor readers already enforce country/run/asset/cutoff/scope/licence joins. Regimes has its own lineage drawer and a useful two-country retained matrix; it lacks a coherent cross-workspace investigation target.

Available joins include Risk origin → its exact pinned Data Issues artifact/item and Factor metadata → its exact Regimes numerical/snapshot/lineage refs. Example: `india:mom` factor run `e5602e885e3910167eb6120a90e4a0a62fc776f4d2f73c6118b4311b78210e38` declares HMM producer `e8b9663befadd79f457aff9aa6a73ec1968564193abd9ffd9c3cf044c811a2da` and volatility producer `f839fd045b2a5781914764d868569d1e467760a7f422fea7cf946fe4911fd0b7` in the exact India lineage artifact. Frozen Research OS verdicts are present in public Regime/Factor metadata; `/research` itself remains a placeholder. No public per-experiment route is granted merely by a raw file reference.

## 10. Current Vercel capability matrix

Definitions: PUBLIC_REPLAY = checked admitted static evidence/view; HOSTED_API_VERIFIED = the specific remote operation actually verified; HOSTED_AUTH_REQUIRED = observed authentication boundary, business behavior unverified; LOCAL_LIVE_ONLY = currently loopback/configuration-gated functionality; UNAVAILABLE = no admitted public capability. Apply labels per feature/selection/action, not one optimistic label to an entire workspace.

| Feature / selected capability | Current classification | Evidence / limitation |
|---|---|---|
| Market aggregate US-MKT / IN-MKT overview | PUBLIC_REPLAY | derived historical market-factor results; reference securities are not equivalent data coverage |
| Regimes real Phase5 dashboard/timeline/matrix | PUBLIC_REPLAY | historical sealed US/India evidence, unequal component coverage |
| Factors catalogue/MOM diagnostics/audit/ledger | PUBLIC_REPLAY | two countries / three retained cutoffs; read-only |
| Risk Issues/coverage/history | PUBLIC_REPLAY | current 35/53/77 retained result; no public portfolio |
| Data health/issues/revisions/lineage/cost | PUBLIC_REPLAY | available diagnostics; India revision surface remains unavailable |
| Agents runs/benchmarks/trajectories | PUBLIC_REPLAY | recorded runs; no new agent execution |
| Observatory aggregate HMM/signal | PUBLIC_REPLAY | only actual AVAILABLE US-MKT/IN-MKT trace selections |
| Observatory SPY/QQQ/IWM traces; all neural traces | UNAVAILABLE | manifest entries unavailable, despite some recorded-trace wording |
| World quake/satellite context | PUBLIC_REPLAY | recorded snapshots; no exposure/market-impact prediction |
| Browser watchlist | PUBLIC_REPLAY local preference | navigation shortcuts only; no quantitative security screen |
| Frozen Research OS summary | PUBLIC_REPLAY where already published | CLOSED / NOT_CALIBRATED; top-level F6 UI UNAVAILABLE today |
| Lower V1 DEMO latest snapshots | PUBLIC_REPLAY / SYNTHETIC | exact demo-full/demo-sparse latest routes only |
| Lower V1 DEMO historical/compare actions | UNAVAILABLE | their query variants have no admitted Replay routes |
| Paper book/private local Risk lab | LOCAL_LIVE_ONLY | signed session, observed marks and identity guards; hosted workflow unverified |
| Fresh quotes/provider feeds/model training/agent execution | LOCAL_LIVE_ONLY in current client | requires local configuration/entitlements; no execution performed in this audit |
| Factors tenant-local assessment | UNAVAILABLE | no installed local assessment; Live mode alone cannot enable it |
| Public login/account submission | UNAVAILABLE | intentionally local-only form; not a hosted login product |
| Execution/trading/full security screening | UNAVAILABLE | future contract, not offered here |
| `/api/health` through production | HOSTED_API_VERIFIED | GET 200: `status=ok`, `app=FinSight Alpha API`, `version=0.1.0` |
| `/api/auth/me`, protected Risk/Regimes/Data GET boundary | HOSTED_AUTH_REQUIRED, boundary-only | observed 401 JSON; no session, authenticated business operation or backend revision verified |

`frontend-v2/vercel.json` rewrites `/api/*` to the external `finsight-alpha-mocha.vercel.app`. A responding auth middleware can precede route resolution: 401 does not prove route implementation or provider readiness. Current source evidence APIs also contain production refusal guards; they must not be promoted to verified hosted features. No authenticated account, private paper request, provider, model or business mutation was exercised.

The Vercel connector lacked this team scope; the existing explicitly scoped CLI read the same project successfully. No linking, deployment, environment or protection mutation occurred. Browser production access was anonymous; the exact deployed global manifest matched Git.

## 11. Current API/action honesty gaps

Source inventory covers shell, Market subapps, World controls, Risk tabs/evidence/lab, real and legacy Regimes, Factors, Observatory/neural, Agents, Data and login. Correct current controls remain correct: shell Local Live is disabled remotely; Market nonoverview business screens, paper lab and account forms are hidden/gated in Replay; Agents says recorded/read-only; retries re-read evidence rather than collect providers.

| Current gap | Observed result | Planned treatment |
|---|---|---|
| Observatory Method → Live model run | Chrome: enabled; click leaves Replay and page unchanged, no API attempt. `MethodDrawer.tsx:136–143` lacks disabled gate. | capability-aware disabled LOCAL LIVE control and explanation |
| V1 synthetic DEMO REPLAY / COMPARE | Chrome: DEMO latest loads, enabled historical/compare variants produce “Snapshot failed closed”; missing exact routes | disable unsupported variants before interaction; retain admitted synthetic latest view |
| Named palette/landing Observatory SPY; neural recorded wording | three-browser palette opens unavailable SPY; all neural trace entries unavailable | use explicit eligible context/selection or coverage chooser; show neural recording unavailable |
| Research F6 | obsolete Phase4-arrival placeholder | new read-only view of already published frozen summary, no research execution |
| F4 multiple evidence generations | real Phase5 above old V1/synthetic research stack | clear retained real primary view, secondary labelled legacy/synthetic evidence |

The lower “Run 72 frozen worlds” control is not currently reachable in public Replay because prerequisite evidence is unavailable; it is not reported as a visible production bug. Do not run analytics to make unavailable controls pass. Continue to distinguish safe read/retry/playback from compute/private mutation even when an old compute endpoint happens to use GET.

## 12. Current desktop-density problems

Production Chrome captured nine workspaces at 1440×900, 1440×1000 and 1920×1080 (27 views), plus Risk at 390 and 2560. Major workspaces begin around y=192px; Agents around y=231px. At 1920, Market/Regimes/Factors/Risk/Data/Research/Agents main remains 1360px, leaving 280px on each side. At 2560 Risk still uses 1360px, leaving 600px per side.

Risk feed begins around y=686px and shows two complete rows at 1440×900, three at 1440×1000, four at 1920×1080. Its initial inspector extends below the fold. Market's weekly table starts around y=1760px; page height 3467px. Regimes is roughly 3904px tall; key timeline/volatility panels are visible but most component tables follow below. Risk metadata includes text below 11px. Full-width World/Observatory are exceptions, not evidence that the ordinary investigation shell already uses wide screens.

## 13. Current table limitations

Risk has deterministic existing sorting/filtering but no header sort, row keyboard traversal, sticky headers, selected-ID copying or export. Its 35 Issues do not justify virtualization. Data currently has five health rows, 11 source coverage rows, six lineage records and 53 origin records across views. Factor catalogue shows five retained factor rows despite 20 audited definitions; the 64-channel audit already has text/eligibility filters and disclosure rows. Small transition matrices/four-term coefficients have fixed semantic order and should not become sortable generic grids.

Priorities: Risk feed first, Data issues/source health second, Factor audit third. Keep chart matrices accessible and semantically ordered. Build a bounded native-table primitive only for shared demonstrated needs (§30).

## 14. Current chart-interaction limitations

Real F4 already uses 2D SVG/card/timeline panels; no dominant available full-3D fracture landscape exists. Preserve useful legacy visuals in a secondary labelled surface instead of removing an assumed 3D product. Timeline has actual 6705 US / 6466 India dates and a local within-run scrubber; arrays contain warmup/offset semantics. Factor MOM rolling coefficients have 250 dated points but no shared date cursor. Full-window coefficients are not a dated time series. Market has 52 weekly derived rows and local chart modes. Observatory's cursor is an optimization/recorded-trace step, not an observation date. Data revision cutoff is an annual observation-window filter, not evidence age.

Plan shared date interaction only where exact retained dates, asset, run and observation units agree. No interpolation, silent nearest-date mapping, invented event markers or change of retrospective/calibration labels.

## 15. Proposed typed investigation context

Use one versioned semantic context plus a tagged workspace-view union. Avoid globally optional country/security/exchange/source/model/run/Issue/factor/event strings with conflicting meanings.

| Minimal field | Contract |
|---|---|
| `version: 1` | one canonical codec and serializer |
| `market?: US \| INDIA` | a filter; absence means no market filter, not an implicit US |
| `subject?` | discriminated `market-factor {id: US-MKT \| IN-MKT}` OR `reference-listing {providerSymbol, venue}` from existing identity resolver |
| `anchor?` | exact AVAILABLE manifest artifact ID; adapter derives all clock meanings from its verified envelope |
| `compare?` | exact second anchor; usable only after compatibility validation |
| `observationDate?` | ISO date on an actual compatible retained date axis; not a publication cutoff or trace step |
| `origin?` | optional one typed evidence/entity reference identifying the investigation's starting point when following a cross-workspace link |
| `view` | tagged by destination workspace: only its allowed panel, filters and exact entity selection |

`view` contains typed choices such as Risk Issue+owning sweep, Data source/admission/origin, Factors factor_id, Regimes declared producer run, recorded Agents run, or Observatory trace+optimization step. There is no unqualified universal `run_id`. Model identity belongs to a declared producing-run/trace namespace, not a free global model label.

An anchor stores identity, not a user-supplied URL or trusted cutoff. Risk manifest publication time differs from its evidence cutoff; Data publication time differs from annual observation window; Regime requested cutoff differs from `state_at`. Derive and label each separately. Only observationDate represents a shared chart date.

The optional origin reference prevents an Issue→Data→Regimes investigation from discarding its starting Issue. It is one bounded breadcrumb, not a growing URL history. Destination view state may select a source while the origin remains the original Issue. Browser back/forward supplies the route history.

Do not add active event/facility/company/security-master/portfolio/strategy/order fields now. Existing reference listings remain reference identities, not PIT security IDs. Future typed namespaces extend a versioned union only after their evidence contract exists.

## 16. Context compatibility rules

Every destination adapter returns `{applied, parked, unavailable, reasons}`. Apply the compatible subset; retain bounded original identity/anchor in the URL and visible origin breadcrumb. Name every parked field in a CONTEXT NOT APPLICABLE notice. Offer explicit compatible alternatives; never silently reinterpret an identifier.

| Input / destination | Required behavior |
|---|---|
| IN-MKT → Factors/Regimes | derive INDIA consistently; exact retained market-factor identity |
| Reference RELIANCE/NIFTY listing → aggregate Factors/Regimes | retain known country/reference listing as origin; aggregate subject not applicable; require explicit “Open India market factor” action |
| `ticker=IN-MKT&country=US` | reject contradiction, show correction choices; no valid US data under India shell |
| Risk Issue → Data | open exact pinned Data publication/origin; retain Issue origin; do not switch to newer Data alias |
| Risk model Issue with null run_id → Regimes | open exact referenced snapshot; no fabricated producing-run selection |
| Exact anchor missing/unavailable | unavailable selection; never choose latest silently |
| Unknown/untrusted query | bounded useful error, no fetch for forged IDs/URLs; preserve separately validated safe fields only |
| Regime retrospective cursor → Observatory iteration | cursor not applicable; keep observation date as parked origin context, use explicitly typed traceStep separately |
| Different workspace clocks | display both; no promotion of manifest as_of into evidence cutoff or annual observation cutoff |

Bare/default entry may choose the latest admitted selection and visibly state what it chose; canonicalize its resolved exact anchor. “Use latest” is an explicit action. Refresh of a pinned link stays pinned even after a later publication. Legacy query normalization is permitted only when meaning is unambiguous; lowercase identifiers must normalize before compatibility checks.

## 17. URL schema

Retain existing public paths. Introduce `ctx=1` and a fixed key order: shared market/subject/anchor/comparison/date/origin tuple, then workspace-owned selection/filter/panel keys. No serialized auth, book, backend URL, arbitrary path, JSON pointer or executable command.

Example shape (IDs abbreviated here only for readability):

```text
/risk?ctx=1&market=INDIA&subject=market-factor%3AIN-MKT&artifact=risk%3Astate%3A<64hex>&sweep=<64hex>&issue=risk-issue%3A<64hex>&panel=feed&severity=HIGH
/data?ctx=1&market=INDIA&artifact=data-organ%3Aissues%3A<64hex>&originIssue=risk-issue%3A<64hex>&originState=risk%3Astate%3A<64hex>&originSweep=risk%3Asweep%3A<64hex>&source=iima%3Adaily-factors&panel=issues
```

The codec validates full IDs, not the displayed abbreviations. Risk sweep payload ID must resolve uniquely to its verified sweep artifact and owning state. A carried Issue origin requires the complete valid origin tuple; partial tuples reject. Unknown query keys, duplicates, nonstring coercion, control characters, unsupported versions, malformed UTF-8/percent escapes and contradictory aliases reject. Max URL length 4096 bytes, search text 160 characters, at most 12 selected table columns and one origin tuple. Query order changes do not change meaning.

`dataWindowEnd` is an explicitly named workspace-only annual observation cutoff and accepts only existing admitted windows. `traceStep` is an integer bounded by the selected trace. Any legacy `at` import is parsed by its workspace adapter and resolved to an exact artifact; it is not a global clock. TanStack Router is the sole history authority in the migrated wrappers. Debounced filter typing replaces history; deliberate Issue/panel/workspace/anchor changes push history. Generated routeTree is never hand-edited.

## 18. Cross-workspace link contract

Construct one typed `InvestigationTarget` via `links.ts`, used by shell, palette, table rows, evidence inspector and copy-link. It contains destination workspace, typed context/view selection and optional proof of relation. Render native Link/anchor elements so new-tab/middle-click and accessibility work.

A relation link needs an exact source ref, destination entity/anchor, relation enum and the manifest-bound public metadata selector that proves it. Resolve IDs with the destination's validators before rendering an enabled link. An AVAILABLE container may support only a container link, not every entity inside it. Keep “Verify evidence” distinct from “Open related workspace.”

Allowed initial relationships: Risk→pinned Data origin; Risk→explicit Regime snapshot; Factor→declared numerical/producer/lineage artifact; inverse exact referenced-entity→Risk Issues; recorded Agents run→its explicit artifact/task; already public frozen Research summary→its explicit supporting snapshot. Research per-experiment links, generic Risk→Factor/Research, current Data→all historical computations and Observatory→Phase5 producing-run links remain unavailable unless an exact declared ID join exists. No name matching.

## 19. Dependency traversal design

Add a bounded derived navigation index, not a scientific knowledge graph. Node key: kind + namespace + exact ID + artifact anchor. Edge: from/to + relation + backing artifact + fixed selector enum. Relations are `REFERENCED_ARTIFACT`, `ISSUE_ORIGIN`, `DECLARED_PRODUCER`, `DECLARED_SOURCE_VERSION`, `DECLARED_ADMISSION`, `DECLARED_CAPTURE` and `PRESENT_IN`. Build inverse adjacency deterministically. The index grants neither publication nor scientific claims.

Important negative result: across all 21 retained AVAILABLE Data lineage publications, none matches the exact source-version/admission pairs used by the latest retained Regime factor runs. India current Data version `c7eb2691…` / admission `fe41077a…` differs from Regime version `265dfd08…` / admission `4dc6f299…`, even though capture SHA `32af19e5…` agrees. Same bytes/source name do not prove a current health window affected a historical model. Show “impact relationship unavailable”; an optional same-source context link must say different retained versions and must not appear in the affected-computations count.

Runtime traversal: maximum depth 4, 256 visited nodes, 512 edges, 512 KiB fetched metadata per explicit traversal; cycle detection and cancellation required. Build catalog: maximum 4096 entity records / 8192 declared edges before an explicit reviewed capacity change; per shard ≤512 records and ≤128 KiB decoded. Exceeding a bound fails generation or reports bounded incomplete navigation visibly; never silently drops evidence or changes scientific coverage.

The inherited IIMA diagnostic remains explicitly UNAVAILABLE. No synthetic diagnostic node is created. No generic editable graph, event influence, portfolio exposure or invalidation/execution engine is added.

## 20. Unified search design

One deterministic metadata service powers Ctrl+K/⌘K, the command bar and Market search. Static commands/workspaces/reference identities are distinguishable from AVAILABLE evidence entities; a known listing is not a promise of quote coverage. Current searchable evidence: semantic Issues, sweeps, Data source/origin/admission IDs, declared model/run IDs, factor definitions, Regime artifacts, recorded agent runs and actually available traces. Include frozen Research summaries only at the granularity already public; do not fabricate an experiment directory.

Build from an explicit allowlist of validated AVAILABLE public metadata and static reference identities. Index type, namespace, exact ID, label, market, anchor, target and licence/availability. Deduplicate semantic IDs while preserving version choices; show cutoff disambiguation. Sort deterministically. Rank exact full ID > exact mnemonic/reference ID > label prefix > token prefix > substring, then stable type/ID tie-break. No fuzzy dependency inference or model-generated results.

Initial seed contains workspace/command/reference names and compact current summaries. Lazy per-workspace/history shards load only when searched/opened. Search within a loaded shard is synchronous and bounded; cancel stale queries. Historical scope is explicit. Capability-disabled commands may appear with a reason; unavailable evidence must not appear as an openable AVAILABLE search result. One keyboard combobox pattern supports arrows, Enter, Escape, focus restoration and accessible result counts.

A derived index is needed for navigation/search speed; it is build-generated, ignored, compiled as lazy literal metadata modules. It is not a new Replay artifact kind or a new public JSON namespace. Generator verifies original source SHA/bytes/schema/licence and emits only allowlisted fields, records original bindings and roundtrips projections against those exact inputs. Original artifacts remain authoritative and verified on detailed inspection.

Projection verification has two explicit layers. At build time, validate the complete original source bytes/SHA, full original schema, licence, country/run/clock bindings and exact selected fields/rows/offsets. Emit a versioned closed projection contract with the original binding, original full row count, selected window/range, limitations and a digest of the projection itself. In the browser, validate that projection contract/digest and its exact compiled binding; label it a **build-verified projection**, not a browser-verified complete original. Fetching an original on explicit inspection invokes the unchanged whole-artifact SHA/byte and full-payload validator. A partial window cannot establish the original whole-artifact hash at runtime. Risk/Factor full-envelope reads and all full Data/snapshot reads keep their existing whole-payload validation; the distinction applies only to newly projected Market/Regime display windows.

## 21. Command-language design

Keep current verified listing syntax/aliases. Add a small explicit grammar using the same typed target resolver as search:

```text
US REG [GO]                 INDIA REG [GO]
RISK [HIGH|MEDIUM|LOW|MODEL|DATA|SYSTEM] [GO]
DATA <exact-source-id-or-unambiguous-alias> [GO]
FACTOR <catalog-factor-id> <US|INDIA> [GO]
ISSUE <full-semantic-issue-id> [GO]
RUN <namespace>:<exact-run-id> [GO]
CHANGES <US|INDIA> [GO]
COMPARE US INDIA REG [GO]
```

Examples: `DATA IIMA` works only if alias resolves uniquely to the admitted source; `FACTOR india:mom INDIA` selects the actual factor ID. If a shorter MOM alias is offered, the country-qualified resolver must resolve exactly one catalogue entry. `RISK MODEL` is category filtering, not a model fit. RUN namespaces are explicit (e.g. regime / agent), never a guessed universal hash.

ISSUE uses the selected/current owning sweep; historical ambiguity asks for a cutoff choice in the result surface, not silent selection. CHANGES requires compatible anchors or offers their explicit selection. COMPARE opens the retained cross-market matrix with independently labelled cutoffs/calendars; it does not assert synchronized economic comparability. Reject trading verbs, arbitrary natural-language execution, unavailable capability, unknown/ambiguous source, partial IDs and incompatible context before navigation. Provide a useful correction and eligible targets. Parse commands, never eval them; no command invokes scientific execution.

## 22. “What changed?” comparison design

Use two exact verified anchors, their declared history relation and country/subject compatibility. Classify field-level metadata change, publication/identity-only change, explicit lifecycle transition and NOT_COMPARABLE separately. Include left/right evidence cutoffs, observation dates, policy/evaluator/source/control identities and unavailable differences. An Issue missing from a list is not resolved; only a retained resolution transition is resolution evidence.

“What changed in India?” can be answered today in this bounded sense. October 23→26 Risk India remains 10 semantic Issues while Data origin records rise 24→27 (three additional IIMA health origins). There is no NEW India Issue. Across the same total Risk publication, US rises 10→11 Issues and 23→26 origins; the new required-source BLS attempt is US. Do not confuse all 34 receipt UPDATED transitions with 34 changed economic conclusions.

All three Oct10 Regime publications retain the same `(state_at, hmm2_state, volatility_state, momentum_sign)` per country despite different run IDs. US state_at is 2026-08-31, India 2025-12-31. Report identity/publication change with unchanged selected state summary. Compare Factor estimates only when country, assessment/control/profile/source basis and compatible cutoff semantics agree; otherwise show not comparable. Data compares exact selected publication metadata/health windows and keeps current versus historical origins explicit.

Implement pure deterministic diff adapters over existing fields; no model, regression, new returns/IC statistics or live attribution. Load only the two requested bundles and related bounded summary metadata. A country report groups workspace results with independent clocks and clearly states missing dependency edges. It cannot explain price moves, portfolio P&L, causality or live transitions.

## 23. Risk-first investigation workflow

Risk becomes the principal investigation hub; Market remains a valid starting page. The primary inspector shows: finding and scope, current/historical/synthetic/unavailable status, severity, why it exists, what changed, remediation/limitation, and only proven related-workspace actions. Retain first/latest/resolution anchors and full origin records.

Place lengthy policy serialization, full SHA/byte/source seals, complete chronology and origin multiplicity details under one-action evidence/provenance disclosure. Keep critical evidence cutoff, historical state date, uncalibrated/capture-only limits, licence status and unavailable coverage visible in the primary layer. Do not hide caveats merely to make the interface denser. “Verify exact evidence” remains available; remediation never promises a provider refresh or automated trading fix.

## 24. Regimes integration plan

Primary view: selected retained regime, evidence cutoff versus actual state_at, change summary, volatility state, model health, partial MOM factor context, fracture coverage and exact related Risk links. Use a compact component-status table and timeline window near the top. Put complete history, full matrices, lineage and older synthetic/legacy visual work in labelled secondary panels. Real F4 already is 2D; no useful visualization is discarded on the assumption of a 3D problem.

| Phase5 component | Required presentation / scientific boundary |
|---|---|
| Volatility clustering | real retained diagnostic; US AVAILABLE, India PARTIAL calendar/observation semantics; historical, not fresh instrument monitoring |
| Intraday seasonality | public UNAVAILABLE for both; conditional US local IEX only, India additionally lacks admitted calendar; no fake heatmap |
| Factor neutrality | PARTIAL MOM on MKT/SMB/HML; seven-factor/universal neutrality unavailable; diagnostic asymptotic, not calibrated |
| Regime momentum | descriptive retained MOM/lagged state; no validated alpha; frozen Research OS verdict stays separate |
| MacroHFT fracture | PARTIAL volatility-only 1/6 contribution; full score/landscape unavailable; never display it as a completed composite |
| Hawkes / future Hawkes→HMM | synthetic work retained elsewhere; real event pressure and Hawkes-driven HMM unavailable/unvalidated |

Visible timeline window may project exact existing dated rows/offsets for initial performance, with full retained history on demand and explicit window label. This is lossless selection from unchanged evidence, not refitting or relabelling retrospective paths. “NOW” means latest admitted retained state, never a live prediction. HMM filtered confidence remains uncalibrated; PARAMETER_RETROSPECTIVE remains explicit.

## 25. Factors integration plan

Lead with the actual MOM assessment: exposure to MKT/SMB/HML, change only where comparable, plain interpretation and limitation. A security context cannot become a security factor estimate. Default to an explicit country-qualified MOM selection if the user chooses the exposure view; preserve it in URL. Retain five-factor catalogue, 20-definition/64-channel audit, claim-readiness ledger and exact lineage as deeper panels.

Keep original 24 metadata artifacts and 18 numerical references untouched. No new factor fit, regression, decile sorts, IC/rank IC, turnover, security factors or alpha claims. Full-window HAC is retrospective; rolling coefficients are prior-only and have 250 dated tail points. Do not silently compare different controls/profiles/source bases. Fix country/subject validation before cosmetic changes. Existing full metadata/binding validation remains on every selected payload.

## 26. Data integration plan

Primary view answers which source is broken, whether finding/window is current or historical, what changed between exact publications and what declared dependants can actually be proven. Combine a compact source-health summary with the existing 53-origin Issue view; retain coverage, revisions, disagreement, costs and lineage tabs.

URL-address source/origin/admission identity instead of array index. Open the exact pinned epoch from a Risk link; provide a separate explicit latest-source action. Never map an evidence cutoff into the annual revision-window control. Current Data→historical Regime impact is unavailable under §19; show that limitation rather than a guessed downstream list. All Data Organ semantics and source admission remain unchanged.

## 27. Capability-matrix architecture

Add one `app/terminal/capabilities.ts` registry and resolver, keyed by stable feature/action ID plus selected evidence/mode. Each result contains exactly one of the five required labels, allowed action class, disabled reason, required mode, optional exact public evidence ref and dated verification basis. Separate navigate/read/playback/local preference/local computation/private mutation. Current source+remote proof (§10) seeds it; health verification never enables business actions.

All prominent affected CTAs consume a shared CapabilityAction presentation and the same resolver. Selection-specific availability matters: aggregate HMM versus SPY, DEMO latest versus historical compare, public Factors versus missing tenant assessment. New direct action code must not maintain its own optimistic “live” constant. Preserve server authorization independently. No periodic runtime capability probes, auth attempts, provider calls or permission expansion.

## 28. Public Replay vs Local Live UX contract

Public Replay performs only checked derived-evidence reads and local navigation/preferences/playback. Zero provider calls, private paper hydration, scientific execution or unexpected API mutation. Never show a training, agent execution, provider refresh, private book write or backtest as a supported hosted action. Unsupported actions are disabled with explanation, hidden where appropriate, or explicitly marked LOCAL LIVE before interaction.

Local Live remains loopback + explicit configuration + existing signed-session/account checks. URL/storage/search cannot enable it. Mode changes retain the existing QueryClient cancellation/clear and session-boundary isolation. Do not mount a LocalRiskLab or model hook to populate a public decision summary. No backend rewrite, credential setup or hosted business-flow implementation belongs to this phase. Existing safe Replay retry means re-read retained bytes; label it accordingly.

## 29. Desktop/wide-layout design

Desktop is the primary product. Use a full available-width shell with 24px gutters at 1440 and 32px at 1920+, rather than a fixed 1360px centre. Proposed compact chrome budget ≤120px before workspace content at 1440/1920; navigation, command and context remain keyboard accessible. Do not achieve density by shrinking text.

At 1440 Risk: two columns, flexible feed and 360–420px inspector; table header by y≤380px, at least 10 complete 40–44px rows at 900px height. At 1920: roughly 240px source/change navigation, ≥850px feed/timeline, 420–480px inspector using remaining width; at least 12 complete feed rows at 1080px. Allow keyboard-operable inspector resizing within min/max bounds, saved as a layout preference. At ≥2560 keep readable text line lengths but let tables/charts use additional columns/width; no return to a 1360px wall. Multi-monitor sharing uses independently openable exact links, not synchronized private desktop state.

Regimes at 1920: left compact state/component/change column, centre retained timeline/volatility/model view, right exact evidence/Risk inspector. Factors: exposure/change/interpretation centre with catalogue/audit secondary. Data: source/issues table with evidence/lineage inspector. Sticky compact context and owned panel scroll regions prevent page-long chrome; focused rows must not hide behind sticky elements.

Body/table decision text ≥13px, secondary metadata ≥11px with explicit contrast checks, long IDs copyable/expandable. Preserve visible focus, text zoom, semantic headings, reduced motion, touch alternatives and screen-reader table structure. 390px stays correct using stacked panels and deliberate table scroll, not the desktop design driver. [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) inform the URL, focus and accessibility review; exact product acceptance is defined here.

## 30. Table interaction plan

One bounded native `InvestigationTable` supplies stable row IDs, optional column sort/filter, `aria-sort`, sticky headers inside its own labelled region, roving row focus with arrows/Home/End, Enter to open inspector, Escape to restore focus, copy selected ID/link and visible-column preference. Sorting never changes semantic selection or Issue identity. Use a stable final ID tie-break. Offer only meaningful columns; no drag-only controls.

Initial users: Risk feed; Data Issue/source-health summary. Factor audit gains compact keyboard navigation and copy/eligibility grouping while retaining its existing filters and full 64-channel disclosure. Small transition matrices remain semantic matrices. Column resizing is included for the wide Issue/source tables only, with keyboard alternatives and bounded widths; other tables defer it. No virtualization for present ≤64 principal rows; if a future bounded list materially exceeds this, profile before adding it. No generic enterprise-grid package. Export is routed exclusively through §33's whitelist.

## 31. Chart-linking plan

Use a shared optional observation-date cursor only after a chart adapter verifies subject, run/anchor, real dates, unit and offset/warmup compatibility. F4 timeline/volatility/HMM and descriptive MOM may share actual dated points; F5 rolling coefficients join only dates present in their exact 250-point tail. Market weekly cursor remains weekly; selecting a day without a corresponding exact displayed week mapping must explain the limitation, not silently snap.

Cross-market overlays require explicit date intersection and separate state_at/calendar/unit badges. No India session-calendar equivalence or synthetic annualization. Comparison views label both retained cutoffs. Risk markers require both an exact declared identity/lineage relation to the selected series/run and an exact observation/evidence time supported by the Issue. Country and date alone do not establish a marker relation; a publication timestamp is not an event in the market series. An unmatched time remains unplotted with a reason.

Observatory traceStep remains a separate optimization-axis cursor. Keep useful recorded 3D/model-space views secondary to the decision/evidence summary and available without implying calibration. WORLD overlay hooks stay unpopulated until admitted event/relationship evidence exists. Keyboard cursor control, data table alternative and reduced-motion behavior are required; no fake interactive points.

## 32. Saved-state plan

| State | Authority / persistence |
|---|---|
| Workspace, subject/market, exact anchors, comparable anchor, filters, panel and exact Issue/model/run/factor/source selection | canonical typed URL; shareable, survives refresh/back/forward |
| Origin investigation reference | bounded typed URL tuple, no arbitrary return URL or expanding breadcrumb log |
| Inspector width, density, visible columns, nonprivate supported-ID shortcuts | versioned browser-local preference; URL selection wins; malformed storage ignored safely |
| Replay/Local mode, private session/account/book/pending writes | existing protected APIs/store; never encoded in shared URL or entity index |
| Future server-saved/collaborative workspace | deferred; no sync/account database in7.5 |

Preserve existing watchlist as ≤30 supported navigation shortcuts with cross-tab updates, not a PIT universe/screener/portfolio. Label reference identities without coverage as unavailable for the selected function. Do not copy local private holdings into shortcuts or public search. Browser storage refusal must preserve functional navigation. Clear private caches through existing account/logout boundaries; changing a public investigation must not hydrate private state.

## 33. Export plan

Implement CSV, strict JSON and copy-link for explicit public derived metadata schemas: Issue list/evidence summary, Data health summary, Factor definition/audit eligibility metadata and Regime diagnostic summary. Defer printable report until these are correct; no PDF/report framework now.

Whitelist exact fields and source/selector kinds. Require AVAILABLE input, accepted licence status and positive `publish_derived` permission for the selected public derivative; a reference alone grants no redistribution. Preserve attribution/terms identifiers and any validity/clock limits. Every export includes schema version, exact source artifact IDs/SHA, evidence/publication/observation clocks as relevant, country/subject, unavailable status/reasons and all six false claim flags.

Exclude raw licensed returns/prices/bars/vintages, arrays underlying a permitted summary, local traces/holdings/books, prompts/tokens/credentials and unapproved third-party data. Factor export is audit/eligibility metadata and explicitly approved diagnostic summary, not raw research-source arrays. Regime export does not turn uncalibrated diagnostics into a forecast. CSV neutralizes formula-leading cells (`=`, `+`, `-`, `@`, tabs/control prefixes); JSON rejects nonfinite/unknown fields. Cap each export at 256 rows / 256 KiB, show a precise bounded-scope message rather than silently truncate. Copy-link passes the same privacy/codec checks.

## 34. Future WORLD extension points

Reserve versioned entity/relationship namespaces, not active fake fields or links. Future 8W/10W can add event, location, facility, company, PIT security, exposure-ledger and impact-evidence refs through the same typed target and verified-edge interfaces. Unknown future kinds currently reject. Existing World quake/satellite recorded context and synthetic Forge world hashes remain distinct namespaces.

Future EVENT → LOCATION → FACILITY → COMPANY → SECURITY → SUPPLY CHAIN → REGIME/FACTOR → HAWKES PRESSURE → IMPACT → RISK links require declared evidence at each edge. None is inferred from geography, company name or an earthquake marker today. No facility graph, impact model, real-event Hawkes training or Hawkes→HMM is implemented.

## 35. Future Execution extension points

Evidence links may later carry a typed immutable decision-evidence bundle of public anchor refs, compatibility/availability and claim limits into a separately gated validation workspace. There is no order/strategy/account selection or execute action in7.5. Evidence availability is not execution eligibility.

| Future phase | Clean boundary left by7.5 |
|---|---|
| 8A PIT security/data spine | replace/extend reference-listing namespace only when true PIT identity/calendar/licence contracts exist |
| 8B economic portfolio/watchlists/screens/alerts | separate private economic state from public investigation; do not relabel navigation shortcuts |
| 8W World event/exposure ledger | add exact event/company/security/exposure IDs and declared edges |
| 9E bounded execution validation | separate eligibility/action registry; explicit validation and scientific gates |
| 9F professional factors | new approved security/PIT assessment namespace, not an expansion of frozen MOM evidence |
| 10W World impact/Hawkes pressure | admitted event/impact evidence and validated methods before linking pressure to regime |
| 11N selective neural/RL | versioned recorded/validated model capabilities, no current availability implication |

This prepares the EVENT → EXPOSURE → REGIME → RISK → EXECUTION loop by giving it typed, provenance-bound connection points. It does not fill missing scientific/economic relationships.

## 36. Exact files to ADD after approval

These are proposed implementation files, not created by this planning task. No backend, scientific computation, production manifest/artifact, database or workflow scheduling file is added.

| Exact path | Responsibility |
|---|---|
| `frontend-v2/src/app/terminal/context.ts` | discriminated context/view types, canonical URL codec and bounds |
| `frontend-v2/src/app/terminal/compatibility.ts` | destination compatibility, parked context and correction reasons |
| `frontend-v2/src/app/terminal/links.ts` | typed targets/native link construction and relation proof |
| `frontend-v2/src/app/terminal/capabilities.ts` | one five-label capability registry/resolver |
| `frontend-v2/src/app/terminal/catalog.ts` | bounded lazy generated metadata shard loading/validation |
| `frontend-v2/src/app/terminal/reader.ts` | strict original reader plus separately versioned build-projection contracts and licence rules |
| `frontend-v2/src/app/terminal/search.ts` | deterministic entity ranking/deduplication |
| `frontend-v2/src/app/terminal/commands.ts` | bounded grammar, shared target resolution and useful failures |
| `frontend-v2/src/app/terminal/changes.ts` | pure compatible retained-metadata diff adapters |
| `frontend-v2/src/app/terminal/preferences.ts` | nonprivate versioned local layout/shortcut preferences |
| `frontend-v2/src/app/terminal/exports.ts` | licence/field-whitelisted CSV/JSON/copy-link |
| `frontend-v2/src/app/terminal/TerminalShell.tsx` | shared compact wide shell with injected bounded workspace readers |
| `frontend-v2/src/app/terminal/ContextBar.tsx` | subject/clocks/origin/compatibility status and explicit corrections |
| `frontend-v2/src/app/terminal/CapabilityAction.tsx` | consistent gated action presentation |
| `frontend-v2/src/app/terminal/EvidenceLink.tsx` | proven typed workspace navigation plus verify-evidence action |
| `frontend-v2/src/app/terminal/ChangeSummary.tsx` | bounded country/anchor comparison surface |
| `frontend-v2/src/app/terminal/InvestigationTable.tsx` | native bounded table interactions/keyboard/columns |
| `frontend-v2/src/app/terminal/terminal.css` | scoped compact/wide/accessibility layout |
| `frontend-v2/src/research/ResearchEvidenceWorkspace.tsx` | read-only already-public frozen Research OS summary |
| `frontend-v2/scripts/generate-terminal-index.mjs` | pure deterministic allowlisted metadata/read projection generator |
| `frontend-v2/scripts/verify-terminal-context.mjs` | codec/link/index/commands/capabilities/diff/export/privacy sabotage |
| `frontend-v2/scripts/verify-terminal-browser.mjs` | browser/context/action/density/network/performance gates |
| `docs/phase7-5-connected-quant-terminal.md` | implementation/final verification report, only after approval |
| `docs/qa/phase7-5-connected-quant-terminal-proof.json` | final engineering proof, only after approval |

Generator outputs are ignored build products under `frontend-v2/src/app/terminal/generated/`: `seed.generated.ts`, `market.generated.ts`, `regimes.generated.ts`, `risk.generated.ts`, `factors.generated.ts`, `data.generated.ts`, `recordings.generated.ts`, `history.generated.ts`. All eight exact modules have fixed contracts and lazy imports. They contain bounded navigation/read metadata and exact already-derived display windows, not raw licensed source arrays. Their aggregate limits and lossless field-selection checks are gates; do not grow/prune around a failing budget without review. No new public JSON artifact namespace is needed.

## 37. Exact files to CHANGE after approval

Only the following existing files are in the proposed implementation scope. Existing scientific validators remain authoritative; extensions here are for presentation/link fields, not changes to sealed scientific contracts.

| Exact path | Bounded change |
|---|---|
| `frontend-v2/src/routes/markets.tsx` | shared shell/context integration; retain Local Live parent gates |
| `frontend-v2/src/routes/dynamics.tsx` | typed Regime URL validation |
| `frontend-v2/src/routes/factors.tsx` | one country/subject/anchor codec; reject contradictory legacy input |
| `frontend-v2/src/routes/risk.tsx` | exact Issue/sweep/filter/panel URL selection |
| `frontend-v2/src/routes/data.tsx` | source/publication identity and separately named annual window |
| `frontend-v2/src/routes/research.tsx` | replace stale placeholder with bounded read-only summary |
| `frontend-v2/src/routes/observatory.tsx` | typed available trace/view URL state |
| `frontend-v2/src/routes/globe.tsx` | carry compatible shared context; no new event relationships |
| `frontend-v2/src/routes/forge.tsx` | carry shared context into recorded workspace selection |
| `frontend-v2/src/routes/runs.tsx` | retain shared context on recorded-run layout/navigation |
| `frontend-v2/src/routes/runs.index.tsx` | combine existing run filters with shared codec |
| `frontend-v2/src/routes/runs.$runId.tsx` | exact recorded-run target/origin; no run namespace conflation |
| `frontend-v2/src/routes/index.tsx` | capability-honest Observatory/neural entry targets/copy |
| `frontend-v2/src/app/workspaces.ts` | current capability metadata; remove obsolete arrival claims |
| `frontend-v2/src/app/command/CommandLine.tsx` | shared parser/search result targets |
| `frontend-v2/src/app/command/ForgeCommandPalette.tsx` | single search service; remove hard-coded SPY destinations |
| `frontend-v2/src/app/command/mnemonics.ts` | compatibility wrapper retaining existing listing grammar |
| `frontend-v2/src/markets/TickerSearch.tsx` | common search presentation with existing guarded local resolver |
| `frontend-v2/src/markets/ReplayOverviewScreen.tsx` | bounded already-derived weekly view, typed chart selection/cursor |
| `frontend-v2/src/risk-manager/RiskShell.tsx` | reader adapter into new shell; preserve existing read budget |
| `frontend-v2/src/risk-manager/RiskWorkspace.tsx` | URL selections, compact decisions/change view/table |
| `frontend-v2/src/risk-manager/IssueFeed.tsx` | bounded table/keyboard selection and permitted export |
| `frontend-v2/src/risk-manager/IssueInspector.tsx` | decision-first order and exact related links |
| `frontend-v2/src/risk-manager/SweepHistory.tsx` | URL-addressed existing chain navigation and comparison |
| `frontend-v2/src/regimes/RegimeIntelligence.tsx` | context/clocks/decision hierarchy/change/Risk links |
| `frontend-v2/src/regimes/query.ts` | exact bounded current/historical original reads with full validation; distinct display-window projection contract |
| `frontend-v2/src/regimes/panels.tsx` | actual-date cursor and bounded initial window with full history on demand |
| `frontend-v2/src/regimes/LineageDrawer.tsx` | proven typed entity links |
| `frontend-v2/src/dynamics/DynamicsNavigator.tsx` | one router history; secondary legacy stack and new shell |
| `frontend-v2/src/dynamics/RegimeProduct.tsx` | capability-gate unsupported historical/compare variants |
| `frontend-v2/src/factors/FactorsShell.tsx` | inject existing Factor projection into shared shell |
| `frontend-v2/src/factors/FactorsWorkspace.tsx` | exposure-first view, typed factor/panel selection/change |
| `frontend-v2/src/factors/RetainedDiagnostics.tsx` | exact-date rolling cursor and limitations |
| `frontend-v2/src/factors/OutputAudit.tsx` | bounded keyboard/copy/eligibility interactions |
| `frontend-v2/src/factors/LineageDrawer.tsx` | declared exact producer/source links |
| `frontend-v2/src/data-organ/DataWorkspace.tsx` | current/historical source/issues/change/table presentation |
| `frontend-v2/src/data-organ/query.ts` | bounded exact publication reader, unchanged cross-view epoch checks |
| `frontend-v2/src/data-organ/LineageInspector.tsx` | identity selection and proven dependency navigation |
| `frontend-v2/src/data-organ/RevisionObservatory.tsx` | explicit observation-window naming, no clock reinterpretation |
| `frontend-v2/src/components/observatory/ObservatoryPage.tsx` | new shell, available trace selection and typed trace step |
| `frontend-v2/src/components/observatory/MethodDrawer.tsx` | disabled/explained remote Live action |
| `frontend-v2/src/components/observatory/Timeline.tsx` | persisted recorded-step semantics/keyboard without date coercion |
| `frontend-v2/src/components/globe/GlobePage.tsx` | shared shell/capability labels, recorded context only |
| `frontend-v2/src/forge/shared/AgentsShell.tsx` | shared shell carrying context; recorded-only banner |
| `frontend-v2/src/forge/command-center/CommandCenter.tsx` | typed recorded-run/evidence navigation and capability copy |
| `frontend-v2/src/forge/runs/RunIndex.tsx` | preserve context on exact recorded-run links |
| `frontend-v2/src/forge/runs/RunObserver.tsx` | preserve context/origin on existing evidenced links |
| `frontend-v2/scripts/verify-risk-browser.mjs` | adjust presentation selectors; retain all caps/failure/privacy cases |
| `frontend-v2/scripts/verify-factors.mjs` | current full audit plus context/entry expectations; no weaker checks |
| `frontend-v2/scripts/verify-regimes.mjs` | presentation/context/date-cursor verification |
| `frontend-v2/scripts/verify-data.mjs` | exact publication/source/window/context verification |
| `frontend-v2/package.json` | add pure generator and static/browser verification hooks |
| `.gitignore` | ignore the eight generated terminal modules/build QA outputs |
| `.github/workflows/ci.yml` | add frontend terminal checks only; keep required jobs, budgets and scientific gates unchanged |

Existing workspace CSS files can remain byte-identical: new scoped terminal.css supplies the planned layout. No changes to frozen `app/shell/ForgeShell.tsx`, `markets/queries.ts`, `replay/*` protected files, original artifact schemas or original archives. If implementation discovers another file is necessary, report a concrete scope amendment and obtain approval before changing it. Do not silently expand this manifest.

## 38. Exact files to DELETE

None. Keep original frozen shells/readers, legacy visual/scientific evidence and all original routes/history. Unused frozen compatibility components may remain present without being the active terminal wrapper.

## 39. Test / sabotage matrix

All tests below are proposed implementation gates; this planning task has not created their implementation files or executed scientific work. Existing archive/schema/origin/chronology checks remain intact.

| Boundary | Required positive and sabotage cases |
|---|---|
| URL codec | canonical parse/serialize roundtrip; stable key order; lowercase normalization before compatibility; duplicate/unknown keys, malformed UTF-8/percent, nonstring coercion, excessive length/control bytes, wrong version and path/URL injection reject |
| Identity/context | country/subject contradiction, factor/security confusion, same ID wrong namespace, forged venue, arbitrary model/run, missing/partial origin tuple, wrong owning sweep and forged artifact cutoff reject |
| Continuity | seven-workspace chain preserves compatible context; refresh/back/forward/new-tab/copy-link preserve selection; deliberate changes push and text edits replace; incompatible fields visibly parked, never silently mapped |
| Evidence links | exact Risk→Data item and Risk→Regime container; exact Factor producer refs; null run stays null; orphan/substituted refs, stale alias replacing pinned epoch, same capture/different admission and name-only dependency fail |
| Dependency/index | deterministic rebuild/hash/field-projection equality; unknown selectors/kinds/claim flags, bad licence, missing/non-AVAILABLE input, cycles and node/edge/depth/byte overflow reject; no silent pruning; inherited IIMA missing diagnostic stays unavailable |
| Search | exact-ID priority, stable ties/deduplication, country/epoch disambiguation, cancelled stale query, unavailable result gating; no raw/private text or invented experiment index |
| Commands | each grammar form and legacy alias; unknown/partial/ambiguous IDs, unsupported source/function/trading verb, invalid compare basis and unavailable capabilities give useful no-execution failure |
| Comparisons | exact receipt lifecycle versus mere disappearance, evidence/publication-only distinction, incompatible country/policy/control/calendar/source basis, no date intersection and observation/window clock confusion |
| Capabilities | one registry across prominent controls; 401 never verifies a business feature; no neural recording label without AVAILABLE entry; legacy DEMO compare disabled; every remote Live CTA disabled/explained before click |
| Private isolation | URL/storage/index injection of account/book/token/backend URL rejected; changing mode cannot bypass loopback flag; no paper hydration in Replay; existing account/logout/race clearing preserved |
| Tables | sort stability, selected ID invariant, arrow/Home/End/Enter/Escape focus, aria-sort, column preference corruption, sticky-header focus visibility, keyboard resizing, long IDs and empty rows |
| Charts | exact date/offset/warmup, no nearest-date fallback, no posterior calibration promotion, traceStep/date distinction, unavailable event markers, deterministic compatible cross-market intersection |
| Export | positive public-derived whitelist; unknown/missing licence, raw arrays, private values, nonfinite data, formula injection, overbudget/unknown fields and changed claims reject |
| Freeze/performance | all original scientific/artifact/source hashes, routes, withdrawals and counts; initial chunk/data/validation caps; no eager global graph or unselected legacy/model trace fetch |

No test may manufacture a scientific result to satisfy UI availability. Engineering mutation fixtures stay in temporary directories and carry engineering provenance. No change to old test or budget simply to make a failing new layout pass.

## 40. Browser QA matrix

Chrome, Edge and Firefox at 390×844, 1440×1000 and 1920×1080. Risk and Regimes additionally at 1440×900 in all three; wide shell at 2560×1080 in Chrome/Edge and two independently open exact-context tabs. The 1440/1920 professional desktop experience is the primary acceptance bar.

For each browser: MARKET→REGIMES→FACTORS→RISK→DATA→RESEARCH→OBSERVATORY, plus recorded Agents/World entry/capability checks; URL/deep-link refresh/back/forward/new-tab; conflicting subject/country; historical selection; Issue/source/model/run focus; keyboard search/commands/table; empty/unavailable/no-permission states; 200% zoom and focus traversal. Check reduced motion and a normal-motion desktop case. No hidden focused content, unintended page-level horizontal overflow or inaccessible drag-only control.

Exercise every enabled prominent public action identified in §11 with network recording. Zero provider calls, private paper requests/hydration, scientific calls, polling or unexpected API mutations. Prohibit business GETs that compute as well as non-GETs. Record source/deployment SHA, selected immutable artifacts, screenshots, console errors, requests/bytes and gating results. Do not use a local preview's missing Vercel rewrite to infer the hosted API is absent.

Current planning audit already captured 27 production views and 29 targeted probes across all three browsers, with zero page errors or blocked/attempted API/mutation requests. It verified actual context/capability gaps rather than claiming they are fixed. Eight separate GET-only remote diagnostic/manifest probes are recorded as audit probes, not Replay user-workflow traffic.

## 41. Performance budgets

Measured current production, fresh browser context, uncompressed selected data and gzip JS body measurements. Raw figures are in `current-load-budgets.json` and `factor-selected-mom-load.json`.

| Current route/selection | Audited load |
|---|---:|
| Risk initial current | 298,097 data bytes = 57,867 read projection + 113,084 primary + 127,146 receipt; route JS 37,750 gzip bytes |
| Factors unselected catalogue | 61,892 data bytes; selected MOM US diagnostic load 179,268 bytes |
| Regimes current compound page | 1,772,813 data bytes, including global manifest, 345,357-byte full timeline and 848,540-byte older evidence view |
| Data current | 493,529 data bytes, of which 427,665 is the global manifest |
| Market default US aggregate | 1,276,181 data bytes, including global manifest and 848,516-byte full retained series |

The prior reviewed full incremental Factor chunk set was 25,241 gzip bytes at the identical implementation source; current fresh catalogue alone is smaller. Do not misrepresent catalogue-only bytes as the whole exposure/audit product.

Proposed gates:

- Keep existing Risk selected state+receipt ≤256 KiB, total initial data ≤512 KiB, synchronous validation ≤50ms and filter interaction ≤100ms. Keep the original 64 KiB incremental executable workspace cap for both Risk and Factors, counting new terminal dependencies attributable to that route rather than hiding them in a shared chunk.
- New shared terminal functionality ≤24 KiB gzip, included in those aggregate workspace caps. Common initial JS target ≤224 KiB gzip for the five main evidence routes; legacy 3D/trace code must remain deferred. Risk currently totals 179,157 gzip JS bytes; current compound Regimes totals 243,970 and needs lazy separation to meet the proposed target.
- Initial navigation/search seed ≤48 KiB decoded /12 KiB gzip. Lazy shard ≤128 KiB decoded /32 KiB gzip and ≤512 records; no complete repository/graph/manifest fetch just to show search or shell.
- Initial Market/Regimes/Data selected data target ≤256 KiB; Factors total initial ≤512 KiB. Use build-only exact projections of already-derived weekly/timeline windows, declared metadata and bounded read bindings. Show window length/full-history action. Keep original complete artifacts unchanged and fetch them on explicit inspection. Do not recompute statistics or omit evidence secretly.
- Explicit full history/trace read ≤2 MiB per user-selected bounded artifact; compatible two-anchor change report ≤1 MiB total data; traversal/export limits remain §19/§33. Check declared size before fetch, cancellation and error states. A large trace is not an initial global search input.
- Warm compatible navigation UI response p95≤150ms; loaded-shard search p95≤30ms; context parse/serialize p95≤2ms for a valid 4KiB URL. Measure at least30 deterministic interactions in the controlled browser harness and report environment/sample counts. Payload validation retains its own existing gate; no acceptance cache replaces validation.

Generator field-selection/roundtrip checks prove a window or index is an exact projection of its verified source; it cannot grant new publication rights or fabricate a result. Full numerical history is retained, accessible and explicitly distinguished from the initial display window. A failing budget is a finding to repair or bring back for scope approval, not a reason to raise thresholds, omit old epochs or repeatedly rerun until green.

## 42. Licence/privacy boundaries

All six claim flags remain false. Require explicit accepted licence + publish_derived permission for each indexed/read/exported public derivative. Source attribution, evidence class, cutoff, historical state date and unavailable/partial limits survive projection. No raw licensed source, private account/book/trace, credential, provider token, research holdout or unpublished ledger enters the public index, URL, logs or export.

Public Research summary reads only already-public `frozen_research` metadata and exact admitted refs. A source file path/SHA inside a public summary does not authorize publishing that file. Reference listings/venue metadata are not a security master or point-in-time universe. Existing auth authority remains the signed cookie; no owner/header/URL chooses another account. Hosted health and401 evidence remain narrow facts, not permission to test business mutations.

## 43. Phase 0–7 freeze strategy

Take an implementation-start Git/working-byte inventory on then-current main, including all current publication entries and immutable Risk raw/public histories; reconcile legitimate intervening Data publications as separate admitted epochs. Preserve the existing 930-file /221-original-artifact /126-original-route boundary, Phase5 684 files, Phase6 24 metadata/18 numerical refs, six withdrawals, Research OS and original scientific operation/claim truth. Do not rewrite old freeze files to bless presentation changes.

The union of protected frontend sources across current freeze inventories is exactly:

```text
frontend-v2/src/app/shell/ForgeShell.tsx
frontend-v2/src/markets/queries.ts
frontend-v2/src/replay/client.ts
frontend-v2/src/replay/contracts.ts
frontend-v2/src/replay/FactorRegimeEvidence.tsx
frontend-v2/src/replay/SourceCredit.tsx
frontend-v2/src/replay/factor-series.ts
frontend-v2/src/replay/mode.tsx
frontend-v2/src/replay/observatory.ts
```

Keep these byte-identical. Unpinned wrappers may adopt new TerminalShell/read adapters while original frozen readers remain for archive compatibility. For full original reads, new adapters must reproduce or delegate their SHA/byte/closed-schema/licence/chronology/scope/epoch checks. For compiled display projections, build-time full-original validation and exact field/row equality are separate from browser-time projection-schema/digest/binding validation as specified in §20. Independently sabotage both layers; never claim runtime validation of an unfetched full original. No trust is transferred from a search label to an unverified artifact. Generated navigation metadata is lazy build code, avoiding any broadening of the archive's public-artifact addition allowlist.

Keep all sealed Phase0–7 artifacts and current Risk states/sweeps byte-identical; no production manifest update, evidence regeneration, source/provider capture, model/plugin/SeriesModel run, factor fit, Research attempt, holdout opening or simulator run. Run all existing read-only archive verifiers and required engineering CI at implementation review. Existing CI infrastructure fixtures are engineering tests, not authorization for a new scientific campaign.

## 44. Risks

| Risk | Mitigation / stop rule |
|---|---|
| Context conflates market factor/security or clocks | tagged IDs, strict compatibility, explicit parked notice; reject contradictions |
| New reader weakens original validation | exact binding+payload guards and independent projection/corruption tests before migrating any workspace |
| Derived index implies dependencies that do not exist | declared-ID edges only; current Data→historical Regime impact unavailable |
| Source/publication advances during implementation | pin review baseline, admit new complete epochs through existing contracts, rerun exact-head review; do not overwrite older Risk |
| Risk finite 128KiB artifact capacity | current receipt127,146 leaves3,926 bytes; keep schedules disabled and fail closed; no unreviewed retention/cap increase in this UI milestone |
| Too much scope in one release | staged acceptance sequence; prove context/identity before table/chart polish; no Phase8/9 additions |
| Desktop density harms readability/accessibility | explicit font/focus/zoom targets and real row/viewport evidence |
| Generated modules inflate initial JS | lazy fixed shards, route-attributable budgets, reproducible output equality; no eager global index |
| Hosted/API labels overpromise | source-and-selection registry, dated narrow verification facts; unauthenticated401 cannot enable business actions |
| Local state leaks through URL/search/export | positive field/licence whitelist and existing session-boundary guards |
| Legacy lower Dynamics confuses real/synthetic evidence | separate labelled entry; gate unavailable variants; preserve useful historical work |
| Extra path/change becomes necessary | stop for a concrete scope amendment; no silent changes outside §36–37 |

## 45. Implementation sequence after explicit approval

1. Reinspect current main, exact freeze inventories, source/deployment baselines and legitimate new publications. Create a Phase7.5 implementation branch only after approval; preserve specified Raghhav author/committer identity and no attribution trailers.
2. Implement types, canonical codec, compatibility and typed target builder. Prove parse/serialize/privacy/failure cases before connecting views.
3. Implement pure generator/read/index projection contracts and deterministic equality/sabotage checks. Measure actual record/byte counts before finalizing module layout; return for approval if proposed bounds/scope are insufficient.
4. Add shared shell/context bar and migrate Risk/Factors adapters first. Preserve their current payload/JS budgets and mode gates; reproduce then fix B1–B5 with regression evidence.
5. Unify palette/command/Market search using one target service; introduce the bounded new grammar and exact-ID navigation.
6. Wire Risk-first links/history/change summaries, then Data exact epochs and Regimes/Factor declared refs. Keep unprovable impact links unavailable. Add the public frozen Research summary.
7. Apply capability registry to all affected prominent actions, including correct disabled reasons and available Observatory trace selection. Keep hosted business workflows out of scope.
8. Add bounded table interactions, decision-first layouts and compatible chart cursor. Migrate Market/Data/Regimes bounded presentation reads; move older compound evidence/3D/large traces behind explicit actions.
9. Add local layout/shortcut preferences and permitted exports; run privacy/licence/formula sabotage.
10. Complete browser/desktop/performance/freeze verification, all required exact-head CI and source-bound deployed read verification. Produce implementation report/proof and seek review; do not merge or enable schedules implicitly.

## 46. Acceptance gates and approval boundary

Approval must cover the exact Add/Change/No-Delete manifest, minimum context/URL model, build-only bounded projections, search/command grammar, honest unavailable edges and desktop/table/chart scope in this document. Implementation is not authorized by delivery of this plan.

Acceptance requires:

- Every current core workspace shows the same compatible typed subject/market and clearly labels its own clocks; contradictory legacy URLs reject. The seven-workspace investigation, refresh, back/forward and copied/new-tab link retain exact selections or a visible reason a context is not applicable.
- Exact Risk/Data/Regime/Factor relations work; missing Data→historical computation, Research experiment and event-impact relationships remain unavailable. No name-based or same-capture shortcut.
- One global search/command service and one capability registry; current B1–B5 and reachable action gaps have browser regressions. No public action suggests unavailable hosted execution.
- All six Phase5 component truths, frozen Research conclusions, Factor limits and false claim flags remain explicit. Existing retained histories and all scientific artifacts/operations remain unchanged.
- 1440/1920 density/row targets, keyboard/focus/zoom/reduced-motion requirements and all measured caps pass in the specified browser matrix. Mobile remains correct.
- URL/preferences/search/export exclude private/raw/unlicensed data. Replay has zero provider/private paper/scientific/unexpected-mutation traffic.
- Existing archive/scientific/schema/lineage tests and required exact-head CI remain green; new projection/index/diff/capability sabotage passes without relaxed budgets or baselines.

No Phase5 rerun, D6, regime/Risk scheduling, Research OS rerun, inference recalibration, new factor regression, holdout, execution engine, VectorBT/Nautilus/hftbacktest, security master, portfolio ingestion, broker API, full Global Eye, facility graph, real Hawkes/Hawkes→HMM, neural/RL model or live trading is implemented.

STOP: this document is the plan deliverable. No Phase7.5 implementation branch, implementation files or PR have been created. Await explicit approval before beginning §45.

### Explicit questions — decisions for approval

| Question | Answer / decision |
|---|---|
| Minimum shared context? | Version + optional typed market/subject, exact anchor/comparison, actual observation date, one typed origin; workspace-tagged view/focus, not a universal bag of model/run/source strings (§15). |
| Which existing IDs support deterministic links? | Manifest IDs/SHA, semantic Issue with owning sweep, source/origin/admission/version, exact Factor/Regime producer refs, recorded agent run/task and checked trace IDs (§8–9,18). |
| What cannot be linked honestly? | Current Data health→historical Regime impact, null model/run inference, arbitrary Risk→Research/Factor, per-experiment results without public routes, event/portfolio/execution effects (§18–19). |
| How should incompatible context fail? | Preserve compatible fields and typed origin, visibly park unsupported context, reject contradictions/forged IDs and require explicit alternative; never substitute latest (§16). |
| Can “What changed in India?” be answered today? | Yes, as retained metadata/lifecycle comparison:10 → 10 India Issues, 24 → 27 origins, October 23 → 26; independent clocks, no price/causal attribution (§22). |
| Additional derived index? | Bounded deterministic declared-edge/search/read metadata modules; lazy, exact-source verified, no new scientific kind or broad graph (§19–20). |
| Should Risk be the main investigation hub? | Yes for evidence/remediation investigation; Market remains a legitimate start (§23). |
| Provenance below decision layer? | Full SHA/byte seals, policy serialization, exhaustive chronology/origins; critical cutoff/status/licence/claim limits stay visible (§23). |
| Which F4 panels are useful versus visually dominant? | Real timeline/volatility/model/component/change view is useful and already 2D; older compound/synthetic/3D work becomes secondary, not deleted (§14,24). |
| Six Phase5 components without equal-completeness implication? | Explicit per-component status/limitation table, especially seasonality unavailable, neutrality partial, fracture 1/6 and real Hawkes unavailable (§24). |
| How should F5 lead? | Explicit country-qualified MOM exposure/change/interpretation/limitation, full catalogue, 64-channel audit/ledger/lineage one action deeper; no new regressions (§25). |
| Which Data issues can point downstream? | Exact pinned Risk origin relations and any declared matching admission/version edges; present historical model impact edges have no matching pairs and remain unavailable (§19,26). |
| Commands that save time? | Explicit country Regimes, severity/category Risk, exact source Data, qualified factor, exact Issue/namespaced Run, compatible CHANGES/COMPARE; all resolve before navigation (§21). |
| Unified search from current metadata? | Yes for existing available granularity plus reference/navigation entries; no invented security universe/experiments/events (§20). |
| Current misleading/dead Vercel actions? | Enabled Observatory Live no-op, unsupported DEMO historical/compare, unavailable SPY/neural destinations and obsolete F6 placeholder (§11). |
| Truly hosted versus Replay/Local? | Specific healthGET verified; auth boundary401 only; public evidence replay; private/provider/model/agent work local-gated/unverified; detailed selection matrix §10. |
| 1920px Risk/Regime investigation? | Wide three-column source/change, main feed/timeline and inspector; compact≤120px chrome, readable text and explicit row targets (§29). |
| Tables first? | Risk 35 Issues, Data 53-origin/source summary, Factor 64-channel audit; no enterprise grid/virtualization for current bounded sizes (§30). |
| Charts with real shared cursor? | Exact F4 dated paths/compatible tails and F5 dated rolling 250 points; Market weekly separately typed; no trace-step/date or calendar coercion (§31). |
| Permissible exports? | Whitelisted admitted public-derived Issue/Data health/Factor audit/Regime diagnostic metadata with licence/attribution/exact refs; no raw licensed/private arrays (§33,42). |
| Future WORLD identifiers to reserve? | Versioned entity/edge extension interfaces; no active event/facility/company/PIT security fields until real contracts exist (§34). |
| How prepare EVENT→EXPOSURE→REGIME→RISK→EXECUTION? | Typed immutable evidence refs, declared edges, compatibility and separately gated action eligibility; missing economic/scientific steps remain explicit (§34–35). |
