# FinSight Dynamics Lab D0.2.1 — Selection-Aware Certification Freeze

Dynamics Lab treats a mathematical law as a falsifiable market theory, never as
evidence that markets “obey physics.” D0.1 established exact Ornstein–Uhlenbeck
certification. D0.2 preserves that engine and adds a selection-aware financial
application: point-in-time pair discovery, corrected cointegration screening,
frozen hedge-ratio estimation, and sealed residual certification.

## Framework-neutral contract

Every theory adapter implements the `MarketTheory` protocol:

```text
fit(world, train_window) -> TheoryFit
forecast(fit, horizon) -> ForecastDistribution
score(forecast, sealed_holdout) -> TheoryScore
falsify(fit, evidence) -> FalsificationReport
compare(score, baselines) -> TheoryComparison
```

The resulting `TheoryArtifact` always records the world hash and as-of time,
train and sealed-holdout windows, parameters and uncertainty, identifiability,
forecast distributions, proper holdout scores, baseline scores, structural
stability, falsification checks, hypothesis ledger, and three separate verdicts.

## Point-in-time world

Every observation submitted to `POST /dynamics/fit/ou` includes `value`,
`observed_at`, and `available_at`. The request binds the run to an explicit
timezone-aware `as_of`. The API rejects unordered timestamps and any observation
that was unavailable in the requested world.

The request also records how many hypotheses were considered, when and how the
equation was selected, its selection metric, whether the holdout remained
untouched, and any multiplicity adjustment. Multiple unadjusted hypotheses force
a scientific `ABSTAIN`.

## Exact OU likelihood

For each observed interval `Δtᵢ`, the transition is evaluated exactly:

```text
E[Xᵢ | Xᵢ₋₁]   = μ + (Xᵢ₋₁ - μ) exp(-θ Δtᵢ)
Var[Xᵢ | Xᵢ₋₁] = σ² (1 - exp(-2θ Δtᵢ)) / (2θ)
```

The maximum-likelihood fit therefore supports genuinely irregular timestamps.
Observed-information uncertainty is reported for `θ`, `μ`, `σ`, and the derived
half-life `log(2)/θ`.

## Fail-closed falsification

Scientific acceptance is killed by any critical failure: point-in-time leakage,
optimizer failure, unsupported or non-positive reversion, half-life too long for
the sample, residual moment/tail or independence violations, pre-holdout parameter
or likelihood breaks, a touched holdout, or uncontrolled hypothesis multiplicity.

Predictive acceptance is separate. OU must beat the best sealed-holdout baseline
on Gaussian negative log likelihood without worsening RMSE. The baseline tournament
contains random walk, persistence, historical mean, AR(1), and rolling z-score.

Economic acceptance is also separate and defaults to `ABSTAIN` until execution,
costs, latency, and capacity have actually been measured. A final market claim is
eligible only when scientific, predictive, and economic verdicts all accept.

## Frozen certification suite

`GET /dynamics/certification/ou` runs two exact-OU positive controls and eight
adversarial negative controls: unit roots, deterministic trend, a level break,
time-varying reversion, heavy-tailed innovations, a jump process, and an explosive
anti-reverting process across regular and irregular clocks. Its headline metric is
**Theory False-Accept Rate**.

The same summary also exposes Theory True-Accept Rate, Abstention Rate, and Theory
False-Reject Rate. False accepts never stand alone: a verifier that rejects every
world would look safe on that metric while having no scientific power.

`GET /dynamics/experiments/reference-ou` powers the UI with a deterministic,
irregular-time exact-OU control. It can validate implementation behavior, but its
synthetic scope and unmeasured execution force the final market claim to `ABSTAIN`.

## D0.2 pair-search contract

`POST /dynamics/stat-arb/search` accepts an aligned caller-supplied universe. Every
security shares the same `observed_at` and `available_at` clock and the request is
bound to one `as_of` world. The pipeline is fixed:

```text
PIT universe → full pair family → cointegration screen → BH correction
             → frozen hedge ratio → residual spread → OU certification
             → sealed forecast tournament → execution reality → verdict
```

The discovery prefix is the only data used to select pairs. Cointegration uses an
Engle–Granger residual ADF(0) statistic with a deterministic finite-sample null
generated from independent random-walk regressions. Extreme values below the
Monte Carlo resolution use a recorded exponential lower-tail extrapolation; this
avoids a p-value floor that would make large-family correction impossible.
Benjamini–Hochberg correction is applied to the complete pair family before any
candidate reaches OU.

For corrected candidates, the hedge ratio is estimated on the subsequent OU train
window and frozen before holdout. The residual then enters the unchanged D0.1
certification engine with the full candidate-pair count and correction method in
its Hypothesis Ledger.

Every result includes a `DiscoveryLedger` containing the world, universe, total
pairs, screened pairs, corrected candidates, completed OU fits, certified
survivors, economic survivors, selection timestamp and metric, correction method,
and exact screen/train/holdout windows. The full screening ledger is retained,
including rejected pairs.

`GET /dynamics/experiments/reference-stat-arb` provides a deterministic synthetic
universe with one deliberately cointegrated pair. It proves the selection plumbing;
it is not market evidence. Costs, fills, latency, borrow, and capacity remain
unmeasured, so its economic verdict is `ABSTAIN`.

## D0.2.1 selection-aware certification freeze

Every pair-search response is now a single content-addressed
`dynamics-stat-arb/0.2.1` artifact. Its SHA-256 covers canonical JSON for the
entire payload except the `artifact_hash` field itself. The freeze binds the
discovery-run identity to the PIT world hash and retains the eligible universe,
hypothesis count, every screened pair's Engle–Granger statistic, raw p-value and
BH-adjusted value.

Each selected pair retains the frozen hedge-ratio fit window and an explicit
sealed-holdout commitment with its observations and availability clock. The same
record carries OU parameters and uncertainty, falsifiers, the full baseline
tournament, scientific/predictive/economic verdicts, supplied execution evidence,
and final market-claim eligibility.

Two top-level metrics make selection pressure visible:

```text
Candidate Compression  = screened → BH → scientific + predictive → economic
Search Survival Rate   = economically certified hypotheses / hypotheses screened
Reference freeze       = 28 → 1 → 1 → 0; 0 / 28 = 0
```

The reference artifact is materialized at
`eval/dynamics/d0_2_1/selection_aware_certification.json`. It remains a
controlled synthetic certification record, not evidence of a tradable market
effect.

## Pilot scientific power map

`GET /dynamics/power/ou` repeatedly runs the full scientific verifier over frozen
controls that vary reversion strength, diffusion, sample size, observation interval,
measurement noise, and pre-holdout break magnitude. It reports acceptance,
rejection, abstention, and correct-certification probability per cell. This is a
pilot map, not a high-resolution power study; increasing repetitions is explicit
and bounded.

## Scope boundary

D0.2 intentionally does not add Heston, Hawkes, or a broad model zoo. The next
milestone is nonlinear Langevin discovery on selection-aware residuals. It must
compete inside the same world, target, holdout, scoring, and execution gates.
