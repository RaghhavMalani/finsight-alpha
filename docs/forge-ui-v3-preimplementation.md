# FinSight Forge UI v3 — pre-implementation design pack

Status: proposal for review; implementation has not started.  
Prepared: 2026-09-09.  
Scope: `frontend-v2` product architecture and presentation only.

## Executive decision

FinSight should move from a collection of market-terminal functions to an evidence-first research instrument. The existing React/TanStack/Tailwind/R3F stack is suitable and should be retained. The redesign is a product-flow and frontend-architecture change, not a framework rewrite.

The application model becomes:

```text
DISCOVER → HYPOTHESIS → RUN → EXPERIMENTS → REALITY LADDER
         → VERIFICATION → FINDING → REPLAY / COMPARE → LEARNING
```

The governing invariant is:

> The presentation layer may project, navigate, and visualize verified truth. It may never create, amend, grade, or silently infer that truth.

This proposal therefore does not change behavioral tasks, reward semantics, verifier logic, point-in-time boundaries, engine certification, trajectory hashing, or any frozen artifact. It also does not propose writing browser-derived calculations back into Forge records.

## 1. Repository and UI forensics

### 1.1 What exists now

| Area | Current evidence | Consequence for UI v3 |
| --- | --- | --- |
| Frontend stack | React 19, TanStack Router/Query/Start, Tailwind 4, Three.js, React Three Fiber, Drei, D3 Force, and Fuse are already installed in `frontend-v2/package.json`. | Keep the stack. No framework migration and no additional 3D dependency are needed. |
| Route model | The only product routes are `/`, `/terminal`, `/risk`, and `/login`. | Runs, worlds, artifacts, baselines, and replay cannot currently be linked, reloaded, or shared as first-class locations. |
| Terminal composition | `src/routes/terminal.tsx` is a 1,360-line route that imports the market, options, Monte Carlo, Greeks, ML, news, correlation, volatility, backtest, strategy, risk, assistant, watchlist, alerts, replay, and tour surfaces. | The route is both shell and feature coordinator. It must be decomposed before new Forge surfaces are added. |
| Navigation | A 64 px left rail enumerates `HOME`, `MK`, `OC`, `MC`, `GR`, `ML`, `NEWS`, `CX`, `VS`, `ALT`, `BT`, `STRAT`, `RISK`, and `SIGHT`. | The information architecture describes tools, not the research lifecycle. |
| Shell | The route uses a fixed `h-screen`/`overflow-hidden` frame: 48 px top bar, ticker strip, left rail, center stage, permanent 320 px right rail, and status bar. | It is desktop-instrument-like, but it has no deliberate narrow-screen composition and gives persistent market widgets equal weight with research evidence. |
| State | The route owns at least 16 local state groups. The active surface is `const [fn, setFn]`, with selected symbol, comparison, replay fraction, maximized panel, workspace preset, alerts, book state, and overlays also local. | Important application state disappears on refresh and cannot be addressed by URL. |
| Commands | `CommandBar` and `CommandPalette` share a `COMMANDS` list and Fuse search, but both ultimately map natural-language hints back to terminal function codes and tickers. | Preserve the keyboard-first interaction, replace the command grammar and destination model. The two command entry implementations should share one controller and result renderer. |
| Provenance | `Panel` can show optional `source` and `asOf` text. Some data components explicitly show `UNAVAILABLE`; the agent request includes `displayed_price_provenance`. | This is a useful start, but provenance is not a typed, required property of every displayed value and there is no shared source inspector. |
| Visual language | The current tokens already use off-black surfaces, amber primary, green/red state, tabular mono numerals, 2 px panel radii, short transitions, and a global reduced-motion rule. | Refine rather than restart. Add evidence/counterfactual semantics and remove effects that do not encode state. |
| 3D | Volatility, Greeks, and Monte Carlo canvases already use R3F; the wrappers lazy-load canvas modules and show loading fallbacks. | Reuse the loading and interaction patterns, but put the canvases behind Forge domain view-models and always ship an equivalent 2D view. |
| Frozen behavioral data | `data/exports/forge_v0_2_5_real_baseline` contains the manifest, 54 admitted episodes, one excluded attempt, recovery evidence, summary, requests, and frozen execution source. | The first Bench, Run Observer, Verifier, and Replay views can use real records immediately. |
| Reality Ladder data | The v0.2.4.1 artifact contains six aggregate checkpoints, exact execution engines, metrics, signed degradation decomposition, regimes, world hashes, certification binding, and artifact hash. | The flagship Reality Ladder can be evidence-backed from day one. |
| Backend projection | There are currently no Forge-, artifact-, trajectory-, world-, baseline-, or replay-oriented routes under `backend`. | UI v3 needs a read-only projection boundary before it should consume full artifacts. |

