# Phase 1 implementation plan

Status: approved with the amendments below. This PR implements Phase 1a only (shell, command line, Replay and India). Phase 1b is a separate future PR for the Agents redesign.

## Approved amendments

- PR #20 merged at `f5275b59ef7cbc44e5314492de4c329548b086bf`. Branch `feat/terminal-replay` starts from that `origin/main` commit, not from a stacked PR branch.
- The user supplied `docs/forge-reference.html` from the root checkout. Copy it unchanged and commit it. Its background `#050607`, panel `#0B0D10`, amber `#F0A929`, Inter/JetBrains Mono, thin chrome and 1360 px page column override the earlier fallback below. Do not use the Forge v3 fallback.
- Candidate function keys are F1–F4, F6 and F8–F10, with `preventDefault` outside text fields only. Never capture F5 or F7. Test all keys in Chrome, Edge and Firefox; drop any candidate a browser will not release. FACTORS and EXECUTION remain reachable through navigation, palette and `FACT`/`EXEC` commands.
- Bloomberg exchange inputs are US/UN/UQ/UP and IN/IS/IB. SPY resolves to UP. IN defaults to NSE. Validate aliases and exchange conflicts in `verify-shell.mjs`.
- Replay GP supports weekly relative performance rebased to 100, drawdown, realized volatility and HMM shading, without absolute vendor price levels. Each artifact records source and licence status. Public series require explicit publication permission through the licensing policy; denied sources are unavailable and reported by name. Never invent data to fill denied coverage.
- Leave the Agents composition unchanged in 1a; its redesign from the actual reference belongs to 1b. Shared shell tokens apply to every workspace.

## Starting point

- Phase 0 is merged in PR #20. Phase 1a starts from `main` and opens a separate PR to `main`.
- Keep React 19, TanStack Start/Router/Query, Tailwind 4, existing CSS, Three.js and Playwright. No new UI or state library is necessary.
- `docs/forge-reference.html` is now supplied by the user and copied into this worktree. It is the design source for both phase PRs.

## Workspace and navigation behavior

One shared workspace registry owns labels, routes, function keys, command destinations and active-state matching. Preserve existing deep links rather than duplicating screens under ten new route trees.

| Key | Workspace | Primary route | Content in this phase |
|---|---|---|---|
| F1 | MARKET | `/markets` | Existing Markets screens, mode-aware Overview, ticker identity and watchlist |
| F2 | WORLD | `/globe` | Existing God's Eye, recorded event aggregates in Replay |
| F3 | RISK | `/risk` | Phase 7 line in Replay; preserve existing local Paper Book capability |
| F4 | REGIMES | `/dynamics` | Existing Dynamics navigator and validated available derived results |
| F5 | FACTORS | `/factors` | “Factor library and neutrality checks arrive in Phase 6.” |
| F6 | RESEARCH | `/research` | “Research OS and the US–India momentum study arrive in Phase 4.” |
| F7 | EXECUTION | `/execution` | “Execution sweeps and simulator comparisons arrive in Phase 9.” |
| F8 | OBSERVATORY | `/observatory` | Existing HMM, signal and neural trace views; missing traces remain unavailable |
| F9 | AGENTS | `/forge` | Forge Center, Runs, Bench, Worlds, Artifacts and Reality as workspace subnavigation |
| F10 | DATA | `/data` | “US and India source health and revision views arrive in Phase 3.” |

The shell has a compact F1–F10 bar, persistent command input, current instrument, Replay/Live status, artifact cutoff, skip link and visible keyboard focus. At 390 px the workspace strip scrolls within its own region, command entry remains usable and content stays within the viewport. Ctrl+K and Cmd+K open the palette. F1 now selects MARKET rather than opening the palette. F5 and F7 are never intercepted; FACT and EXEC commands open those workspaces. Existing numeric scene shortcuts remain scoped to their current workspace.

The command parser accepts `<TICKER> [EXCH] <FUNCTION>` submitted with Enter or GO; it can also accept a trailing `GO`/`<GO>` when pasted. Functions:

- `DES`: Market Overview.
- `GP`: weekly relative performance rebased to 100, drawdown, realized volatility and HMM shading in Replay when publication is licensed; actual price candles are local Live only.
- `OMON`: existing Markets options screen.
- `FA`: existing Markets fundamentals screen, with explicit India coverage limits.
- `REG`: REGIMES with instrument context.
- `GE`: WORLD with instrument context, without inferring a company exposure map before Phase 8.
- `RISK`: RISK with instrument context.

Resolve `RELIANCE IN DES` to `RELIANCE.NS` on NSE, `SPY REG` to its verified US instrument identity and `TSM GE` to TSM on NYSE. Accept supported exchange aliases without guessing an exchange for an unknown US ticker. Reject malformed commands, conflicting suffix/exchange combinations and ambiguous symbols inline. Preserve ticker context across workspace changes, refresh, and browser back/forward.

