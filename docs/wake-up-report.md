# Wake-up report — 14 Nov 2026, 16:10 IST

## Merged since you left
- PR #30 (M0 + Q0): connected terminal unblocked; Data/history indexes as SHA-verified static JSON; Risk limit split
  (1 MiB admission / 128 KiB compact); verifiers check real properties; CI after publications; Research OS replay
  pinned and green. CI is now 13 parallel shards: ~16 min wall time instead of 60+ min and timing out.

## Open / in progress
- Q1 `q1/truth-fundamentals`: AsOf retired in docs; SEC EDGAR companyfacts provider; `fundamentals(ticker, field,
  as_of)` with sabotage tests. Review found no look-ahead; fixing 4 should-fix items, then PR.
- Q2 `q2/live-spine`: append-only live store (available_at = ingestion time), 12 feeds, SSE `/live/stream`,
  `python -m finsight live`. Review found 4 store-robustness blockers (torn lines, write ordering, startup seal
  crash, cross-process lock); being fixed, then PR.
- Q3 `q3/visual-research`: visual system extracted from globe/observatory; three `?look=` Research directions.
- Q0 follow-up `q0/generator-simplify`: delete ~800 lines of cap-era generator code. Queued.

## Live now
- In a 5.5-min real-network run 11/12 feeds came up: USGS, NWS, CelesTrak, EIA, Yahoo (delayed), Alpaca IEX,
  Polymarket, Kalshi, Fed/ECB RSS, GDELT, FRED. NSE is unavailable by design (needs an operator bhavcopy).
- How to run once Q2 merges: `python -m finsight live` (or `./live.ps1`).

## Needs you (≤5)
- SEC EDGAR returns 403 without a contact email in the User-Agent. Set `FINSIGHT_SEC_CONTACT` to a mailbox you're
  happy to expose; until then fundamentals run on a labelled synthetic fixture only.
- Spend cap was blank → $0 model spend; Q5 will dry-run with a labelled mock.
- Full list: `docs/questions-for-raghhav.md`.

## Spend
- Model API: $0 of $0.

## Look at this first
- PR #30's description: what M0 changed and why CI kept timing out.

## Next up
- Open Q1 and Q2 PRs after fixes → merge on green → Q3 integration and the design review.
