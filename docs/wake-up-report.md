# Wake-up report — 18 Nov 2026, 19:15 IST

## Merged since you left
- #30 M0 + Q0: connected terminal unblocked, SHA-verified static indexes, Risk limit split. CI is now parallel
  shards: ~16 min instead of 60+ and timing out.
- #32 Q2 Live Spine: append-only live store, 12 feeds, SSE `/live/stream`, `python -m finsight live`.
- #33 Q1: AsOf retired; SEC EDGAR provider; point-in-time `fundamentals()`. #35 adds `GET /truth/fundamentals`.
- #34 Q4 part 1: sourced knowledge graph (44 nodes, 46 cited edges) with as-of-respecting propagation.
- #36: a live quake near a mapped site becomes a suggested research question naming the reached tickers, each
  with its cited chain. Suggestion only: no model call, no cost.
- #38: cap-era terminal encodings deleted; plain sealed JSON (net −1,578 lines).
- #37 Q3 part 1: shared visual system; `/research` is an evidence graph of 109 real nodes, where a trial's
  distance from the hypothesis is its t-statistic. Every state comes from a sealed field or a preregistered
  rule shown in the node panel. Four rounds of code and design review.

## Open / in progress
- #39 U1: seven workspaces (F1 Command · F2 Research · F3 Global Eye · F4 Forge · Alt 5 Dynamics · F6 Markets ·
  Alt 7 Risk) and live F1 Command over the globe. All old URLs still resolve. Local checks green after merging
  main; code and design reviews running.

## Live now
- `python -m finsight live`, then open F1 Command in Local Live. Without the spine, every panel says so and
  shows no numbers.

## Needs you (≤5)
- `FINSIGHT_SEC_CONTACT` is still unset, so SEC EDGAR returns 403 and fundamentals run on a labelled fixture.
- Spend cap was blank → $0 model spend; U10 (Forge v0.3 ablation) will dry-run with a labelled mock.
- Deleting merged remote branches and enabling PR auto-fix were blocked by the permission system. Branches are
  left in place.
- Full list: `docs/questions-for-raghhav.md`.

## Spend
- Model API: $0 of $0.

## Look at this first
- `docs/screenshots/q3-research-bloom-1440.png` and `u1-command-live-1440.png`.

## Next up
- Merge #39 on green after reviews → #37 follow-ups (leader lines, dim graph behind the HUD, 16 px label
  gutter) → U2 `<Num>` everywhere with a CI check → U3 Global Eye v2.