## Replay and Live boundary

Add one root `/replay-manifest.json`. Every entry records schema version, artifact ID, same-origin URL when available, SHA-256, byte count, source/input hashes, observed/available/as-of timestamps, evidence scope, source attribution, publication/licence status and claim flags. Unavailable entries carry a reason and no URL, so missing coverage does not trigger a failing request.

Reuse the existing SHA checking and runtime adapters. Validate the manifest, hash artifact bytes before parsing/display, reject unknown schemas or unlisted URLs, and show an explicit unavailable state on corruption. All public routes use Replay by default. A public URL, saved preference or keyboard command cannot enable Live.

Enable Live only on loopback with explicit local configuration and the existing authenticated backend/provider credentials. Keys remain backend environment values. Changing mode separates query/cache identities, cancels stale reads and clears the previous mode's evidence before rendering the new mode.

Publication sources:

1. Existing frozen Forge exports, projected through `backend/routes/forge.py`; preserve source bytes, verifier decisions and canonical values. Public projections allow-list derived metrics, recorded conclusions, hashes and provenance. Do not ship arbitrary tool payloads or raw provider requests/responses.
2. The six historical HMM/signal traces for SPY, QQQ and IWM are unavailable in public Replay because no anonymous `publish_derived` grant exists. Remove their payloads from the current tree and retire the Observatory-specific manifest. Tests read the byte-identical existing Git objects; they do not republish the vendor payloads. False market/alpha/causal claim flags remain unchanged.
3. Existing validated real regime snapshots when the operator has installed the inputs. The current product universe is SPY/QQQ/IWM and no real input installation was found in this checkout or the root checkout. Missing India or real-regime results are labelled unavailable. Frozen reference certifications may remain accessible as explicitly labelled reference experiments; do not present synthetic worlds as real market evidence.
4. God's Eye: capture genuine public-source evidence and publish a compact, attributed derived event summary (counts, hub aggregates and normalized map records) at a fixed cutoff. Satellite motion uses the recorded epoch in Replay. If a source is unavailable or redistribution cannot be established, publish an unavailable entry, not a fabricated feed. Keep Natural Earth geography bundled locally.

The exporter is an explicit local command, not a scheduled training workflow (Phase 2 owns scheduling). It is deterministic, verifies frozen source hashes, uses a fixed cutoff and writes only schema-allow-listed public fields. Reject raw vendor OHLCV, quote marks, absolute price paths and unsafe nested fields; confidence interval `low`/`high` fields remain valid statistics. Scan strings/tool evidence as well as ordinary JSON fields. Existing Phase 0 simulated fixtures stay test-only.

The Market Replay view shows instrument identity, available model/regime summaries, timestamps, provenance and coverage. It never converts a derived result into a pretend quote. Quotes, candles, option chains and live calculations use the existing local Live implementations. Unavailable Replay options/fundamentals/research sections make no API calls and explain their actual coverage.

## US and India instruments

Add a typed instrument identity with provider symbol, display symbol, exchange, market, currency, timezone and regular session hours. Normalize Yahoo exchange codes rather than treating its search strings as canonical exchange names. US listings include NYSE/NASDAQ and explicit ETF listing venues where relevant; do not mislabel SPY as a NYSE primary listing when the metadata identifies NYSE Arca.

Replay search uses checked instrument metadata, independent of metric availability. An unsupported replay ticker remains navigable with a coverage message. Live search reuses the existing backend search. USD and INR formatting follow instrument/reporting currency; selecting an Indian ticker does not relabel a USD portfolio or a US agent's measured costs as INR.

Show NSE regular cash session hours in Asia/Kolkata (09:15–15:30 IST). Label these as regular hours rather than asserting holiday-aware open/closed status without a calendar. The Market Overview includes India VIX with a sourced/timestamped local Live value when available; Replay uses a verified derived volatility summary, otherwise a clear unavailable row. A raw vendor India VIX level is never bundled publicly. Broader Indian data ingestion and real-regime analytics remain in Phases 3 and 5.

## Design and Agents

Use `docs/forge-reference.html`: background `#050607`, panel `#0B0D10`, rule `#1A1E23`, text `#E7EAEC`, amber `#F0A929`, with the reference's semantic status colors. Use Inter and JetBrains Mono/tabular numerals for measurements. Borders and spacing establish hierarchy; reserve motion for selection or stored replay events.

Phase 1b will recompose Agents from the actual HTML reference in a separate PR. Phase 1a preserves the existing validated Command Center and adds its workspace subnavigation. Replace cosmetic continuous shell glow with workspace and evidence state in the shared shell.

## Files and logical commits

All paths below are relative to the implementation worktree. Additions are proposed names; generated artifact counts depend on validated coverage.