### 1.2 Foundations worth preserving

- Keyboard entry already has `/`, `Ctrl/Cmd+K`, history, fuzzy matching, arrow navigation, Enter execution, and Escape dismissal.
- The app already distinguishes unavailable provider data instead of silently filling some gaps.
- TanStack Router and Query provide the right primitives for typed search parameters, deep links, caching, and route-level code splitting.
- R3F canvases already use bounded device-pixel ratio and interactive orbit controls.
- The palette is already close to the proposed instrument aesthetic. The change is semantic expansion, not a fashionable reskin.
- Reduced-motion handling exists globally and should become a component-level contract for camera movement and graph playback.
- The released baseline has enough hashes and immutable identifiers to make every drill-down auditable.

### 1.3 Product and truth mismatches

#### P0 — epistemic presentation risk

1. `terminal.tsx` contains hard-coded `INSIGHTS`, including market interpretations such as “Tape prints skew to buyers” and “Skew steepening.” These strings have no bound evidence, world, as-of, run, or artifact.
2. `VolatilitySurface.tsx` derives ATM term structure, skew, IV rank, percentile, and a natural-language “surface insight” from a deterministic pseudo-random function keyed by symbol. The panel says `SIM`, but individual numbers do not carry an epistemic class or derivation record.
3. `GreeksSurface.tsx` similarly generates a pseudo-random GEX profile and labels rough calculations as position Greeks. These may remain useful demonstrations only if explicitly quarantined as `SIMULATED`, with a method identifier and no visual equivalence to verified evidence.
4. Current panels accept arbitrary source strings. `SIM`, `DATA`, `MODEL`, provider names, and availability state are not enforced as a closed vocabulary.

Required response: introduce a typed value/provenance contract before building new metric components. Hard-coded interpretation must either come from a signed/hashed artifact or render as unavailable. Demonstration-only tools must be visibly and programmatically separated from Forge evidence.

#### P1 — the product object is wrong

The current shell treats market functions as peers and treats “AI research” as one panel among them. Forge’s actual first-class objects are:

```text
Hypothesis   Run   Experiment   Evidence   World
Verification   Finding   Trajectory   Baseline   Artifact
```

Market, options, backtest, Monte Carlo, Greeks, correlations, ML, news, and risk are capabilities used by experiments. They are not the application’s primary hierarchy.

#### P1 — navigation and replay state are not durable

`fn`, symbol selection, comparison, replay fraction, and maximized content live in React state. The existing `/terminal` URL cannot represent “run X, experiment 4, at replay time 17,” so refresh and share semantics are absent.

#### P1 — the artifact boundary is missing

The frontend has a general API client and an agent SSE consumer, but no endpoint or DTO for verified Forge artifacts. Loading `episodes.jsonl` directly in the browser would be the wrong shortcut:

- each episode embeds raw provider responses and request payloads;
- a 54-episode baseline is much larger than the views need;
- the frontend would have to understand internal artifact schemas;
- filtering or deriving verifier state client-side risks creating a second source of truth.

UI v3 needs verified, read-only projections produced from the existing artifacts. Raw evidence remains downloadable/inspectable through explicit artifact access, not bundled into every screen.

#### P1 — responsive and accessibility gaps

- The permanent 64 px + center + 320 px layout has no route-specific collapse strategy.
- `CommandPalette` visually behaves like a dialog but has no dialog role, labelled relationship, focus trap, or focus restoration contract.
- `Panel` makes every section focusable and applies a custom focused style, but the focus model is panel-centric rather than task-centric and does not consistently use `:focus-visible`.
- Canvas interactions rely on drag, scroll, and hover; equivalent keyboard/table exploration is not guaranteed.
- There is no skip-to-content link in the root shell.
- Global `z-index: 9999` and a click-ripple effect are visual-system exceptions that should not carry into the new shell.

#### P2 — visual hierarchy is dense but not selective

The current UI gives ticker tape, watchlist, sectors, alerts, market intel, workspaces, and the center analysis persistent or near-persistent status. Bloomberg-like density works when priority is unmistakable. Here it dilutes the research trajectory, evidence gates, and final finding.

### 1.4 Current capability disposition

