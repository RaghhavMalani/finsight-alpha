# U2 · Numbers carry provenance

Invariant: **the UI states only what the evidence states, and every displayed number carries its
provenance.** A number on an enforced route is rendered by `<Num>`, `<Hash>`, `<Stamp>` or `<Src>`
(`frontend-v2/src/visual/Num.tsx`), or sits inside a documented exemption. A missing value is shown
as `unavailable` / `n/a` (or the workspace's existing dash), never as `0`.

## Origin kinds

Every provenance element renders `data-num`, `data-origin-kind`, `data-src`, `data-ptr` and, only when
a real digest exists, `data-sha`. The popover (`[data-origin-popover]`) shows only what the kind can
truthfully say.

| Kind     | `src`                                                                          | SHA-256 shown                                                                                                                                    | Clocks shown                                                       | Used by                                                                                                                |
| -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `sealed` | key into the sealed table passed to `ProvenanceProvider`                       | the sealed file's digest, and who sealed it                                                                                                      | run id, preregistration, study cutoff/freeze                       | `/research`                                                                                                            |
| `replay` | URL of a checked Replay artifact                                               | the digest `/replay-manifest.json` names for that URL (verified on load); "unavailable" if none. Labelled "checked Replay artifact · not a seal" | artifact `as_of` when the manifest states it                       | `/markets`, `/markets/$ticker`, `/risk`, Forge, `/data`, `/factors`, `/regimes`, `/dynamics`, `/observatory`, `/globe` |
| `live`   | the local API endpoint (`GET /live/recent · /live/stream`, `GET /live/health`) | never. "none · a live response is not hashed or sealed". Labelled "live API · not sealed"                                                        | record `seq`, `observed_at`, `available_at`; health snapshot `now` | `/` (F1 Command) in Local Live                                                                                         |

Helpers in `frontend-v2/src/visual/origins.ts` build origins (`replayOrigin`, `liveOrigin`) and
values (`num`, `ref`); non-finite or absent values become `null` with a reason, never zero.
`frontend-v2/src/visual/route-origin.tsx` (`useRouteOrigin`, `useRouteProv`) gives the origin of a
body read through `api(route)`: in Replay the artifact `/replay-manifest.json` routes it to (URL
and that entry's SHA-256), in local Live the endpoint `GET <route>` (live, no SHA). Pointers address
that JSON body. `/data` uses one
origin per `/data/<kind>` artifact. `/factors` (`src/factors/prov.tsx`) names the entry of the
checked Factor read manifest, the manifest it actually reads through; its artifact URLs and
digests are the same as the global manifest's. Forge and Bench artifacts are never shown as
`sealed`: no page verifies them against a sealed table.
Values computed in the browser from a source (counts of records, issues or weeks) keep the source's
kind and name the rule in `formula` (for example `count of /payload/issues where partition = UNAVAILABLE`).
The Replay manifest itself (`/replay-manifest.json`) is the root of the Replay check and has no
digest of its own; values read from it say so (`manifestOrigin` in `origins.ts`: an entry's
`sha256` or `as_of`, with no SHA claimed).

`<Num>`, `<Hash>` and `<Stamp>` accept `display` (the page's own formatting of the same value; the
popover always shows the raw value), `inert` (a span instead of a button, for values inside a link)
and `className="vx-inherit"` (keep the surrounding colour and font). Every value's tooltip carries
its source and pointer and, when the origin states them, `seq`, `observed_at`, `available_at`,
as-of, formula and note; elements also expose `data-seq` and `data-available-at`.

Inert values are never the only way in. On F1 Command each live row (event stream, risk alerts,
research, US and India markets) has an origin button beside its link (`#<seq>`, `.cmd-prov`), and
each feed-health row has one (`src`); they take focus and open the popover with endpoint, seq,
observed/available clocks, and the record's source, delay, confidence and licence. Row links keep
their full record provenance title.

Specific origins:

- Feed health: each row names where it was last read, either `GET /live/health` `/feeds/<i>` (with
  the snapshot's `now` as as-of) or the `feed.health` record (`/payload`, with its seq and clocks).
- USGS and CelesTrak chips (Local Live): the public feed URLs; the time is the browser-clock fetch
  time, not a source timestamp.
- Regimes (`src/regimes/prov.tsx`, `useRegimeOrigin`): each envelope is resolved the way
  `src/regimes/query.ts` reads it: a selected sealed snapshot by its content identity, a timeline
  at a cutoff by kind + `as_of` + source, otherwise by the manifest route. Pointers address the
  envelope (`/payload/...`). The `REPLAY · sha256 …` badge names the manifest entry's digest.
  Recorded rule text (convergence rule, momentum definition, Sharpe unit) is shown through `<Src>`.
- Observatory regime space: the checked trace artifact (`observatory:<ticker>:<kind>`), pointers
  into the trace body (`/frames/<i>/...`, `/dates_tail/<i>`); in Live the model-run endpoint, with
  `/trace` prefixed. Scene labels (HTML, no button) carry the same data attributes and a tooltip; a
  label eases between recorded EM iterations while replay animates, and says so. The header SHA
  and as-of are read from the manifest entry.
- Global Eye: quake and satellite values name the checked `world:quakes` / `world:satellites`
  artifacts (`/events/<i>/...`); in Live, the public USGS and CelesTrak feeds (live, no SHA). The
  four Geo-events inputs, admitted/pending counts and hub exposure are page-computed from `/events`
  and give the backend's rule (one-day availability lag, 7- and 30-day windows, energy
  `10^(1.5·mag + 4.8)` J) in `formula`, with `now` named in a note. The window-covered days depend
  only on `now` and name the snapshot's `as_of`. The camera readout is the reader's own view
  (`input`).
- Global Eye graph projection (`GeoPanel.tsx`, `src/components/globe/geo-prov.ts`): `replay` kind,
  `src` the served pinned file, `sha256` the digest compiled into `geo-pin.generated.ts` (the page
  refuses bytes that do not hash to it). It is not in a manifest, so the popover says the digest is
  named by `geo-pin.generated.ts` (`shaNamedBy`), not by `/replay-manifest.json`.
- Risk counts that include a failed sweep's Issue name both the state and the sweep receipt.
  Without a retained state a value is read from the sweep and says so in a note, not as "absent".
- Risk evidence-reference clocks name the checked Risk read manifest entry
  (`/artifacts/<id>/as_of`), with no SHA claimed for the manifest.
- Markets chart ticks (SVG text cannot hold a button) carry the same data attributes and a
  `<title>`: the min, midpoint and max of the plotted `/weeks/*/<field>`, and the first and last
  `/weeks/<i>/week`.

The popover header names the kind (`ORIGIN · SEALED / REPLAY / LIVE`) with a kind colour on its
left rule; values are underlined, not boxed (cyan dotted sealed, amber replay, green dashed live).
The popover is placed below its value, else above, else beside it, never over it; on narrow screens
it is a bottom sheet and the value is scrolled to stay visible above it.

## Exemptions

`data-num-exempt="<reason>"` on an ancestor. Any other value is reported as malformed and fails the
check on every route.

| Reason      | For                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `key-label` | keyboard and workspace keys: F1, F2, F3, Alt 7                                                              |
| `ticker`    | instrument identifiers: 8035.T, RELIANCE.NS, ^N225                                                          |
| `date`      | calendar labels that are UI state (a chosen range), not evidence values                                     |
| `id`        | identifiers, versions and digests shown as identifiers: sweep ids, rule `v1`, `bls:LNS14000000`, policy SHA |
| `copy`      | fixed product prose and verbatim record text (a headline, a quake place, a retained reason, a citation)     |
| `axis`      | pure scale marks that are not data values (unused on enforced routes; Markets ticks are provenanced)        |
| `input`     | a value the reader chose (watchlist size kept in this browser)                                              |

Two further, narrow allowances are coded in the checker:

- `[data-research-root] [data-copy]`: Research's pre-U2 convention for fixed prose, already
  enforced by `verify-research.mjs`; treated as `copy`.
- Sealed chrome: `.shell-cutoff` in `src/app/shell/ForgeShell.tsx` (the Replay manifest cutoff in
  the shell header). The file is sealed and cannot take an attribute, so the checker lists the
  selector explicitly and prints a `sealed chrome` count per route rather than dropping it silently.

## The checker

`frontend-v2/scripts/verify-num.mjs`, independent of the page code (it does not import `Num.tsx`).

- Static stage (always, CI `static` shard loop): self-test of the token rules. A numeric token is a
  currency amount, a percent, a decimal, or an integer of two or more digits; a text node that is
  nothing but a number (a count in a tile or cell, even a single digit) is also a token. Inside
  prose a single digit ("F1", "1 of 3") is not.
- Browser stage (`--url`, CI `browser-command` shard): Playwright Chromium, Replay mode, 1440 × 1000,
  all requests off the preview host aborted. Every page route from `src/routes` is visited; each
  visible text node with a token outside `[data-num]` or an exemption is reported. It also fails any
  provenance element with an unknown origin kind, a live value that names a SHA-256, a malformed
  digest, or a missing value (`data-na`) rendered as anything but `unavailable` / `n/a`.
- Every `data-origin-kind="replay"` element on every visited route must name either a checked
  manifest file (`/replay-manifest.json`, or the Risk read manifest whose URL the checker reads from
  `src/risk-manager/read-plan.generated.ts`, or the Factor read manifest read from
  `src/factors/read-plan.generated.ts`) with no SHA, or an artifact URL listed in one of those
  manifests with exactly that entry's `sha256`, as read by the checker itself. The one exception is
  the Global Eye graph projection, which no manifest lists: the checker reads the pinned file name
  and SHA-256 from `src/components/globe/geo-pin.generated.ts`, accepts a served URL whose file stem
  is the pinned file's (a hashed build asset) only with exactly that SHA-256, and fetches each such
  URL and hashes its bytes against the pin before it passes (`PIN … matches`).
- Further views of enforced routes: F1 Command in Local Live against a TEST-ONLY mocked spine
  (`/live/recent`, `/live/health`). The live close must be `live` with no SHA and a tooltip giving
  seq, observed_at, available_at, source and licence. The row link must keep its provenance title.
  A record without a close must show `unavailable`. The `#seq` origin button, reached by focus and
  Enter, must open a `LIVE` popover with Seq, Available and "none" for SHA. Also checked: the
  Markets popover, opened from the keyboard (its SHA equals the manifest's, and it does not cover
  its value), Risk with an Issue selected, Sweep history, and Coverage, and the Data Revisions,
  Lineage, Costs and Issues tabs.
- Sabotage: on `/markets` it injects a raw `Sharpe 1.37`, a lone `7`, an undocumented exemption, a
  live value claiming a SHA-256, a replay value with a swapped SHA-256 and a missing value shown
  as `0`, and requires all six to be flagged.
- Not scanned: `aria-label` and `title` text, closed `<details>`, tabs and panels the checker does
  not open, the Local Live Markets screens, the 3D trajectory view, and `/reality/$artifactId`.
- `--route /path` checks one route; `--verbose` prints every raw number.

## Enforced routes (zero raw numbers)

`/` (F1 Command, Replay and mocked Local Live), `/research`, `/markets`, `/markets/$ticker`, `/risk`
(feed, inspector, history, coverage), `/data` (all five tabs), and since U2 slice 3 `/regimes`,
`/observatory` (default Regime space scene) and `/globe` (Global Eye, default view, including the
propagation panel's default state).

Exemptions used by these routes: artifact and plugin identifiers, versions and hashes as `id`;
the outlier rule `10 × MAD`, the citation in a lineage licence and fixed prose naming a version as
`copy`; the Data Organ's design rule, shown as "By design · no models run, no holdouts opened" (a
statement, not a count; no artifact records it, so it is not shown as a number); a revision year and
the chosen Factor cutoff as `date`. Slice 3 adds: fixed prose naming the frozen `D0.4.2` analytics,
`RV20`, `√252`, `12–1`, `95% interval` and table captions as `copy`; the `D0–D0.4.2` lineage summary,
the word `sha256`, the graph version and the `geo_quake_*` input names as `id`; the Observatory's
state indices in the transition matrix as `id`; its regime-space axis names ("Rising 20d return",
"Near 52w high") as `axis`; verbatim quake places and scenario labels, the Geo-input labels, the
hub-exposure rule (`M4.5+ within 1,000 km, 30 days`) and the window length (`of 30 days`) as
`copy`; the Global Eye camera readout as `input`; and the Live wall clock as `date`. The
Observatory timeline's "last 250 sessions" was fixed text: it is now the count of `/dates_tail`.

## Protected Forge routes

`/forge`, `/worlds`, `/artifacts`, `/bench` and `/runs` are rendered by `frontend-v2/src/forge`,
which `scripts/research_archive.py` freezes as closed phase evidence (`SHARED_PATHS`, against its
`BASELINE` commit), as it does `frontend-v2/src/agents`. Their components cannot be edited, so U2
cannot add provenance to them in place, and they stay report-only (`PROTECTED` in
`verify-num.mjs`). Giving them provenance needs either a versioned successor of the Forge UI or an
explicit decision to amend that protection; both are logged in `docs/questions-for-raghhav.md`.

`/dynamics` is also report-only (`PROTECTED`), with **6** raw numbers, all in
`src/replay/FactorRegimeEvidence.tsx`, which `eval/factors/v0.1/phase5-freeze.json` seals (its
coverage share, row count, sample range, generated time and a count link). It is not edited or
wrapped from outside. Everything else on `/dynamics` (the Regime Intelligence workspace, the
navigator and the product header) is provenanced, so the route would pass once that panel has a
versioned successor.

## Report-only routes (raw numbers after U2 slice 3, Replay mode)

| Route                                                                                                  | Raw numbers | Why not enforced                                              |
| ------------------------------------------------------------------------------------------------------ | ----------: | ------------------------------------------------------------- |
| `/runs`                                                                                                |         272 | protected Forge component (above)                             |
| `/forge`                                                                                               |          57 | protected Forge component (above)                             |
| `/worlds`                                                                                              |          19 | protected Forge component (above)                             |
| `/artifacts`                                                                                           |           8 | protected Forge component (above)                             |
| `/bench`                                                                                               |           7 | protected Forge component (above)                             |
| `/dynamics`                                                                                            |           6 | sealed `FactorRegimeEvidence.tsx` (above); 116 before slice 3 |
| `/factors`                                                                                             |           6 | overview counts, see below                                    |
| `/execution`                                                                                           |           0 | no values in Replay                                           |
| `/markets/backtest`, `/markets/fundamentals`, `/markets/options`, `/markets/research`, `/markets/risk` |           0 | Live-only screens; Replay shows no values                     |

Total 375 (601 after slice 2, 680 at the U2 baseline), 363 of them on protected Forge routes and 6
in the sealed panel on `/dynamics`. Not visited: `/reality/$artifactId`, `/bench/$benchmarkId`,
`/runs/$runId`.

- `/factors` overview (`20 audited definitions`, `64` channels, `55 current + 9 derived`, `4 / 64`
  retained views, `0` new runs): fixed counts in `FactorsWorkspace.tsx` that describe the audit and
  ledger artifacts. Those artifacts are not read on the default view (`verify-factors` requires
  their requests to stay deferred), so no checked origin can be named; the counts stay raw rather
  than claim a check that did not happen. The catalogue, retained diagnostics, output audit,
  ledger, lineage drawer and the Factor clock are provenanced. No `/factors` number is in a sealed
  component (`src/replay/FactorRegimeEvidence.tsx` is not used by this route).
- `/regimes` (enforced since slice 3): its one raw number was `D0.4.2` in the fixed prose of
  `src/dynamics/RegimeProduct.tsx`, now `copy`.

## Known gaps

- The Local Live Markets overview (`LiveOverviewScreen` in `src/markets/OverviewScreen.tsx`, fed by
  the sealed `src/markets/queries.ts`) is not converted; the checker runs Markets in Replay.
- The shell's Replay cutoff (sealed `ForgeShell.tsx`) carries no origin; it is listed as sealed
  chrome above.
- The terminal context bar shows Risk's clocks with a `replay` origin (tooltip only, outside the
  workspace popover); other workspaces' context-bar clocks remain raw and appear in their counts.
- Views the checker does not open are not converted: the Observatory's Feature flow scene (66 raw
  numbers in Replay) and Neural net scene (7), its hover tooltips and Method drawer; the Global
  Eye's selected-event views (focus card, propagation answer, reached securities and sites); the
  Regime lineage drawer; and the RegimeProduct dashboard once a product source is chosen.
- `/dynamics` stays report-only until the sealed `FactorRegimeEvidence.tsx` has a successor.
