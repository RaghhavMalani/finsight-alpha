# Phase 1a: terminal shell, Replay and India

This branch starts at `f5275b59ef7cbc44e5314492de4c329548b086bf` on main, after PR #20 merged. Phase 1b will redesign the Agents content separately. The committed `forge-reference.html` supplies the shared shell's colors, typography, spacing and column layout.

## Navigation

The bar exposes all ten workspaces. F1–F4, F6 and F8–F10 navigate only outside text fields and call `preventDefault`. F5 refresh and F7 caret browsing remain browser-owned. FACTORS and EXECUTION open through the bar, Ctrl/Cmd K, `FACT`/`FACTORS`, and `EXEC`/`EXECUTION`. Headed Chrome, Edge and Firefox passed every key; no additional key had to be removed. The test profile suppresses Firefox's first-use caret warning without disabling native F7 behavior.

Commands accept `TICKER [EXCHANGE] FUNCTION [GO]`. `US` resolves a recorded US listing; `UN`, `UQ` and `UP` select NYSE, NASDAQ and NYSE Arca. SPY resolves to UP. `IN` defaults to NSE (`IS`); `IB` uses a recorded BSE identifier. Examples: `SPY US GP`, `RELIANCE IN DES`, `RELIANCE IB DES`, `TSM UN GE`, `SPY REG`, `FACT`, `EXEC`.

India listings display INR and the NSE regular cash session, 09:15–15:30 IST. Session text does not assert holiday-aware open status. India fundamentals have limited free point-in-time coverage. Local Live shows a sourced and timestamped India VIX index level when its provider returns one.

## Public Replay boundary

One `frontend-v2/public/replay-manifest.json` declares 76 available derived artifacts and unavailable coverage. Every entry carries sources, publication licence, cutoff, availability metadata and source input hash. Available payloads also carry byte count and SHA-256. The client verifies these before parsing or rendering; a changed byte, expired licence, future availability or raw-price field fails closed. Claim flags remain false.

The available artifacts are the existing frozen Forge research, verified Dynamics reference projections, explicitly labelled synthetic integration references and a genuine captured USGS ComCat earthquake snapshot. The World clock stays at the recorded cutoff, `2026-10-07T11:20:26Z`, and performs no external feed polling in Replay. USGS-authored ComCat data are covered by the source's [public-domain policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits).

The publication policy did not grant anonymous derived-series publication for these sources:

| Source | Affected public coverage |
|---|---|
| ALPACA_IEX | SPY, QQQ and IWM weekly Market series; HMM, signal and neural traces |
| YFINANCE | US and NSE daily Market series |
| YFINANCE / NSE India VIX | Derived volatility-index summary |
| CelesTrak | Recorded satellite projection |

These entries have no payload URL. A tenant display or training grant does not authorize publication. The six original Alpaca trace payloads are removed from the current repository tree and deployed static directory; contract tests read their byte-identical historical Git objects from the existing immutable PR #20 commit. Existing Git history is preserved. No vendor price download or simulated fixture fills a denied source.

Market GP implements weekly relative performance rebased to 100, drawdown, 20-session annualized realized volatility and checked HMM shading. It publishes no absolute price levels. Each view shows its actual availability and methodology; the desk also provides instrument identity, session, watchlist and coverage. When an explicit publication grant and genuine local input are supplied, the exporter reuses the existing bounded HMM on admitted close-derived features. Its historical shading is a fit posterior, not contemporaneously known historical regimes or evidence of tradable alpha.

The GP test inputs use the existing simulated Phase 0 bars, with an explicit TEST_ONLY badge and permission envelope. They exercise all four views and do not supply product screenshots or findings. The preserved real-trace layout tests are also separate from the unmocked production Replay checks.

## Reproduction

```powershell
$env:OPENBLAS_NUM_THREADS='1'
$env:OMP_NUM_THREADS='1'
$env:MKL_NUM_THREADS='1'
python -m scripts.export_replay --as-of 2026-10-07T11:20:26Z --world-input data/exports/replay-source/usgs-month.geojson
```

The local captured source is intentionally ignored by Git. To capture a new genuine World snapshot, use `--capture-world` with a current cutoff after the source's generated timestamp. Verified frozen-reader results are cached locally only when tracked implementation/input hashes and software versions match; the original evidence verifier must complete before a cache entry is written. Public payload validation still runs on every export.

Local Live requires `VITE_ENABLE_LOCAL_LIVE=true` and a loopback hostname, plus a locally configured backend with its own credentials. A public hostname, URL parameter or browser preference cannot enable Live. Switching mode cancels and clears the query cache and remounts the workspace before later responses can render.

## Validation

Lint, TypeScript, production build and every `verify-*.mjs` contract check pass. The browser checks pass 50 unmocked Replay views at 1440/390, 48 local-Live Market data/error/signed-out views, and 18 historical Observatory trace layouts. Chrome, Edge and Firefox pass all function-key and field-focus checks. Replay sabotage checks cover changed bytes, denied sources, unsafe price fields, expired permission, future availability, public attempts to enable Live and delayed responses across a mode switch.

The full Windows pytest run returned 768 passed and 16 failures: the existing sandbox sabotage tests time out during process startup against their 0.5-second deadline on this machine. The unchanged main baseline exhibits those same failures. The latest targeted Replay publication suite passes all 18 tests. CI runs the full suite on Linux; its result is reported in the PR.

## Postable result

The terminal now opens all ten workspaces without login or API keys and keeps US and India instrument context across navigation. Its public Replay verifies frozen research and a recorded USGS snapshot, while weekly Market views explain exactly which publication permissions are missing. No alpha or causal claim is earned by this navigation and publication work.

Record 45–55 seconds from the public Replay build:

1. MARKET: type `RELIANCE IN DES`, show IS / INR and NSE session hours (10 seconds).
2. Type `SPY US GP`, select Drawdown, Realized volatility and HMM regimes, show the source/licence unavailable message (10 seconds).
3. Press F2 for WORLD; show the recorded cutoff and USGS events (10 seconds).
4. Open FACTORS and EXECUTION from the bar or palette; show their phase labels (5 seconds).
5. Press F9 for AGENTS; show the existing checked frozen run evidence (10 seconds).
6. Press F10 for DATA; end on the shared shell (5 seconds).

Use the committed 1440 and 390 screenshots in `docs/screenshots/`. Do not record the TEST_ONLY GP fixture as market evidence.
