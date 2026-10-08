# Phase 1a: terminal shell, Replay and India

This branch starts at `f5275b59ef7cbc44e5314492de4c329548b086bf` on main, after PR #20 merged. Phase 1b will redesign the Agents content separately. The committed `forge-reference.html` supplies the shared shell's colors, typography, spacing and column layout.

## Navigation

The bar exposes all ten workspaces. F1–F4, F6 and F8–F10 navigate only outside text fields and call `preventDefault`. F5 refresh and F7 caret browsing remain browser-owned. FACTORS and EXECUTION open through the bar, Ctrl/Cmd K, `FACT`/`FACTORS`, and `EXEC`/`EXECUTION`. Headed Chrome, Edge and Firefox passed every key; no additional key had to be removed. The test profile suppresses Firefox's first-use caret warning without disabling native F7 behavior.

Commands accept `TICKER [EXCHANGE] FUNCTION [GO]`. `US` resolves a recorded US listing; `UN`, `UQ` and `UP` select NYSE, NASDAQ and NYSE Arca. SPY resolves to UP. `IN` defaults to NSE (`IS`); `IB` uses a recorded BSE identifier. Examples: `SPY US GP`, `RELIANCE IN DES`, `RELIANCE IB DES`, `TSM UN GE`, `SPY REG`, `FACT`, `EXEC`.

India listings display INR and the NSE regular cash session, 09:15–15:30 IST. Session text does not assert holiday-aware open status. India fundamentals have limited free point-in-time coverage. Local Live shows a sourced and timestamped India VIX index level when its provider returns one.

## Public Replay boundary

One `frontend-v2/public/replay-manifest.json` declares 85 available derived artifacts and unavailable coverage. Every entry records its sources, publication licence, cutoff, actual availability, source input hash, byte count and SHA-256. The client checks these before rendering. Claim flags remain false.

The real public market evidence now uses the [Ken French Data Library](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html) and the [IIM Ahmedabad Indian factor library](https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/). Both registrations permit attributed `publish_derived` research projections. They are not labelled public domain or Creative Commons, and do not authorize redistributing underlying CRSP or CMIE Prowess records. IIMA attribution follows Agarwalla, Jacob and Varma (2013), *Four factor model in Indian equities market*, W.P. No. 2013-09-05.

| Public series | Genuine market history | Available views |
|---|---|---|
| `US-MKT` · Ken French | 1926-07-01–2026-08-31 · 26,317 daily returns | Weekly GP, HMM, signal validation, regime evidence |
| `IN-MKT` · IIMA survivorship-bias adjusted release 2025-12 | 1993-10-04–2025-12-31 · 8,003 daily returns | Weekly GP, HMM, signal validation, regime evidence |

Both are labelled **market factor, not a ticker**. The source files also contain size, value and momentum factors; their genuine coverage and capture hashes are recorded. IIMA's library starts 1993-10-01, but its first market-factor value is missing; the market series therefore starts October 4 without filling the missing value. Source CSV percentages are converted to proportional holding-period returns. GP compounds **market excess returns (Rm-Rf)** into a dimensionless index, rebased to 100 at the first weekly observation. It shows weekly relative performance, drawdown, 20-session annualized log-return volatility and HMM posterior shading across the fitted history. It is not a ticker price or an investable total-return index.

The HMM and signal adapters reuse the existing return feature helpers, HMM EM tracer, GBM stage adapter, model-family selection suite, purge, validation and final holdout construction. No OHLCV rows or volume features are fabricated. HMM uses the entire complete market-return history; its posteriors are retrospective. Signal uses return, momentum, volatility and drawdown features from that country's market factor only. The US HMM reaches tolerance at 56 EM iterations; India reaches the 100-iteration cap and is explicitly labelled unconverged. The US signal verdict is inconclusive. India's holdout interval is above chance under the existing descriptive verdict rule; this does not earn an alpha claim.

These are current **revised captures**, not historically known factor vintages. Each source records its actual capture time in `available_at`. The signal split clock orders observations within that one fixed vintage, with a one-session horizon purge and an untouched final 20% holdout after validation-only model selection. Historical split dates are not alleged publication dates. The [IIMA revision FAQ](https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/FAQ.php) explains why historical values may change. The regime panel publishes return-only HMM evidence, not a full six-component fracture score.

