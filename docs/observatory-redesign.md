# Observatory redesign: match the reference (task for Codex)

Branch: `codex/model-observatory`. Before starting, commit the attached `observatory-reference.html` to `docs/observatory-reference.html`. It is a single-file three.js page built from `frontend-v2/public/artifacts/observatory/spy-*.json`. **Treat it as the visual spec.** Open it next to the app and match layout, framing, colour, typography and behaviour. Port its logic into the existing React/R3F components; don't paste it in as an iframe.

Keep everything that is already good: the replay/PIT backend, the trace schemas, the SHA provenance, the tests, `useTrainingStream`, the reduced-motion handling, and the "never show undeclared data" rule.

## 1. Page layout (`ObservatoryPage.tsx`, `SceneFrame.tsx`, `observatory.css`)
- Remove the page heading block ("Research instrument / 007", "Model Observatory.", "Watch the fit…") and the boxed toolbar. Put the scene tabs, the ticker select and the source chip in **one 52px bar** under the Forge nav.
- The canvas fills the whole remaining viewport (`height: calc(100dvh - nav - bar - timeline)`), with **no border, no panel frame and no nested boxes**. Delete `.obs-model-grid`, the 285px aside column and the `clamp(500px, 50vw, 800px)` height.
- The readout becomes **one translucent card docked right** (`width 320px; margin 16px; background rgba(8,10,12,.8); backdrop-filter: blur(12px)`) laid over the canvas through CSS grid (same grid cell, `justify-self: end`). Below 900px it moves under the timeline and the page scrolls.
- The timeline becomes **one bar at the bottom**: play button, then a 20px ribbon (HMM: dominant regime per day for the last 250 sessions, height = posterior; Signal: val AUC above/below 0.5 for every stage), then the scrubber, then a single status line.
- Title overlay at top-left of the canvas: one 20px sentence plus one muted sentence explaining how to read it. No marketing headlines ("One fit. Every EM step.", "Features flow. Evidence stays apart.").
- Provenance (SHA, coverage, disclosure, claims flags, semantics text) moves into a **Method drawer**, opened from a button in the bar. Show the SHA once, as a short chip in the bar.
- **Delete from the UI**: the `.obs-perf` line ("1,088 CURVES · 326 INSTANCED NODES · FPS…"), `.obs-truth-footer` and the repeated REPLAY / AS OF / ticker badges. Keep the `Monitor` instrumentation for tests, but show frame-rate numbers only behind a `D` key toggle.

## 2. Rendering quality (`SceneFrame.tsx`, `BloomLayer.tsx`)
- `dpr={[1, 2]}`, `gl={{ antialias: true }}`, `toneMapping = ACESFilmicToneMapping`, and drop `resolutionScale={0.7}`. The current setup is why every line and label looks soft.
- Bloom: `intensity 0.8` (HMM) / `0.55` (signal), `radius 0.55`, threshold about `0.05`. The yellow blob is additive overdraw at intensity 1.2. Fix it by **lowering per-line alpha** (`0.02 + 0.26·w`), not by removing bloom.
- **Auto-fit the camera** to the scene's bounding sphere, offsetting the view for the docked card with `camera.setViewOffset(w + panel, h, panel, 0, w, h)`. Content should fill about 80% of the free area. No fixed `camera=[0,1,15]`.
- Labels: replace drei `<Text>` in world units with **HTML labels projected each frame** at 10.5–11.5px JetBrains Mono, with priority-based collision hiding (state and fold labels win over axis and ρ labels) and vertical stacking for feature names. The reference's `placeLabels()` shows the approach.

