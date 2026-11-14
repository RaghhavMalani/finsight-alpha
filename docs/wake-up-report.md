# Wake-up report — 14 Nov 2026, IST

## Merged since you left
- Nothing yet. PR #30 (M0) waits on its first run under the new parallel CI.

## Open / in progress
- PR #30 (M0 + Q0): ready for review. CI on head `4937347` now runs as 6 backend + 6 frontend parallel shards
  (was 60 + 25 min serial and timing out). Merging with a merge commit as soon as that exact head is green.
- Q1 (retire AsOf, SEC EDGAR fundamentals, `fundamentals(ticker, field, as_of)`): sub-agent working on branch
  `q1/truth-fundamentals`.
- Q2 (Live Spine: scheduler, append-only live store, SSE `/live/stream`, `python -m finsight live`): sub-agent
  working on branch `q2/live-spine`.

## Live now
- Feeds: not yet; the Live Spine is in progress.
- How to run (today): `cd frontend-v2 && npm ci && npm run build && node scripts/preview-built.mjs`.

## Needs you (≤5)
- Model API spend cap was blank, so the budget is $0. The Q5 ablation will be built and dry-run with a labelled
  mock model. Undo: give a cap.
- Repo setting "Allow auto-merge" is off, and turning on PR auto-fix was blocked by permissions, so I merge by
  hand after checking the exact head is green. Undo: enable either if you want hands-off merges.
- Full list: `docs/questions-for-raghhav.md`.

## Spend
- Model API: $0 of $0.

## Look at this first
- PR #30 description: what M0 changed and why the old CI kept timing out.

## Next up
- Merge PR #30 → integrate Q1 and Q2 → start Q3 (visual system, three F2 directions behind `?look=`).