| Current capability | UI v3 disposition |
| --- | --- |
| `HOME` market overview | Replace as primary home with Command Center; retain as an Experiment Lab market-context tool. |
| `SIGHT` AI research | Evolve into Research Lab hypothesis intake and run creation. |
| `MK`, `NEWS`, `ALT` | Typed evidence/market tools inside an experiment. |
| `OC`, `MC`, `GR`, `VS`, `CX` | Quant tools under Experiment Lab; preserve existing visual engines after provenance hardening. |
| `BT`, `STRAT`, `ML` | Experiment definitions, results, and models rather than top-level destinations. |
| `RISK` | Preserve `/risk` during migration; ultimately expose as `/tools/risk` and experiment output. |
| Watchlist, tape, sectors, alerts, book | Context drawers or saved workspaces, not a permanent rail on every Forge surface. |
| Existing replay scrubber | Rebuild around immutable action/model-turn events and URL time, not market-history fraction alone. |

## 2. New information architecture

### 2.1 Primary navigation

```text
F1  COMMAND      opens global command palette
F2  LAB          create or inspect a hypothesis
F3  RUNS         active, complete, failed, and excluded trajectories
F4  BENCH        versioned model/system baselines
F5  WORLDS       PIT worlds and explicit counterfactual forks
F6  ARTIFACTS    content-addressed evidence and manifests

/RISK            preserved specialist surface during migration
/TOOLS           typed market and quant capability directory
```

Command Center is the authenticated default and logo destination. `F1` is an action, not an otherwise empty page.

### 2.2 Object hierarchy

```text
Baseline
├── suite + model identities + seeds
├── Run / trajectory
│   ├── public task + hypothesis
│   ├── World reference
│   ├── ordered AgentAction[]
│   │   └── experiment evidence + result hash
│   ├── ordered ModelTurn[] + measured usage
│   ├── decision / Finding
│   └── Verification checks
└── manifest + recovery + certification + Reality Ladder bindings

World
├── as-of + information policy + seed
├── dataset snapshots
└── explicit child forks
    └── interventions[]

Artifact
├── schema version + content hash
├── source/release binding
└── typed relationships to runs, worlds, evidence, and verifications
```

### 2.3 URL map

| URL | Surface | URL-owned state |
| --- | --- | --- |
| `/forge` | Command Center | optional `run`, `baseline`, `panel` |
| `/lab` | Research Lab intake | `asOf`, `policy`, optional draft id |
| `/lab/:hypothesisId` | Hypothesis workspace | selected evidence/experiment in search params |
| `/runs` | Run index | status, model, suite, verdict, date filters, cursor |
| `/runs/:trajectoryHash` | Run Observer | `node`, `tab` |
| `/experiments/:trajectoryHash/:sequence` | Experiment Lab | metric, compare, view (`table`/`surface`) |
| `/reality/:artifactHash` | Reality Ladder | case/regime, checkpoint, metric, view |
| `/verification/:trajectoryHash` | Verifier Console | selected check |
| `/findings/:trajectoryHash` | Finding | claim/evidence selection |
| `/replay/:trajectoryHash` | Deterministic Replay | `t`, speed, view |
| `/bench/:baselineId` | Bench | models, metric, seed, task |
| `/worlds/:worldHash` | World Inspector | fork, dataset, intervention |
| `/artifacts/:artifactHash` | Artifact Inspector | file/member, view |
| `/tools/:toolId` | Typed tool host | tool-specific validated search params |

Hashes are canonical identifiers in URLs. Short display forms are presentation only and must never become lookup keys.

### 2.4 Primary research flow

```text
Command Center
  ├─ open existing run ───────────────────────────────┐
  └─ research command                                 │
        ↓                                             │
     Research Lab                                     │
        ↓ freeze as-of + information policy           │
     Hypothesis graph                                 │
        ↓ start run                                   │
     Run Observer ←───────────────────────────────────┘
        ├─ action → Experiment Lab
        ├─ evidence → Artifact Inspector
        ├─ world → World Inspector
        └─ completion
             ↓
          Verifier Console → Finding
             ├─ Replay
             ├─ Counterfactual fork
             └─ Compare in Bench
```

### 2.5 Command grammar

Commands resolve to typed actions with previewable destinations. Parsing and execution are separate so destructive or state-creating commands can show their exact effect before commit.

```text
research MSFT AI capex --as-of 2024-06-30 --world strict
open run 7bc01592
compare models luna,terra,sol --baseline c5b27e19
replay 7bc01592 --t 2
inspect verifier required_evidence --run 7bc01592
open artifact db371549
world fork <world_hash> --multiply volatility 2
tool black-scholes --symbol MSFT
```

