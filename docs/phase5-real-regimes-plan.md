# Phase 5 — Real US + India Regime Intelligence: approved implementation plan

**Status: APPROVED 2026-10-10 with the amendments recorded below. Implementation proceeds through §17 steps 1–8 without further planning approval.**

Branch `feat/phase5-real-regimes` starts at canonical main `1a0d03d7dedb2e50e57a7c28149f2ed0351be275` (the PR #26 merge). The original proposal was commit `1242f86`; where it conflicts with the review decision below, the review decision governs.

## Review decision (binding)

| Decision | Outcome | Binding amendment |
| --- | --- | --- |
| D1 window | Approved | 2000-01-01 onward is the common analytical window. Each source's complete historical coverage is still reported separately. |
| D2 tenant | Approved | `public-regime-evidence`; Phase 3 F10 history and counts are not mutated. |
| D3 SeriesModel | Approved | Zero fabricated targets, splits or holdout openings for unsupervised/time-series computations. |
| D4 India | Approved with restriction | `PARTIAL · CALENDAR_UNAVAILABLE · STALE_INPUT`. Transitions, windows, durations and GARCH persistence are **per observed record**, never trading days or sessions. No annualisation and no session-gap diagnostics for India. |
| D5 local tier | Approved, non-blocking | SPY/QQQ/IWM first; sector ETFs only if already legitimately admitted. Phase 5 completion does not depend on it. |
| D6 nightly | Approved conditionally | First prove with `workflow_dispatch`: unchanged source → zero new runs; changed admitted content → one new sealed run per computation; always zero holdout openings and zero implicit plugin/reference executions. Only then is the scheduled path left enabled. |
| D7 GARCH | **Changed** | The mature `arch` package (8.x, NCSA licence) is the production GARCH(1,1) estimator, with robust covariance. An independent bounded SciPy reference implementation lives in tests only, for parameter/likelihood/conditional-volatility differential checks. If `arch` cannot be installed reliably in required CI, stop and report before substituting any production estimator. (Checked at approval time: `arch` 8.0.0 installs on Linux/Python 3.11 with the repo's numpy/pandas, and a `cp311-win_amd64` wheel exists.) |
| D8 fracture/IOHMM | Approved | Partial/unavailable; no manufactured components. |
| D9 captures | Approved | Public French/IIMA capture runs in GitHub Actions or by operator execution; the local Alpaca tier is populated on the operator machine. Cloud network blocking never weakens provenance. |
| D10 badge | Approved | `LOCAL MODEL RUN`, never `LIVE MODEL RUN` without a continuously running feed. |

**Scientific corrections (binding):**

1. **Module 6 semantics.** The primary momentum panel conditions the **12–1 market-factor signal itself** on HMM state: n, mean signal, median signal, positive-signal fraction and dispersion. The French/IIMA `MOM` factor by regime is a separately titled panel, "MOM FACTOR BY REGIME — cross-sectional momentum-factor diagnostic", and is never described as the return of a 12–1 market-timing signal. The frozen Phase 4 card is the only place carrying Research OS momentum verdicts.
2. **Time semantics without a calendar.** India HMM transitions are "per observed record", expected duration is in observations, GARCH persistence is per observation step, and 12–1 is a "252/21 observation-index approximation · CALENDAR_UNAVAILABLE". "Days", "trading days" and "sessions" are never used for India.
3. **Posterior semantics.** Published historical paths are genuinely **filtered** by a custom forward recursion; full-sequence (forward–backward) `predict_proba` output is never published as a historical state. Three layers stay distinct: CURRENT STATE AT CUTOFF (PIT-valid for the admitted capture), WITHIN-RUN HISTORICAL PATH (`PARAMETER_RETROSPECTIVE`, parameters estimated through the cutoff) and SEALED MULTI-CUTOFF TIMELINE (the as-known-at-each-run sequence).

**Naming (binding).** Public anonymous views say `US MARKET-FACTOR REGIME · French MKT · CAPTURE_ONLY` and `INDIA MARKET-FACTOR REGIME · IIMA MKT · CAPTURE_ONLY · STALE_INPUT`. They never imply SPY or NIFTY 50. Local views say e.g. `SPY REGIME · ALPACA IEX · LOCAL ONLY · CONSERVATIVE_MARKET_TIME`.

**Still out of scope:** VectorBT, NautilusTrader, hftbacktest, Kalshi, new inference calibration, a new momentum study and any live-trading functionality. Evidence requirements are never weakened to make a module available. The phase ends with one unmerged PR carrying sealed real-evidence findings, production screenshots and the complete verification packet.

This is a product and descriptive-research phase. It is not an inference-calibration tournament, a Research OS retry, a rerun of the frozen momentum study, an alpha claim, a trading strategy, or an execution-engine integration. All claim flags stay false: `market_claim_eligible`, `validated_alpha`, `inference_certified`, `causal_claim_eligible`, plus D0.4.2's `trusted_graph` and `precise_edge_confidence`.

## 0. The honest answer in one table

Today's admitted, publishable evidence is much narrower than the brief's target universe. The plan treats unavailable panels with precise reasons as correct output.

| Module | US public tier: `US-MKT` (French market factor) | US local tier: SPY/QQQ/IWM (Alpaca IEX) | India public tier: `IN-MKT` (IIMA market factor) |
| --- | --- | --- | --- |
| 1 Volatility clustering, ARCH-LM, GARCH(1,1) | AVAILABLE · CAPTURE_ONLY | LOCAL ONLY · CONSERVATIVE_MARKET_TIME · IEX_ONLY · UNADJUSTED | PARTIAL · CAPTURE_ONLY · CALENDAR_UNAVAILABLE · STALE_INPUT |
| 2 HMM (2-state diagnostic + existing 4-state) | AVAILABLE · CAPTURE_ONLY | LOCAL ONLY | PARTIAL; UNCONVERGED retained if it occurs |
| 3 Volatility → HMM coupling | AVAILABLE | LOCAL ONLY | PARTIAL |
| 4 Intraday seasonality | UNAVAILABLE: the factor library is daily | LOCAL ONLY · IEX_ONLY, after a new IEX-minute admission (decision D5) | UNAVAILABLE: no intraday source, no XNSE calendar evidence |
| 5 Factor neutrality | PARTIAL_FACTOR_DIAGNOSTIC (FF3 + MOM) · CAPTURE_ONLY | LOCAL ONLY | PARTIAL_FACTOR_DIAGNOSTIC (IIMA 4F) · CAPTURE_ONLY |
| 6 Momentum by regime (descriptive) | AVAILABLE · descriptive only | LOCAL ONLY | PARTIAL |
| 7 Event pressure (aggregate Hawkes) | UNAVAILABLE: no admitted event stream | UNAVAILABLE | UNAVAILABLE |
| 8 Cross-market matrix | Public rows `US-MKT`, `IN-MKT` | Local rows SPY/QQQ/IWM (+ sector ETFs if imported) | — |
| Fracture landscape (from `docs/upgrade-plan.md`) | PARTIAL subtotal only; full score and 3D landscape UNAVAILABLE | PARTIAL | PARTIAL |
| Hawkes → HMM input-output HMM and its OOS gate | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |

`US-MKT` and `IN-MKT` are market factors (Rm − Rf), not tickers. The UI never labels them SPY or NIFTY 50.

## 1. Current repository findings

**Upgrade plan.** `docs/upgrade-plan.md` Phase 5 asks for the D0.4.2 modules on real US (SPY + sector ETFs) and India (NIFTY 50 + sector indices) data as registered plugins, with synthetic worlds kept as test fixtures. It also asks for ARCH-LM/GARCH with CIs, seasonality with multiple-testing control, factor neutrality, a live view of the Phase 4 study, the fracture landscape, and a Hawkes-driven input-output HMM gated on out-of-sample log-likelihood. The brief for this phase narrows Hawkes to aggregate diagnostics and adds the cross-market matrix. This plan follows the brief and records the fracture landscape and IOHMM as explicit UNAVAILABLE/PARTIAL items (§5.9).

**Data Organ v0.1** (`src/data_organ/`, tenant `public-data-evidence`, `eval/data-organ/v0.1/source-catalog.json`):

- Eleven profiles. Only four are public-admitted: `ken-french:daily-factors`, `iima:daily-factors`, `alfred:UNRATE` and `bls:LNS14000000`.
- Factor captures are admitted only for `factor_window` 2024-01-01 → 2025-12-31, as signals `mkt/smb/hml/mom/rf` on assets `US-MKT` and `IN-MKT`.
- Every factor signal has `available_at` equal to its capture clock (`CAPTURE_ONLY`; backdating is rejected in `contracts.validate_observation`).
- `alpaca:iex`, `yfinance` and `nse:bhavcopy` admit only daily `market_close`, are `LOCAL_ONLY`, and operator imports are bounded to two-year windows (`scripts/collect_data_organ.py`). There is no intraday, volume, quote or event admission.
- IIMA's calendar status is `UNAVAILABLE` ("XBOM/weekday substitution forbidden").

**Source facts from existing artifacts.**

- **French.** The Phase 1a capture of 2026-10-07 covers MKT from 1926-07-01 to 2026-08-31 (26,317 rows), so the library lags by weeks.
- **IIMA.** The release is `2025-12_FourFactors_and_Market_Returns_Daily_SurvivorshipBiasAdjusted.csv`, with MKT from 1993-10-04 to 2025-12-31 (8,003 rows, one missing market row). India's latest possible state is therefore about nine months old today.
- **Alpaca IEX (local).** Market Regime v1.1 installed SPY/QQQ/IWM locally, outside this repository and outside the Data Organ. Daily bars run 2020-07-27 → 2026-10-02, plus 90 IEX minute sessions, with `available_at = observed_at + 900 s` (`CONSERVATIVE_MARKET_TIME`). That install uses the parallel `regime-pit/1` path in `src/regime_intelligence`. Phase 5 must not consume it directly; it must go through Data Organ admission.

**Licence.**

- `src/data/license_policy.py` `PUBLIC_RESEARCH_SOURCES` permits derived publication only for UNRATE, BLS, Ken French, IIMA and CelesTrak; `usgs:comcat` is public domain.
- `alpaca:iex`, `yfinance:*` and NSE sources have no `publish_derived` grant. The manifest shows `market:SPY`, `observatory:SPY:*` etc. as `UNAVAILABLE`/`UNVERIFIED`.
- `scripts/data_archive.verify_policy` rejects any new policy entry beyond UNRATE/BLS. Phase 5 adds no licence registration.

**Plugin SDK** (`finsight/plugins/`):

- Wrapped engines already exist for `hmm` (`src.regime.hmm_regime.train_hmm_regime_model`), `volatility-clustering` (`src.dynamics.market_regime.volatility_path`), `hawkes` (`market_regime._event_fit`) and `d0.4.2` (`compile_world`).
- `Runner.run` builds one feature row per decision from the latest visible value of each signal. Even `task="computation"` runs go through the nested split, fabricate a placeholder target, record `HOLDOUT_OPENED`, and predict only the last 20% of rows.
- The opening family is `hash(data_hash, target_hash, holdout rows)` and excludes plugin identity. Two computation plugins over the same input window would therefore raise a HIGH `REPEATED_HOLDOUT_OPENING` issue.
- **Consequence 1:** a CAPTURE_ONLY history cannot form a per-day PIT feature grid. Every historical decision before the capture clock sees nothing, so `store.frame` raises "Unavailable … at …".
- **Consequence 2:** time-series modules need a history-window read and a no-holdout computation path (§5.0).

**Run identity.**

- The `plugin-computation/2` contract binds the scoped static dependency manifest (`finsight/plugins/dependencies.py`, kernel = runner/store/model), `data_hash` and per-signal `admission_references`. Signals without a Data Organ mapping are returned as `LEGACY_UNMAPPED` instead of failing.
- Execution Git HEAD sits outside identity, and `RESULT_REUSED` prevents re-execution.
- Inlining one admission reference per signal would put tens of thousands of entries into every contract for a 25-year daily window.

**Lineage.** `src/data_organ/lineage.inspect_lineages` verifies signal → mapping → admission → source version → capture/schema/licence. It rescans each admission's observations per signal, which is quadratic at Phase 5 scale.

**HMM.** `src/regime/hmm_regime.py` provides `train_hmm_regime_model`, the plugin engine: hmmlearn `GaussianHMM`, `n_iter=100`, model object returned. It also provides `trace_hmm_fit`, the Phase 1a tracer.

- Phase 1a ran a 4-state full-history HMM on French/IIMA MKT. The US fit converged at 56 iterations; India hit the 100-iteration cap and is labelled unconverged (`docs/phase1a-terminal.md`).
- `src/regime/regime_labeling.label_regime_states` emits "Low-Vol Bullish", "Stress / Selloff", "Recovery". Phase 5 must not reuse these sentiment labels.

**D0.4.2.** The volatility vocabulary is already exactly `LOW_VOL | NORMAL | HIGH_VOL | VOL_CLUSTER | VOL_SHOCK | VOL_BREAK | UNRESOLVED`, with documented deterministic thresholds (`docs/dynamics-lab-d0-4-2.md` §1). It has no ARCH-LM and no GARCH.

- D0.4.2 already supplies seasonality (count/mean/median/MAD/percentile/robust z vs prior sessions), HAC factor regression (Bartlett lag 3), momentum statistics with a 30-sample gate, and the fracture function.
- Its seven-factor neutrality is `UNIDENTIFIABLE` without QUAL/VOL/LIQ.

**Frozen boundaries enforced in CI.**

- `scripts/research_archive.verify_shared_history` fails on any diff since Research OS baseline `651df08` under `src/dynamics`, `eval/dynamics`, `src/findings`, `src/verifiers`, `src/replay`, `src/regime_intelligence`, `frontend-v2/src/forge`, `frontend-v2/src/agents` and `docs/forge-reference.html`. Phase 5 may import from these paths but must never edit them.
- `scripts/data_archive.verify` allow-lists only `data-organ:*` public additions and `/data/*` routes, so a Phase 5 boundary is required (§8).
- D0.4.2 seals `src/dynamics/market_regime*.py` source hashes in `eval/dynamics/d0_4_2/market_regime_lab.json`.

**F4 today.** F4 is `/dynamics` (`frontend-v2/src/app/workspaces.ts`).

- `DynamicsNavigator` renders the Phase 1a `FactorRegimeEvidence` panel (`regime:US-MKT` / `regime:IN-MKT`), the authenticated Market Regime v1 product and the D0.4.2 lab.
- `verify-replay.mjs` asserts the "Public factor regime evidence" region on `/dynamics?ticker=IN-MKT`.
- Charts are hand-written SVG. There is no chart library and no new dependency is needed.

**Frozen Phase 4.**

- `data/exports/research_os_v0_1/flagship.json` holds STATISTICAL `INCONCLUSIVE`, ECONOMIC `UNAVAILABLE`, REGIME_DEPENDENCE `INCONCLUSIVE` and CROSS_MARKET `INCONCLUSIVE`.
- It used its own train-only two-state HMM and a volatility-clustering contrast on monthly-compounded factors. Phase 5 never recomputes these.

**Environment.**

- statsmodels 0.14.6 (`het_arch` available), hmmlearn 0.3.3 and scipy are installed. `arch` is not installed.
- `exchange_calendars` has XBOM but not XNSE.
- This cloud session's network policy denies the French, IIMA, Alpaca and NSE hosts (CONNECT 403). Real captures must run in GitHub Actions, on the operator's machine, or after those hosts are allowed in the environment's network settings.

## 2. Exact reusable existing modules

| Existing module | Reused for | How |
| --- | --- | --- |
| `src/data_organ/service.py`, `adapters.py`, `registry.py`, `contracts.py`, `lineage.py`, `diagnostics.py` | All inputs | Same admission, seal, quarantine, lineage and issue contracts under a Phase 5 profile |
| `src/regime_intelligence/french.py` (`parse_zip`) via `src/data_organ/adapters.factors` | French factor parsing | Imported unchanged |
| `src/regime_intelligence/alpaca.py` via `src/data_organ/adapters.alpaca` | Local IEX daily bars | Imported unchanged; local tier only |
| `finsight/plugins/model.py`, `store.py`, `contracts.py`, `dependencies.py` | Typed signals, PIT reads, scoped identity | Extended additively (§8) |
| `src/truth/run_registry.py` | Attempt chain, sealed runs, idempotent reuse | Unchanged; Phase 5 never calls `holdout()` |
| `src/dynamics/market_regime.volatility_path` | Descriptive volatility components and state | Imported unchanged (frozen D0.4.2 thresholds) |
| `src/dynamics/market_regime.seasonality` | Weekday × bucket cells | Imported unchanged; Phase 5 input adapter only |
| `src/dynamics/market_regime.hac_regression`, `POLICY` constants | HAC factor regression, factor window/minimum/lags | Imported unchanged |
| `src/dynamics/market_regime._event_fit` | Aggregate Hawkes when an admitted stream exists | Imported unchanged; never on synthetic events in real views |
| `src/dynamics/market_regime.fracture` | Partial fracture subtotal | Imported unchanged |
| `src/regime/hmm_regime.train_hmm_regime_model`, `get_hmm_regime_probabilities` | Both HMM configurations | Imported unchanged; no second HMM stack |
| `src/regime/regime_features` | Existing 4-state feature definitions | Imported unchanged |
| `statsmodels.stats.diagnostic.het_arch` | ARCH-LM | Wrapped, labelled `DIAGNOSTIC_ASYMPTOTIC` |
| `src/replay/publication.assert_derived`, `canonical_bytes` | Raw-field rejection, canonical artifacts | Imported unchanged |
| `frontend-v2/src/replay/client.ts`, `mode.tsx`, `SourceCredit.tsx`; `forge/shared/SurfacePrimitives`; `components/observatory/HMMReadout.tsx` visual language | Replay reads, mode badge, attribution, HMM readouts | Reused; observatory components are not modified |

## 3. Data Organ inputs available now

| Source | Signals / asset | Admitted window today | Clock quality | Public derived publication |
| --- | --- | --- | --- | --- |
| Ken French daily FF3 + momentum | `mkt, smb, hml, mom, rf` / `US-MKT` | 2024-01-01 → 2025-12-31 (Phase 3 profile) | CAPTURE_ONLY | Yes (`ken-french:daily-factors`) |
| IIMA daily four factors | `mkt, smb, hml, mom, rf` / `IN-MKT` | 2024-01-01 → 2025-12-31 | CAPTURE_ONLY, XNSE `UNAVAILABLE` | Yes (`iima:daily-factors`) |
| ALFRED UNRATE | `unemployment_rate` | Observations 2020-01 → 2025-12, all vintages | CONSERVATIVE_VINTAGE_DAY | Aggregated only |
| BLS LNS14000000 | `unemployment_rate` | Current mirror | CAPTURE_ONLY | Aggregated only |
| Alpaca IEX (operator import) | `market_close` / ticker | Two-year operator windows; none admitted in the repo | CONSERVATIVE_MARKET_TIME, IEX_ONLY, UNADJUSTED | No grant: local only |
| yfinance, NSE bhavcopy, India VIX | `market_close`, `vix` | None admitted | CAPTURE_ONLY | No grant: local only |
| RBI, MOSPI | — | None | PUBLICATION_TIMESTAMP_REQUIRED | Licence unverified |

The 2024–2025 factor window is too short and too old for a current regime: the US state would sit at 2025-12-31. Phase 5 therefore needs a separately versioned admission profile (decision D1). It does not change the Phase 3 catalog, its diagnostics or its published history.

## 4. US and India availability gaps

**US.**

- **SPY/QQQ/IWM and sector ETFs.** Real IEX bars exist only on the operator's machine, and there is no derived-publication grant. They are local-only and invisible in anonymous Replay.
- **Factor library and microstructure.** The French factor library is daily and lags by weeks. Consolidated volume, spreads, liquidity and order imbalance are not admitted anywhere. Intraday evidence is IEX-only, 90 sessions, local.
- **Events.** There is no admitted event stream.

**India.**

- **Market series.** There is no admitted NIFTY 50, sector index, NSE price or India VIX series. The only market series is IIMA `MKT`, last observation 2025-12-31 (STALE_INPUT).
- **Calendar.** There is no XNSE calendar evidence, so missing sessions are undetectable and session-dependent modules are unavailable.
- **Intraday and macro.** There is no intraday source. RBI/MOSPI permissions are unverified, and there are no events.

Evidence quality differs by design: US public outputs are CAPTURE_ONLY; US local outputs are CONSERVATIVE_MARKET_TIME; India outputs are CAPTURE_ONLY + CALENDAR_UNAVAILABLE + STALE_INPUT. F4 shows each row's evidence badges.

## 5. Architecture

```text
Data Organ admission (Phase 5 profile, sealed captures, quarantine, issues)
        │  SIGNAL_MAPPING bindings
        ▼
SignalStore (Parquet + DuckDB) ── window(as_of) PIT history read
        │
        ▼
Series plugins (registered, plugin-run/2 scoped identity, no holdout)
  regimes.volatility ──► derived outputs admitted as PLUGIN_OUTPUT signals
        │                       │
        │                       ▼
        ├──────────────► regimes.hmm2 (declared inputs: mkt + realized_vol_20)
        ├──────────────► regimes.hmm4-existing (declared input: mkt)
        ├──────────────► regimes.factors (mom ~ mkt, smb, hml)
        ├──────────────► regimes.momentum-view (mkt, mom, hmm2 state)
        ├──────────────► regimes.seasonality (local IEX minute signals only)
        └──────────────► regimes.events (admitted event stream only → else UNAVAILABLE)
        ▼
RunRegistry (attempts, RUN_BOUND, RUN_SEALED, RESULT_REUSED; zero HOLDOUT_OPENED)
        ▼
Lineage verification (batch) ── failure ⇒ module output UNAVAILABLE
        ▼
regimes.matrix (composition of sealed outputs; no new data)
        ▼
Positive-whitelist derived projection ──► SHA Replay artifacts ──► F4 REGIMES
                                      └─► authenticated read-only /regimes API (local)
```

### 5.0 Series-computation path (Plugin SDK extension)

- **`SeriesModel`** is a new `Model` subclass family in `finsight/plugins/series.py`.
  - It declares `series_inputs` (typed `SignalType` + asset role + minimum observations), one config schema, and `compute(windows) -> SeriesResult`.
  - Results contain `current` typed scalars, bounded `paths`, `diagnostics`, `module_status` and `issues`.
- **`SignalStore` window read** (implemented in `series.py` on top of the existing public `SignalStore.history`; `store.py` is unchanged).
  - For a cutoff it returns every observation with `observed_at ≤ as_of` and `available_at ≤ as_of`, choosing the latest vintage visible at the cutoff for each `observed_at`. Same-time ambiguity fails closed.
  - CAPTURE_ONLY data before its capture clock is invisible, so historical cutoffs earlier than a capture are UNAVAILABLE, not backfilled.
- **`SeriesRunner.compute`** writes registry events: `ATTEMPT_STARTED`, `RUN_BOUND`, `COMPUTATION_STARTED`, `RUN_SEALED` or `RESULT_REUSED`, then `ATTEMPT_COMPLETED` or `ATTEMPT_FAILED`.
  - It never fabricates a target, never ranks, never splits and never calls `RunRegistry.holdout`.
  - A model failure seals an `UNAVAILABLE` result. HMM non-convergence is not a failure: the run seals `COMPUTED` with `convergence: UNCONVERGED` and an `HMM_UNCONVERGED` issue. No seed retry is permitted.
- **Admission checks.** Inputs whose admission references come back `LEGACY_UNMAPPED` fail closed. Every input must be Data-Organ-admitted or a verified `PLUGIN_OUTPUT`.
- **Identity.** The run uses the v2 scoped dependency manifest unchanged, with a series kernel (`series.py`, `store.py`, `model.py`) chosen only for `SeriesModel` subclasses. Row-model manifests stay byte-identical.

### 5.1 Module 1 — volatility clustering

Plugin `regimes.volatility` (`src/regimes/volatility.py`), input: daily market excess return (`mkt`).

- **Descriptive components.** These come from `volatility_path` unchanged: RV 5/20/60 (RMS), EWMA λ = 0.94, 20-session sample variance, lag-1 squared/absolute-return autocorrelation, vol-of-vol, shock magnitude, persistence and the frozen state decision.
- **ARCH-LM.** `het_arch(r − mean(r), nlags=5)` over the full visible window, minimum 100 observations. It reports the LM statistic, df and asymptotic χ² p-value, labelled `DIAGNOSTIC_ASYMPTOTIC`. There is one preregistered lag choice and no multiple-testing claim.
- **GARCH(1,1)** (decision D7 as amended).
  - Production estimator: `arch.arch_model(r, mean="Constant", vol="GARCH", p=1, q=1, dist="normal", rescale=False)` on percent returns, minimum 500 observations, fitted with `cov_type="robust"` (Bollerslev–Wooldridge).
  - Outputs: μ, ω, α, β, α + β, conditional-volatility path, log-likelihood, optimizer convergence flag and `fit_status` (`CONVERGED` / `UNCONVERGED` / `BOUNDARY`). Robust SEs and p-values are labelled `DIAGNOSTIC_ASYMPTOTIC`, never calibrated.
  - Half-life `ln 0.5 / ln(α+β)` is published only when 0 < α + β < 1; otherwise `INVALID_DOMAIN` and null. It is in observation steps (sessions only where an evidenced calendar exists, so "sessions" for XNYS-backed US rows and "observations" for India).
  - Test-only reference: an independent bounded SciPy Gaussian QMLE in `tests/regimes/reference_garch.py` cross-checks parameters, log-likelihood and conditional volatility on synthetic GARCH worlds and on fixed data.
- **Provenance.** Every output carries asset, requested `as_of`, `state_at`, input hash, admission identities, evidence quality, calendar identity, plugin version, missing components and diagnostic status.
- **Derived outputs.** `realized_vol_20`, `garch_conditional_vol` and `volatility_state` are appended as `PLUGIN_OUTPUT` signals (`source = plugin:regimes.volatility`, `version = producer run_id`, `available_at = producer cutoff`). They are bound to the sealed producer run (§6.3).

### 5.2 Module 2 — HMM regime engine

Two preregistered configurations, both reported, with no selection between them:

| Config | Features | States | Engine |
| --- | --- | --- | --- |
| `hmm2-diagnostic` | `mkt` excess return; `realized_vol_20` from Module 1 (declared `PLUGIN_OUTPUT` input) | 2 | `train_hmm_regime_model(n_states=2, covariance_type="full", random_state=42)` |
| `hmm4-existing` | Phase 1a features via `src/regime/regime_features` from the admitted return window: `log_return`, `rolling_return_20`, `realized_vol_20`, `drawdown_from_252_high` | 4 | `train_hmm_regime_model(n_states=4, covariance_type="full", random_state=42)` |

- **Fitting.** Fit uses only the visible window at the cutoff (StandardScaler fit on the same window). There is no train/holdout and no state-count search. Seed 42 is fixed; there are no reruns.
- **Exposed outputs.** Filtered posteriors from a custom forward recursion over the fitted `startprob_`, `transmat_`, `means_`, `covars_`. The final filtered row is tested against hmmlearn's posterior for the final observation, where filtering and smoothing coincide. Full-sequence forward–backward probabilities are never published as historical states. Also exposed: the transition matrix, occupancy, expected duration `1/(1−p_kk)` in observations, per-state transition entropy, means and covariances in original units, `monitor_.converged`, the log-likelihood history, iteration count, the current posterior and the last 250 filtered posteriors. The state path publishes filtered argmax and confidence per observation.
- **Labelling.** A deterministic post-fit rule orders states by fitted return-feature variance in original units: `VOL_RANK_1_OF_K` (lowest) … `VOL_RANK_K_OF_K`. Per-state mean return is shown as a number only. There are no bull/bear/crash labels. The canonical permutation and its semantic hash are sealed.
- **Semantics labels.** The path within one run is `PARAMETER_RETROSPECTIVE` (parameters use data up to the cutoff; filtering is observation-causal). The state at the cutoff is the PIT-valid output. A genuine as-known-then timeline is the sequence of sealed runs at successive cutoffs.
- **Issues.**
  - `HMM_UNCONVERGED`.
  - `INSUFFICIENT_WARMUP`: below 312 observations for `hmm4-existing`, or below 120 for `hmm2-diagnostic`.
  - `LOW_STATE_OCCUPANCY`: any state under 5% or under 30 observations.
  - `REGIME_INSTABILITY`: more than 5 argmax switches in the last 20 observations.
  - `MODEL_OOD_DIAGNOSTIC`: the current feature vector's Mahalanobis distance to every state exceeds the χ² 0.999 quantile.
  - All thresholds are fixed in the profile before any real run.

### 5.3 Module 3 — volatility → HMM coupling

`hmm2-diagnostic` sees volatility only as a declared `PLUGIN_OUTPUT` input, resolved from the producer run at the same cutoff, so there is no hidden import of Module 1.

- **Identity binding.** The HMM run's lineage digest includes the producer run id and the producer's own lineage digest.
- **Changes that alter identity.** Changing the volatility implementation changes the producer manifest, then the producer run id and derived signal version, and so the HMM identity.
- **Changes that keep identity.** Appending future rows leaves the cutoff window unchanged, so the old HMM run is reused byte-for-byte. Unrelated UI or Data Organ code changes leave the manifest and admissions unchanged, so identity is the same and the result is `RESULT_REUSED`.
- **`hmm4-existing`.** This configuration keeps its existing internal feature definitions (declared dependency on `src/regime/regime_features`). That realized-vol definition is not the D0.4.2 RMS definition; the difference is disclosed rather than silently harmonised.

### 5.4 Module 4 — intraday seasonality

- **Scope.** Runs only on admitted intraday signals. Today that means nothing public. Locally it would be US IEX minute bars after the new IEX-minute admission (decision D5).
- **Engine.** The Phase 5 adapter builds the frozen D0.4.2 seasonality input and calls `seasonality` unchanged.
  - Grid: XNYS exchange-local weekday × bucket (package calendar evidence).
  - Measures: return, absolute return, vol proxy and `iex_volume`. Spread, liquidity and imbalance are absent.
  - Cell stats: count, mean, median, MAD, percentile, robust z and coverage quality.
- **Labelling and significance.** Volume is labelled `IEX_ONLY` and named `iex_volume`. It is never consolidated volume. v0.1 is descriptive only: no significance and no p-values, so there is no multiple-testing family. Any later bootstrap band would be labelled `DIAGNOSTIC_BOOTSTRAP`.
- **Publication.** Aggregated heatmaps are public only if a grant ever exists. Until then the local view shows `LOCAL ONLY · publication grant unavailable`.
- **India.** `INDIA INTRADAY SEASONALITY — UNAVAILABLE: no admitted intraday source and no evidenced XNSE session manifest.`

### 5.5 Module 5 — factor neutrality

The view is named `PARTIAL_FACTOR_DIAGNOSTIC` (US: MKT, SMB, HML, MOM; India: IIMA MKT, SMB, HML, MOM). The existing seven-factor neutrality stays `UNAVAILABLE`, because QUAL/VOL/LIQ are not invented.

- **Targets.** (a) the MOM factor return regressed on the market's other admitted factors (both markets, public); (b) local tier only: ETF excess return (`close`-to-`close` minus French `rf`, UNADJUSTED basis disclosed) on FF3 + MOM.
- **Computation.** `hac_regression` with D0.4.2 `POLICY` constants: prior-only rolling 120-window, minimum 60, Bartlett lag 3.
- **Outputs.** A full-window descriptive fit (coefficients, HAC SE `DIAGNOSTIC_ASYMPTOTIC`, R²), a rolling exposure path, a stability score, per-HMM-state fits where n ≥ max(60, 5k), and RAW vs FACTOR-EXPLAINED vs RESIDUAL decomposition with the additive identity checked. The intercept is called "intercept (descriptive)", never alpha.
- **Matrix wording.** The matrix column is "factor exposure (partial set)", never "crowding". `FACTOR_COVERAGE_PARTIAL` is always emitted.

### 5.6 Module 6 — regime-dependent momentum view (descriptive)

This is not the Phase 4 study, and nothing from Phase 4 is recomputed.

- **CURRENT MARKET-FACTOR MOMENTUM.** The 12–1 signal is `Π(1+mkt)` over observation indices [t−252, t−21] − 1. US rows use XNYS-backed session indices; India rows say "252/21 observation-index approximation · CALENDAR_UNAVAILABLE".
- **Signal by HMM state (primary panel).** The historical 12–1 signal is grouped by the `hmm2-diagnostic` filtered state at the same observation. Each group shows n, mean signal, median signal, positive-signal fraction and dispersion (MAD and sample SD). It is a distribution of the signal itself, not a return.
- **MOM FACTOR BY REGIME (separate panel).** Subtitled "cross-sectional momentum-factor diagnostic". The next-observation French/IIMA `MOM` return is grouped by the lagged filtered state: n, mean, median, positive fraction, and descriptive Sharpe only when n ≥ 30 with nonzero SD. It is never described as the return of the 12–1 market-factor signal.
- **UI separation.** A permanent split card shows "FROZEN RESEARCH OS RESULT" (the four verdicts read from SHA-pinned `data/exports/research_os_v0_1/flagship.json`) beside "CURRENT DESCRIPTIVE REGIME VIEW". Neither descriptive panel carries a verdict field.

### 5.7 Module 7 — event pressure

The plugin runs only when an event stream is admitted with genuine observation/availability clocks. It reuses `_event_fit` for aggregate intensity, baseline, branching-ratio diagnostic, near-criticality diagnostic and aggregate excitation pressure.

- **Never shown:** causal edges, directional graphs or edge confidence.
- **Today:** `EVENT PRESSURE — UNAVAILABLE: no admitted event stream` (`EVENT_STREAM_UNAVAILABLE`) for every row.
- **Fixtures:** synthetic Poisson and excitation worlds exist only in `tests/regimes/fixtures`. The Replay validator rejects any synthetic scope in `regimes` artifacts.

### 5.8 Module 8 — cross-market regime matrix (centrepiece)

**Columns.** current state, volatility stress (D0.4.2 V mapping), HMM posterior confidence, momentum state, factor exposure (partial), event pressure, data quality and evidence quality.

- **Rows.** Each row sits at its own `state_at`. Rows are never forward-filled and never rectangularised. A missing module is a `PARTIAL` cell with its reason, never zero.
- **Summaries.**
  - State agreement and divergence compare categorical vol/HMM-rank states at each row's latest `state_at` and show the date gap.
  - Volatility divergence is shown in daily units.
  - Historical agreement uses only dates present in both series (inner join on local session dates; no fill; disclosed).
  - Dispersion is computed across available rows.
  - "Leadership/rotation observations" are descriptive date-ordering notes, with no transmission or causal wording.
- **Lineage.** Every cell links to its producing run and its lineage chain.

### 5.9 Upgrade-plan items reconciled

- **Fracture landscape.** Only the volatility component (V) is observable for these series; correlation is degenerate for the market factor itself. F4 shows a `PARTIAL SUBTOTAL` using frozen `fracture`. The six-component score and the 3D landscape are `UNAVAILABLE`, because spreads, liquidity, events and seven factors are missing.
- **Hawkes → HMM input-output HMM and its OOS log-likelihood gate.** `UNAVAILABLE`, because no admitted event stream exists. Any future gate needs its own preregistration, would be a supervised-style holdout evaluation, and is outside this phase.

## 6. Proposed schemas and contracts

### 6.1 Profile `eval/regimes/v0.1/profile.json` (frozen before any real run)

- **Admission windows.** `US-MKT` 2000-01-01 → last observation in the capture; `IN-MKT` 2000-01-01 → last observation (2025-12-31 in the current release). Local ETFs use two-year operator imports, concatenated.
- **Fixed parameters.** Feature definitions, HMM configs, seeds, ARCH lag, GARCH start/constraints, warm-up minimums and issue thresholds.
- **Labels.** Calendar identities (`XNYS` package evidence; India `CALENDAR_UNAVAILABLE`) and the claim policy.
- **Hash.** Profile hash `sha256` is bound into every run contract.

### 6.2 Series computation contract `plugin-series-computation/1`

`tenant_id, asset, as_of, seed, plugin_version, declarations, code (v2 scoped manifest), config, scope, profile_sha256, calendar, evidence_quality[], lineage { data_hash, lineage_digest, admissions[] (distinct admission ids), source_versions[], producer_runs[] }`.

- `lineage_digest` is the canonical hash of sorted per-signal bindings; the full binding list stays in the local registry.
- The run result schema is `plugin-series-run/1`. It is separate from `plugin-run/2`, so neither existing schema is reinterpreted, but it reuses the identical scoped dependency identity.
- Execution provenance (Git HEAD, runtime) is recorded outside identity.

### 6.3 Derived output admission `PLUGIN_OUTPUT`

`{signal_id, signal_sha256, kind: "PLUGIN_OUTPUT", source_version_id: producer_run_id, producer_result_sha256, producer_lineage_digest, output_name}`.

- It is stored through the existing `SignalStore.append(admissions=...)`.
- Verification re-reads the sealed producer run and checks that value, clock and output name match.

### 6.4 API and Replay envelope `regimes/1`

`schema_version, asset, market, requested_as_of, state_at, input_hash, run_id(s), evidence_scope, source_lineage, evidence_quality, calendar, module_statuses{module: AVAILABLE|PARTIAL|UNAVAILABLE|LOCAL_ONLY + reason}, issues[], claims{all false}, payload`.

- **Payload kinds:** `snapshot`, `timeline`, `seasonality`, `factors`, `events`, `matrix`, `lineage`.
- **Whitelist:** a positive field whitelist per kind. Raw factor returns, prices, volumes and vintage matrices are rejected; `assert_derived` runs on every artifact.

### 6.5 Issue hooks

Deterministic id = `hash(kind, asset, run_id or evidence id)`. Each issue has severity, evidence links, first-seen time and append-only status.

Kinds: `HMM_UNCONVERGED, INSUFFICIENT_WARMUP, LOW_STATE_OCCUPANCY, REGIME_INSTABILITY, FACTOR_COVERAGE_PARTIAL, CALENDAR_UNAVAILABLE, EVENT_STREAM_UNAVAILABLE, STALE_INPUT, SOURCE_RESTRICTED, INPUT_LINEAGE_INVALID, INTRADAY_COVERAGE_LOW, MODEL_OOD_DIAGNOSTIC`.

`STALE_INPUT` fires when `requested_as_of − state_at` exceeds 10 sessions (US) or 10 observations (India). This phase builds no portfolio Risk Manager.

### 6.6 Read-only authenticated routes `/regimes/*`

`/regimes/assets`, `/snapshot?asset=&as_of=`, `/compare?asset=&left=&right=` or `?assets=US-MKT,IN-MKT`, `/timeline`, `/seasonality`, `/factors`, `/events`, `/matrix`, `/lineage/{run_id}`.

- GET routes read sealed runs and admitted local evidence only. They never fetch upstream and never write registry events. New cutoffs are computed by an explicit operator command.
- Responses use the §6.4 envelope. Status codes: 404 for UNAVAILABLE, 409 for lineage/seal failure, 422 for invalid input.
- The prefix `/regimes` is distinct from the existing `/regime` routes.

## 7. Exact files to ADD

| Path | Purpose |
| --- | --- |
| `finsight/plugins/series.py` | `SeriesModel`, PIT window read over `SignalStore.history`, `SeriesRunner` (no holdout), series contract |
| `finsight/plugins/derived.py` | `PLUGIN_OUTPUT` admissions and verification against sealed producer runs |
| `src/regimes/__init__.py` | Public API |
| `src/regimes/contracts.py` | Envelope, statuses, evidence propagation, claims, issue kinds |
| `src/regimes/profile.py` | Loads/validates the frozen profile and its hash |
| `src/regimes/volatility.py` | Module 1 adapter: `volatility_path`, ARCH-LM wrapper |
| `src/regimes/garch.py` | `arch` GARCH(1,1) wrapper with robust covariance, fit status, half-life domain |
| `src/regimes/hmm.py` | Module 2 adapters, filtered posteriors, deterministic labelling, persistence/entropy/OOD |
| `src/regimes/seasonality.py` | Module 4 input adapter to frozen `seasonality`; IEX labelling |
| `src/regimes/factors.py` | Module 5 partial-factor diagnostic, raw/explained/residual |
| `src/regimes/momentum.py` | Module 6: 12–1 market-factor signal by HMM state; separately named MOM-factor diagnostic; frozen-verdict reader |
| `src/regimes/events.py` | Module 7 admitted-stream gate and aggregate Hawkes diagnostics |
| `src/regimes/matrix.py` | Module 8 composition and descriptive summaries |
| `src/regimes/plugins.py` | Registered series plugins and explicit dependency declarations |
| `src/regimes/lineage.py` | Batch chain verification, including derived outputs; failure ⇒ UNAVAILABLE |
| `src/regimes/service.py` | Operator pipeline per asset/cutoff and read-only projections |
| `src/regimes/publication.py` | Positive-whitelist derived projection and validation |
| `backend/routes/regimes.py` | Authenticated read-only GET routes |
| `eval/regimes/v0.1/profile.json` | Frozen windows, features, configs, thresholds, calendars |
| `scripts/collect_regime_inputs.py` | Data Organ admission under the Phase 5 profile (network optional, operator/Actions) |
| `scripts/run_regimes.py` | Explicit computation at a cutoff; idempotent; no holdout |
| `scripts/export_regimes_replay.py` | Derived publication and retained history; no model execution |
| `scripts/verify_regimes.py` | Read-only audit: SHA, lineage, claims, zero openings, profile binding |
| `scripts/regimes_archive.py` | Phase 5 boundary vs `1a0d03d`: earlier bytes frozen, only reviewed `regimes:*` additions |
| `tests/regimes/__init__.py`, `tests/regimes/conftest.py`, `tests/regimes/fixtures/` (deterministic synthetic controls generated in-test) | Shared test setup |
| `tests/regimes/test_series_runner.py` | No-holdout path, reuse, LEGACY_UNMAPPED rejection, identity |
| `tests/regimes/test_derived_lineage.py` | Producer binding, coupling identity cases |
| `tests/regimes/test_pit_sabotage.py` | Test family A |
| `tests/regimes/test_lineage_sabotage.py` | Test family B |
| `tests/regimes/test_calendar_sabotage.py` | Test family C |
| `tests/regimes/test_hmm.py` | Test family D |
| `tests/regimes/test_volatility.py`, `tests/regimes/test_garch.py`, `tests/regimes/reference_garch.py` | Test family E; independent SciPy reference GARCH used only for differential checks |
| `tests/regimes/test_seasonality.py` | Test family F |
| `tests/regimes/test_factors.py` | Test family G |
| `tests/regimes/test_events.py` | Test family H |
| `tests/regimes/test_matrix.py` | Test family I |
| `tests/regimes/test_momentum_view.py` | Frozen-verdict separation |
| `tests/regimes/test_publication.py`, `tests/regimes/test_api.py` | Test family J |
| `tests/regimes/test_archive_boundary.py` | Earlier evidence immutability |
| `frontend-v2/src/regimes/RegimeIntelligence.tsx` | F4 product: header, NOW/REPLAY/COMPARE, top row |
| `frontend-v2/src/regimes/panels.tsx` | Timeline, volatility, HMM probabilities, transition matrix, seasonality, factors, momentum, events (dense SVG) |
| `frontend-v2/src/regimes/CrossMarketMatrix.tsx` | Module 8 |
| `frontend-v2/src/regimes/LineageDrawer.tsx` | "Why is this regime state available?" chain |
| `frontend-v2/src/regimes/ModuleUnavailable.tsx` | Unavailable/partial/local-only card |
| `frontend-v2/src/regimes/contracts.ts` | Fail-closed validators and whitelist |
| `frontend-v2/src/regimes/query.ts` | SHA Replay reads and authenticated local reads |
| `frontend-v2/src/regimes/regimes.css` | Forge tokens, responsive layout |
| `frontend-v2/scripts/verify-regimes.mjs` | Static contract attacks and Chrome/Edge/Firefox QA |
| `docs/phase5-real-regimes.md` | Architecture, formulas, limitations, operation, interpretation |
| `docs/findings/real-regimes-v0.1.md` | Written only after actual runs, from observed evidence |
| `docs/screenshots/phase5-regimes-{us-now,us-replay,us-compare,india-now,matrix}-1440.png`, `docs/screenshots/phase5-regimes-{us-now,india-now,detail}-390.png` | Genuine production Replay captures |

## 8. Exact files to CHANGE

| Path | Bounded change |
| --- | --- |
| `pyproject.toml` | Add `arch>=8,<9` (production GARCH estimator, decision D7) |
| `finsight/plugins/dependencies.py` | Select the series kernel for `SeriesModel` subclasses only; row-model manifests unchanged |
| `finsight/plugins/__init__.py` | Export `SeriesModel` |
| `src/data_organ/adapters.py` | Additive `alpaca_intraday` (IEX minute `iex_bar_close`, `iex_bar_volume`, LOCAL_ONLY), only if D5 is approved; existing adapters unchanged |
| `backend/main.py` | Register the `/regimes` router |
| `scripts/data_archive.py` | Delegate reviewed `regimes:*` identities and `/regimes/*` routes to `scripts/regimes_archive.py`; Phase 3 checks unchanged |
| `frontend-v2/src/dynamics/DynamicsNavigator.tsx` | Render `RegimeIntelligence` first; keep the Phase 1a panel and the v1/D0.4.2 surfaces reachable unchanged |
| `frontend-v2/src/app/command/mnemonics.ts` | `<ASSET> REG` deep-links with `asset`/`mode` URL state; existing commands unchanged |
| `frontend-v2/scripts/verify-replay.mjs` | Include Phase 5 routes in zero-request/zero-vendor and raw-field checks |
| `frontend-v2/scripts/verify-shell.mjs` | F4 deep-link and URL-state cases; F5/F7 and text-focus assertions unchanged |
| `frontend-v2/public/replay-manifest.json` | Append-only `regimes:*` entries and `/regimes/*` routes; all earlier entries retained |
| `.github/workflows/ci.yml` | Add `verify_regimes.py`, the boundary audit and `verify-regimes.mjs` (static + browser) |
| `.github/workflows/organs.yml` | Only if D6 is approved: after the Data Organ refresh, run the Phase 5 pipeline and stage only `data/exports/regimes_v0_1` + `regimes-*.json` + the manifest; the plugin reference stays verify-only |
| `tests/data_organ/test_archive_reconciliation.py` | Only if D6 is approved: extend the pinned staging line by the Phase 5 paths; keep the no-plugin-execution assertions |

Not changed (enforced): everything under `src/dynamics`, `eval/dynamics`, `src/replay`, `src/regime_intelligence`, `src/findings`, `src/verifiers`, `frontend-v2/src/forge`, `frontend-v2/src/agents`, `docs/forge-reference.html`, `src/regime/*`, `src/data/license_policy.py`, `eval/data-organ/v0.1/*`, `finsight/plugins/runner.py`, `finsight/plugins/store.py`, `finsight/plugins/engines.py`, all frozen exports and all earlier public artifacts.

## 9. Files to DELETE

None.

## 10. Source, licence and publication implications

- **Public Replay scope.** Only outputs derived from `ken-french:daily-factors` and `iima:daily-factors` are public, with their existing attribution and `publish_derived` status. Artifacts list sources, licence resolution and attribution.
- **Local-only scope.** SPY/QQQ/IWM/sector ETFs (Alpaca IEX) and any yfinance/NSE input stay local. Anonymous Replay shows those rows as `LOCAL ONLY · no derived-publication grant` with no numbers.
- **Registrations.** No new licence registration or grant is added, and the Phase 3 policy audit stays strict.
- **Positive whitelist.** The whitelist excludes raw factor returns, prices, volumes and any per-observation vendor value. States, posteriors, volatility/GARCH paths, coefficients, aggregates and counts are derived. Price-derived local series are never projected publicly.
- **Data Organ tenant.** Phase 5 admissions use a separate tenant `public-regime-evidence` (decision D2) with the same Data Organ code and contracts, so F10's Phase 3 publication and history do not change.

## 11. Plugin dependency manifests

Each series plugin declares `computation_dependencies` explicitly. Unresolved or dynamic dependencies fail closed (existing v2 rule).

| Plugin | Declared computation roots (besides series kernel) |
| --- | --- |
| `regimes.volatility` | `src.regimes.volatility`, `src.regimes.garch`, `src.dynamics.market_regime:volatility_path`, statsmodels `het_arch`, `arch` |
| `regimes.hmm2` | `src.regimes.hmm`, `src.regime.hmm_regime:train_hmm_regime_model`, hmmlearn, scikit-learn, scipy |
| `regimes.hmm4-existing` | the above + `src.regime.regime_features` |
| `regimes.factors` | `src.regimes.factors`, `src.dynamics.market_regime:hac_regression`, `POLICY` |
| `regimes.momentum-view` | `src.regimes.momentum` |
| `regimes.seasonality` | `src.regimes.seasonality`, `src.dynamics.market_regime:seasonality` |
| `regimes.events` | `src.regimes.events`, `src.dynamics.market_regime:_event_fit` |

The Data Organ code, the API, the UI and the matrix composition are outside every computation closure. Tests prove that an unrelated `src/data_organ` or `frontend-v2` commit leaves each manifest and run identity unchanged.

## 12. Testing matrix

| Family | Cases | File |
| --- | --- | --- |
| A PIT / leakage | Future price, factor revision, macro release, event and volatility rows each leave the old cutoff byte-identical with no recompute; target-named input rejected; normaliser fit outside the visible window rejected; capture-only data invisible before its capture clock | `test_pit_sabotage.py` |
| B Lineage | Changed source bytes, admission hash, source/version mismatch, backdated `available_at`, stripped timezone and removed licence grant each fail closed or make public Replay unavailable; lineage failure makes the output UNAVAILABLE, never a cached value | `test_lineage_sabotage.py`, `test_derived_lineage.py` |
| C Calendar | XNSE unavailable gives no weekday/XBOM grid; calendar version change changes diagnostic identity; invalid early close/session gives explicit unsupported | `test_calendar_sabotage.py` |
| D HMM | Fixed-seed determinism; filtered-posterior prefix invariance (future observations never change an earlier filtered row under fixed parameters); final filtered = hmmlearn posterior; a smoothed path is rejected by the publication validator; transition and posterior rows sum to 1; label determinism under permuted init; relabelling changes semantic hash; unconverged run retained with no retry; India durations in observations | `test_hmm.py` |
| E Volatility | Constant series; IID Gaussian (no clustering, ARCH-LM diagnostic only); ARCH and GARCH synthetic controls (parameters recovered within tolerance); `arch` vs SciPy reference agreement on parameters, log-likelihood and conditional volatility; shock/recovery world; return scaling (α, β invariant, ω scales); no NaN/Inf; half-life `INVALID_DOMAIN` for α + β ≥ 1 | `test_volatility.py`, `test_garch.py` |
| F Seasonality | Planted time-of-day effect recovered; shuffled timestamps destroy it; missing sessions stay missing; DST transition; `iex_volume` never becomes consolidated volume | `test_seasonality.py` |
| G Factors | Known-beta, zero-beta, missing factor, future factor clock, partial set never labelled seven-factor; raw = explained + residual | `test_factors.py` |
| H Hawkes | No stream → UNAVAILABLE; Poisson control has no high excitation; excitation fixture works as an engineering test; real pipeline rejects synthetic scope | `test_events.py` |
| I Matrix | Differing timestamps never fill; missing India module gives a partial row, not zero; asset rename numerically invariant | `test_matrix.py` |
| J Replay/API | GET never fetches upstream or writes registry events; unauthenticated 401; SHA mismatch, unknown schema or elevated claim → unavailable; anonymous Replay zero API/vendor requests | `test_publication.py`, `test_api.py`, `verify-regimes.mjs` |
| No-holdout | `Runner.run` and `RunRegistry.holdout` patched to fail across the whole pipeline and scheduler replay; zero `HOLDOUT_OPENED` in the Phase 5 registry; Phase 2 public-fixture registry never restored into it | `test_series_runner.py` |
| Boundary | All pre-`1a0d03d` public bytes, Phase 0–4 exports and Phase 3 history unchanged; only reviewed `regimes:*` additions | `test_archive_boundary.py`, `regimes_archive.py` |
| Module 6 semantics | Primary panel aggregates the 12–1 signal, never a return; MOM-factor panel separately named; Research OS verdict card byte-bound to `flagship.json`; descriptive panels have no verdict field | `test_momentum_view.py` |

## 13. Browser and Replay plan

**Browser QA.** `verify-regimes.mjs` runs Chrome, Edge and Firefox at 1440 and 390 against the production preview.

- Coverage: NOW/REPLAY/COMPARE tabs, cutoff scrubber, asset and market switch, every panel, the lineage drawer, unavailable cards, keyboard navigation, F4 native key, F5/F7 unchanged, text-field focus and the command palette.
- Expectations: zero failed requests, zero API/vendor traffic in anonymous Replay, and SHA-exact artifacts.
- Sabotage: changed bytes, unknown schema, elevated claim, synthetic scope and a raw field each give a fail-closed render.

**REPLAY for public rows.** REPLAY means sealed runs at genuine cutoffs. For CAPTURE_ONLY rows those cutoffs are actual capture clocks, which accumulate as captures are retained. The within-run retrospective path is scrubbable but labelled `PARAMETER_RETROSPECTIVE`, not PIT.

**Final checks.** Vercel preview: green, and served `replay-manifest.json` bytes equal committed bytes.

## 14. Performance plan

| Measure | Target | Method |
| --- | --- | --- |
| Pipeline per asset/cutoff (vol + GARCH + 2 HMMs + factors) | < 60 s local, < 120 s on an Actions runner | Timed in `run_regimes.py`, recorded in receipt |
| Lineage verification (~70k signals) | < 10 s | Indexed batch join instead of the quadratic per-signal scan |
| `/regimes/snapshot` from sealed runs | p95 < 300 ms local | Pytest timing with a seeded registry |
| Replay artifacts | ≤ 300 KB each, ≤ 2 MB total for Phase 5 | Export receipt |
| Bundle delta | Lazy F4 chunk ≤ 120 KB gzip, no new npm dependency | Build stats before/after |
| F4 render | No long task > 200 ms at 1440 after data load | Playwright performance marks |

No 3D rendering is added; all Phase 5 views are dense 2D SVG.

## 15. Generated artifacts (after approval, from actual runs only)

- **Derived exports.** `data/exports/regimes_v0_1/receipt.json`, `runs.json`, `lineage.json`, `issues.json`, `manifest.json`, plus content-addressed historical copies. These hold derived values and identities only.
- **Replay artifacts.** `frontend-v2/public/artifacts/replay/regimes-{snapshot,timeline,factors,momentum,matrix,lineage}-<sha256>.json` for `US-MKT` and `IN-MKT`, and manifest entries `regimes:<kind>:<sha256>` with routes `/regimes/<kind>?asset=...`.
- **Screenshots.** The eight `docs/screenshots/phase5-regimes-*.png` files.
- **Local only (ignored).** Phase 5 Data Organ and plugin runtimes, the signal store, raw captures, local ETF and IEX-minute admissions and their local projections.

## 16. Risks

| Risk | Mitigation |
| --- | --- |
| The public product is a market factor, not SPY/NIFTY, which may disappoint | Labelled everywhere; local tier shows real ETFs; findings say what was and was not possible |
| CAPTURE_ONLY gives no historical PIT replay for public rows | Honest REPLAY semantics (§13); capture history accrues nightly if D6 is approved |
| India state is about nine months stale | `STALE_INPUT` issue and visible date gap; no extrapolation |
| HMM non-convergence | Retained and shown; no reruns |
| A small grid of thresholds looks like tuning | All thresholds are frozen in the profile before the first real run, and the profile hash is bound into runs |
| GARCH optimiser edge cases | `arch` estimator with explicit fit status, boundary flag, domain-checked half-life, synthetic controls and an independent test-only reference |
| Lineage scale and performance | Batch verification, lineage digest instead of inline references |
| Boundary verifiers break | Phase 5 audit plus a narrow delegation, same pattern Phase 3 used |
| Network-blocked capture in this session | Real runs in Actions or on the operator machine, or after the hosts are allowed |
| Descriptive momentum view read as a new verdict | Permanent split card; no verdict field; frozen verdicts byte-bound |

## 17. Implementation sequence (after approval)

1. Series SDK path, derived-output admissions, batch lineage, no-holdout and identity tests.
2. Profile + Phase 5 Data Organ admissions (tenant D2, window D1) with sabotage tests.
3. Modules 1–3 (volatility, GARCH, ARCH-LM, both HMMs, coupling) with families A/B/D/E.
4. Modules 5–6 and 7's unavailable gate, then the matrix; families G/H/I and frozen-verdict separation.
5. Module 4 and the local tier (only if D5 is approved).
6. Publication, boundary audit, read-only API, F4 UI, browser/Replay checks.
7. Real runs in Actions or on the operator machine, then derived artifacts, screenshots and findings written from observed evidence.
8. Full verification (§ acceptance gates), then one Phase 5 review PR. It is not merged automatically.

## Explicit answers

**Which real US inputs can Phase 5 use today?**

- Publicly: Ken French daily MKT/SMB/HML/MOM/RF (`US-MKT`), CAPTURE_ONLY, once admitted under the Phase 5 window.
- Locally only: Alpaca IEX daily bars for SPY/QQQ/IWM (and sector ETFs if imported) via Data Organ operator import, CONSERVATIVE_MARKET_TIME.
- IEX minute bars, locally, only after the D5 admission.
- ALFRED UNRATE is admitted but not used by v0.1 modules.

**Which real India inputs can Phase 5 use today?** Only IIMA daily MKT/SMB/HML/MOM/RF (`IN-MKT`), CAPTURE_ONLY, with the last observation on 2025-12-31 and the XNSE calendar unavailable. There is no NIFTY 50, sector index, NSE price, India VIX or intraday data.

**Which Phase 5 requirements are impossible with current evidence?**

- Public SPY/QQQ/IWM/sector ETF outputs.
- Any NIFTY 50 or NSE sector series.
- India intraday or session-dependent seasonality.
- US consolidated volume, spread or liquidity seasonality.
- Hawkes event pressure for either market.
- The Hawkes-driven input-output HMM and its gate.
- The full fracture score and 3D landscape.
- Seven-factor neutrality.
- Historical-cutoff PIT replay of factor-derived outputs before their capture clock.
- A current India state.
- Any calibrated or inferential claim.

**Can we run real HMM for both markets?** Yes, on market-factor returns. US: CAPTURE_ONLY. India: CAPTURE_ONLY, `PARTIAL · CALENDAR_UNAVAILABLE · STALE_INPUT`, with transitions and durations per observed record (never days or sessions) and no annualisation (decision D4 as amended). Locally on SPY/QQQ/IWM with CONSERVATIVE_MARKET_TIME. Unconverged fits are retained.

**Can we run intraday seasonality for both markets?** No. US is possible only locally on 90 IEX-only sessions after a new admission (D5), and is never public without a grant. India is UNAVAILABLE.

**Can we run Hawkes for either market?** No. No event stream is admitted. Both rows show `EVENT PRESSURE — UNAVAILABLE`.

**What exact evidence would unblock anything unavailable?**

- **Public ETFs.** A verified market-data licence review permitting derived publication for `alpaca:iex`, recorded as a tenant `publish_derived` grant with a reviewed policy-audit change, or another licensed source.
- **India market series.** An admitted official NSE/NSE Indices source with publication permission.
- **India sessions and intraday.** Evidenced XNSE session manifests (official holiday and session-timing circulars) for the window.
- **India freshness.** A newer IIMA release.
- **US consolidated intraday.** A licensed consolidated feed with quotes.
- **Events.** An admitted event stream with genuine clocks and licence.
- **Seven factors.** Documented QUAL/VOL/LIQ series.
- **Historical PIT for factor rows.** Accumulated captures, or vintage archives at matching frequency.

**Which outputs are CAPTURE_ONLY versus stronger PIT evidence?**

- CAPTURE_ONLY: everything derived from French/IIMA.
- Stronger, CONSERVATIVE_MARKET_TIME (a disclosed reconstruction rule, not witnessed receive time): local SPY/QQQ/IWM outputs.
- Nothing in scope has publication-timestamp or receive-timestamp evidence at scale.
- Outputs inherit the weakest input quality and list every quality present.

**How will Phase 5 avoid reopening any existing holdout?**

- Series computations have no target and never call `RunRegistry.holdout`.
- Phase 5 uses its own tenants and registries and never restores the Phase 2 public-fixture registry.
- There is no supervised model in v0.1, and the IOHMM OOS gate is deferred.
- The Phase 2 reference stays verify-only, and the Phase 4 study is read-only.
- Tests patch `Runner.run` and `RunRegistry.holdout` to fail across the pipeline and the scheduler, and assert zero openings.

**How will the scoped identity bind upstream Data Organ lineage?**

- Each series contract carries the v2 scoped code manifest, `data_hash` over the exact input signal payloads, and `lineage_digest` over every per-signal binding: admission id and seal, source version, capture hash, schema hash and licence-resolution hash, or the producer run for derived inputs.
- It also carries the distinct admission ids, source versions, producer runs and the profile hash.
- New source bytes, an admission change or a producer implementation change therefore change identity. Unrelated code does not.

**Which old synthetic worlds remain test-only fixtures?** D0.4.2 demo-full/demo-sparse (`eval/dynamics/d0_4_2/market_regime_lab.json`, seed 642011), `src/dynamics/market_regime_fixture.py`, the Phase 2 synthetic PIT fixture (`eval/plugins/nervous-system-v0.1/pit-fixture.json`), Market Regime v1 `DEMO` sources, the D0.4–D0.4.1.1 Hawkes event worlds, the D0.3.x OU/nonlinear worlds, and the Research OS null/planted calibration worlds. Real F4 views never read them, and the Replay validator rejects synthetic scope.

**What will F4 display when a module is unavailable?** A `ModuleUnavailable` card. It contains:

- The module name and status (`UNAVAILABLE`, `PARTIAL` or `LOCAL ONLY`).
- The exact reason and the missing evidence.
- What would unblock it.
- The linked issue ids and the evidence badges.

It shows no chart skeleton, placeholder number or greyed fake data. Partial modules render only the available components, with an explicit partial subtotal where a total would otherwise appear.

## Decisions as proposed (resolved)

All ten were resolved by the review decision at the top of this document, which governs where it differs from the recommendations below.

| Id | Decision | Recommendation |
| --- | --- | --- |
| D1 | Phase 5 factor admission window | 2000-01-01 → last captured observation for both markets, frozen in the profile before outputs |
| D2 | Data Organ tenant for Phase 5 admissions | Separate `public-regime-evidence` tenant using the same Data Organ code; F10 stays Phase 3. Alternative: same tenant, so F10 shows the longer window and Phase 3 counts change |
| D3 | Time-series plugin mechanism | New `SeriesModel` no-holdout path with lineage digest (§5.0). Alternative: per-decision JSON window signals inside existing v2 contracts (much larger, redundant admissions) |
| D4 | India daily modules without calendar evidence | Run vol/GARCH/HMM on the IIMA observation sequence as `PARTIAL · CALENDAR_UNAVAILABLE · STALE_INPUT`; annualised and session-dependent outputs unavailable. Alternative: mark India daily modules UNAVAILABLE |
| D5 | Local tier (SPY/QQQ/IWM, sector ETFs, IEX-minute admission for US seasonality) | Include as local-only, verified on the operator's machine; never public |
| D6 | Nightly automation | Add a Phase 5 step to `organs.yml` that publishes only when admitted factor content changes, so genuine capture-clock replay history accrues. Alternative: operator-only publication in v0.1 |
| D7 | GARCH implementation | **Decided:** `arch` package in production; SciPy reference in tests only |
| D8 | Fracture landscape and IOHMM | Show both as PARTIAL/UNAVAILABLE with reasons; no IOHMM gate in this phase |
| D9 | Where real captures run | GitHub Actions (`workflow_dispatch` on the branch) or the operator machine. This session's network policy blocks the French, IIMA, Alpaca and NSE hosts unless they are allowed in the environment settings |
| D10 | Badge wording for authenticated local views | `LOCAL MODEL RUN · run_id` instead of `LIVE MODEL RUN`, because GET routes read sealed runs and no live feed exists |

## Acceptance gates

- At least one genuine end-to-end public US run (`US-MKT`): Data Organ → Signal Store → series plugins → registry → Replay → F4.
- India either runs genuinely with its PARTIAL/STALE labels or shows precise unavailable states. Evidence requirements are not weakened.
- Zero `HOLDOUT_OPENED` events in Phase 5 registries. Phase 2's three v1 runs, Phase 3 Data Organ history, Phase 4 exports, D0.x evidence and all earlier public bytes are byte-identical (boundary audits pass).
- Full Linux pytest.
- Every historical verifier: Forge, the 13 Dynamics verifiers, Research OS, inference calibration, plugin Replay, Data Organ, archive, authorship, licence and truth-contract.
- Frontend: lint, Prettier, TypeScript, production build and every `verify-*.mjs`.
- Chrome/Edge/Firefox at 1440/390.
- Replay with zero failed and zero vendor requests.
- Vercel green, with served manifest bytes equal to committed bytes.
- All claim flags false in every artifact, envelope and UI contract.
- Findings and the three-sentence Postable result written only from actual sealed runs, with the exact screens to record.
