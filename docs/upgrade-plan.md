# FinSight v2 — plan (quants first · US + India · ₹0 budget · public showcase)

Commit as `docs/upgrade-plan.md` (replacing v1). Run one phase per PR: "Read docs/upgrade-plan.md and do Phase N."

## 0. Ground rules from the brief

- **Audience: quants at top firms, through LinkedIn.** What impresses them is rigor (preregistration, honest negative results, factor-neutral checks, multiple-testing correction) plus engineering (tests, reproducibility, provenance). Each phase ends with a **postable result**: a 30–60 s screen recording, one honest finding, the live link and the repo.
- **₹0 budget.**
  - Frontend and API on Vercel Hobby.
  - All heavy or periodic compute runs in **GitHub Actions scheduled workflows**: free on a public repo, standard runners. That includes data refresh, model training, risk sweeps and replay publishing.
  - Results are published as SHA-checked **replay artifacts**: in the repo for small files, as GitHub Release assets for larger ones.
  - Live mode runs only on your laptop.
  - LLM features use local Ollama in Live; the public site shows recorded answers.
- **The public site must work with no login and no API keys.** Replay mode is the default.
- **Licensing.** Publish only **derived** results publicly: signals, regimes, model traces, test statistics, aggregates. Raw vendor prices stay local, respecting `src/data/license_policy.py`. Each artifact records its sources and licence status.
- **Markets: US and India.**

| Data | US | India |
|---|---|---|
| Daily prices | Alpaca IEX / yfinance (local) | NSE bhavcopy archives, yfinance `.NS` (local) |
| Factors | Ken French library (already in `src/regime_intelligence/french.py`) | IIM Ahmedabad Indian Fama-French / momentum factor library |
| Macro | FRED / ALFRED (vintages) | RBI DBIE, MOSPI releases |
| Volatility index | VIX | India VIX |
| Filings / fundamentals | SEC EDGAR (AsOf) | Limited free point-in-time data; label coverage honestly |
| Costs | commissions + spread | STT, exchange fees, GST, stamp duty, spread |
| Events | USGS, NOAA, GDELT, NASA FIRMS | same + IMD (monsoon, cyclones) |

## 1. Architecture: the body

```
SENSES      data adapters (US, India, God's Eye feeds, news, filings, Kalshi)
NERVOUS     signal bus + point-in-time signal store: typed, timestamped, provenance-tagged
ORGANS      Regime · Prediction · Simulation · Execution · Knowledge · Event markets · Portfolio
NEURONS     neural nets inside organs + a "cortex" fusion layer (which organ matters, in which regime)
IMMUNE      Risk Manager: scheduled sweeps raise Issues (portfolio, model, data, research hygiene)
BRAIN       Research OS (hypothesis → preregister → test → replicate) + Agents (Forge, scenario RL)
```

**The plugin SDK is the core product.** A quant writes one Python class declaring `inputs` (signal names), `outputs`, `fit` and `predict`. FinSight provides everything else automatically:
- the point-in-time split;
- an Arena entry;
- the honesty harness (null world, planted signal, leakage sabotage, factor neutrality);
- an Observatory trace;
- run-registry records;
- Risk Manager monitoring.

Every existing model (HMM, GBM suite, MLP, Monte Carlo, Hawkes, the D0.4.2 modules) gets wrapped as a plugin. Nothing is rewritten from scratch.

## 2. Workspaces (Bloomberg-style)

F1 MARKET · F2 WORLD · F3 RISK · F4 REGIMES · F5 FACTORS · F6 RESEARCH · F7 EXECUTION · F8 OBSERVATORY · F9 AGENTS · F10 DATA.

Plus a command line with mnemonics (`RELIANCE IN DES <GO>`, `TSM GE <GO>`, `SPY REG <GO>`) and ⌘K. Every ticker page works for both US and India.

## 3. Phases

