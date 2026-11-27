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
(17) tabs. Report-only total across the app: 602 → 239.

## Left for stage B

U4 proper: the trajectory debugger, Bench and Reality Ladder upgrades, built on forge2. Not yet
covered by `verify-num`: `/reality/$artifactId` (not visited), the 3D trajectory view.
