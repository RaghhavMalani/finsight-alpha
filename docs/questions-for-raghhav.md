# Questions for Raghhav

Decisions taken while you were away. Newest last. Each says what I chose and how to undo it.

## 2026-11-14 — Model API spend cap was blank
- Treated as **$0**: no paid model calls. Q5 (Forge v0.3 ablation) will be built and dry-run with a clearly
  labelled mock model; the real run waits for a cap.
- Undo: put a USD cap in the brief (or here) and say "run Q5"; the cost estimate will be in the Q5 PR.

## 2026-11-14 — CI restructure (PR #30)
- Split the 60-min backend job and 25-min frontend job into parallel shards; push CI now runs only on `main`
  (PRs use `pull_request`), with cancel-in-progress for superseded PR runs. No check was removed.
- Undo: revert the `ci.yml` commit on `main`.
