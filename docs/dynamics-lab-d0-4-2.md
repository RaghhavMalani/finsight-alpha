# D0.4.2 — Market Regime Intelligence Lab

## Release scope

D0.4.2 ships five connected product-analytics modules in one Dynamics surface: volatility clustering, intraday seasonality, factor neutrality, regime-dependent momentum, and a deterministic regime-fracture landscape. Existing Hawkes fits supply aggregate event diagnostics only. This is an integrated product iteration, not another estimator tournament or a promotion of earlier research verdicts.

The default `/dynamics` screen is now Market Regime Intelligence. All earlier Dynamics milestones remain individually addressable in the program ledger. The dense read-only console presents the current state, an inspectable 3D parameter surface, its historical optimizer trail, module-level evidence, missing-data states, and an expandable policy ledger.

Release branch: `dynamics/d0.4.2-market-regime-intelligence`, based on frozen D0.4.1.1 commit `0383d7d84db6944f1cc82614ce5bd76ad91a870d`. This document does not claim that the branch has merged into `main`.

The shipped reference has **two synthetic integration worlds, each containing 420 published sessions**. These are not 420 independent experiments, not market history, and not a 2007–2026 backtest. Their weekday calendar deliberately ignores exchange holidays. The full fixture contains synthetic prices, volume, factor returns, strategy returns, spreads, liquidity, macro releases, imbalance, and events. The sparse fixture removes strategy returns, six factors, spreads, liquidity, macro, and events to exercise honest unavailability. Neither supplies trade counts.

All experimental claim fields remain false:

```json
{
  "market_claim_eligible": false,
  "causal_claim_eligible": false,
  "validated_alpha": false,
  "trusted_graph": false,
  "precise_edge_confidence": false
}
```

## Architecture and use

```text
Published daily/intraday bars + supplied factor/macro vintages + aggregate events
                                |
              shared AsOfContext observation/availability filter
                                |
           server-side volatility / factors / seasonality / momentum
                       + fixed-fit Hawkes diagnostics
                                |
                   state vector + fracture component ledger
                                |
           lagged-state policy replay -> grid + historical optimum path
                                |
                authenticated read-only API -> typed console
```

The browser selects a world, publication cutoff, heatmap measure/cell, landscape color, parameter point, and trail visibility. It does not calculate research scores, refit models, alter policy, or write artifacts. TanStack Query caches the whole projection; the integrated lab is lazy-loaded instead of importing a new WebGL engine. The 3D SVG is an isometric rendering of actual objective values, not generated terrain. Its native point selector exposes all 121 vertices and the six raw/weighted objective components. Historical trail points retain their own window objective heights.

Authenticated endpoints:

| Method and path | Contract |
| --- | --- |
| `GET /dynamics/regime-intelligence/worlds` | Full/sparse demo registry and availability of the local PIT input |
| `GET /dynamics/regime-intelligence?world=demo-full` | Frozen latest full reference |
| `GET /dynamics/regime-intelligence?world=demo-sparse` | Frozen missing-data control |
| `GET /dynamics/regime-intelligence?world=pit-local&as_of=...` | Compile an explicitly versioned local input at the requested aware ISO cutoff |

`as_of` is optional for every world. Without it, the cutoff is the latest published bar in the dataset, **not a claim of live data**. Historical selections trigger bounded cached server computation. A missing local dataset returns 404; corrupt frozen evidence returns 409; unknown worlds, invalid timestamps, or invalid data return 422. There are no mutation endpoints. Existing session authentication applies.

## Local PIT input: no automatic downloads

Install a separately prepared JSON input at:

```text
<FINSIGHT_DATA_DIR>/regime_intelligence/world.json
```

The catalog reports `UNAVAILABLE` when no input is installed. D0.4.2 does not download provider data or manufacture macro, factor, order-book, trade, or publication fields. Existing provider frames can use `bars_from_market_frame` only when they already contain genuine `Date`, `available_at`, `Close`, and `Volume` columns. A retrieval timestamp is not substituted for a historical release timestamp.

