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
popover always shows the raw value), `inert` (a span instead of a button, for values inside a link;
the origin is in the tooltip) and `className="vx-inherit"` (keep the surrounding colour and font).

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
| `axis`      | chart axis tick labels: scale marks, not values                                                             |
| `input`     | a value the reader chose (watchlist size kept in this browser)                                              |

Two further, narrow allowances are coded in the checker:

- `[data-research-root] [data-copy]`: Research's pre-U2 convention for fixed prose, already
  enforced by `verify-research.mjs`; treated as `copy`.
- Sealed chrome: `.shell-cutoff` in `src/app/shell/ForgeShell.tsx` (the Replay manifest cutoff in
  the shell header). The file is sealed and cannot take an attribute, so the checker lists the
  selector explicitly and prints a `sealed chrome` count per route rather than dropping it silently.

## The checker

`frontend-v2/scripts/verify-num.mjs`, independent of the page code (it does not import `Num.tsx`).

- Static stage (always, CI `static` shard loop): self-test of the token rule. A numeric token is a
  currency amount, a percent, a decimal, or an integer of two or more digits. Single digits are not
  tokens.
- Browser stage (`--url`, CI `browser-command` shard): Playwright Chromium, Replay mode, 1440 × 1000,
  all requests off the preview host aborted. Every page route from `src/routes` is visited; each
  visible text node with a token outside `[data-num]` or an exemption is reported. It also fails any
  provenance element with an unknown origin kind, a live value that names a SHA-256, or a malformed
  digest. Further views of enforced routes: F1 Command in Local Live against a TEST-ONLY mocked spine
  (`/live/recent`, `/live/health`; the live close must be `data-origin-kind="live"` with no SHA),
  the Markets origin popover (its SHA must equal the manifest's digest for that file, read by the
  checker itself), and Risk with an Issue selected, Sweep history, and Coverage.
- Sabotage: on `/markets` it injects a raw `Sharpe 1.37`, an undocumented exemption and a live value
  claiming a SHA-256, and requires all three to be flagged.
- `--route /path` checks one route; `--verbose` prints every raw number.

## Enforced routes (zero raw numbers)

`/` (F1 Command, Replay and mocked Local Live), `/research`, `/markets`, `/markets/$ticker`, `/risk`
(feed, inspector, history, coverage).

## Report-only routes (raw numbers at the U2 baseline, Replay mode)

| Route                                                                                                  |                                   Raw numbers |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------: |
| `/runs`                                                                                                |                                           272 |
| `/dynamics`                                                                                            |                                           114 |
| `/forge`                                                                                               |                                            51 |
| `/observatory`                                                                                         |                                            46 |
| `/factors`                                                                                             |                                            45 |
| `/globe`                                                                                               |                                            39 |
| `/data`                                                                                                |                                            31 |
| `/worlds`                                                                                              |                                            13 |
| `/artifacts`                                                                                           |                                             6 |
| `/bench`                                                                                               |                                             6 |
| `/regimes`                                                                                             |                                             1 |
| `/execution`                                                                                           |                                             0 |
| `/markets/backtest`, `/markets/fundamentals`, `/markets/options`, `/markets/research`, `/markets/risk` | 0 (Live-only screens; Replay shows no values) |

Total 624. Not visited (need an id): `/bench/$benchmarkId`, `/reality/$artifactId`, `/runs/$runId`.

## Known gaps

- The Local Live Markets overview (`LiveOverviewScreen` in `src/markets/OverviewScreen.tsx`, fed by
  the sealed `src/markets/queries.ts`) is not converted; the checker runs Markets in Replay.
- The shell's Replay cutoff (sealed `ForgeShell.tsx`) carries no origin; it is listed as sealed
  chrome above.
- The terminal context bar shows Risk's clocks with a `replay` origin (tooltip only, outside the
  workspace popover); other workspaces' context-bar clocks remain raw and appear in their counts.