The palette groups results by `Navigation`, `Runs`, `Worlds`, `Artifacts`, and `Actions`. It shows the target object, source, and as-of before execution. Natural-language research intake may create drafts; fuzzy matching must never silently transform an unrecognized query into an unrelated command.

### 2.6 Responsive composition

| Width | Composition |
| --- | --- |
| `≥ 1280 px` | Three-pane instrument layout: compact object list, primary evidence canvas, contextual inspector. Pane sizes are user-adjustable and route-aware. |
| `768–1279 px` | Two panes: primary canvas plus collapsible inspector. Object list becomes a command/search drawer. |
| `< 768 px` | One semantic content column. Tabs switch graph/table/inspector; 2D evidence view is the default; 3D is an opt-in full-screen view. |

The DOM reading order always follows task → evidence → verdict. Visual pane order may change without changing that semantic sequence.

## 3. Component and domain architecture

### 3.1 Proposed module boundaries

```text
frontend-v2/src/
  app/
    shell/
      ForgeShell.tsx
      PrimaryNav.tsx
      ContextInspector.tsx
      StatusBar.tsx
      SkipLink.tsx
    command/
      CommandPalette.tsx
      command-catalog.ts
      command-parser.ts
      command-actions.ts
    navigation/
      route-links.ts
      shortcuts.ts

  forge/
    contracts/
      artifacts.ts
      baselines.ts
      evidence.ts
      runs.ts
      worlds.ts
    data/
      forge-client.ts
      forge-queries.ts
      forge-query-keys.ts
    command-center/
    lab/
    runs/
    run-observer/
    experiment/
    reality-ladder/
    verifier/
    finding/
    replay/
    bench/
    worlds/
    artifacts/

  epistemic/
    EpistemicValue.tsx
    ProvenanceChip.tsx
    ProvenancePopover.tsx
    SourceInspector.tsx
    EvidenceState.tsx
    UnavailableValue.tsx

  visualization/
    shared/
      VisualizationFrame.tsx
      CanvasErrorBoundary.tsx
      TableFallback.tsx
      useReducedMotion.ts
    three/
      RealityTerrain.tsx
      WorldForkGraph.tsx
      TrajectoryGraph.tsx
      QuantSurface.tsx

  tools/
    market/
    options/
    monte-carlo/
    greeks/
    volatility/
    correlation/
    backtest/
    ml/
    risk/
```

Routes should be thin composition modules. Domain modules own view-model conversion, components, and tests. Shared visual components must not import verifier or reward implementations.

### 3.2 Read-only artifact projection

Add a backend projection layer with endpoints conceptually equivalent to:

```text
GET /forge/baselines
GET /forge/baselines/{baseline_id}
GET /forge/runs?baseline_id=...
GET /forge/runs/{trajectory_hash}
GET /forge/reality-ladders/{artifact_hash}
GET /forge/worlds/{world_hash}
GET /forge/artifacts/{artifact_hash}
```

Rules:

1. The service opens only allow-listed export roots and content-addressed artifacts.
2. It verifies or consumes a previously verified artifact before projecting it.
3. Every response includes its source schema version, source artifact hash, and verification status.
4. Projection code may select, paginate, sort, and redact fields. It may not recompute verdicts, verifier checks, rewards, costs, or hashes.
5. Raw provider responses and full prompts are excluded from default run DTOs. Explicit raw-artifact inspection is separately permissioned and paginated.
6. Unknown schema versions fail closed as `UNAVAILABLE`, with the unsupported version visible.
7. The frontend never imports Python verifier code and never decides whether a run “passes.”

### 3.3 Required frontend contracts

The exact names may change, but every measured value needs equivalent structure:

```ts
type EpistemicClass =
  | "HISTORICAL"
  | "COMPUTED"
  | "MODEL"
  | "FORECAST"
  | "COUNTERFACTUAL"
  | "SIMULATED"
  | "UNAVAILABLE";

type Provenance = {
  epistemicClass: EpistemicClass;
  source: string;
  asOf: string | null;
  worldHash: string | null;
  runHash: string | null;
  seed: number | null;
  artifactHash: string;
  evidenceHash?: string;
  engine?: string;
  engineVersion?: string;
  certificationLevel?: string;
  method?: string;
};

type EpistemicValue<T> =
  | { state: "AVAILABLE"; value: T; provenance: Provenance }
  | { state: "UNAVAILABLE"; value: null; reason: string; provenance: Provenance };
```

