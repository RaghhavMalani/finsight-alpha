# Third-party notices

FinSight's own license terms do not extend to the works below. Each keeps its own license.
Dependency licenses for npm and PyPI packages are recorded in their lockfiles and package
metadata; this file covers code that was ported into the repository and the data the God's Eye
globe reads.

## God's Eye View (ported code)

- Source: <https://github.com/bilawalsidhu/gods-eye-view> (commit `9542a5e`)
- Ported into `frontend-v2/src/components/globe/`:
  - `sensors.ts`: the FLIR, CRT and NVG post-process shaders from `src/styles/thermal.js`,
    `src/styles/retro.js` and `src/styles/surveillance.js`, run as three.js GLSL3 passes. The
    FLIR port omits the source's luminance-derived temperature digits and frame counter.
  - `geo-data.ts`: `normalizeEarthquakes` (from `src/layers/earthquakes/records.js`) and
    `parseTle` (from `src/sources/tle.js`).
- No God's Eye View data, imagery or 3D models are included. Its README and LICENSE note that
  several of its bundled datasets are non-commercial; none of them were copied.

```text
MIT License

Copyright (c) 2026 Bilawal Sidhu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Libraries added for the globe

| Package | License | Use |
| --- | --- | --- |
| `satellite.js` | MIT | SGP4 propagation of CelesTrak element sets |
| `topojson-client` | ISC | Decoding Natural Earth TopoJSON |
| `world-atlas` | ISC (data: Natural Earth, public domain) | 1:110m land and country outlines |

## Data read at runtime

| Source | Terms | Where |
| --- | --- | --- |
| USGS ComCat earthquake feeds and FDSN event service | U.S. public domain | Globe quakes; `scripts/fetch_usgs_catalog.py` |
| CelesTrak GP element sets | CelesTrak terms of use | Globe satellites (fetched in the viewer's browser, not stored) |
| Natural Earth | Public domain | Land dots, coastlines and borders |

`frontend-v2/scripts/fixtures/` holds small snapshots of a USGS weekly feed and of CelesTrak's
`stations` group, used only by the verification scripts.
