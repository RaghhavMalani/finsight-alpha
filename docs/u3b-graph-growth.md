# U3 part 2: growing the cited graph (seed v2)

Seed v1 is frozen. `src/geo/graph/seed/v2.json` holds every v1 node and edge unchanged, followed by
the additions, and `LATEST` is now `v2`. The API's default version follows `LATEST`, and `?version=v1`
still serves the frozen seed. The schema (`geo-graph-seed/2`) and the loader are unchanged.

## Counts

| | v1 | v2 |
|---|---|---|
| Nodes | 44 | 125 |
| Edges | 46 | 115 |
| Companies | 7 | 22 (17 with a sourced listing) |
| Securities | 6 | 20 |
| Facilities and ports | 25 + 0 | 62 + 15 |
| `operates` / `listed_as` / `ships_through` | 25 / 6 / 0 | 77 / 20 / 3 |

The added located sites, by country: India 14 (10 Adani ports and 4 Reliance manufacturing
divisions), Taiwan 10 (UMC and Micron), Japan 5, China 5, South Korea 5 (Samsung foundry and
SK hynix), Saudi Arabia 4 (Aramco terminals on the Gulf and the Red Sea), Indonesia 3, Singapore 2,
United States 2, New Zealand 1 and Egypt 1.

The added companies are Toyota, Nippon Steel, CATL, Methanex, UMC, Micron, SK hynix, Adani Ports,
Saudi Aramco and Reliance, which are all listed. Hutchison Ports, KIOXIA, NORDEN, Hapag-Lloyd and
Maersk are added without a listing. v1's Samsung Electronics gains its KRX listing and its foundry
sites.

The `ships_through` edges are NORDEN to Hormuz, from its Q1 2026 report, which says the closure of
the strait directly hit its dry cargo earnings. Hapag-Lloyd and Maersk go to Suez, from their
3 Feb 2026 release that routes the Gemini IMX service through the Red Sea and the Suez Canal.

## Dating rule, by source class

`available_at` is the earliest instant this project may rely on a source. It is never earlier than
the evidence supports.

| Source class | date / date_basis | available_at | Used for |
|---|---|---|---|
| Internet Archive snapshot that contains the quoted text (URL `https://web.archive.org/web/<timestamp>/<url>`) | snapshot day / `retrieved` | the snapshot timestamp (UTC) | 132 items |
| Document that prints its own date (press release, interim report) | printed date / `published` | noon UTC the day after the printed date, after that date has ended in every time zone | 18 items (8 of them read through a snapshot because the live page refuses automated clients) |

Where a quote spans table cells or separate page elements, its locator says "joined table cells" or "joined elements". An Aramco port appears only as a section of the download list on the guidebook page, so its quote is the page's sentence about "all Aramco terminals in Saudi Arabia", and its locator names the section.
| Page read live, no earlier evidence | fetch day / `retrieved` | the fetch instant | none needed in this batch |

`tests/test_geo_graph.py` enforces all three rules on every added item. No sec.gov page was used,
because it refuses clients without a declared contact.

Coordinates are city, district or port centroids taken from general geographic reference. Each one
carries its precision label, for example "city centroid (Yibin); the plant may be tens of km away".

Confidence conventions:
- `operates`: 1.0 when the company lists the site as its own, 0.9 when the same source says a
  majority-owned subsidiary runs it (Toyota's TMMIN, 95%), and 0.5 for a joint venture (JICT,
  Methanex Egypt).
- `ships_through`: 0.8 when the company says its own service or earnings were directly affected by
  the passage.

## Recorded quakes that now reach the graph at their own time

The Replay snapshot (`world:quakes`, as of 2026-10-07) has 523 quakes, 146 of them M5+. Statuses at
each quake's own time:

| | v1 | v2 |
|---|---|---|
| AVAILABLE | 0 | 5 |
| PARTIAL | 0 | 0 |
| NO_COVERAGE | 0 | 141 |
| UNAVAILABLE (M5+) | 146 | 0 |

Under v1 every recorded M5+ quake was UNAVAILABLE, because no source predated it. Under v2 the
earliest source is from 2016, so every M5+ quake is evaluated: it is either AVAILABLE or NO_COVERAGE
with the distance to the nearest site.