The authoritative schema is `src/dynamics/market_regime_inputs.py`, version `market-regime-input/0.4.2`. Required world metadata: `id`, `ticker`, `evidence_scope`, `source`, `revision`, `price_basis`, `calendar_note`, and `daily`. Exchange timezone defaults to `America/New_York`; bucket/session lengths and annual session count are explicit. Local mode requires `PIT_LOCAL` and non-synthetic price basis. The source/revision labels are user-supplied provenance, not independently attested market certification.

Every row requires timezone-aware `observed_at` and `available_at`, with availability no earlier than observation. Daily and intraday bars are immutable, strictly observation-ordered, with monotone publication order. Factor and macro revisions can arrive later; same-time ambiguous vintages are rejected. Events must have strictly increasing aggregate timestamps. Non-finite data and unknown fields are rejected. Bounds include 2,000 daily bars, 50,000 intraday bars, 20,000 factor/macro rows each, 50,000 events, and a 64 MB local file limit.

| Stream | Fields / units |
| --- | --- |
| Daily/intraday bars | Positive `close`, nonnegative `volume`; optional decimal `strategy_return`, `spread_bps`, consistently defined nonnegative `liquidity`, `order_imbalance` in [-1,1], nonnegative `trade_count` |
| Factor vintages | `values` dictionary using supplied `MKT/SMB/HML/MOM/QUAL/VOL/LIQ` decimal simple returns; `revision` |
| Macro vintages | `series`, finite `value`, `direction` (`HIGH_IS_STRESS` or `LOW_IS_STRESS`), `revision` |
| Aggregate events | Observation and availability timestamps; no causal identity inferred |

Factor definitions must be documented by the input provider. The schema does not silently map ETFs to factors or turn percent returns into decimals. Strategy and factor series must use compatible return conventions. `MKT` is used exactly as supplied: callers wanting an excess-return regression must provide consistently excess-return strategy/factor data. `UNADJUSTED` prices carry corporate-action limitations; the loader rejects implausible daily jumps, but does not reconstruct adjustment history. Bars are treated as bucket closes; callers must supply a real exchange/session calendar and appropriately aggregated buckets. Early closes require suitable session metadata or a separately prepared dataset; the demo is not an exchange-calendar implementation.

## Point-in-time invariants

Both observation and availability must be at or before each cutoff. Factor/macro values use the latest vintage actually published at that feature cutoff, not the final revised value. Each historical state is reconstructed at that bar's own publication time. Appending future bars or future revisions cannot change an earlier projection's visible input identity or historical state/optimizer prefix.

Factor training excludes the current strategy outcome. Intraday baselines exclude the current session and all future sessions, including observations published after the selected cell's publication. Momentum positions and landscape costs/states are lagged one session before their realized outcome. Missing costs or state components reset the landscape's contiguous evaluation sample; gaps are not bridged with zeros. Null is missing evidence, not a neutral exposure or no stress.

## 1. Volatility Clustering Detector

Daily returns are `close_t / close_(t-1) - 1`. Realized volatility for 5/20/60 sessions is `sqrt(annual_sessions * mean(r²))`; this RMS convention differs from demeaned sample standard deviation. EWMA variance starts from the first observed squared return, then uses `0.94 * previous_variance + 0.06 * r²`. The module also retains 20-session sample variance, lag-one absolute/squared-return correlation over up to 60 returns, and volatility-of-volatility as the sample deviation of recent five-session realized volatilities.

Robust level z-scores use prior values only: `(value - median) / (1.4826 * MAD)`, minimum ten observations, with sample-standard-deviation fallback when MAD vanishes. A constant equal baseline produces z=0; a different value against a wholly constant baseline remains unidentifiable. Shock magnitude divides the current absolute return by the prior 20-session RMS. Persistence is the proportion of recent five-session vol estimates exceeding the median of the older baseline.

The transparent cluster contributions are:

```text
0.30 * max(absolute-return AC, 0)
+ 0.30 * max(squared-return AC, 0)
+ 0.20 * clip(volatility z / 4, 0, 1)
+ 0.20 * persistence
```