WORLD includes a genuine USGS ComCat freeze and **176 unique satellites** derived from captured CelesTrak OMM JSON for the stations and visual groups. The orbital snapshot at `2026-10-08T04:10:00Z` contains SGP4 geodetic positions and 20 trail samples at 30-second intervals, with no TLE or OMM elements. Each layer displays its own cutoff; USGS retains `2026-10-07T11:20:26Z`. CelesTrak attribution includes USSPACECOM / 18th Space Defense Squadron and Space-Track.org. The registration cites the [CelesTrak usage policy](https://celestrak.org/usage-policy.php) and [Space-Track redistribution guidance](https://www.space-track.org/documentation). Captures are cached, GP requests are limited to two hours, and a non-200 response stops further requests. Orbital projections are research visualizations, not operational tracking.

| Source kept unavailable publicly | Affected coverage |
|---|---|
| ALPACA_IEX | SPY, QQQ and IWM ticker GP; ticker HMM, signal and neural traces |
| YFINANCE | US and India ticker GP |
| YFINANCE / NSE India VIX | Volatility-index summary |

Those entries have no payload URL; ticker-level views remain local Live-only. Display or training grants do not authorize publication. Original Alpaca trace payloads remain absent from the current tree and deployed assets. Historical contract tests use the exact original PR #20 Git objects. Synthetic GP fixtures remain TEST_ONLY and supply no product evidence or screenshots.

## Reproduction

```powershell
$env:OPENBLAS_NUM_THREADS='1'
$env:OMP_NUM_THREADS='1'
$env:MKL_NUM_THREADS='1'
python -m scripts.export_replay --as-of 2026-10-07T11:20:26Z --world-input data/exports/replay-source/usgs-month.geojson
```

Then add the public research projection without recomputing or altering the checked frozen Forge and Dynamics bytes:

```powershell
python -m scripts.export_public_research --as-of 2026-10-08T04:10:00Z --capture
```

Raw captures and their `.meta.json` files live in the ignored `data/exports/replay-source/` directory. The exporter verifies their exact URL, capture time and byte hash, uses the same capture on reruns, and fails closed per country/source. A fresh capture requires a current cutoff after capture; it never backdates a revised download. The library release URL is pinned for reproduction. Retained artifacts must pass byte, source-cutoff, licence and claim checks before the manifest is extended. The source capture metadata and hashes are also recorded in each public derived artifact.

Local Live requires `VITE_ENABLE_LOCAL_LIVE=true` and a loopback hostname, plus a locally configured backend with its own credentials. A public hostname, URL parameter or browser preference cannot enable Live. Switching mode cancels and clears the query cache and remounts the workspace before later responses can render.

## Validation

Lint, TypeScript, production build and every `verify-*.mjs` contract check are required. The expanded unmocked Replay check covers all workspaces, both countries' HMM and signal scenes, all four GP views and restored satellites at 1440/390, with zero live API requests, failed requests or viewport overflow. Checks also reject source substitution, backdated capture availability, historical-PIT relabelling and changed bytes. Existing local Live and historical Observatory contract/layout checks remain in place. Chrome, Edge and Firefox recheck function keys and text-field focus.

The targeted factor/publication tests pass 25 checks, including unit conversion, missing first market return, duplicate/out-of-order sessions, malformed returns, causal feature-prefix invariance and horizon purges. The full Windows backend suite returns 780 passed and 16 failed, with only the existing 0.5-second sandbox subprocess startup timeouts previously reproduced on main. Tests are not weakened. Latest Linux CI results are recorded in PR #21's validation section.

## Postable result

Public Replay now shows real US and Indian market-factor research from the sources' full available histories, with checked HMM and signal scenes and weekly relative views. WORLD restores attributed, recorded satellite projections alongside genuine earthquakes. Revised-history validation and descriptive model scores do not certify tradable alpha or causal claims.

Record about 60 seconds:

1. MARKET: `US-MKT GP`, then Drawdown, Realized volatility and HMM regimes (10 seconds).
2. `IN-MKT GP`, show the real history and the “market factor, not a ticker” label (10 seconds).
3. F8 OBSERVATORY: show US and India Regime space and Feature flow; open Method for source/capture disclosure (20 seconds).
4. F4 REGIMES: choose India; show the unconverged-fit disclosure and return-only evidence (10 seconds).
5. F2 WORLD: show both recorded feed chips, satellite count and source credits (10 seconds).

Use the committed 1440 and 390 screenshots under `docs/screenshots/`, including `phase1a-observatory-{us,india}-{hmm,signal}-{width}.png`. Ticker GP and India VIX remain local Live-only.