| # | Phase | Postable result |
|---|---|---|
| 0 | Rescue Markets (push the Phase 0 commits) + Market Overview | "FinSight's market desk is back, with fixes" |
| 1 | Bloomberg shell F1–F10, command line, Replay mode, US + India tickers | Walkthrough video of the terminal |
| 2 | Nervous system: signal bus, point-in-time store, plugin SDK, run registry, scheduled workflows | "Build a model in 30 lines and get the full rigor stack" |
| 3 | Data organ: US + India adapters, factor libraries, F10 data quality | "Data-quality report: US vs India" |
| 4 | **Flagship: regime-dependent momentum, US vs India.** Research OS v0.1 + statistics engine | **The main LinkedIn post** |
| 5 | Regimes on real data: D0.4.2 modules on US + India; Hawkes intensity drives HMM transitions | Regime-fracture landscape on real markets |
| 6 | Factors: factor lab, neutrality check on every signal, factor-zoo correction | "Of N signals, only k survive" |
| 7 | Risk Manager (immune system) + F3 | Issues feed catching real problems |
| 8 | World: God's Eye → exposure map → event study → impact on holdings | The Taiwan-quake demo |
| 9 | Execution: sweeps, Nautilus/hftbacktest, differential engines, market-making lab | "Same strategy, two simulators, different answers" |
| 10 | Neurons: cortex fusion, neural organs, MacroHFT-style scenario RL agent, Observatory body view | The "living system" video |

---

## Phase prompts

**Applies to every phase.**
- Start in plan mode: read the relevant code, propose the files to add, change or delete, and wait for my OK.
- Reuse existing modules; don't rewrite them.
- Commit in logical steps.
- Run lint, `tsc`, build, every `verify-*.mjs`, the browser checks and the full pytest suite.
- Open a PR with 1440 and 390 screenshots.
- Real data or checked-in artifacts only: no invented numbers, a labelled unavailable state when a source is down, and claim flags stay false unless a preregistered test earns them.
- Public Replay artifacts contain derived results only, never raw licensed prices.
- End each PR with a "Postable result" section: a 3-sentence finding and the exact screens to record.

### Phase 0: rescue Markets
> PR #18 was merged without the Phase 0 commits in `.claude/worktrees/phase0`. Add **Markets → Overview**: `/markets` and `/markets/$ticker` with search, live quote (source and timestamp), candlesticks + volume (1D–5Y) and a watchlist. Add it to `verify-markets.mjs`. Then `git push origin HEAD:feat/markets-desk` and open a PR to `main`.