State readiness requires 60 returns and identifiable level, persistence, and correlation components. Decision priority is shock (ratio ≥4), break (5/20 RV ratio ≥1.7 and z≥1), cluster (both ACs≥0.15, persistence≥0.4, score≥0.3), low vol (z≤-1), high vol (z≥1), otherwise normal. Before readiness, the state is `UNRESOLVED`. A single large candle does not certify clustering. Thresholds are disclosed heuristics, not calibrated discovery tests; displayed confidence means window sufficiency, not a probability.

## 2. Intraday Seasonality Map

The map groups close buckets by exchange-local weekday and time. Each cell compares its most recent published observation with prior sessions of that same weekday/bucket, known by that observation's publication. It reports count, mean, median, MAD, tie-adjusted percentile, robust z, current publication, and baseline end. At least five historical observations are needed for a descriptive percentile; ten for robust z.

Measures: volume, realized-vol proxy, absolute return, spread, liquidity, aggregate events/minute, trades/minute when supplied, and imbalance when supplied. The volatility proxy is the close-to-close bucket magnitude scaled by `sqrt(session_minutes / bucket_minutes)`, a session-equivalent proxy, not a high-frequency quadratic-variation estimator. The first bucket has no within-session predecessor, so its return/volatility fields remain unavailable. Aggregate events are never relabeled as trades. Optional absent measures remain null rather than producing a plausible heatmap.

## 3. Factor Neutrality Check

Prior-only rolling OLS uses an intercept and the supplied factor universe, up to 120 prior sessions. A fit requires at least `max(60, 5 * design_columns)` aligned observations, full rank, and condition number ≤1e8. Missing factor columns are not zero-filled. Available coefficients can be inspected, but any missing member of the seven-factor requested universe leaves the overall status `UNIDENTIFIABLE`.

Standard errors use Bartlett Newey–West lag-3 sandwich covariance with `n/(n-k)` correction. Intervals are approximate normal 95% intervals, not guaranteed finite-sample coverage. A beta interval wholly within [-0.10,0.10] is `NEUTRAL`; wholly outside on either side is `EXPOSED`; overlap is `WATCH`. These are configurable-policy concepts frozen here as fixed thresholds, not formal equivalence-test certification.

Each row retains beta, SE, t, interval, prior rolling beta history, robust exposure z, and stability `1/(1 + prior_beta_sample_SD)` when ten prior estimates exist. The current supplied factor return is multiplied by coefficients estimated without the current strategy outcome:

```text
raw strategy return = intercept + factor-explained loading return + residual
```

The displayed factor-explained series includes the intercept. Cumulative raw/explained/residual charts sum the same aligned decomposition rows and preserve the additive identity. They are **unit-notional arithmetic return attribution**, not compounded equity, executable cash P&L, or evidence of alpha. Unknown/late current factor values make decomposition unavailable rather than leaving a fake residual.

## 4. Regime-Dependent Momentum

Momentum combines 1/5/20/60-session close returns with weights 0.10/0.20/0.30/0.40. The descriptive position is `tanh(10 * signal)`, lagged one session before the next asset return. Conditional groups include bull/bear trend, low/high-vol chop, liquidity stress, macro shock, event-driven, and unresolved states.

Regime assignment prioritizes liquidity stress≥0.6, macro stress≥0.6, event pressure≥0.75, then signal≥0.01 / ≤-0.01 for trends, otherwise high/low-vol chop split at V=0.5. Optional missing inputs yield a visibly partial state vector; they do not establish absence of those stressors.

Rows retain sample count, mean signal, mean next asset return, sign hit rate, gross position-return Sharpe, mean actual chronological turnover, and gross subset-path drawdown. Sharpe needs at least 30 samples and nonzero return dispersion. Hit rate, turnover, and drawdown also remain unresolved below 30. Larger samples are still descriptive: annualization does not remove serial dependence, selection effects, or sparse-regime uncertainty. Turnover includes transitions across regimes instead of stitching unrelated positions. Drawdown is over the regime-subset gross path, not full-strategy equity. Sample support is `min(n/120, 1)` for eligible groups and zero below the sample gate, never calibrated probability.

## 5. State, fracture, and deterministic landscape

The state vector retains `V/L/M/H/F/S`, plus `C` for correlation:

| Component | Disclosed mapping |
| --- | --- |
| V | `clip((prior-baseline volatility z + 2)/6, 0,1)` |
| L | `clip(-liquidity robust z /4, 0,1)` |
| M | `tanh(10 * momentum signal)` |
| H | Aggregate fitted Hawkes excitation fraction |
| F | Mean absolute identifiable seven-factor beta, clipped [0,1]; an exposure proxy, **not measured crowding** |
| S | Mean positive signed robust macro-release z/4 clipped [0,1] over available supplied series |
| C | Absolute asset/MKT correlation over up to 30 published aligned observations; minimum 20 |

Macro stress uses the latest known vintage of each supplied series and up to 60 prior releases. Its minimum robust baseline is ten. A supplied proxy name is visible; no macro series is invented.

The fracture index sums equal-weight `|Δcomponent|/6` contributions for V,C,L,H,F,S. All six changes must be observable to publish a full score. Otherwise the score is null with coverage and an explicitly partial subtotal. Heuristic transition thresholds are 0.10 / 0.25; these are not validated market alarms.

The landscape replays three disclosed **heuristic agents**, not deployed MacroHFT agents:

```text
agents = [M, tanh(1.5M), -M(1-V)]
weights = softmax(abs(agents) / temperature)
position = sum(weights * agents) * exp(-sensitivity*S)
           * (1-.5V) * (1-.5L) * (1-.25H) * (1-.25F)
```

It evaluates the last 120 sessions with at least 60 contiguous complete lagged-state/spread/outcome pairs. Temperature uses 11 values from 0.20 to 2.00 in steps of 0.18; sensitivity uses 11 from 0 to 2 in steps of 0.20. Every cell retains its n, components, contributions, objective, and stress color.

```text
turnover = |position_t - position_(t-1)|, initial position=0
cost = turnover * (prior spread_bps * .00005 + prior liquidity_stress * .0001)
gross return = lagged position * current asset return
net return = gross return - cost
J = annual arithmetic gross mean
    - 1.2 * net maximum drawdown
    - annual mean cost
    - .02 * mean weighted absolute agent disagreement
    - .005 * mean turnover
    - sqrt(annual_sessions) * max(0, -net 5% quantile)
```

Drawdown comes from compounded net return within the window. The half-spread/liquidity cost is a disclosed proxy: there are no measured fills, impact, borrow, or fees. This mixed-scale objective is intentionally a fixed research policy, not an economic utility estimate. Its coefficients were not optimized into a profitability claim. Stress color is `min(1, drawdown + tail + conflict)` and is not a calibrated risk measure or proof of robustness.

The optimum is the deterministic grid argmax. Each eligible historical publication produces its own optimum point; the trail displays only observed windows. Finite-difference gradients use the actual gamma/tau spacing, and temporal gradient change is the RMS difference from the previous eligible window. It is a diagnostic of this objective, not established causality or independently calibrated fracture detection. The optimization is rolling **in-sample**; no OOS trading claim is permitted.

## Hawkes boundary remains intact

The unchanged D0.4.1 univariate exponential fit is trained on the first 30 published sessions with enough events, then held fixed for later states. The time basis is calendar hours including market closures. The training-window endpoint is reconstruction, not an out-of-sample forecast. Observations unavailable at a cutoff never enter the event count or intensity.

Outputs are aggregate conditional intensity/hour, excitation pressure, session burst score, and estimated univariate rho. Boundary/seasonality bias and uncertainty remain limitations; criticality remains `UNRESOLVED`. Exact causal graphs, precise edge confidence, and economic causation are not consumed. The integration does not repair, rename, or override D0.4.1's `PARTIALLY_CHARACTERIZED` or D0.4.1.1's `EVIDENCE_INSUFFICIENT` verdicts.

## Frozen reference and verification

The new envelope `eval/dynamics/d0_4_2/market_regime_lab.json` contains inputs, projections, claim policy, seven normalized source seals, and byte hashes for all 12 historical Dynamics evidence artifacts. Historical artifacts and estimator implementations are not rewritten. Reference projection identities are pinned independently of the envelope seal, so merely resealing a fabricated output does not make it valid. The freeze script refuses overwrite.