1. **Workspace registry and command contracts**
   - Add `frontend-v2/src/app/workspaces.ts`, `frontend-v2/src/app/command/mnemonics.ts`, `frontend-v2/src/markets/instruments.ts`.
   - Add meaningful parser/navigation/instrument checks to `frontend-v2/scripts/verify-shell.mjs`.
2. **Shared Replay contracts and exporter**
   - Add `src/replay/publication.py`, `scripts/export_replay.py`, `tests/test_replay_publication.py`.
   - Add `frontend-v2/src/replay/contracts.ts`, `client.ts`, `mode.tsx`, and `frontend-v2/public/replay-manifest.json` plus checked derived projections under `public/artifacts/replay/`.
   - Reuse `backend/routes/forge.py`, the existing regime projections and `scripts/export_observatory.py`; change export plumbing only where necessary. Leave frozen model/verifier inputs untouched.
3. **F1–F10 shell and command entry**
   - Change `frontend-v2/src/app/shell/ForgeShell.tsx`, `shell.css`, `frontend-v2/src/app/command/ForgeCommandPalette.tsx`, `frontend-v2/src/routes/__root.tsx` and `frontend-v2/src/styles.css`.
   - Add `CommandLine.tsx`, shared `WorkspacePlaceholder.tsx`, and routes `factors.tsx`, `research.tsx`, `execution.tsx`, `data.tsx`.
   - Regenerate `frontend-v2/src/routeTree.gen.ts` through the existing router tooling.
4. **Connect existing workspaces to verified Replay**
   - Change Forge data client/query plumbing, Dynamics query/fetch boundaries, Observatory Page/training loader/neural mode controls, God's Eye feeds/page and the landing manifest reader.
   - Add Replay/Live identity to affected query keys; gate local execution/mutations before any request.
   - Remove `frontend-v2/public/artifacts/observatory/manifest.json` once all readers/exporters use the shared manifest. Remove the six unlicensed trace payloads from the current tree; preserve existing Git history and read its exact bytes for tests.
5. **India-aware Market and honest coverage**
   - Change Markets contracts/search/query/format/Overview and route search validation; add a Replay Overview component if it keeps raw/derived contracts distinct.
   - Change `backend/routes/assets.py` only as needed for verified normalized instrument metadata. Reuse quote providers for local India VIX.
   - Gate `frontend-v2/src/routes/risk.tsx` to its approved Replay/Live behavior before it mounts local book queries.
6. **Agents visual composition — deferred to Phase 1b**
   - Leave `frontend-v2/src/forge/command-center/CommandCenter.tsx` and Agents composition unchanged in 1a. Three small responsive/accessibility fixes let a panel header wrap, keep closed provenance popovers hidden, and contain the Reality table's positioned content within its scroll region. In 1b, match the actual reference while retaining the trajectory/evidence models and contracts.
7. **Release checks and documentation**
   - Add `frontend-v2/scripts/verify-replay.mjs`, a reusable Phase 1 capture script, and `.github/workflows/ci.yml` steps.
   - Update existing affected verifier scripts for the intentional navigation/mode behavior changes without weakening contract assertions.
   - Add `docs/phase1a-terminal.md`, 1440/390 screenshots and the postable finding/walkthrough. Retain this implementation plan with the final PR.

## Verification and completion

- Run lint, TypeScript, production build, every existing `verify-*.mjs`, new shell/Replay checks, existing browser checks and the full pytest suite.
- Run the production frontend with no API server or credentials. Load all ten workspaces and every existing workspace subpage, navigate via function keys and commands, refresh and use history at 1440 and 390 px. Record all requests/responses: zero unexpected failed requests, zero authenticated API/external feed requests, and zero raw vendor price fields in Replay artifacts or rendered evidence.
- Separately sabotage a manifest hash, artifact hash, schema, timestamp, source identity and unsafe nested field to prove fail-closed behavior. Missing/unavailable coverage must not fetch a nonexistent artifact. CI must exercise real checked files rather than fulfilling product requests with simulated fixtures.
- Check US/India command aliases, currency formatting, session labels, unknown instruments, exchange conflicts, public attempts to enable Live, mode-switch cache isolation, keyboard focus, viewport overflow and unavailable states.
- Verify frozen Forge hashes and Dynamics lineage remain unchanged. Preserve every applicable existing release/authorship gate.
- Capture MARKET (US and India), WORLD, REGIMES, OBSERVATORY, AGENTS and an empty future workspace at both widths. Document a 30–60 second recording path: F1 → `RELIANCE IN DES` → `SPY REG` → F8 → F9 → one future workspace. Finish the PR with a three-sentence honest finding, exact screens to record, public link and repository link.

The user approved this plan with the amendments above. Implementation proceeds on Phase 1a; Phase 1b remains separate.
