# U1 — Seven workspaces and F1 Command

Branch `u1/shell-command`. Source of truth: `frontend-v2/src/app/workspaces.ts`.

## Layout

| key | workspace | routes (sub-navigation tabs) | mnemonics |
|---|---|---|---|
| F1 | Command | `/` (`/command` redirects with its query) | `CMD` |
| F2 | Research | `/research` | `RES` |
| F3 | Global Eye | `/globe` | `GE` |
| F4 | Forge | `/forge`, `/runs/*`, `/bench/*`, `/worlds`, `/reality/*`, `/artifacts` (Center · Runs · Bench · Worlds · Artifacts) | `AGENTS`, `FORGE` |
| Alt 5 | Dynamics | `/dynamics`, `/observatory` (Lab · Observatory) | `REG`, `OBS`, `DYNAMICS` |
| F6 | Markets | `/markets/*`, `/factors`, `/regimes`, `/execution` (Market · Factors · Regimes · Execution) | `DES`, `GP`, `OMON`, `FA`, `FACT`, `EXEC`, `MARKETS` |
| Alt 7 | Risk | `/risk`, `/data` (Risk · Data / feed health) | `RISK`, `DATA` |

- Every old URL still resolves to the same page; nothing was moved, so no query or investigation context is lost.
  Only `/` changed: the landing page is now F1 Command. `/regimes` is new: the market regime product
  (`RegimeProduct`) on its own under Markets; `/dynamics` keeps the full lab, including that product.
- **Sections vs workspaces.** The ten old ids (`market`, `world`, `risk`, `regimes`, `factors`, `research`,
  `execution`, `observatory`, `agents`, `data`) are now *sections*: the typed destinations used by commands,
  search, palette and investigation links. Their ids are part of the terminal context contract and did not change.
  Each section belongs to one of the seven workspaces (`SECTIONS[].workspace`).
- `data-workspace` on `.shell` is the workspace id (`command`, `research`, `world`, `agents`, `dynamics`,
  `market`, `risk`). The terminal shell also sets `data-section` (the typed section).
- `ForgeShell.tsx` is sealed (`phase5-freeze.json`), so it is unchanged. It reads `WORKSPACES`, `FUNCTION_KEYS`
  and `activeWorkspace` from `workspaces.ts`, which is how it shows the new nav. Section tabs for Forge-shell pages
  are rendered as the first child of the page (`WorkspaceSubnav inline`); the terminal shell draws them itself.

## Keys

- F1–F4 and F6 are captured (outside text fields). **F5 and F7 stay with the browser** (reload, caret
  browsing); those workspaces are labelled `Alt 5` / `Alt 7`.
- Alt+1…Alt+7 open every workspace (`WorkspaceHotkeys`, mounted in `__root.tsx`; matched by physical digit,
  so macOS Option characters do not matter). Text fields keep F-keys and Alt+digit.
- Decision logged in `docs/questions-for-raghhav.md` with how to undo it.

## F1 Command

`frontend-v2/src/command/`: `records.ts` (pure parsing and summaries), `live.ts` (spine client),
`CommandCenter.tsx`, `command.css`.

- The existing globe (`components/globe/GlobeScene`) is the full-bleed backdrop, with its public USGS and
  CelesTrak feeds (checked Replay artifacts in Replay). It is held still (`reduced`); `GlobeScene` gained an
  optional `markers` prop that draws located live records as static spikes.
- HUD panels: event stream, US / India market strip (each feed's delay label printed under it), current
  `risk.alert`s (latest per check, `CLEAR` hidden), research suggestions in flight (`research.progress`, with
  the exposure tickers), feed health as `LiveDot` fresh / stale / dead with lag (from `GET /live/health`,
  updated by `feed.health` records).
- Transport: `GET /live/health`, a `GET /live/recent?limit=200` backlog, then `GET /live/stream?since_seq=N`
  (SSE, `withCredentials`). If the stream closes, it polls `/live/recent?since=<seq>` every 15 s; a `gap` frame
  triggers a re-poll. Health refreshes every 30 s.
- **When the spine is contacted.** Only in Local Live. Replay never requests `/live/*` (verify-replay forbids
  any non-origin request in Replay). States, each named in plain words:
  - public host (Local Live not allowed): "Live data is local only…"
  - local build in Replay: "Replay mode · the live spine is read only in Local Live" + a switch button
  - no answer / `NOT_RUNNING` / 503: "Live spine not running — start with `python -m finsight live`."
  - 401: "Live spine needs a signed-in local session" + link to `/login`
  - streaming / polling
- **No fabricated numbers.** A record is shown only if every required field (`seq`, `id`, `type`, `source`,
  `source_id`, `revision`, `observed_at`, `available_at`, licence, provenance with a delay label, payload) is
  present; otherwise it is dropped, never repaired. Missing values print as "n/a". Every row's hover title carries
  type, seq, source, `observed_at`, `available_at`, delay, confidence and licence; the visible meta line shows
  source and `available_at`.
- **Clicks carry context.** geo → F3 `/globe`; tick → F6 `/markets?ticker=…`; risk alert → `/risk`;
  feed health → `/data?section=health`; macro → `/data?section=revisions`; research suggestion, headline and
  prediction → F2 `/research?q=<question>` (the Research page itself was not edited).
- Motion only on state change: a record that arrives after the reader does flashes once (none under reduced
  motion). Panels have fixed places; text ≥ 11 px on a near-opaque panel. At ≤ 820 px the globe sits on top and
  the panels stack below it.

## Context strip

The Forge shell's listing strip ("SPY UP · NYSE Arca") is hidden on Command, Research and Forge, where no ticker
applies (`shell.css`, keyed on `data-workspace`). Markets, Risk, Dynamics and Global Eye keep it.

## Verifiers

- New `scripts/verify-command.mjs`. Static: workspace order and key labels, captured keys, route ownership for
  every old URL, mnemonics, record parsing (incomplete records dropped), destinations, freshness. Browser
  (`--url`, Chromium): public host says "local only" and requests nothing from `/live`; local Replay requests
  nothing until Local Live; an absent spine is named, shows no records, no price-like numbers and no markers;
  a **test-only** mocked spine (Playwright route interception; fixtures labelled TEST) streams records that land
  in the stream, the market strip, risk, research and on the globe (`data-markers`), with a malformed record
  dropped, and every item links to its workspace; nav keys and Markets tabs. `--screenshots` writes
  `docs/screenshots/u1-*.png`. Wired into CI: static loop and a `browser-command` shard.
- `verify-shell.mjs`: seven workspaces; F1–F4/F6 captured; F5/F7 still native (unchanged assertion); Alt+5/Alt+7
  navigate; text fields keep F-keys and Alt+digit; FACT/EXEC land in Markets; palette lists them under F6;
  nav key labels. One retry of a goto aborted by a browser-owned F5 reload (Firefox).
- `verify-data.mjs`: F10 no longer exists; it reaches Risk with Alt 7 instead.
- `verify-terminal-browser.mjs`: the terminal-shell layout check reads `data-section` (was `data-workspace`).
- `verify-risk-browser.mjs`: pressed F3 (the old Risk key) and expected to stay on `/risk`; it now presses
  Alt+7. Alt+digit on a workspace's own page keeps its context (no re-navigation, no re-validation).
- No integrity or negative assertion was removed.