UI components receive these contracts, not bare numbers. Formatting may round for display, but the inspector exposes the canonical value and source. Color, icon, and text jointly encode state; color alone never does.

### 3.4 State ownership

| State | Owner |
| --- | --- |
| Active run, node, checkpoint, verifier, baseline, models, world fork, replay time | URL path/search parameters |
| Artifact projections and indexes | TanStack Query, keyed by full immutable identifier and schema version |
| Live run events | Append-only stream cache reconciled with canonical run projection on completion |
| Hovered point, selected 3D mesh, camera orbit, transient tooltip | Local component state |
| Pane size and reduced-density preference | Local preference storage with safe defaults |
| Hypothesis draft | Explicit draft object; never conflated with a verified run |

Reloading a deep link must reconstruct the same evidence selection. UI-only preferences may vary without changing the addressed research object.

### 3.5 Four meaningful visualization systems

#### Reality Terrain

Source: `aggregate.checkpoints` and `decomposition` from the bound Reality Ladder artifact.

- X = ordered checkpoint/reality stage.
- Y = selected canonical metric, initially Sharpe.
- Z/depth = regime or case only when that dimension exists in the artifact.
- Ridge color = epistemic/execution stage, not metric desirability.
- Drop annotations = signed artifact decomposition.
- Selection links to checkpoint engine, metrics, world, and artifact.

The accompanying DOM table is authoritative and always available. The canvas is an alternate projection.

#### World Fork Graph

Source: actual world manifests (`world_id`, `parent_world_id`, `as_of`, `information_policy`, `seed`, dataset hashes, and `interventions`).

- Edges exist only when a child manifest names the parent.
- Fork labels list explicit interventions.
- No relationship is inferred from similar metrics or hashes.
- A missing manifest renders `UNAVAILABLE`; it does not generate a plausible branch.

#### Trajectory Graph

Source: ordered `run.actions` plus `model_turns` and measured usage.

- Vertical position = sequence/time.
- Width = turn tokens when a corresponding measured turn exists.
- Brightness = measured inference cost.
- Border state = stored action/tool status and verifier projection.
- Edge = sequence/causality already present in the trajectory.
- Divergence = only a verified replay mismatch, never a client heuristic.

#### Quant Surface

Source: a typed grid with explicit method, inputs, epistemic class, as-of, world, and artifact/run reference.

Existing IV, Greek, probability, and risk canvases can migrate onto this frame. Pseudo-random demo surfaces remain in a separately labelled sandbox until real or explicitly simulated input contracts are available.

### 3.6 Visual system

```text
Canvas          #07090B
Panel           #0B0E11
Raised          #101419
Rule            #1D232B
Text            #E6E8EB
Muted           #7B8490
Faint           #48515C
Forge amber     #FFB000
Evidence        #52A8FF
Pass            #35C78A
Reject          #FF5A57
Review          #D8A43A
Counterfactual  #A67CFF
Simulated       #C889FF
Unavailable     #616A75
```

- Interface: Geist or the existing Inter initially; measured values: JetBrains Mono with tabular figures.
- Cormorant may remain on the marketing landing page but not as the primary data-panel voice.
- Borders and spacing, not shadows, establish most hierarchy.
- Amber indicates selection/command focus, not generic decoration.
- Blue means evidence/source material; green and red are reserved for verified pass/reject semantics.
- Purple is restricted to counterfactual or simulated state and always appears with a text label.
- Bloom is permitted only inside 3D canvases and only to clarify the selected data object.

### 3.7 Motion and accessibility contract

- Pane transitions: 120–220 ms, transform/opacity only.
- A run edge pulses once when its event arrives; continuous pulsing is reserved for genuinely live state.
- Replay animation follows stored sequence timestamps and never invents timing.
- Reality Terrain camera movement stops on user interaction and has a direct “reset view” control.
- `prefers-reduced-motion` replaces camera traversal and graph animation with immediate state changes.
- Every canvas has a concise accessible label and a same-data table/list in the DOM.
- Global palette uses semantic dialog/combobox/listbox roles, focus trap, focus restoration, and announced result count.
- All commands and graph nodes are keyboard reachable with visible `:focus-visible` styling.
- Status never relies on hue alone; every state includes text and an icon/shape distinction.
- A skip link and stable landmark structure are release gates.

## 4. Static wireframes