| Quake (UTC) | Radius | Site reached | Securities | Source available |
|---|---|---|---|---|
| 2026-09-11 21:23, M6.5 Java Sea, 121 km NNE of Teluknaga | 141 km | TMMIN Sunter plants, North Jakarta, about 122 km; JICT, Tanjung Priok, about 119 km, in radius but unlinked | 7203 (Toyota) | Toyota release of 2016-03-07; Toyota IR snapshot of 2026-06-10 |
| 2026-09-25 21:01 and 23:57, M5.0 Xunchang, Sichuan | 50 km | CATL Yibin Plant, about 21–23 km | 300750 SZ, 3750 HK | CATL profile snapshot of 2026-09-09 |
| 2026-10-01 12:27, M5.3 Yōkaichiba, Chiba | 62 km | Nippon Steel Kashima Area, about 31 km | 5401 (Nippon Steel) | snapshots of 2026-06-10 and 2026-07-12 |
| 2026-10-02 13:57, M5.0 Inglewood, NZ | 50 km | Methanex Motunui (Waitara centroid), about 18 km | MEOH, MX | Methanex NZ page snapshot of 2026-07-15 |

`tests/test_geo_projection.py` asserts these five answers. It also asserts that no point-in-time
answer uses a node or edge whose source became available after the quake.

The Globe verifier now selects the M6.5 Java Sea quake at event time. It checks that the quake
draws arcs, is not labelled hypothetical and lists exactly the projection's securities.

No recorded quake becomes PARTIAL. JICT is the only unlinked site inside a radius, and it shares that
quake with Toyota's linked Sunter plant.

## Other behaviour that changed, and the tests updated for it

- **Taiwan M6.8 scenario.** It still reaches v1's TSM, AMD, NVDA, ADI and AAPL, and now also UMC,
  2303 TW and MU, whose fabs sit at the same city centroids.
- **Hormuz conflict scenario.** It stays PARTIAL, because NORDEN has no sourced listing in the graph.
- **Live exposure.** A synthetic Taiwan quake on 13 Nov 2026 now gets a suggestion naming UMC and
  MU, but never TSM, whose fab list was checked on 14 Nov. Tests that assumed the fixture quake
  "predates the graph" now expect the hub trigger and one exposure suggestion, each stored once.
- **Static Globe check.** UNAVAILABLE no longer occurs among recorded answers. The check now
  requires the four evaluated statuses and asserts why UNAVAILABLE is absent: every recorded quake
  follows the earliest source. Tampered projections and refused Live answers still render
  UNAVAILABLE.

## Left out, and why

- **Ownership links to listed parents.** The schema has no `subsidiary_of` edge, so these stay
  unlisted: Hutchison Ports (80% CK Hutchison, per CK Hutchison's 2025 annual report), KIOXIA
  Corporation (KIOXIA Holdings), JFE Steel (JFE Holdings) and POSCO (POSCO Holdings). JFE's Chiba
  works and POSCO's steelworks were read but not added, because without a listing they add no
  reach. Adding the edge needs a new schema version.
- **Listings that could not be sourced to a page this project could open.** NORDEN (Nasdaq
  Copenhagen), Hapag-Lloyd, Maersk, Westports (Port Klang), Shin-Etsu (whose Kashima plant is inside
  the Chiba radius, but no opened page gives its securities code) and Micron's Gujarat plant (the
  source names only the state).
- **Bab el-Mandeb.** The Hapag-Lloyd release names the Red Sea and the Suez Canal, not Bab
  el-Mandeb, so no edge was drawn to that chokepoint. Malacca also has no `ships_through` edge.
- **Aramco's crude through Hormuz** is not stated on the pages read, so there is no edge.
- **Methanex Motunui stays in the graph.** 1News reported on 2 Sep 2026 ("Methanex to close
  Taranaki plant, citing 'decline' in gas supply",
  https://www.1news.co.nz/2026/09/02/methanex-to-close-taranaki-plant-cites-declining-gas-supply/,
  opened 2026-11-24). Methanex expects to "indefinitely idle" Motunui, with methanol manufacturing
  ending at the end of February 2027. The plant was therefore still producing at the Inglewood quake
  on 2026-10-02, and that reach stands. Once the seed can say when an `operates` edge ends, the
  idling should be recorded.
- **MCC Ramu NiCo (PNG, inside the M6.4 Kainantu radius).** Only secondary sources were found.
- **Large annual-report PDFs** (CK Hutchison, Maersk) exceed the fetch limit and were not used.
- **Seed breadth.** v2 has 22 companies, short of the ~100 aimed for. Breadth was traded for one
  opened, dated source per fact.

## How to regenerate

```bash
python scripts/export_geo_projection.py
python scripts/export_geo_projection.py --check
pytest -q tests/test_geo_graph.py tests/test_geo_projection.py tests/live
```
