# Model Observatory

`/observatory` exposes two read-only research scenes: HMM optimization and the signal-model forest. Forge F7, the command palette, and the SPY/QQQ/IWM legacy regime panel link to it. Scene/ticker choices are bookmarkable. The default is a checked replay of actual installed evidence, bounded at **2026-10-03T04:15:00Z**.

## Evidence and model semantics

Both endpoints require `ticker`, `as_of` and `source=real`. The HMM additionally requires `n_states` (2–6). They consume the activated publication-evidenced dataset, admitting only daily rows with `observed_at <= available_at <= as_of`. The Observatory price source is `ALPACA_IEX`. Date labels use the source's completed daily interval end in UTC; the latest interval represents the October 2 trading session and ends October 3 at 04:00Z.

Each trace returns admitted-input SHA-256, cutoff, latest observation/availability, source, quality, coverage, count, price basis and snapshot identities. `CONSERVATIVE_MARKET_TIME` and `RECEIVE_TIMESTAMP_CAPTURED` remain distinct. Combined qualities are explicitly `MIXED`, with the full quality list in the provenance drawer. The current checked replays use conservative historical timing and unadjusted IEX prices. Market, causal and validated-alpha claim flags remain false.

`LIVE MODEL RUN` means computation by the authenticated backend on locally installed evidence. The collector remains stopped. `REPLAY` identifies a checked artifact by its exact byte SHA-256, verified before geometry is rendered. Invalid SHA, schema, cutoff, probability vectors, quality disclosure or split evidence hides the scene. A changed request synchronously hides the previous trace and cancels its fetch.

### HMM

```text
GET /regime/hmm/trace?ticker=SPY&as_of=2026-10-03T04:15:00Z&n_states=4&source=real
```

The existing regime feature construction and StandardScaler feed a full-covariance GaussianHMM with seed 42. Each subsequent one-iteration `fit` retains its parameters (`init_params=""`). The trace records likelihood, means, covariance diagonals, transition matrix, full-fit posterior tail, convergence delta/flag and scaler parameters/hash. It stops at absolute likelihood delta < 0.01 or 100 iterations. Cache entries are bounded, single-flight, tenant-scoped and expire after 30 minutes; their keys include admitted input content and evaluated cutoff.

The last 250 particles are retrospective posteriors under the selected bounded fit. State names describe the final fit's components; the scrubber exposes the actual EM parameter history. They do not assert contemporaneously known historical regimes.

The fixed state ring is a layout. State arcs encode actual transition probabilities in width/brightness; particle connections encode posterior probabilities; cluster spokes encode standardized feature means. The particle position combines its posterior-weighted state center with a deterministic chronological offset. Pulse phase follows the selected recorded step on these actual weighted connections. There are no randomly invented edges or observations.

### Signal forest

```text
GET /ml/trace?ticker=SPY&as_of=2026-10-03T04:15:00Z&source=real&horizon=1&embargo=0
```

`build_signal_splits` and `signal_selection_split` are shared with `train_point_in_time_signal_suite`, used by `/ml/signal/{ticker}`. They retain the existing outer chronological 20% holdout, inner 20% validation, target-horizon purge and configured embargo. The current inference row is separate from labeled rows. Every fold also enforces:

```text
max(fit target-information availability) < min(validation feature availability)
```

The same check protects the final holdout. Its indices cannot enter any trace fit or validation slice.

Five expanding prefixes of the development set expose sklearn GBM diagnostics. The last prefix exactly matches production's candidate fit/validation split. Earlier prefixes are diagnostic folds; model-family selection uses the final development validation slice, preserving production behavior. The selected family is refit on development and evaluated once on the untouched final holdout, followed by the separate production inference fit.

`ModelTraceAdapter` supports sklearn GradientBoostingClassifier through `staged_predict_proba`. Stage importance is the cumulative normalized impurity decrease from trees fitted through that stage. Each frame has real validation logloss/AUC and importance. XGBoost/LightGBM and other families expose `stage_trace=UNAVAILABLE`; their final validation scores can still participate in production selection. Native iteration adapters require separate deterministic validation before enabling them.