All numbers and identifiers shown below come from the released v0.2.5 baseline or the bound v0.2.4.1 Reality Ladder artifact. Braced labels such as `{query}` denote UI fields, not fabricated data.

### 4.1 Command Center

```text
┌ FINSIGHT FORGE ─────────────────────────────────────────────────────── ⌘K ┐
│ [ research, open run, compare, replay, world, artifact…            ]     │
├──────────────┬──────────────────────────────────────┬─────────────────────┤
│ RUNS         │ SELECTED TRAJECTORY                  │ VERIFICATION        │
│              │                                      │                     │
│ v0.2.5       │ Small-cap spread reversion           │ ✓ task identity     │
│ 54 admitted  │                                      │ ✓ artifact binding  │
│ 1 excluded   │ inspect hypothesis                   │ ✓ required evidence │
│              │        │                             │ ✓ decision binding  │
│ selected     │        ▼                             │ ✓ efficient routing │
│ 7bc01592…    │ run screen · vectorbt C4             │                     │
│ SOL · 101    │ Sharpe -0.3000                       │ VERIFIED RESEARCH   │
│ REJECT       │        │                             │ SUCCESS              │
│              │        ▼                             │                     │
│              │ submit · REJECT                      │ reward 1.0          │
│              │                                      │                     │
├──────────────┴──────────────────────────────────────┴─────────────────────┤
│ WORLD 07bc4122… │ TRAJECTORY 7bc01592… │ COST $0.0136 │ 9.4337s │ seed 101 │
└───────────────────────────────────────────────────────────────────────────┘
```

Interaction:

- Up/down changes the selected run without changing route context.
- Enter opens `/runs/7bc015...`.
- Selecting an evidence node opens its source inspector without losing the graph.
- If there is no active or selected run, the center shows a composed “open a verified run or start a research draft” state—never fake activity.

### 4.2 Run Observer

```text
┌ RUN / 7bc015925b30… ─ v025_case_001 ─ gpt-5.6-sol ─ seed 101 ─ COMPLETE ┐
│ Hypothesis: A short-horizon small-cap spread-reversion signal has          │
│             deployable alpha.                                             │
├───────────────────────────────┬────────────────────────────────────────────┤
│ TRAJECTORY                    │ SELECTED ACTION · 02                       │
│                               │                                            │
│ 01 INSPECT HYPOTHESIS   OK    │ research.run_screen                       │
│      513 in / 36 out          │ status              OBSERVED              │
│           │                   │ engine              vectorbt              │
│           ▼                   │ certification       C4                    │
│ 02 RUN SCREEN       OBSERVED  │ execution           frozen_evidence_replay│
│      884 in / 26 out          │ observations        240                   │
│           │                   │ Sharpe              -0.3000               │
│           ▼                   │ max drawdown         0.0130                │
│ 03 SUBMIT REJECT          OK  │ alpha survival      1.0000                │
│     1158 in / 107 out         │ evidence f990ef20…  result 35af96b6…      │
│                               │                                            │
│ TOTAL 2,724 TOKENS            │ [OPEN ARTIFACT] [VIEW RAW CANONICAL VALUE]│
│ $0.0136 · 9.4337s             │                                            │
├───────────────────────────────┴────────────────────────────────────────────┤
│ FINDING · REJECT │ VERIFIED · 16/16 checks │ [VERIFY] [REPLAY] [COMPARE]  │
└────────────────────────────────────────────────────────────────────────────┘
```

The raw provider response is not loaded in this default view. “View raw” targets an explicit artifact detail route and clearly distinguishes calculated token cost from invoice data.

### 4.3 Reality Ladder

```text
┌ REALITY LADDER / db371549… ─ aggregate ─ metric: SHARPE ─ [3D] [TABLE] ┐
│                                                                         │
│  4.7991  ●────────●────────●                                            │
│          L0       L1       L2                                           │
│                              ╲ 4.6118 ●  FEES + SLIPPAGE                 │
│                                          ╲ 3.7292 ●  LATENCY            │
│                                                      ╲                  │
│                                                       ╲ 0.3449 ● STRESS │
│                                                                         │
│  REALISM ────────────────────────────────────────────────────────────→  │
├──────────────────────────────────────┬──────────────────────────────────┤
│ CHECKPOINT TABLE                     │ PROVENANCE                       │
│ L0 analytical       4.7991           │ artifact db371549…              │
│ L1 vectorbt         4.7991           │ schema forge-reality-ladder/…   │
│ L2 nautilus         4.7991           │ engine certification 9ee9dabb… │
│ L3 fees/slippage    4.6118           │ primary metric sharpe           │
│ L3 latency          3.7292           │                                  │
│ L4 stress           0.3449           │ ALPHA SURVIVAL 7.2%              │
├──────────────────────────────────────┴──────────────────────────────────┤
│ largest degradation · counterfactual market stress · Δ Sharpe -3.3843  │
└─────────────────────────────────────────────────────────────────────────┘
```