```text
Bundle:      3dacbdda3b3e4badc606ae596b7e6525e5ab97b98af498dae370cb887519f6d9
Full demo:   64d4aae186b77b35205dd2b911377e75d710042d5153b7c42fb02d8ce8435d44
Sparse demo: 7330a0d8284049da6756c6a8174028b4ecc88912e550135030ef38a56e68fbc5
File bytes:  3dab3a067193f27f2e1da863cf2b5165538fec423561922a88f546d5f39fad07
```

The product verifier checks seals/parents/identities and recomputes both projections. Numerical replay allows narrow floating-point tolerances for cross-platform libraries; categorical decisions, dimensions, timestamps, and counts remain exact. This replay is not advertised as an independently implemented scientific estimator. Separate focused tests use hand-computed volatility and covariance controls, planted exposures, cost causality, component identities, insufficient samples, missing data, future append/revision controls, and API tampering. The frontend runs its actual runtime adapter against frozen fixtures and 27 positive/adversarial assertions.

```bash
python -m pytest -q tests/test_market_regime.py tests/test_market_regime_api.py
python scripts/verify_dynamics_d0_4_2.py
python scripts/verify_release_authorship.py
cd frontend-v2
node scripts/verify-market-regime.mjs
npx tsc --noEmit
npm run build
```

CI includes the complete repository suite, all 13 frozen Dynamics verifiers, the authorship/attribution gate, existing sabotage tests, all three event/regime frontend adapters, targeted lint/formatting, and production build. Browser QA exercises the authenticated actual API, full/sparse worlds, historical cutoff/restore, landscape controls, seasonality cells/measures, and desktop/mobile overflow. The release receipt is recorded after those checks complete; earlier milestones' frozen receipts are not modified.

### Local verification receipt (2026-10-05)

- Focused Python/API controls: 37 passed.
- Complete frozen Dynamics verifier chain: 13 passed; all 12 parent artifact byte hashes unchanged.
- Actual frontend runtime adapters: 12 D0.4.1 + 25 D0.4.1.1 + 27 D0.4.2 assertions passed.
- TypeScript, targeted ESLint/Prettier, Python formatting, release authorship gate, and production client/server build passed. Existing large legacy 3D-chunk and Vite configuration warnings remain outside this change.
- Authenticated browser: full/sparse switching; volume/event cell inspection; stress color, trail and point/optimum controls; a 161-session historical prefix at `2024-08-13T20:03:00+00:00` and restoration to 420 sessions; home and Dynamics navigation.
- Viewports 1440×1000, 768×1024, and 390×844: no page-level horizontal overflow after repair; wide evidence tables remain internally scrollable and keyboard-focusable.
- New lab's automated accessibility audit: zero violations, 33 passes, one incomplete color-contrast category involving SVG/overlapped content. This is not a claim of comprehensive accessibility certification. No browser runtime errors or Vite overlays were observed on the final populated surface.
- Actual API checks: authenticated full projection 200 with 121 cells and all five false claim fields; missing local input 404; naive cutoff and unknown world 422; unauthenticated lab requests 401.

Full-suite and remote-CI completion are reported against the published release head, not inferred from these focused checks. QA used a disposable isolated account/database; its servers and browser were closed, and no runtime database is included in the release.

## Boundaries and next useful work

This lab is usable for inspecting published data and strategy attribution once a valid local dataset is supplied. The shipped default remains synthetic. A real-data deployment still needs documented factor definitions, adjustment/vintage history, a genuine exchange calendar, consistent liquidity measures, event observation policy, and independent evaluation appropriate to the proposed claim. Model uncertainty, calibrated regime alarms, walk-forward validation, realistic execution, and economic usefulness are not established here.

Future extensions can add properly versioned real inputs, cost/observation sensitivity, richer supplied event channels, and separately validated strategy experiments. They should be motivated by user needs or observed failures, not an automatic sequence of small certification releases. No such extension is presented as already shipped.

Method references: [statsmodels HAC covariance documentation](https://www.statsmodels.org/stable/generated/statsmodels.stats.sandwich_covariance.cov_hac.html) for the Bartlett/Newey–West convention; [Kenneth French factor definitions](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_factors.html) for why supplied factor construction and units must be explicit. The implementation does not download either source's data or pretend their definitions cover every optional factor.
