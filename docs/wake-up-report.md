# Wake-up report — 25 Nov 2026

## Public demo
- **https://finsight-alpha-web.vercel.app**: Replay of checked artifacts. A banner on every page gives the recording date.
- Before going public, the production bundle was grepped: Local Live compiles to `false`, and there are no `VITE_` variables, backend URLs or key values. The live bundle has the same content hashes as the local build, so the Vercel project bakes in no env vars.
- `/api` no longer proxies to the backend (#43). The public `/research` was "unavailable" until #45 let the build read the sealed exports. A CI guard now stops `.vercelignore` from hiding a build input again.
- **2-minute video:** `docs/demo/finsight-forge-demo.webm`, recorded from the public site with `frontend-v2/scripts/record-demo.mjs`.

## Merged since the last report
- **#41 U3 part 1:** Global Eye propagation arcs over the cited graph.
- **#44 U3 part 2:** the graph grows from 44 to 125 nodes and from 7 to 22 companies.
  - Five recorded quakes now reach securities at their own time (none did before).
  - An independent audit re-fetched 18 source groups; none was fabricated.
- **#42 and #46 U2:** every number on `/`, `/research`, `/markets`, `/risk` and `/data` carries a truthful origin (sealed, replay or live), enforced in CI.
- **#43 and #45:** the public demo, as above.

## Open / in progress
- **U2 slice 3:** `/dynamics`, `/observatory`, `/globe` and `/regimes`.

## Needs you (≤5)
- **Forge pages are protected evidence.** `scripts/research_archive.py` freezes `frontend-v2/src/forge` and `src/agents`. That blocks both Forge provenance (363 raw numbers) and U4 (debugger, Bench, Reality Ladder). The options are in `docs/questions-for-raghhav.md`.
- **`FINSIGHT_SEC_CONTACT` is unset.** SEC EDGAR returns 403, so fundamentals use a labelled fixture.
- **Spend cap is $0.** U10 will dry-run with a labelled mock.

## Known flake
- `verify-shell`'s palette step ("F6 · FACTORS") timed out twice on Linux Edge for #45, then passed on a re-run with no code change. It passes locally in all three browsers. Logged; not yet root-caused.

## Spend
- Model API: $0 of $0.
