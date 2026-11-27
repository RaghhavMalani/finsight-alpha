# U4 · Forge v2: a versioned successor of the Forge UI

## Why v2 exists

`scripts/research_archive.py` freezes `frontend-v2/src/forge` and `frontend-v2/src/agents`
(`SHARED_PATHS`, against its `BASELINE` commit) as closed phase evidence: no byte under them may
change, and CI fails if one does. U2 needed to change the Forge components to give their numbers
provenance, and the in-place conversion was rejected and reverted (see `docs/u2-num-provenance.md`
and the 2026-11-25 entry in `docs/questions-for-raghhav.md`). The owner chose a versioned Forge UI:
the new UI lives in `frontend-v2/src/forge2/`, and the v1 files stay byte for byte as the record.

## What was ported (stage A)

Each file under `frontend-v2/src/forge2/` opens with a header naming the v1 path it succeeds.

| v2 (`src/forge2/…`)                                                                      | from v1 (`src/forge/…`) |
| ---------------------------------------------------------------------------------------- | ----------------------- |
| `command-center/CommandCenter.tsx`, `overview-model.ts`                                  | same paths              |
| `runs/RunIndex.tsx`, `RunObserver.tsx`, `TrajectoryExplorer.tsx`                         | same paths              |
| `runs/TrajectoryGraph2D.tsx`, `TrajectoryGraph3D.tsx`, `TrajectoryEvidenceInspector.tsx` | same paths              |
| `runs/trajectory-model.ts` (UI-side view model)                                          | same path               |
| `bench/BenchIndex.tsx`, `BenchDetail.tsx`                                                | same paths              |
| `worlds/WorldIndex.tsx`, `artifacts/ArtifactIndex.tsx`, `reality/RealityLadder.tsx`      | same paths              |
| `shared/AgentsShell.tsx`, `SurfacePrimitives.tsx`, `agents.css`                          | same paths              |
| `shared/forge-prov.tsx`, `runs/node-prov.tsx`                                            | new in v2 (provenance)  |

Two commits:

1. **Faithful port.** The files above, copied with only their imports repointed (`@/forge/<ui>` to
   `@/forge2/<ui>`) and the header added; the eight route files (`forge.tsx`, `runs.index.tsx`,
   `runs.$runId.tsx`, `bench.index.tsx`, `bench.$benchmarkId.tsx`, `worlds.tsx`, `artifacts.tsx`,
   `reality.$artifactId.tsx`) now render forge2. Same behaviour and DOM: `verify-agents.mjs`
   passes unchanged.
2. **Provenance.** The U2 conversion that was written against v1 and reverted (`d7efd01`,
   `b9330e6`, `dadfd9a`, fixes in `0cab233`) replayed onto forge2, and `/forge`, `/worlds`,
   `/artifacts`, `/bench`, `/runs` enforced in `verify-num.mjs`.

## What stays in v1

- The contracts and data layer are imported read-only, never copied: `@/forge/contracts/observer`
  and `@/forge/data/*` (`forge-client`, `forge-queries`, `forge-adapters`). Every value forge2 shows
  is adapted by the same frozen code that v1 used.
- `src/forge/shared/SurfacePrimitives.tsx` is still imported by `src/dynamics/*` (not a Forge
  route); those imports are unchanged.
- `scripts/verify-agents.mjs` and `scripts/generate-terminal-index.mjs` import the v1 adapters and
  `overview-model.ts` directly. The forge2 `overview-model.ts` is a byte copy of that logic (plus
  its header), so the checks hold for both.
- All v1 UI files remain in the tree, unreferenced by routes, as the record of the closed phase.

## How to compare

- Port fidelity: every forge2 file equals its v1 file once its two-line header is dropped and
  `@/forge2/` is read as `@/forge/` (and `../../forge/contracts/` as `../contracts/`):
  `git show <port commit> -- frontend-v2/src/forge2` against `frontend-v2/src/forge`.
- The provenance step: `git diff <port commit> <provenance commit> -- frontend-v2/src/forge2`,
  which is the reverted U2 diff (`git diff 2780ea3 2780ea3^ -- frontend-v2/src/forge`) with paths
  moved to forge2.
- v1 untouched: `python .milestones/tools/sealed_check.py` prints "none" for protected phase
  paths, and `git diff origin/main -- frontend-v2/src/forge frontend-v2/src/agents` is empty.

## Truth of the origins

- Replay values name the artifact `/replay-manifest.json` routes their `api(route)` read to, with
  that entry's SHA-256 (`useRouteOrigin`). `verify-num.mjs` now also resolves each Forge replay
  value's `data-ptr` in that artifact's JSON body, read by the checker itself
  (`POINTER_CHECKED`), and a sabotage step requires an unresolved pointer to be flagged.
- Values computed in the browser (counts, sums, `× 100` percentages) carry a `formula`.
- A node without a recorded model turn shows its usage as `unavailable`, never `0`.
- No Forge or Bench value is shown as `sealed`: no page verifies them against a sealed table.

## Enforced routes