The 3D mode uses the same six records. Switching to table view changes representation only; no metric or conclusion changes.

### 4.4 Bench

```text
┌ BENCH / c5b27e19… ─ REAL API MODEL BASELINE v0.2.5 ─ 54 episodes ─ VERIFIED ┐
│ [Verified research] [False α] [Cost/finding] [Latency] [Tool/engine use]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ MODEL          VERIFIED   FALSE α   CRITICAL FAIL   COST/FINDING   LATENCY  │
│ Luna             77.8%      0.0%          5.6%        $0.00128       13.6s  │
│ Terra            83.3%      0.0%          0.0%        $0.01032       15.6s  │
│ Sol              83.3%      0.0%          0.0%        $0.02371       24.0s  │
├────────────────────────────────┬─────────────────────────────────────────────┤
│ OBSERVED RELATION              │ ARTIFACT                                   │
│ Terra and Sol tie on verified  │ admitted episodes     54                   │
│ success in this suite; Terra   │ excluded attempts      1                   │
│ uses less cost and latency.    │ all-attempt cost       $0.52861666          │
│ Not a global model ranking.    │ reality ladder         db371549…            │
├────────────────────────────────┴─────────────────────────────────────────────┤
│ v0.2.5.1 HARDENED · UNAVAILABLE — no verified artifact loaded               │
│ v0.3 MULTI-AGENT · UNAVAILABLE — no verified artifact loaded                │
└──────────────────────────────────────────────────────────────────────────────┘
```

The view derives no values from marketing copy. It projects `summary.json` and manifest fields, and it labels the Terra/Sol relation as an observed suite-specific comparison.

## 5. Migration plan from the existing terminal

No branch or implementation should begin until this pack is reviewed. Once approved, use `feat/forge-ui-v3` and keep behavioral hardening isolated from it.

### Phase 0 — freeze the UI truth boundary

Deliverables:

- Architecture decision record declaring the frontend read-only with respect to verifier/reward truth.
- Checksums for the v0.2.5 summary, manifest, representative episode, and Reality Ladder fixture used by frontend contract tests.
- Protected-path CI check for UI pull requests covering behavioral, verifier, evaluation, certification, and frozen export paths.
- Inventory of every current simulated or hard-coded metric/insight, with disposition: real source, explicitly simulated sandbox, or unavailable.

Gate: a frontend change cannot alter or regenerate frozen artifacts and cannot import reward/verifier implementations.

### Phase 1 — versioned projection contracts

Deliverables:

- Read-only Forge projection service and allow-listed artifact resolver.
- Small DTOs for baseline list/detail, run list/detail, Reality Ladder, world manifest, and artifact metadata.
- TypeScript contracts plus runtime schema validation at the API boundary.
- Fixture tests proving the projected v0.2.5 numbers and hashes equal the frozen source.

Gate: unsupported or invalid schemas fail closed and display `UNAVAILABLE`.

### Phase 2 — Forge shell and typed URLs

Deliverables:

- `ForgeShell`, six primary destinations, shared command controller, semantic landmarks, skip link, responsive panes, and route error/empty/loading states.
- Deep links for Bench and Run Observer first.
- `/terminal` remains operational and visually labelled “Legacy terminal.”

Gate: every target route survives direct load, refresh, browser back/forward, and copied URL.

### Phase 3 — epistemic component system

Deliverables:

- `EpistemicValue`, provenance chip/popover, source inspector, unavailable state, evidence status, hash link, and canonical-number formatter.
- Token additions for evidence, review, counterfactual, simulated, and unavailable states.
- Story/test matrix for every class and missing-field condition.

Gate: no new Forge number component accepts an unwrapped bare numeric prop.

### Phase 4 — Bench as the first production surface

Why first: it has a compact, already verified source and exercises models, costs, latency, release identity, artifact hashes, unavailable future versions, tables, filters, and comparison semantics without requiring live execution.

Deliverables:

- v0.2.5 model table, overall metrics, artifact identity, episode/task/seed drill-down, and suite-specific comparison notes.
- Explicit `UNAVAILABLE` cards for v0.2.5.1 and v0.3 until their verified artifacts exist.