The forest displays the 5,000 strongest nonzero feature-stage edges from the actual trace, with shown/eligible counts. Fold layers contain real stages. FIT, VALIDATION and UNTOUCHED OOS HOLDOUT have distinct treatments. The holdout has no training edges and its AUC appears only at the completed-selection replay position. The pictured SPY run selects XGBoost and reports holdout AUC **0.463**, while the GBM final validation AUC is **0.481**. These remain separate values. The optional neural candidate is omitted.

## Rendering and artifacts

The route, model scenes, R3F/Three rendering and Bloom load lazily. Curves use one/few BufferGeometry groups: LineSegments for the dense forest/posteriors and one batched ribbon geometry for weighted HMM transition widths. Nodes are instanced; labels are sparse camera-facing Drei Text using a bundled JetBrains Mono font. Html is reserved for the active tooltip.

Hover changes shader uniforms and instanced color attributes, dimming unrelated curves and nodes to 15% according to actual model connections. Pulse motion also changes uniforms. Geometry rebuilds only when an actual HMM frame changes; forest geometry is reused throughout playback. Additive radiance scales by the actual group's curve count while preserving relative importance. Bloom uses five mipmap levels, radius 0.3, intensity 1.2 and threshold 0.1, keeping its glow close to the lines. Its error boundary preserves the same model geometry when loading/initialization fails. Reduced motion disables pulses, auto-rotation and automatic replay, retaining manual scrubbing.

Six checked JSON snapshots live in `frontend-v2/public/artifacts/observatory/`. `manifest.json` records exact artifact/input hashes, byte counts, cutoff and model library versions. Regenerate only from installed real evidence:

```powershell
$env:PYTHONPATH='.'
python scripts/export_observatory.py --as-of 2026-10-03T04:15:00Z
```

No provider key or raw authentication message is embedded. `useTrainingStream` accepts authenticated GET JSON, checked JSON/JSONL, or complete `{trace: <snapshot>}` envelopes from a localhost WebSocket. JSONL uses one complete envelope per line, validates every snapshot and selects the last. This iteration ships the GET endpoints; no WebSocket server is required for production, which uses static replays.

For a local preview of the actual Nitro Vercel production output, run `npm run build` and then `node scripts/preview-built.mjs` from `frontend-v2/`. The preview binds to `127.0.0.1:4174` and serves both production SSR and static output.

## Verification record

On Windows, the production build, full lint, TypeScript check and **63** real-artifact integrity/sabotage checks pass. The full backend suite reports **695 passed, 16 failed**. All 16 failures are existing `tests/sabotage/test_sandbox_nasty.py` tests with a 0.5-second process budget returning TIMEOUT. The first failure reproduces on the untouched prerequisite checkout, and the sandbox source/tests are unchanged from main. The full suite is therefore not represented as green. Observatory tests cover both endpoint shapes, seed determinism, future append invariance, shared exact production indices, stage-history changes, target-information boundaries and holdout sabotage.

The production browser checks cover real tooltips, stable geometry under hover, motion preferences, selection-time holdout hiding, live/replay equality, corrupted artifact rejection, lazy loading on normal pages, and Bloom failure fallback. Benchmark evidence is recorded alongside the screenshots. The tested reference is this machine's **Intel UHD integrated GPU**, with Chromium/ANGLE Direct3D11, a **2560×1440 browser viewport**, **1473×880 scene canvas** and **DPR 1**. Measurements use actual rendered frames with Bloom enabled. Apple M1 was not tested.

| Scene | Curves | Instanced nodes | Total draw calls, including Bloom/text | Hover median FPS range | Lowest hover p5 FPS |
|---|---:|---:|---:|---:|---:|
| HMM / SPY | 1,088 | 326 | 20 | 133.3 | 116.3 |
| Signal forest / SPY | 5,000 | 573 | 29 | 107.5–108.7 | 91.7 |

Each scene was measured for six consecutive five-second windows after loading, totaling 4,032 HMM frames and 3,207 forest frames over approximately 30 seconds each. The table reports the range of window medians and the lowest window p5, rather than inventing an aggregate percentile. Curve geometry identities remain unchanged during hover. Every window exceeds the requested 50 FPS median integrated-GPU gate without sustained hover drops. [The verification record](observatory-verification.json) includes the actual samples, browser/GPU, tooltips and failure checks. Animation intervals are not excluded for being slow.

![HMM Regime Observatory](observatory-hmm.png)

![Signal Model Forest](observatory-signal.png)
