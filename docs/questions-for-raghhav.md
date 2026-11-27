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
- Known limit: on Linux, Chrome and Firefox use Alt+1…8 to switch tabs, so Alt 5 / Alt 7 may be taken by the
  browser there. The nav, the palette and the REG / RISK / DATA mnemonics still reach both workspaces.

## 2026-11-18 — Research ships one look, Neural Bloom (Q3, #37)
- Depth Field and Constellation were removed: their layouts encoded no measured value, which breaks "every visual
  channel encodes a real quantity". In Bloom a trial's distance from the hypothesis is its t-statistic.
- Old `?look=` values fall back to Bloom. Undo: restore the two scene files from commit `932890a^`.

## 2026-11-22 — Global Eye arcs use labelled scenarios until the graph grows (U3)
- No checked Replay quake reaches a cited site: the graph's sources were checked 14–15 Nov 2026, after every
  recorded quake, and no seed site lies inside any recorded quake's radius.
- Chosen: three scenarios, each labelled "hypothetical, not a recorded event" and dated at the graph's cutoff
  (Taiwan M6.8 → AVAILABLE, Hormuz conflict → PARTIAL, Hsinchu M4.8 → BELOW_THRESHOLD), plus a labelled
  retrospective view of recorded quakes against the graph as checked. Recorded quakes stay honest
  (UNAVAILABLE / NO_COVERAGE).
- Undo: empty the scenario list in `scripts/export_geo_projection.py` and re-run it.

## 2026-11-25 — Forge pages are protected evidence; no provenance in place (U2)
- `scripts/research_archive.py` freezes all of `frontend-v2/src/forge` and `frontend-v2/src/agents`
  (`SHARED_PATHS`) as closed phase evidence. U2 converted the Forge routes, CI rejected it, and the
  conversion was taken back out; `/forge`, `/worlds`, `/artifacts`, `/bench` and `/runs` stay
  report-only (363 raw numbers).
- Options, your call: (a) leave them as they are; (b) a versioned successor of the Forge UI outside
  the protected path, with the old one kept for the record; (c) amend the protection to admit a
  presentation-only change. I did not touch the guard.

## 2026-11-27 — Owner chose a versioned Forge UI (U4 stage A)
- Decision (yours, option (b) above): owner chose a versioned Forge UI. The new UI lives in
  `frontend-v2/src/forge2/`; `frontend-v2/src/forge` and `frontend-v2/src/agents` stay byte for
  byte as the record, and `scripts/research_archive.py` is untouched.
- Done: forge2 ports the Forge components (contracts and data layer imported from v1, not copied),
  the eight Forge route files render it, and the reverted U2 provenance is replayed onto it.
  `/forge`, `/worlds`, `/artifacts`, `/bench` and `/runs` are enforced (363 raw numbers to 0), and
  their replay pointers are checked to resolve. See `docs/u4-forge-v2.md`.
- Undo: point the eight route files back at `@/forge/…`, delete `src/forge2`, and move the five
  routes out of `ENFORCED` in `frontend-v2/scripts/verify-num.mjs`.
