# God's Eye integration

[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) is an open-source browser globe
of live public signals (aircraft, ships, satellites, earthquakes, cameras) built on Cesium. FinSight
does not vendor it. It ports the pieces that fit a point-in-time research environment and connects
them to the neural network through one input family, **Geo events**. This page explains how the
pieces fit and how to extend them.

## What came over, and what did not

| From God's Eye View | In FinSight | Change |
| --- | --- | --- |
| `src/styles/thermal.js`, `retro.js`, `surveillance.js` | `frontend-v2/src/components/globe/sensors.ts` | Cesium post-process GLSL run as three.js GLSL3 passes. The FLIR port drops the temperature digits and frame counter the source derives from screen brightness, because a globe has no temperature to read. |
| `src/layers/earthquakes/records.js` | `geo-data.ts` `normalizeEarthquakes` | A malformed feed is rejected whole, so a partial snapshot never replaces a good one. Threshold is the feed's M4.5. |
| `src/sources/tle.js` | `geo-data.ts` `parseTle` | Unchanged. |
| SGP4 via `satellite.js` | `GlobeScene.tsx` `Satellites` | Same library (v6, as upstream), three.js instead of Cesium. |

Not copied: Cesium, the server-side proxies, voice control, cameras, flights and ships (they need
keys or proxies), and every bundled dataset. Upstream's own LICENSE marks several of its datasets as
non-commercial. The MIT notice for the ported code is in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

FinSight's globe is three.js and React Three Fiber, like the Observatory, so the two share the
label layer, pointer picking and bloom setup. Land is Natural Earth 1:110m (public domain, via
`world-atlas`) drawn as a dot matrix lit by the real subsolar point.

## The connection: Geo events

```text
USGS ComCat ──► scripts/fetch_usgs_catalog.py ──► $FINSIGHT_DATA_DIR/geo/usgs_catalog.json
                                                        │
                                       src/geo/usgs.py geo_features (one row per trading day)
                                                        │
                       src/observatory/neural.py ──► network inputs, family "Geo events"
                                                        │
USGS live feed ──► globe geo-data.ts geoInputs ──► neural link panel (same four values, live)
```

Four daily features, defined once in `src/geo/usgs.py`:

| Feature | Definition |
| --- | --- |
| `geo_quake_count_m5_7d` | Events of magnitude ≥ 5 in the last 7 days |
| `geo_quake_max_mag_7d` | Largest magnitude in the last 7 days (the catalog threshold when none) |
| `geo_quake_energy_log_30d` | log₁₀ of summed Gutenberg–Richter energy, 10^(1.5M+4.8) J, over 30 days |
| `geo_quake_near_hub_30d` | Events within 1,000 km of a market hub in the last 30 days |

Hubs are New York, San Francisco Bay, Los Angeles, Tokyo, Hsinchu, Seoul, Shenzhen and Mexico
City: exchange and semiconductor-supply locations whose disruption reaches US large-cap earnings.
The globe draws each hub's 1,000 km circle so the near-hub input is visible.

### Timing rule

An event enters a row only when `event time + 1 day <= row available_at`. USGS posts M5+ events
within minutes, so a day errs late. Rows whose 30-day window starts before the catalog's first
admitted event are left missing, never zero, so a short catalog cannot read as a quiet planet.

### Disclosed limitation

The catalog is retrospective. USGS revises magnitudes and locations after publication, and a
catalog downloaded today carries today's values. Every trace that uses Geo events sets
`geo_provenance.quality = RETROSPECTIVE_CATALOG` with that disclosure; the frontend validator
rejects a trace that claims Geo events without it. These are not publication-time evidence.

### Parity between browser and backend

`frontend-v2/scripts/fixtures/usgs-4.5-week.sample.geojson` is a captured USGS weekly feed.
`tests/test_neural.py::test_globe_and_backend_agree_on_geo_inputs` computes the four values with
`usgs.inputs_at`, and `scripts/verify-globe.mjs` computes them with `geoInputs`. Both must equal
`geo-inputs.expected.json`. Change one formula and CI fails until the other matches.

## Using it

```powershell
$env:PYTHONPATH='.'
python scripts/fetch_usgs_catalog.py --start 2018-01-01          # install the catalog
python scripts/export_observatory.py --as-of 2026-10-03T04:15:00Z --neural-geo
```

The export trains the preregistered network with all six input families, evaluates its holdout
once, and writes `*-neural.json` replays that the manifest declares. In the Observatory, choose
the Neural net scene, tick **Geo events** in the editor and train: in the lab on synthetic worlds
(the *Geo shock* world plants a rule on its geo channel), or live on installed evidence.

The readout's attribution bar for Geo events is the honest answer to "does the network use it".
In the lab's geo-shock world it should lead; on real evidence, expect it near the others and a
validation interval that spans chance. Either way the verdict comes from the holdout rule, not
from the attribution.

## Extending

**A new globe layer.** Add a feed loader to `components/globe/feeds.ts` (validate the whole
snapshot, keep the last good one on failure), a component in `GlobeScene.tsx` that builds its
geometry in a `useMemo` and disposes it in an effect, and a toggle in `GlobePage.tsx`. Prefer
keyless sources that send CORS headers; anything that needs a key belongs behind the backend.

**A new network input.** Define the feature once in Python with an explicit availability rule,
add it to `NEURAL_FAMILIES` in `src/observatory/neural.py` and `types.ts`, give the family a colour
in `neural-model.ts`, add a fixture parity test if the browser shows it too, and extend
`verify-neural.mjs` so the validator rejects a trace that uses the input without its provenance.

**A new sensor look.** Port the fragment shader into `SENSORS` keeping the `colorTexture`,
`colorTextureDimensions`, `intensity`, `time` and `v_textureCoordinates` names, and make sure it
draws no number it did not compute from data. `verify-globe.mjs` checks the ported looks for
invented readouts.
