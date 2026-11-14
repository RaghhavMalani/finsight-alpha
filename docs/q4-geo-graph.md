# Q4 — Global Eye knowledge graph (part 1)

Events reach securities only through cited edges. This part ships the model, a first sourced seed, the
propagation function, the API and the tests. The seed is deliberately small; widening it is listed below.

## What exists

- `src/geo/graph/model.py` — typed nodes (`facility`, `port`, `chokepoint`, `company`, `security`, `sector`) and
  edges (`operates`, `supplies`, `ships_through`, `listed_as`, `exposed_to`). Every node and edge carries a
  `Source`: https URL, title, the document's own date, `available_at`, and a supporting excerpt where the
  document states the fact in words. Each edge also has a confidence in (0, 1] and a one-line mechanism.
  Loading rejects an edge with no source, a non-https URL, an empty mechanism, an unknown type, endpoints of the
  wrong node type, or an `available_at` earlier than the source's own date.
- `src/geo/graph/seed/v1.json` — 37 nodes, 36 edges:
  - 18 TSMC fabs from TSMC's own fab list, with `operates` edges.
  - `supplies` edges quoted from filings: TSMC → NVIDIA and Samsung → NVIDIA (NVIDIA 10-K FY2026), TSMC → AMD and
    GlobalFoundries → AMD (AMD 10-K FY2025), TSMC → Analog Devices (ADI 10-K FY2025), TSMC → Apple (Apple
    Environmental Progress Report 2025 supplier list).
  - Listings and SIC sectors for TSM, NVDA, AMD, AAPL, GFS, ADI from SEC EDGAR filer profiles.
  - Four oil chokepoints (Hormuz, Bab el-Mandeb, Suez/SUMED, Malacca) with EIA 1H2025 flows. They have no
    `ships_through` edges yet, so propagation reports them as sites with no sourced operator.
- `src/geo/graph/graph.py` — `load_graph()` and `propagate(graph, event, as_of=...)`. An event (kind, lat, lon,
  time, magnitude) reaches located sites inside a declared radius (earthquake: 100 km at M6, doubling per
  magnitude, capped at 600 km), then the operator, its sourced customers one hop deep, their listings and
  sectors. Score = proximity × product of edge confidences. The result lists every hop with its source.
- `backend/routes/geo_graph.py` — `GET /geo/graph`, `POST /geo/graph/propagate`. Read-only, behind the normal
  session gate. A future `as_of` is refused.

## Point-in-time rule

`available_at` in the seed is when this project fetched and checked each source (14 Nov 2026), not when the
document was first public. Propagation uses only items available at or before both the event and `as_of`, so
replaying a 2024 event returns nothing rather than using relationships we learned later. That is conservative
on purpose. Backfilling earlier `available_at` values needs evidence of earlier publication (for filings, the
EDGAR `filed` date) and should be done edge by edge.

## How to run

```bash
pytest -q tests/test_geo_graph.py
python -c "from src.geo.graph import load_graph, propagate; print(propagate(load_graph(), {'kind':'earthquake','magnitude':6.8,'lat':23.9,'lon':121.6,'time':'2026-11-14T12:00:00Z'}, as_of='2026-11-14T12:30:00Z')['securities'])"
```

## Verified

- 16 tests: every seed item is sourced; seven malformed-edge cases are rejected; a quake near Taichung reaches
  TSM, NVDA and AMD through cited hops; a distant quake reaches nothing; `as_of` before the event is
  UNAVAILABLE; the API works and the real app requires a session.
- Sabotage: with the `available_at` filter removed from `propagate`, the "edge learned after the event" test fails.

## Knowingly left

- Seed breadth: the brief asks for 50–80 companies, including ASML, Samsung fabs, Micron, Intel, shipping and
  energy names with `ships_through` edges, and Indian ports (JNPT, Mundra, Chennai, Visakhapatnam). Each needs
  its own cited source; none is added without one.
- Coordinates are approximate centroids from general geographic reference, labelled per node.
- Portfolio exposure (G3) and wiring live `geo.event` records into propagation are not built yet.
- Radii are declared, coarse and unfitted.
