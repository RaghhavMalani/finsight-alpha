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

## 2026-11-14 — SEC EDGAR needs a contact in its User-Agent (Q1)
- SEC returned 403 to `FinSight-Forge research (github.com/RaghhavMalani/finsight-alpha)`. Its fair-access policy
  asks for a contact email in the User-Agent, and the brief forbids a personal email, so I sent none.
- Chosen: provider and `fundamentals(ticker, field, as_of)` ship working offline (synthetic, labelled fixture);
  no real EDGAR data is fetched. Undo: set `FINSIGHT_SEC_CONTACT` to a project mailbox you're happy to expose
  (the provider appends it to the User-Agent); then `FINSIGHT_NETWORK_TESTS=1` exercises the real API.

## 2026-11-14 — India fundamentals left as a documented gap (Q1)
- NSE and BSE terms forbid automated collection without written consent; nothing was scraped. Undo: none needed.

## 2026-11-18 — Workspaces 5 and 7 use Alt 5 / Alt 7, not F5 / F7 (U1)
- F5 reloads and F7 toggles caret browsing; the shell leaves both to the browser (verify-shell enforces it).
- Chosen: Dynamics and Risk are labelled "Alt 5" / "Alt 7" and reached by Alt+5 / Alt+7, nav, palette, REG/OBS/RISK/DATA.
  Alt+1..7 also open every workspace. Text fields keep F-keys and Alt+digit.
- Undo: in `frontend-v2/src/app/workspaces.ts` set those keys to "F5"/"F7" (they are then captured) and flip the
  native-key assertions in `scripts/verify-shell.mjs`.
