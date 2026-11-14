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

## 2026-11-12 — M0 baseline, backend, with project venv

- Python verifiers all pass locally with the venv: plugin replay, Data Organ, regimes, factors, Risk archive,
  Research OS, inference calibration, all 13 Dynamics freezes. `pytest tests/regimes` passes.
- Local-only failures, not real: `tests/sabotage/test_sandbox_nasty.py` (16) needs Linux process isolation;
  `tests/factors/test_publication.py` (2 errors) copies the repo into the pytest basetemp, which recurses when the
  basetemp is inside the repo. Use a basetemp outside the checkout.
- Research OS weekly check: recomputed all 8 cases x 1000 worlds locally with the recorded versions (numpy 2.3.4,
  scipy 1.16.3, pandas 2.3.1, statsmodels 0.14.6, sklearn 1.7.0) on Windows: seed hash, generated-data hash and
  family hash identical, max p-value difference 0.0. CI had installed numpy 2.5.4 / scipy 1.18.1 / pandas 3.1.1
  on Linux. Fixed in `69116c0`: the workflow installs the recorded versions on `windows-latest`, and the verifier
  refuses to replay in a drifted environment (sabotage test added). The frozen artifact is untouched.
- `ci.yml` now also runs on `workflow_run` of "Checked organs" and on dispatch (`00f09f4`).
- The first three sub-agents ran into a rate limit; restarted on another model with their partial diffs intact.

## 2026-11-13 — M0 integration on `m0/unblock-terminal-and-risk`

- Terminal core done (b6b4322, b85893e, 92f579b, 91d0e15): named ceilings everywhere, static indexes fail closed
  with the reason, stale static files pruned, `--check` catches stale/missing/tampered files, 16 node-level
  sabotage checks. `verify-terminal-context.mjs`: 643 checks, ~2 min. The commit-shape epoch walk and the
  Phase 7.5 approved-file-scope guards were replaced by an append-only check on the current manifest (verified
  in a simulated post-merge main).
- Browser verifier done (3bf50d5, 3ccd2a6, 68637a4): code budgets count code only; 21 new negative cases x 3
  browsers; static-index stage 15/15, history layout 60/60.
- Initial-packaging gate (c40f0f0): replaced the 12.8 MB 2-Nov snapshot comparison and chunk-ownership
  attribution with whole-body budgets (initial JS <= 224 KiB gzip per workspace, terminal core <= 24 KiB,
  no eager optional modules). `npm run verify:terminal:initial` passes: Risk 204,494 B, Factors 185,452 B.
- CI now also runs `generate-terminal-index --check`, `verify-terminal-context.mjs` and the static-index stage.
- Palette no longer shows "No eligible result" under an unavailable-index reason (69211dc).
- Full browser matrix (not in CI) still fails 61/89 on pre-existing issues: the 623 KB replay manifest loads
  on Market and Data initial load; /dynamics initial JS 260 KB gzip; 8-10 px text on Risk/Factors. M3 work.
- Data static index has no UI consumer (`loadTerminalShard("data")` is never called); candidate for deletion.
- Waiting on: Risk frontend (m0-risk). Then: merge, full local CI, adversarial review, push, merge PR #30.

## 2026-11-13 — M0 pushed to PR #30 (`05d82d3`)

- Merged: Risk split (253 passed / 0 errors), terminal core + review fixes (644 context checks), browser verifier,
  Market Local Live fix (bare unrecorded tickers work again in Local Live only), latest main `233def0`.
- Adversarial review: no blockers; should-fix items done (vacuous counts, append-only vs parent/merge-base,
  canonical Risk bytes, `workflow_run` limited to main, Research OS replay pins Python 3.12.0 + recorded pins).
- Local gotcha: Markets/Risk/Data/Factors browser verifiers rewrite tracked `docs/screenshots/*.png`, which the Risk
  freeze inventory protects; never run them in the same checkout as the Risk suite. `git checkout -- docs/screenshots`.
- Local gotcha: build with `VITE_ENABLE_LOCAL_LIVE=true` (CI sets it job-wide) or Markets' Local Live button is
  disabled. `main`'s preview script has no `PREVIEW_PORT`; it always binds 4174.
- Dispatched research-os-full-verification on the PR branch: run 43443555790.
- Next: CI green on PR #30 -> mark ready -> merge (merge commit, not squash). Then M1 (retire AsOf, SEC EDGAR).
