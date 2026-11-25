# Q4 — Global Eye knowledge graph (part 1)

Events reach securities only through cited edges. This part ships the model, a first sourced seed, the
propagation function, the API and the tests. The seed is deliberately small; widening it is listed below.

## What exists

- `src/geo/graph/model.py` — typed nodes (`facility`, `port`, `chokepoint`, `company`, `security`, `sector`) and
  edges (`operates`, `supplies`, `ships_through`, `listed_as`, `exposed_to`). Every node and edge carries a
  `Source`: https URL, title, a real `YYYY-MM-DD` date, what that date means (`filed`, `published`, `created`,
  `updated` or `retrieved`), `available_at`, and where the document states the fact in words, the sentence and
  its page. Each edge also has a confidence in (0, 1] and a one-line mechanism. A `supplies` edge must quote a
  sentence, not just a company name. Loading rejects anything unsourced or malformed.
- `src/geo/graph/seed/v1.json` — 44 nodes, 46 edges:
  - 25 TSMC manufacturing fabs from TSMC's own fab list, with `operates` edges.
  - `supplies` edges quoted from the documents: TSMC → NVIDIA and Samsung → NVIDIA (NVIDIA 10-K, filed
    2026-02-25; same sentence, same confidence), TSMC → AMD and GlobalFoundries → AMD (AMD 10-K, filed 2026-02-04),
    TSMC → Analog Devices (ADI 10-K, filed 2025-11-25), and TSMC, Samsung, GlobalFoundries and Analog Devices →
    Apple (Apple 2025 Environmental Progress Report, p. 32: manufacturers with Apple-related production).
  - Listings and SIC sectors for TSM, NVDA, AMD, AAPL, GFS and ADI from SEC EDGAR filer profiles.
  - Four oil chokepoints (Hormuz, Bab el-Mandeb, Suez/SUMED, Malacca) with EIA 1H2025 flows. They have no
    `ships_through` edges yet.
- `src/geo/graph/graph.py` — `load_graph()` and `propagate(graph, event, as_of=...)`. An event reaches located
  sites inside a declared radius, then the companies linked to each site (`operates`, `ships_through`), their
  sourced customers one supply hop on, their listings and sectors. Score = proximity × the product of edge
  confidences; a security's score is its best single chain. Every hop is returned with its source.
- `backend/routes/geo_graph.py` — `GET /geo/graph?as_of=` and `POST /geo/graph/propagate`. Read-only, behind the
  normal session gate. A future or naive `as_of` is 422; an unknown version is 404.

## Live link

`src/live/exposure.py` runs every stored earthquake through `propagate` as of the moment it was stored. When
sourced links reach a security, the live store gets a `research.progress` record with `status: SUGGESTED`: a
question naming the tickers, plus the best cited chain for each (edge, mechanism, source URL and date). Nothing
runs a model. A quake that predates the graph, is under M5, or reaches no sourced link gets no suggestion.

## What the status means

| Status | Meaning |
|---|---|
| `AVAILABLE` | at least one security is reached through sourced edges |
| `PARTIAL` | sites lie in the radius but the graph has no sourced link from them to a security (`unlinked_sites`) |
| `NO_COVERAGE` | no sourced site lies in the radius; this says nothing about real exposure (`nearest_site_km`) |
| `BELOW_THRESHOLD` | an earthquake under M5.0, below the declared disruption threshold |
| `UNAVAILABLE` | `as_of` precedes the event, or the graph had no sourced sites at the event time |

An empty list is never returned as `AVAILABLE`.

## Point-in-time rule

`available_at` is when this project fetched and checked each source (14–15 Nov 2026), not when the document was
first public. Propagation uses only nodes and edges available at or before both the event and `as_of`, and an
edge needs both endpoints known. Replaying a 2024 event therefore returns `UNAVAILABLE` rather than using
relationships learned later. Backfilling earlier dates needs evidence edge by edge; for a filing that is its
EDGAR filing date, which is why filings are dated `filed` and never by fiscal period end.

## Declared, unfitted choices

- Radius: earthquake 50 km at M5, doubling per magnitude, capped at 600 km; cyclone 300 km; conflict 200 km;
  other disruption 150 km.
- Coordinates are city or passage centroids from general geographic reference, not from the cited documents.
  A fab can be tens of km from its city centroid, so distances are whole km and carry the precision label.

## How to run

```bash
pytest -q tests/test_geo_graph.py
```

## Verified

- 45 tests. A magnitude 6.8 quake near Taichung reaches TSM, AMD, NVDA, ADI and AAPL through cited hops.
- Sabotage sweep: 45 guards removed one at a time (source URL, title, date, date basis, sentence excerpt, ids,
  types, coordinates, confidence, mechanism, duplicates, schema, version, both availability filters, the cutoff,
  every status, the radius threshold and cap, confidence weighting, `ships_through` traversal, the route's
  future-`as_of`, version and NaN handling). Each removal fails at least one test.
- An independent adversarial review found one blocker (empty results reported as `AVAILABLE`) and eleven
  should-fix items; all are fixed here.

## Seed v2 (U3 part 2)

v1 is frozen. `seed/v2.json` carries every v1 item unchanged plus 81 nodes and 69 edges, and
`LATEST` is now `v2`. The additions are dated by evidence of earlier availability, an Internet
Archive snapshot or the document's printed date, rather than by when this project fetched them.
As a result, five recorded Replay quakes reach securities at their own time. See
[u3b-graph-growth.md](u3b-graph-growth.md).

## Knowingly left

- Seed breadth: the brief asks for 50–80 companies, including ASML, Samsung fabs, Micron, Intel, shipping and
  energy names with `ships_through` edges, and Indian ports. Each needs its own cited source.
- Portfolio exposure (G3).
- EDGAR filer-profile pages answer 403 to clients without a declared contact, so a reader may need a browser
  to open those citations.