## 3. HMM scene (`HMMScene.tsx`): position must mean something
- Place each state at its **own mean** on `rolling_return_20` (x), `realized_vol_20` (y) and `drawdown_from_252_high` (z), in σ, times 1.55. Remove the equal-angle ring layout. Draw faint axes through 0σ with tick marks every 1σ, and end labels "Rising/Falling 20d return", "High 20d vol / Calm", "Near 52w high / Deep drawdown".
- Replace the posterior "particles" (250 days × 4 curves) and the mean "spokes" with **emission clouds**: about 1,500 fixed-seed standard-normal samples per state, positioned at `μ + σ·z` using that state's `covariance_diagonal` on the 3 axes. Additive, `alpha 0.16`. The number visible per state follows the stationary distribution of the transition matrix. When you scrub EM, the clouds move and reshape: that's the training visible.
- Transitions: **bundles of up to 14 strands** per ordered pair, strand count = `1 + round(p·44)`, skipped below 0.002. Colour runs as a gradient from source to target state, with a pulse travelling source → target. Persistence (`A[i][i]`) is shown as a camera-facing ring around the core: opacity `0.08 + 0.75·p⁴`, scale `0.45 + 0.25·p`.
- Readout: current regime (name in its colour, posterior shown as `≥ 0.999` when it rounds to 1), log-likelihood plus sparkline, EM rows, a **4×4 transition heat grid** (cell tint = state colour at `p^0.7·38%`, text in `--fg` when p ≥ 0.2), occupancy over the last 250 days, and one fine-print line.
- Colours (fixed, regime → hue): Sideways `#6AA8FF`, Low-Vol Bullish `#39E6B5`, Recovery `#B88CFF`, Stress `#FF4D6D`. Amber stays for UI chrome only: active tab, play button, scrubber.

## 4. Signal scene (`SignalScene.tsx`): from fog to rank flow
- Delete the "100 stage nodes stacked per fold" layout and the 5,000-curve cap. Use **6 columns**: inputs (grouped by feature family) + 5 folds. In each fold column, features are **sorted by importance in that fold** (rank 1 at the top). Each feature is one line, running from column to column: input slot → fold-1 rank → fold-2 rank and so on, as cubic S-curves.
- Brightness and bundle width come from `sqrt(imp / maxImp)` in the destination fold, with 1–5 strands per curve. Colour comes from feature family: Returns & momentum `#3FE0FF`, Trend & levels `#A98CF0`, Volatility `#FF5FD2`, Volume `#42E08B`, Cross-asset `#FF8A5B`. Use the same family mapping as the reference's `export.py` logic, and move it into the trace exporter so the frontend doesn't guess.
- Scrubbing runs through `fold × stage`. Earlier folds sit at their final stage, the current fold at the current stage, and later folds are hidden and labelled "Pending". Ranks **ease** to new positions.
- Labels: "Fold n" plus the validation window above each column. "Val AUC" plus a chip below, coloured red under 0.5, grey from 0.5 to 0.52, green above. `ρ` (Spearman between consecutive folds' final importances, computed in the exporter) sits between the columns. Family names go beside the input column, and the top-6 feature names beside the newest visible column. **Don't uppercase ρ** (it renders as "P").
- Camera: front-on with a slight angle (`dir (0.22, 0.08, 1)`) and a gentle ±0.16 rad sway instead of a full orbit.

## 5. Honesty fixes (non-negotiable)
- **Validation AUC 0.481 and holdout 0.463 must never be green or presented as the headline.** The readout opens with a verdict: "No predictive edge", with a red dot and one sentence. Below it go a holdout bullet chart on a 0.40–0.60 scale with a marked 0.50 chance line, validation AUC for every model family as diverging bars around 0.5, and per-fold AUC bars.
- If every family's validation AUC is ≤ 0.5, the selection step should report **"suppressed"**, not "picked xgboost". Show that state in the UI. Picking the best of five sub-chance models is selection on noise.
- Add the line: "Feature rankings barely move between folds (ρ 0.85–0.88). The model keeps leaning on the same inputs, and they still don't predict next-day direction." Stable importances with chance-level AUC is the actual finding.

## 6. Acceptance
- Side-by-side screenshots at 1440×860 and 400×860 of the app and `docs/observatory-reference.html` for both scenes, in the PR. Layout, framing and readout content should match.
- No label overlaps at 1366, 1440 and 1920 widths (assert this in `verify-observatory.mjs` with rect intersection on visible labels).
- The existing tests and provenance checks still pass. New exporter fields (`family`, `rho`, `suppressed`) get tests.
- 60fps median on integrated graphics at 1440p, with fps shown only behind `D`.
