# Forecasting layer — HSMM regimes + Temporal Fusion Transformer (scoping)

This is a **plan**, not a shipped feature. HSMM/TFT forecasting is real research-ML
work (training, leakage-safe validation, model serving, monitoring). Faking it
with a toy model would be worse than not having it. Here is how to build it
properly, in phases, so it can be defended in an interview.

## Goal
Two linked capabilities:
1. **Regime detection (HSMM)** — label each day as a latent market state
   (e.g. calm-bull, choppy, high-vol-bear, crash, recovery) with *state-duration*
   modeling (HSMM ≥ HMM because regimes persist for variable lengths).
2. **Conditional forecasting (TFT)** — predict the focal stock's forward return
   distribution (quantiles), conditioned on its own features **and its
   dependencies' recent moves** — i.e. "if TSMC/SPY move like X, AAPL's 5-day
   return distribution shifts like Y."

## Data
- Prices/returns for the focal name + its dependency tickers (already available
  via `MarketDataService`; dependencies from `/graph`).
- Engineered features (reuse `src/ml/features.py`): returns, vol, RSI, MACD,
  rolling stats, plus **dependency returns** as exogenous regressors.
- Macro/known-future inputs for TFT: calendar features, optionally rates.
- Target: forward N-day return (regression) or its sign (classification); for
  quantile loss, predict P10/P50/P90.

## Models
**HSMM** — `hmmlearn` (Gaussian HMM as a baseline) → upgrade to an explicit-
duration HSMM (e.g. `pomegranate`, or a custom EDHMM). Inputs: return, realized
vol, maybe dispersion. Output: per-day state + transition matrix + expected
state duration. This already exists in a simpler form in `src/regime/` — the
HSMM is the duration-aware upgrade.

**TFT** — Temporal Fusion Transformer via `pytorch-forecasting` (PyTorch
Lightning). Handles static covariates (ticker, sector), known-future inputs
(calendar), and observed inputs (the stock's + dependencies' features), and
emits **quantile forecasts** with interpretable variable-importance + attention.

## Validation (the part that matters)
- **Walk-forward / expanding-window** splits — never random. Reuse the
  walk-forward discipline already in `src/ml/walk_forward.py`.
- **Purge + embargo** around each split boundary to kill leakage.
- Metrics: directional accuracy, quantile (pinball) loss, calibration of the
  predicted distribution, and a **backtested** strategy that trades on the
  signal vs buy & hold (reuse the new `/backtest` engine).
- Honest baseline: the TFT must beat a naive "tomorrow ≈ today" and a simple
  AR/logistic model, or it isn't worth shipping.

## Serving
- **Batch, not live training.** Nightly job trains/refits, writes per-ticker
  forecasts + regime labels to `data/forecasts/`.
- New endpoints: `GET /forecast/{ticker}` (quantile path + current regime) and
  `GET /regime/{ticker}` (state timeline). The terminal renders a fan of
  predicted quantiles on the price chart and colors the timeline by regime.
- Model registry + versioning (MLflow) so a forecast is traceable to a model.

## Integration with the dependency graph
The graph already computes each dependency's **β** (sensitivity). The TFT turns
that static elasticity into a *conditional, non-linear* forecast: feed a
hypothetical dependency shock as an exogenous input and read the shifted output
quantiles — "if crude +5%, RIL 5-day P50 → …". That's the real version of
"predict how the stock moves if the dependency moves."

## Phased plan (realistic effort)
1. **Week 1–2** — feature store + leakage-safe walk-forward harness + baselines
   (logistic / gradient boosting). Wire metrics + backtest.
2. **Week 2–3** — HSMM regime model; expose `/regime/{ticker}`; render timeline.
3. **Week 3–5** — TFT with `pytorch-forecasting`; quantile forecasts; offline
   eval vs baselines; only ship if it beats them.
4. **Week 5–6** — nightly batch serving, `/forecast/{ticker}`, terminal fan
   chart, model registry + monitoring.

## Risks / honesty
- Financial return forecasting has a **low signal ceiling**; expect modest edge,
  and present it with confidence intervals, not as a crystal ball.
- TFT needs enough history and careful regularization or it overfits.
- The deliverable that impresses is the **evaluation rigor** (walk-forward,
  purging, calibration, backtest), not a single accuracy number.
