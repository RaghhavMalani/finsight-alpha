# U2 · Numbers carry provenance

Invariant: **the UI states only what the evidence states, and every displayed number carries its
provenance.** A number on an enforced route is rendered by `<Num>`, `<Hash>`, `<Stamp>` or `<Src>`
(`frontend-v2/src/visual/Num.tsx`), or sits inside a documented exemption. A missing value is shown
as `unavailable` / `n/a` (or the workspace's existing dash), never as `0`.

## Origin kinds

Every provenance element renders `data-num`, `data-origin-kind`, `data-src`, `data-ptr` and, only when
a real digest exists, `data-sha`. The popover (`[data-origin-popover]`) shows only what the kind can
truthfully say.

| Kind     | `src`                                                                          | SHA-256 shown                                                                                                                                    | Clocks shown                                                       | Used by                                 |
| -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------- |
| `sealed` | key into the sealed table passed to `ProvenanceProvider`                       | the sealed file's digest, and who sealed it                                                                                                      | run id, preregistration, study cutoff/freeze                       | `/research`                             |
| `replay` | URL of a checked Replay artifact                                               | the digest `/replay-manifest.json` names for that URL (verified on load); "unavailable" if none. Labelled "checked Replay artifact · not a seal" | artifact `as_of` when the manifest states it                       | `/markets`, `/markets/$ticker`, `/risk` |
| `live`   | the local API endpoint (`GET /live/recent · /live/stream`, `GET /live/health`) | never. "none · a live response is not hashed or sealed". Labelled "live API · not sealed"                                                        | record `seq`, `observed_at`, `available_at`; health snapshot `now` | `/` (F1 Command) in Local Live          |

Helpers in `frontend-v2/src/visual/origins.ts` build origins (`replayOrigin`, `liveOrigin`) and
values (`num`, `ref`); non-finite or absent values become `null` with a reason, never zero.
Values computed in the browser from a source (counts of records, issues or weeks) keep the source's
kind and name the rule in `formula` (for example `count of /payload/issues where partition = UNAVAILABLE`).
The Replay manifest itself (`/replay-manifest.json`) is the root of the Replay check and has no
digest of its own; values read from it say so.

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
  `src/risk-manager/read-plan.generated.ts`) with no SHA, or an artifact URL listed in one of those
  manifests with exactly that entry's `sha256`, as read by the checker itself.
- Further views of enforced routes: F1 Command in Local Live against a TEST-ONLY mocked spine
  (`/live/recent`, `/live/health`). The live close must be `live` with no SHA and a tooltip giving
  seq, observed_at, available_at, source and licence. The row link must keep its provenance title.
  A record without a close must show `unavailable`. The `#seq` origin button, reached by focus and
  Enter, must open a `LIVE` popover with Seq, Available and "none" for SHA. Also checked: the
  Markets popover, opened from the keyboard (its SHA equals the manifest's, and it does not cover
  its value), and Risk with an Issue selected, Sweep history, and Coverage.
- Sabotage: on `/markets` it injects a raw `Sharpe 1.37`, a lone `7`, an undocumented exemption, a
  live value claiming a SHA-256, a replay value with a swapped SHA-256 and a missing value shown
  as `0`, and requires all six to be flagged.
- Not scanned: `aria-label` and `title` text, closed `<details>`, tabs and panels the checker does
  not open, the Local Live Markets screens, and the routes that need an id.
- `--route /path` checks one route; `--verbose` prints every raw number.

## Enforced routes (zero raw numbers)

`/` (F1 Command, Replay and mocked Local Live), `/research`, `/markets`, `/markets/$ticker`, `/risk`
(feed, inspector, history, coverage).

## Report-only routes (raw numbers at the U2 baseline, Replay mode)

| Route                                                                                                  |                                   Raw numbers |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------: |
| `/runs`                                                                                                |                                           272 |
| `/dynamics`                                                                                            |                                           116 |
| `/observatory`                                                                                         |                                            59 |
| `/forge`                                                                                               |                                            57 |
| `/data`                                                                                                |                                            49 |
| `/factors`                                                                                             |                                            47 |
| `/globe`                                                                                               |                                            45 |
| `/worlds`                                                                                              |                                            19 |
| `/artifacts`                                                                                           |                                             8 |
| `/bench`                                                                                               |                                             7 |
| `/regimes`                                                                                             |                                             1 |
| `/execution`                                                                                           |                                             0 |
| `/markets/backtest`, `/markets/fundamentals`, `/markets/options`, `/markets/research`, `/markets/risk` | 0 (Live-only screens; Replay shows no values) |

Total 680 (higher than the first U2 count of 624 because lone numbers, such as single-digit counts, are now tokens). Not visited (need an id): `/bench/$benchmarkId`, `/reality/$artifactId`, `/runs/$runId`.

## Known gaps

- The Local Live Markets overview (`LiveOverviewScreen` in `src/markets/OverviewScreen.tsx`, fed by
  the sealed `src/markets/queries.ts`) is not converted; the checker runs Markets in Replay.
- The shell's Replay cutoff (sealed `ForgeShell.tsx`) carries no origin; it is listed as sealed
  chrome above.
- The terminal context bar shows Risk's clocks with a `replay` origin (tooltip only, outside the
  workspace popover); other workspaces' context-bar clocks remain raw and appear in their counts.
