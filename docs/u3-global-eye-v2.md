# U3 — Global Eye v2 (part 1): propagation on the globe

F3 Global Eye now shows how an event travels through the cited knowledge graph of
[Q4](q4-geo-graph.md): event → sourced site in the declared radius → the company that operates it →
its sourced customers → their listed securities. Nothing on the page adds a relationship, a number
or a source; every hop is an edge of `src/geo/graph/seed/v1.json` and every answer is
`propagate()`'s.

## What the page does

- **Layers.** Beside Quakes, Satellites and Hubs, a *Graph layers* group toggles **Sites** (the 29
  located nodes: TSMC fabs and the four oil chokepoints, drawn once per coordinate, coloured by type)
  and **Companies**. All are buttons with `aria-pressed`, reachable by Tab and Enter.
- **Companies have no coordinates in the graph.** They are drawn on tiers above the globe, never at
  a place: the operator above its largest site cluster, tethered to each site it operates; the
  other companies ring it, joined only by cited `supplies` edges. On the globe only tickers are
  labelled; company names are in the panel. While a selected event's chain is drawn, the
  Companies button is disabled and its title says why (the chain is drawn in its place).
- **Propagation.** Select an earthquake (on the globe, in Latest events, or in the *Earthquakes M5+*
  picker) or a scenario. The panel states the status in words, the declared radius, the nearest
  sourced site, the sites in the radius and how many cited chains exist. Each reached security is
  listed with its best chain: every hop's mechanism, confidence, source title and URL, source date
  with its basis (`filed`, `retrieved`, …), page or section, and the quoted sentence.
- **Arcs.** Event → each site in the radius, then site → operator → customer → security for the best
  chain of every reached security. **Brightness encodes one named value per arc**: hop confidence
  for a cited edge, proximity `1 − distance / radius` for event → site. One function, `arcRgb()`,
  maps (edge type, value) to an sRGB colour: the hue's linear light × (0.12 + 0.88 × value). The
  scene sets exactly that colour and the legend paints exactly that colour; the verifier checks
  both against its own copy of the rule. Hue names the edge type; line width is constant. Arcs are
  drawn with additive blending, so where two arcs overlap the crossing looks brighter than either
  value, and the scene's tone mapping and bloom shift perceived brightness slightly. The ring is the
  declared radius.
- **Scenarios look different.** A scenario's arcs use an amber family of hues, a solid amber
  *Scenario · hypothetical — not a recorded event* chip sits on the globe and the same tag heads
  the panel; satellite orbits dim and the hero copy fades while it is drawn.
- **Statuses** are always words, never an empty `AVAILABLE`: AVAILABLE, PARTIAL, NO_COVERAGE,
  BELOW_THRESHOLD, UNAVAILABLE, each with `propagate()`'s reason.
- **Missing is not zero.** For UNAVAILABLE and BELOW_THRESHOLD `propagate()` never looks at sites
  or chains, so the projection writes no count and the panel says *not evaluated* for sites in
  radius, cited chains and arcs drawn.
- **Small screens.** At 768 px and below the status and reached securities come first, above a
  globe capped at 44svh, with 16 px gutters; labels that would be cut at the stage edge are left
  out.
- **Precision.** Coordinates are city or passage centroids; distances are whole km and approximate.

> **Seed v2 (U3 part 2):** the paragraph below describes seed v1. With v2, every recorded M5+ quake
> is evaluated at its own time: five are AVAILABLE (Java Sea M6.5 to Toyota, Xunchang to CATL,
> Chiba to Nippon Steel, Inglewood to Methanex) and the rest are NO_COVERAGE. See
> [u3b-graph-growth.md](u3b-graph-growth.md).

## Point in time, retrospective and scenarios

The graph's sources were checked on 14–15 Nov 2026. Every quake in the checked Replay snapshot
(`world:quakes`, as of 2026-10-07) predates that, so **at its own time** each is UNAVAILABLE (M5+:
the graph had no sourced sites yet) or BELOW_THRESHOLD (under M5). The panel shows that answer
first. A second radio, *Graph as checked 2026-11-15*, shows a labelled **retrospective** answer: the
same place and magnitude against the relationships known now. For every recorded M5+ quake that is
NO_COVERAGE with the nearest site's distance — the seed has no site near any of them.

To show a chain that reaches securities, the projection includes three declared **scenarios**,
labelled *hypothetical, not a recorded event* and dated at the graph's knowledge cutoff. Their
coordinates and magnitudes are the fixtures of `tests/test_geo_graph.py`:

