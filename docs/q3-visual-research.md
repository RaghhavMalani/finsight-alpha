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
  manifest (and both manifests against `eval/factors/v0.1/phase5-freeze.json`), and writes `public/research/graph.<sha16>.json` plus `src/research/pin.generated.ts` (file name and
  SHA-256). Every number in the projection carries its source file and a JSON pointer into it. Both outputs are
  gitignored; nothing is copied into code by hand.
- **Loading.** The page checks the projection's length and SHA-256 against the compiled pin, then validates it.
  A tampered or missing file, missing Web Crypto or any error renders *unavailable* with the reason.
- **States.** No state is asserted by the UI. Trial states follow the preregistered rule (Holm p ≤ α and CI
  lower > 0; α read from the preregistration) and each panel shows the rule with its inputs; placebos read
  *held* when they do not pass Holm. Test suite, calibration (*not calibrated*), guard, repeat run, finding
  and the gate event are derived from their source fields.
- **Graph.** 109 real nodes: the preregistered hypothesis at the core; US and India trials, placebo ring,
  calibration, mutation tests, test suite, repeat run, the finding, and the v0.1.1 skeptic audit. In Bloom a
  trial's distance from the hypothesis is its t (estimate ÷ SE, derived from the sealed CI with the formula
  shown), with a no-effect ring and the one-sided critical-value ring. Cyan settled, amber state changes,
  magenta the skeptic, red failure only. A readout of the two primary trials sits under the title.
- **Replay.** A timeline scrubber replays the recorded events in order; scorecard values stay pending until
  the replay reaches the event that sealed them. This is the only motion on the page.
- **HUD.** Clicking or pressing Enter on a node opens a translucent overlay with evidence, cost, model and
  world; Esc closes it. At 390 px it is a bottom sheet. Every figure is a `<Num>`: click it for origin file,
  JSON pointer, SHA-256, run, preregistration hash and as-of. Fields the evidence does not record (model
  tokens, cost in dollars) say *unavailable*.
- **Composer.** One inert prompt line at the bottom edge in the command bar's style. It is disabled and
  says so: this build replays sealed evidence only, and `LIVE` is shown as unavailable.
- **Three looks**, switchable in the header or with `?look=`: `bloom` (radial neural bloom, the default because
  the hypothesis-to-finding axis reads fastest), `depth` (layered planes in perspective) and `constellation`
  (star-burst clusters).
- **Fallback.** Without WebGL, or after a lost context, the same nodes and edges are drawn on a 2D canvas.
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

- `verify-research.mjs` (independent of the page's contract): hashes sources itself against the manifests
  and freeze inventory, traces 995 numbers to sealed bytes, recomputes every trial state, t, wall time and
  the derived verdicts. In the browser:
  109 real nodes rendered, rendered values carry source and SHA-256, keyboard HUD works, tampered and missing
  projections render *unavailable* with the reason, all three looks render at 1440 and 390 px with no
  horizontal scroll, and the 2D fallback positions every node.
- `tsc`, lint (0 errors), production build, and the Observatory, neural, globe and shell verifiers pass after
  the extraction.
- Frame rate (`--perf` against a `VITE_PERF_PROBE=true` build; the sampler and the 200-node synthetic probe
  exist only in such builds): headless Chrome, D3D11 on an RTX 4060 laptop GPU, 1440x900, vsync-capped:
  real 109 nodes median 59.9 fps (p5 56.5); synthetic 200 nodes median 59.9 fps (p5 56.2).
- Screenshots: `docs/screenshots/q3-research-{bloom,depth,constellation}-{1440,390}.png` and
  `q3-research-hud-{1440,390}.png`.

## Knowingly left

- The shell still has ten workspaces and Research sits at F6. Consolidating to seven (F2 Research) with
  redirects is the next slice.
- F1 Command, the Global Eye propagation arcs, Forge trajectory replay and Bench, and the Dynamics scenes are
  not built. `<Num>` is used on Research only.
- The page does not consume `/live/stream` yet, so suggested questions from the Live Spine do not appear.
- Labels declutter by priority (lower-priority labels hide on collision) rather than using leader lines.