Raw numbers in Replay (`verify-num.mjs`), v1 report-only against forge2 enforced: `/runs` 272 → 0
(218 provenanced), `/forge` 57 → 0 (61), `/worlds` 19 → 0 (7), `/artifacts` 8 → 0 (4), `/bench`
7 → 0 (4). Further views, all 0 raw: the `/forge` run drawer (72 provenanced), the first
`/bench/$benchmarkId` (19), and the first `/runs/$runId` on its action (22), turns (35) and checks
(17) tabs. Report-only total across the app: 602 → 239. Stage B adds the `/reality/$artifactId`
views below.

## Stage B: the debugger, Bench and Reality Ladder

Built only in `frontend-v2/src/forge2` (v1 and its contracts are read, never changed), one commit
per surface, following `docs/forge-ui-v3-preimplementation.md` §4.2–§4.4.

### Run Observer as a step-through debugger (`/runs/$runId`, §4.2)

- `runs/TrajectoryStepper.tsx`: the recorded actions as a list beside the selected action's
  inspector. Each row shows the action's sequence, label, recorded status (with a verifier mark)
  and its model turn's `tokens_in` / `tokens_out`; an action without a turn reads `unavailable`.
- Keyboard: ↑/↓ or j/k step, Home/End jump; focus follows the selection (roving tabindex).
- `?step=N` is the selected action's recorded sequence. It deep-links and survives a reload;
  stepping replaces the history entry. `?node=N`, the pre-U4 name, is still read because the
  frozen v1 UI links with it.
- Play/Prev/Next replay the recorded action order only. Playback moves at a fixed display pace,
  stated on the page as not recorded timing (the record has no timestamps). Under
  `prefers-reduced-motion` Play is disabled and the selection changes only when stepped.
- Review fix in `TrajectoryGraph2D.tsx`: node values are one per row in normal flow, so the
  `selected` mark no longer overlaps the latency, and the token count cannot wrap. The graph's
  legend names every channel of the view on screen (2D and 3D differ).

### Bench (`/bench/$benchmarkId`, §4.4)

- Metric tabs (`?metric=`): verified research, false α, critical fail, cost per finding, latency,
  tool/engine use. All are fields of `model_summaries` in the baseline artifact.
- `bench/bench-model.ts` computes the observed-relation sentence from those fields: the best value
  (ties by exact equality), the others in order, and for verified research the tie-break on cost
  and latency among the tied models. It prints beside "Observed in this suite (N admitted
  episodes); not a global ranking." Every value in it is a `<Num>` into the artifact.
- A bar per model encodes the selected field from zero to the largest observed value (legend).
- Planned releases (v0.2.5.1 hardened, v0.3 multi-agent) that the baseline index does not list
  show as `UNAVAILABLE — No verified artifact loaded`. The Reality Ladder link appears only when the
  loaded ladder's hash equals the baseline's `bindings.reality_ladder_artifact_hash`.

### Reality Ladder (`/reality/$artifactId`, §4.3)

- A 2D chart of one checkpoint metric (Sharpe, max drawdown, slippage, latency cost, runtime)
  against realism level in artifact order; point colour is the epistemic class (computed or
  counterfactual), the amber ring is the selected checkpoint, and the dashed lines mark the
  highest and lowest recorded values. `?view=table` shows the same six records as a table, with
  the signed Δ to the previous checkpoint for the selected metric.
- `reality/ladder-model.ts` computes the deltas from the checkpoint records. The largest
  degradation is the most negative Sharpe step (Sharpe is the artifact's primary metric), shown
  with its Δ and compared with `aggregate.largest_degradation`: the page says whether they match.
- The provenance panel names the artifact, schema, integrity status, primary metric and alpha
  survival; the unbound certification hash reads `unavailable`.

## Verifiers

- `scripts/verify-forge2.mjs` (CI shard `browser-agents-shell-plugins-data-research`) reads the
  checked artifacts itself and does not import forge2. It recomputes the relation sentence for
  each Bench tab and the ladder deltas and largest degradation for each metric, and compares the
  page. It checks keyboard stepping (↓, j, k, ↑, End, Home), focus, the `?step` deep link across a
  reload, disabled playback under reduced motion, playback visiting exactly the recorded order and
  stopping at the end, UNAVAILABLE releases, that chart and table show the same records, no
  horizontal scroll and no text under 11px at 1440 and 390. Sabotage, one per surface: a tampered
  run turn's tokens, a tampered model summary, and a tampered checkpoint Sharpe (each re-hashed in
  the manifest so it loads) must each be detected; the ladder page must also say it no longer
  matches the artifact.
- `verify-num.mjs`: `/reality/$artifactId` is now visited as ten views (chart and table, each
  metric), enforced at zero raw numbers, and `/reality` is pointer-checked.
- `verify-agents.mjs`: the run-route URL assertions use `step=`.

Screenshots: `docs/screenshots/u4-{debugger,bench,ladder}-{1440,390}.png`, written by
`node scripts/verify-forge2.mjs --url <preview> --screenshots`.

## Still not covered

- The 3D trajectory view is not scanned by `verify-num` (its labels live in a WebGL overlay).
- The Bench's planned-release list is the design plan's, not an artifact's; only the absence of a
  verified artifact for them is checked.