| Scenario | Status |
|---|---|
| M6.8 earthquake, eastern Taiwan (23.9, 121.6) | AVAILABLE — TSM, AMD, NVDA, ADI, AAPL |
| Conflict at the Strait of Hormuz (26.57, 56.25) | PARTIAL — the chokepoint has no `ships_through` edge |
| M4.8 earthquake at Hsinchu | BELOW_THRESHOLD |

## Data path

- **Replay makes no API or third-party request.** `scripts/export_geo_projection.py` loads the seed,
  verifies the Replay quakes against their manifest pin, runs `propagate()` for every recorded quake
  (at its time and retrospectively) and every scenario, and writes
  `frontend-v2/src/components/globe/data/projection.<sha16>.json` (imported with `?url`, so Vite emits it as a same-origin hashed asset; `public/` holds only reviewed publications, which the archive guards enforce) plus
  `frontend-v2/src/components/globe/geo-pin.generated.ts` (file name, SHA-256, bytes, size limit).
  Both are committed. The page fetches the same-origin file and refuses it before parsing unless its
  length and SHA-256 match the compiled pin; a tampered, missing or oversized file renders
  `UNAVAILABLE` with the reason, and no sites, companies or arcs are drawn.
- The projection records the seed's SHA-256 over its LF bytes (the Git blob form, so Windows
  checkouts with CRLF agree with CI) and the Replay input's URL, SHA-256 and cutoff.
- **Local Live**: selecting a live quake calls `POST /geo/graph/propagate` through the normal `api()`
  client, behind the session gate. The request carries no `as_of`; `propagate()` cuts at the
  earlier of the quake's time and `as_of`, so the answer is the point-in-time one: only
  relationships sourced by the quake's time. A refusal (e.g. 401) or a malformed answer is shown as
  UNAVAILABLE with the reason. The request is keyed on the quake's id and values, so a feed refresh
  does not resend it. Layers and scenarios still come from the pinned projection.
- `.gitattributes` marks `frontend-v2/src/components/globe/data/projection.*.json` as `-text`. Today's compact JSON
  has no newline bytes, so this only guards a future pretty-printed export against CRLF
  conversion changing the pinned bytes on Windows checkouts.

## Regenerating

```bash
python scripts/export_geo_projection.py          # after a seed, propagate() or Replay change
python scripts/export_geo_projection.py --check  # drift guard: exit 1 if committed bytes differ
```

## Checks

- `tests/test_geo_projection.py`: the committed projection and pin equal a fresh export (drift
  guard, runs in the backend `general` shard); recorded answers never use later relationships;
  scenarios are labelled and reach securities only through cited edges.
- `frontend-v2/scripts/verify-globe-graph.mjs`, independent of the page code:
  - static: pin, content-addressed name and bytes; seed hash; every node and edge equal to the
    seed's; the Replay input equal to its manifest entry and every recorded event equal to the
    snapshot; every one of the 526 answers recomputed in JavaScript from the seed (radius,
    sites and distances, nearest site, status, securities, best-chain connectivity and score); four
    sabotaged answers must be caught; then the Python exporter in `--check` mode.
  - browser (`--url`, Chromium, 1440 and 390): Sites and Companies toggle by keyboard and the drawn
    counts follow; the Taiwan scenario draws arcs and lists every security with each hop's
    mechanism, confidence, URL, date and basis, quote and page; PARTIAL, BELOW_THRESHOLD,
    UNAVAILABLE and NO_COVERAGE render in words, with *not evaluated* counts where nothing was
    evaluated; the scenario tag, globe chip and retrospective labels render; arc and legend colours
    match the mapping (a changed mapping fails); status and securities are above the fold at 390;
    tampered, missing and oversized projections render UNAVAILABLE with the reason; Replay makes no
    non-origin or API request; no horizontal scroll.
  - mocked Local Live (route interception of `POST /geo/graph/propagate`): a 401 and a malformed
    answer each read UNAVAILABLE in words, switching quakes shows each quake's own answer, and one
    request is sent per selection.
  - Wired into CI: the static loop and the `browser-agents-shell-plugins-data-research` shard.
- Screenshots: `docs/screenshots/u3-globe-{layers,propagation,unavailable}-{1440,390}.png`.

## Knowingly left (part 2 and later)

- Seed breadth (more companies, `ships_through` edges, ports): no recorded Replay quake reaches a
  sourced site, so recorded quakes draw only their radius until the seed grows.
- Tier placement of companies and securities is schematic.
- Live mode reuses the projection's node names; a node only the live backend knows is shown by its
  id with type `unknown`.