### Phase 1: Bloomberg shell + Replay mode + India tickers
> Replace the shell with the F1–F10 workspaces from `docs/upgrade-plan.md` §2.
> - **Command line** with mnemonics: `<TICKER> [EXCH] <FUNCTION> <GO>`, where functions are DES, GP (price graph), OMON (options), FA, REG, GE (God's Eye), RISK, plus ⌘K.
> - **Existing screens** move into their workspaces: Markets → F1, Dynamics → F4, Observatory → F8, Forge → F9, God's Eye → F2.
> - **Placeholders:** each workspace without content yet shows one line saying what lands in which phase. No fake panels.
> - **Replay mode** is the default for anonymous visitors. It's driven by one `replay-manifest.json` of SHA-checked derived artifacts. Live mode is for local use with keys. Add a CI check that every workspace renders in Replay with zero failed requests and zero raw-price fields.
> - **India:** the ticker model gets an exchange (`NSE`, `NYSE`/`NASDAQ`), INR/USD display, NSE session hours, and India VIX in the Market overview.
> - Apply the design tokens from `docs/forge-reference.html`, and rebuild the Agents workspace to match it.

### Phase 2: the nervous system and the plugin SDK
> 1. **Signal store.** Typed, point-in-time signals: `name`, `asset`, `value`, `observed_at`, `available_at`, `source`, `licence`, `version`. Reads take an `as_of` and never return anything not yet available. Back it with Parquet/DuckDB locally; reuse `src/data/as_of.py` and AsOf's predecessor index ideas. Add property and metamorphic tests: future-append invariance, ticker-rename invariance, price-scaling invariance for return-based signals.
> 2. **Plugin SDK** (`finsight.plugins`): a `Model` base class with declared `inputs`/`outputs`, `fit(train)`, `predict(rows)` and an optional `trace()`. Registering a plugin automatically gives it the nested chronological split, an Arena entry, the honesty harness (null world, planted signal, leakage sabotage, factor-neutrality regression), an Observatory trace and run-registry records. Wrap the existing HMM, GBM suite, MLP, Monte Carlo VaR, Hawkes and the D0.4.2 modules as plugins.
> 3. **Run registry:** extend `src/truth/ledger.py` with immutable runs (commit, data hash, as_of, seed, config, splits, metrics, artifacts) and every holdout opening counted.
> 4. **Scheduled workflows (₹0 compute):** `.github/workflows/organs.yml` runs nightly. It refreshes allowed data, recomputes signals, runs plugins, runs Risk Manager sweeps (Phase 7 fills these in), publishes replay artifacts (repo or Release assets with SHA), and commits the manifest. Workflows must be idempotent and fail closed.
> 5. **Docs:** `docs/plugin-guide.md` with a worked 30-line example plugin, and the screenshots it produces.

### Phase 3: data organ (US + India) + F10
> Adapters behind the existing provider interface:
> - **India:** NSE bhavcopy (EOD), yfinance `.NS` fallback, the IIM Ahmedabad factor library, RBI DBIE macro, India VIX.
> - **US:** keep the current adapters, and add ALFRED vintages for macro.
>
> Every adapter records availability timestamps, revisions and licence status. Build **F10 DATA**: per-source health (missing sessions, duplicates, timestamp gaps, corporate-action jumps, late revisions, provider disagreement where two sources overlap) and a "revision observatory" for one ALFRED series. Indian transaction costs (STT, exchange fees, GST, stamp duty) go in one tested cost module. Fundamentals coverage for India is shown honestly as limited.

### Phase 4: flagship, regime-dependent momentum (US vs India)
> **Research OS v0.1** (F6), with one complete study as the showcase.
> - **Contract and preregistration.** Hypothesis contract → preregistration freeze, hashed and committed before any result is computed. Fix the primary endpoint, test, acceptance rule, negative controls, cost model, seeds and multiple-testing family.
> - **Study.** Momentum (12-1, monthly rebalance) returns conditioned on regime. Regimes come from the HMM plugin and the volatility-clustering module, US and India separately. Controls: Ken French factors (US), IIMA factors (India).
> - **Tests.** Wrap statsmodels/scipy for HAC regression, block bootstrap, permutation, Holm and BH corrections, and a deflated Sharpe ratio. Then **test the tests**: type-I error on 1,000 null worlds and power on planted effects. Show "CALIBRATED" only when the rate falls inside its CI.
> - **Robustness.** Shuffled-regime placebo, wrong-direction signal, cost frontier (US costs and the Indian cost module), leave-one-crisis-out (2008, 2020), first half vs second half, power analysis.
> - **UI.** Scorecard with Statistical / Economic / Regime-dependence / Cross-market verdicts, a forest plot (original paper, US, India, by regime), and an experiment DAG.
> - **Honesty.** If the effect disappears after costs or corrections, that's the headline. Write `docs/findings/momentum-regimes.md` in plain English.

### Phase 5: regimes on real data + Hawkes → HMM
> Run each D0.4.2 module (`src/dynamics/market_regime*.py`, `docs/dynamics-lab-d0-4-2.md`) on real US (SPY + sector ETFs) and India (NIFTY 50 + sector indices) data, as a registered plugin with its own panel in F4. Keep the synthetic worlds as test fixtures only.
> - **Volatility Clustering Detector:** ARCH-LM test, GARCH(1,1) persistence, volatility-of-volatility and clustering half-life, with CIs. Its state feeds the HMM and the Phase 4 study.
> - **Intraday Seasonality Map:** time-of-day × weekday heatmaps of return, volatility and volume, with CIs and multiple-testing control across cells. Covers NSE and US sessions.
> - **Factor Neutrality Check:** regress module outputs and strategy returns on Ken French (US) and IIMA (India) factors. Flag anything that is really beta, size, value or momentum.
> - **Regime-Dependent Momentum:** live view of the Phase 4 study (momentum returns by regime, US vs India).
> - **Regime Fracture Landscape:** the frozen six-component fracture score (volatility, correlation, liquidity, events, factors, macro) on real data, with the transition timeline and the 3D landscape. Partial coverage shows a partial subtotal, never a full score.
> - **Hawkes Event Dynamics → regime system:** see the next bullet.
> - **Intraday seasonality:** where only daily data is licensed for publication, say so. Use local minute bars and publish only aggregated heatmaps.
> - **Hawkes into the regime model.** An input-output HMM whose transition probabilities depend on Hawkes event intensity (price-jump and news/event streams).
> - **Gate.** Compare it to the plain HMM by out-of-sample log-likelihood with a proper test. If it doesn't beat the plain HMM, ship it labelled as such.
> - **F4 REGIMES:** fracture landscape, regime timeline for SPY and NIFTY 50, and transition drivers.

### Phase 6: factors
> **F5 FACTORS**:
> - factor library (US: Ken French; India: IIMA);
> - decile sorts, IC / rank IC, turnover;
> - a **factor-neutrality check applied to every registered plugin's signal**, which flags signals that are just disguised beta, size, value or momentum;
> - a **factor-zoo report**: raw significant → after FDR → after out-of-sample → after costs → across regimes.

### Phase 7: Risk Manager (immune system)
> **F3 RISK**, plus the nightly sweeps from the Phase 2 workflow. Checks:
> - **Portfolio:** VaR/CVaR (Monte Carlo plugin), concentration, factor exposures, liquidity, and only quoted marks.
> - **Models:** drift (PSI/KS), calibration drift, out-of-distribution inputs (abstain when outside the training manifold), regime change.
> - **Data:** staleness, gaps, provider disagreement.
> - **Research hygiene:** holdout openings, number of tests in each family, unpreregistered claims.
> - **Simulators:** disagreement between execution engines.
>
> Each finding becomes an **Issue** with severity, evidence links, first-seen time and status, in a Bloomberg-style alert feed and an issues page. Seed demo portfolios for US and India (clearly labelled examples).

### Phase 8: World (God's Eye impact chain)
> F2 WORLD.
> 1. Event layers: USGS, NOAA hurricanes, NASA FIRMS fires, GDELT, IMD cyclones and monsoon.
> 2. **Exposure map:** a hand-curated, cited facility map for about 50 US and 50 Indian companies (fabs, plants, ports, mines, refineries), with coverage stated.
> 3. **Event-study engine:** CAR over [0,+1], [0,+5] and [0,+20] versus market and factor models, with bootstrap CI, matched controls and placebo dates.
> 4. **Click an event →** exposed tickers, their historical reaction to similar events (n and CI), and the effect on the demo portfolio's risk.
>
> If the evidence is weak, say "no measurable effect". Events also feed Hawkes intensities (Phase 5).

### Phase 9: Execution
> **F7 EXECUTION**, on the existing workers in `src/execution/workers/`:
> - VectorBT parameter sweeps and walk-forward surfaces;
> - Nautilus order-lifecycle replay;
> - hftbacktest microstructure, using free crypto L2 data and labelled as such, because free US L2 doesn't exist;
> - **differential testing** that runs the same strategy in two engines and flags "simulator-sensitive" results;
> - a market-making lab using `src/prediction_markets` (Avellaneda–Stoikov, GLFT, inventory skew) on Kalshi public data, clean-room, research only.

### Phase 10: neurons, scenario RL and the body view
> 1. **Cortex:** a learned fusion layer that combines organ outputs into one forecast. Attention weights are logged by regime. It enters the Arena like any plugin and must beat simple averaging.
> 2. **Neural organs:** TCN sequence model, autoencoder regime map, neural IV surface, each as a plugin through the full harness.
> 3. **Architecture search** on a schedule: search only on validation, count every attempt, report deflated metrics, and show it in the Observatory as an evolution timeline.
> 4. **Scenario RL** (MacroHFT-style: one sub-agent per regime from the Regime Fracture Landscape and HMM, plus a hyper-agent with memory that blends them).
>    - Train in a scenario simulator built from HMM regimes, Hawkes shocks and God's Eye exposures.
>    - Evaluate on held-out real periods only.
>    - Baselines: buy-and-hold, risk parity and the plain regime rule.
> 5. **F8 body view:** organs as nodes, signals as glowing pulses along the bus, and the Risk Manager's issues lighting up the affected organ.
