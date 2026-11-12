# Agent log

Append-only. Terse. Newest entry last. A new agent should be able to resume from this file alone.

## Standing facts

- Work happens in `D:/Personal_Projects/Finance/finsight-alpha/.milestones/` (ignored by the main clone):
  `m0` is a clone of PR #30's branch; `m0-risk`, `m0-browser`, `m0-base` are its worktrees.
  Python env: `.milestones/venv` (system site-packages + `pip install -e . -r requirements-test.txt`).
- Local pytest on Windows needs `--basetemp=.tmp/<name> -p no:cacheprovider` (the default temp dir is not writable).
- Commits use `Raghhav Malani <96712854+RaghhavMalani@users.noreply.github.com>` and carry no assistant
  co-author trailer; `scripts/verify_release_authorship.py` enforces both in CI.
- `ci.yml` does not run on the daily bot commit to `main` (pushes made with the workflow token do not
  trigger workflows), so `main` can go red without anyone seeing it. Last `ci.yml` run on `main`: 26 Oct.
- Generated terminal modules and `frontend-v2/public/terminal/*.json` are gitignored; `npm ci` / `npm run build`
  regenerate them.

## 2026-11-12 — M0 start: resume protocol and baseline

Leftovers
- The previous agent's M0 work was an uncommitted diff in `.milestones/m0` (PR #30 head `176a413`): a
  half-finished static-JSON transport for the Data and history-archive terminal indexes. Direction was right;
  kept and committed as `cbe85dc`. No Risk changes had survived. All registered worktrees were clean of M0 work.
- `feat/forge-v0.2.5.1-behavioral-hardening` existed only locally (`1eed65b`). Pushed as-is; M2 is unblocked.

Baseline (PR #30 head merged with `main` `16de0e8`)
- Terminal generator: threw on caps. After the merge the numbers were worse than the brief's: data 149,553 B,
  history-archive 134,939 B (cap 131,072), plus a new failure on the search module gzip cap (16,723 > 16,384).
  Regimes was at 30,689 of 32,768 gzip and grows daily.
- Risk: `pytest tests/risk_manager` gave 2 failed / 110 passed / 134 errors. 65 errors share one cause: a fresh
  sweep now builds a primary *state* over the 128 KiB `LIMIT`, so `sweep.run()` returns FAILED and the `preflight`
  fixture asserts. The other 69 are the local temp-dir permission problem, not real. Largest retained risk-state
  is 130,898 B, so the real pipeline was one epoch from failing too.
- `tsc` clean, `npm run build` works once the generator writes outputs.
- A fourth workflow is red on `main`: "Research OS full frozen calibration verification" has failed every
  Sunday since at least 11 Oct with "Full calibration input mismatch". The calibration was frozen on
  Windows and CI recomputes on Linux.

Decisions
- Risk: split `LIMIT` into `ADMISSION_LIMIT` (1 MiB) and `COMPACT_THRESHOLD` (128 KiB, unchanged so retained
  receipts keep their wire format).
- Terminal: only the seed is on the initial path and keeps a tight budget. Other shards are retained data
  fetched on demand; their ceilings are runaway guards (`MAX_LAZY_MODULE_*`, `MAX_STATIC_TERMINAL_BYTES` in
  `catalog.ts`). Data and history-archive are served as `/terminal/<name>.<sha12>.json`, verified by SHA-256.
- `preview-built.mjs` takes `PREVIEW_PORT` so several checkouts can run browser verifiers at once.

In flight
- Three sub-agents: Risk (`m0-risk`, branch `m0/risk-admission`), terminal core + node verifier (`m0`, branch
  `m0/unblock-terminal-and-risk`), browser verifier (`m0-browser`, branch `m0/terminal-browser`).
- Next: merge the three branches into `m0/unblock-terminal-and-risk`, fix the Research OS weekly check, run the
  whole CI locally, adversarial review, push to `feat/phase7-5-connected-quant-terminal`, merge PR #30.