Gate: every displayed value matches the frozen summary at canonical precision; rounding is presentation-only.

### Phase 5 — Runs, Observer, Verifier, and Finding

Deliverables:

- Run index and trajectory graph/table.
- Action inspector, model-turn usage, budget state, final decision, verifier check list, and evidence/result hash links.
- Run completion reconciliation: live stream is provisional until the canonical verified projection arrives.

Gate: the UI cannot show `VERIFIED` from an SSE event alone.

### Phase 6 — deterministic Replay

Deliverables:

- URL-owned replay time/sequence.
- Step, play, pause, speed, and jump-to-failure controls.
- Causal updates across trajectory, action inspector, usage, evidence, and verdict.
- Replay mismatch state sourced only from the independent replay/verifier result.

Gate: a given trajectory hash and replay step produces the same visible canonical state after refresh.

### Phase 7 — Reality Ladder, 2D before 3D

Deliverables:

- Exact checkpoint table and signed decomposition view.
- Lazy-loaded `RealityTerrain` using the same view-model.
- Canvas error boundary, WebGL capability fallback, reduced-motion mode, and keyboard-selectable checkpoint list.

Gate: 3D disabled, failed, or reduced-motion states retain all evidence and navigation.

### Phase 8 — Worlds and Artifacts

Deliverables:

- World manifest inspector with as-of boundary, information policy, seed, dataset snapshots, visible hashes/rows, parent, and interventions.
- Fork graph based only on explicit parent identifiers.
- Artifact relationship graph and metadata/raw-view separation.

Gate: missing world manifests never produce inferred counterfactual relationships.

### Phase 9 — Research Lab and typed tool migration

Deliverables:

- Research draft, world freeze, hypothesis graph, experiment selection, and run-start contract.
- Migrate existing terminal capabilities one at a time into `/tools` and Experiment Lab adapters.
- Replace or quarantine pseudo-random metrics and unbound `INSIGHTS` before any migrated tool can be cited as evidence.

Gate: each migrated tool declares inputs, method/version, epistemic class, as-of, world, output artifact, unavailable behavior, and keyboard path.

### Phase 10 — legacy retirement

Only after capability parity and deep-link migration:

- redirect `/terminal` to `/forge` with an explicit migration notice;
- remove duplicated command entry and monolithic routing logic;
- retain compatible URLs or redirects for saved `/risk` workflows;
- remove legacy-only hard-coded insight paths.

Gate: route analytics and regression tests show no required workflow stranded in the legacy terminal.

### 5.1 Release gates for every phase

#### Truth

- Frozen hashes and summaries unchanged.
- Values trace to artifact + field path; derived display values declare method.
- Verifier status comes only from verified projections.
- `UNAVAILABLE` is visible and is never replaced by plausible demo data.

#### Accessibility

- Full keyboard path and visible focus.
- Semantic dialog/combobox/table/landmark behavior.
- Screen-reader names for graph nodes and statuses.
- Reduced motion and non-canvas equivalent.
- Contrast verified for normal, muted, focus, and state colors.

#### Performance

- Route-level and canvas-level lazy loading.
- No raw baseline JSONL in the initial bundle.
- Canvas DPR and geometry complexity budgets.
- Streaming lists virtualized only when needed and without breaking accessibility.

#### Quality

- TypeScript, lint, production build, route tests, projection contract tests, and visual regression checks pass.
- Empty, loading, partial, stale, unsupported-schema, offline, WebGL-failed, and verifier-failed states are covered.
- Desktop, tablet, and phone compositions are verified.

### 5.2 Recommended first implementation slice

After approval, the first reviewable vertical slice should be:

```text
read-only v0.2.5 projection
    → Forge shell
    → /bench/c5b27e19…
    → provenance inspector
    → deep-link and accessibility tests
```

It should not include live research creation or 3D. That slice proves the most important architectural claim: the new interface can present real, immutable Forge evidence without owning truth.

### 5.3 Decisions required before implementation

1. Canonical entry route: recommend `/forge`, retaining `/terminal` until parity and then redirecting it.
2. Artifact delivery: recommend a backend read-only projection API, not static frontend imports.
3. Raw provider evidence: recommend metadata-only by default with explicit, separately authorized raw inspection.
4. Mobile 3D: recommend 2D default with user-invoked full-screen 3D.
5. Marketing landing: recommend retaining `/` as a separate cinematic explanation layer while `/forge` remains the instrument UI.

