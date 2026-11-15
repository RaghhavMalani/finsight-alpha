# Q3 — Visual system and the Research workspace (part 1)

The first slice of the interface milestone: a shared visual system extracted from the globe and the
Observatory, and `/research` as a living evidence graph backed only by sealed Research OS evidence.

## What exists

### Visual system — `frontend-v2/src/visual/`

| Piece | File |
|---|---|
| Colour, evidence-state, motion, type and bloom tokens | `tokens.ts`, `visual.css` |
| Additive glow curves, glow points, pulse shader, bloom pass, particle flow along a path | `gl/GlowCurves.tsx`, `gl/GlowPoints.tsx`, `gl/PulseMaterial.ts`, `gl/BloomLayer.tsx`, `gl/flow.ts`, `gl/bundles.ts` |
| 2D canvas equivalents for when WebGL is unavailable | `canvas2d.ts`, `webgl.ts` |
| Thin mono HUD label and kicker | `HudLabel.tsx` |
| Liveness dot: fresh, stale, dead | `LiveDot.tsx` |
| Provenance: `<Num>`, `<Hash>`, `<Stamp>`, `<Src>` and their provider | `Num.tsx`, `num-format.ts` |
| Reduced motion | `useReducedMotion.ts` |

The glow, pulse and bloom code was moved out of `components/observatory/`, and the Observatory and globe now
import it from here; their own verifiers still pass. Motion is tied to state: a node pulses while its event is
replaying and settles when it is sealed. With `prefers-reduced-motion` the graph is static glow with no flow.

### Research workspace — `/research`

- **Data.** `scripts/generate-research-graph.mjs` runs at `npm ci` / `npm run build`. It reads only the sealed
  files under `data/exports/research_os_v0_1` and `research_os_v0_1_1`, checks every byte against each export
  manifest, and writes `public/research/graph.<sha16>.json` plus `src/research/pin.generated.ts` (file name and
  SHA-256). Every number in the projection carries its source file and a JSON pointer into it. Both outputs are
  gitignored; nothing is copied into code by hand.
- **Loading.** The page fetches the projection, checks its SHA-256 against the compiled pin, then validates it.
  A tampered or missing file renders *unavailable* with the reason and draws no graph.
- **Graph.** 109 real nodes: the preregistered hypothesis at the core; US and India trials, placebo ring,
  calibration, mutation tests, test suite, repeat run, the finding, and the v0.1.1 skeptic audit. Verified nodes
  are cyan, failed calibration red, the skeptic challenge magenta, the frozen hypothesis white.
- **Replay.** A timeline scrubber replays the recorded events in order; scorecard values stay pending until
  the replay reaches the event that sealed them. This is the only motion on the page.
- **HUD.** Clicking or pressing Enter on a node opens a translucent overlay with evidence, cost, model and
  world; Esc closes it. At 390 px it is a bottom sheet. Every figure is a `<Num>`: click it for origin file,
  JSON pointer, SHA-256, run, preregistration hash and as-of. Fields the evidence does not record (model
  tokens, cost in dollars) say *unavailable*.
- **Composer.** Docked at the bottom edge (hypothesis, as-of, universe, budget, rigor). It is disabled and
  says so: this build replays sealed evidence only, and `LIVE` is shown as unavailable.
- **Three looks**, switchable in the header or with `?look=`: `bloom` (radial neural bloom, the default because
  the hypothesis-to-finding axis reads fastest), `depth` (layered planes in perspective) and `constellation`
  (star-burst clusters).
- **Fallback.** Without WebGL the same nodes and edges are drawn on a 2D canvas.
- **Loading cost.** three.js is not in the route's initial chunks; the scene is a lazy chunk.

## How to run

```bash
cd frontend-v2
npm ci && VITE_ENABLE_LOCAL_LIVE=true npm run build
node scripts/verify-research.mjs                                  # projection vs sealed bytes
PREVIEW_PORT=4178 node scripts/preview-built.mjs &
node scripts/verify-research.mjs --url http://127.0.0.1:4178      # browser checks
```

## Verified

- `verify-research.mjs`: 943 projection checks; 109 nodes; 873 numbers traced to sealed bytes. In the browser:
  109 real nodes rendered, rendered values carry source and SHA-256, keyboard HUD works, tampered and missing
  projections render *unavailable* with the reason, all three looks render at 1440 and 390 px with no
  horizontal scroll, and the 2D fallback positions every node.
- `tsc`, lint (0 errors), production build, and the Observatory, neural, globe and shell verifiers pass after
  the extraction.
- Frame rate, headed Chrome on an RTX 4060 laptop GPU at 1440x900: median 238 fps, 5th percentile 185 fps with
  the real 109 nodes; median 238 fps, 5th percentile 213 fps with the 200-node scale probe (verifier-only,
  never shown in the product). The automated verifier runs headless, which renders in software at about
  4 fps, so it records frame time but does not gate on it.
- Screenshots: `docs/screenshots/q3-research-{bloom,depth,constellation}-{1440,390}.png` and
  `q3-research-hud-{1440,390}.png`.

## Knowingly left

- The shell still has ten workspaces and Research sits at F6. Consolidating to seven (F2 Research) with
  redirects is the next slice.
- F1 Command, the Global Eye propagation arcs, Forge trajectory replay and Bench, and the Dynamics scenes are
  not built. `<Num>` is used on Research only.
- The page does not consume `/live/stream` yet, so suggested questions from the Live Spine do not appear.
- In the depth look some plane labels sit close to node labels.
