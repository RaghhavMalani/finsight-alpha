# D0.4.1.1 — Hawkes Boundary & Structural Failure Decomposition

## Frozen decision: EVIDENCE_INSUFFICIENT

This diagnostic milestone does not select a repair. Neither preregistered warrant activated. The known-history contrast improves near-critical recovery modestly, but the initial-excitation oracle does not deliver the required improvement. The high-condition graph group is too small for the abstention warrant and does not show its required error gradient.

D0.4.1 remains **PARTIALLY_CHARACTERIZED**. No estimator, historical world, support threshold, uncertainty method or parent capability verdict changed. There is no market ingestion, economic backtest, causal certification, D0.4.2 implementation or promotion to `main`.

| Evidence identity | Frozen value |
| --- | --- |
| Branch | `dynamics/d0.4.1.1-boundary-structure-decomposition` |
| Parent head | `3befb6d316af44313ce04fb0e5dbee75f2f41055` |
| Preregistration commit | `67f0537` |
| Instrumentation-before-execution commit | `8cf7527` |
| Artifact | `eval/dynamics/d0_4_1_1/hawkes_boundary_decomposition.json` |
| Canonical content address | `fc035e03f41f73c209ce31e56a032b5ddb2c3a76472406b08b6d58de13a32b02` |
| Checkout-byte SHA-256 | `655727aebbbf3f7528c121f94e0f6a63ee3304ec1a21554e1ce2f311ecb1746a` |
| Scientific snapshot commit | `eea950b` (retained with its original envelope) |
| Unchanged records content address | `cb7a1653b3010884f390c536655e0e283f8108717ccf0dc9c81db4a2cfcf3507` |
| Unchanged summary content address | `e5ebc2f6d1941763c5fac00849c9f6acb596d5f008d4068c17a8d6a5936975fb` |
| New independent realizations | 200, seeds `511001..511200` |
| Primary protocol fits | 1,800; nine paired fits per realization |
| Ordinary-fit uncertainty audit | 20 new criticality worlds; unchanged 16-refit and 49-point methods |

The [preregistration](dynamics-lab-d0-4-1-1-preregistration.md) fixes the registry, protocols, thresholds, tags, strata and decision order. Both historical artifact byte hashes and their sealed sources are checked independently. The new artifact is about 43.3 MB: full latent/retained timestamps, exposed histories, covariance and uncertainty evidence are retained rather than compressed into headline scores.

## What the matched experiment actually isolates

Each latent stream is generated once, then the same realized retained events and horizon are fitted under ZERO, KNOWN, ORACLE, STATIONARY_MEAN, WARM_1/2/5/10 and LEFT_CENSORED. ZERO calls the unchanged incumbent directly. Other conditions use a separate diagnostic likelihood adapter with the same parameterization, starts, optimizer settings and stability barrier; only initial-history treatment changes.

KNOWN exposes observable negative-time events. ORACLE exposes only the true target-wise initial excitation vector, including hidden-source and remote-initialization contributions. It receives no true baseline, alpha, beta, branching matrix, future events or source allocation. Warm-history cutoffs are fixed observation design measured in true simulation half-lives, not an estimated tuning rule. LEFT_CENSORED removes channel A's prehistory and equals ZERO in univariate worlds.

Simulation starts at stationary **mean** kernel state and supplies 128 half-lives of prehistory. That is not an exact stationary initial distribution, especially near instability. The matched contrast does not identify the effect of that starting distribution. The oracle cannot reveal future hidden common-driver events.

## Boundary warrant: every required predicate fails except the pair count

All 60 near-critical latents (`rho >= .93`) have successful ZERO/KNOWN/ORACLE triples.

| Paired diagnostic | Observed | Required |
| --- | ---: | ---: |
| Successful triples | 60 | >=48 |
| ZERO rho RMSE | .405437 | Reference |
| KNOWN rho RMSE | .368844 | At least 20% lower |
| ORACLE rho RMSE | .460339 | At least 25% lower |
| Known-history RMSE reduction | 9.03% | >=20% |
| Oracle RMSE reduction | -13.54% | >=25% |
| Oracle absolute-error improvement >=.02 | 31.67% | >=60% |
| Mean oracle absolute-error improvement | -.000716 | >=.05 |

Positive error improvement means ordinary absolute error minus reference absolute error. Parameter contrast vectors use ZERO minus the protocol estimate. Unlike-protocol objective deltas are stored separately from the known-history common-model likelihood comparison.

| True rho | ZERO mean fit | KNOWN mean fit | ORACLE mean fit |
| --- | ---: | ---: | ---: |
| .70 | .6981 | .6934 | .6968 |
| .85 | .8355 | .8451 | .8440 |
| .93 | .7649 | .7861 | .7810 |
| .97 | .6617 | .7088 | .5862 |
| .99 | .6064 | .6911 | .6652 |

Each row pools 20 matched latents across the four information targets. History improves some means, but substantial near-critical error remains. An initial-state oracle is not guaranteed to improve this fixed optimizer and likelihood parameterization. These observations do **not** prove intrinsic non-identifiability or isolate optimization from finite information and latent initialization.

## Structural failure does not disappear with prehistory

| Protocol | Exact full graph /100 | True positives | False positives | Missed edges | Reversed edges |
| --- | ---: | ---: | ---: | ---: | ---: |
| ZERO | 55 | 89 | 53 | 11 | 9 |
| KNOWN | 53 | 90 | 56 | 10 | 10 |
| ORACLE | 53 | 89 | 58 | 11 | 9 |

ZERO cross-edge precision is `89/142 = 62.7%`; recall is `89/100 = 89%`. This smaller registry is not the D0.4.1 grid, so these percentages are not a head-to-head regression score against the parent.

ZERO primary false-edge categories are: common-driver-compatible aliasing 31; direction reversal 9; self-to-cross-compatible leakage 9; sparse-event false edge 2; unexplained 2; boundary-induced 0; symmetric ambiguity 0. Tags are deterministic evidence-compatible descriptions, **not identified physical causes**. Primary categories follow preregistered priority; all secondary compatible tags remain in the artifact. The zero boundary-tag count does not imply that boundary treatment has no effect on any fitted parameter or support entry.

ZERO topology confusion over the A/B subgraph:

| True / inferred | NONE | A→B | B→A | A↔B |
| --- | ---: | ---: | ---: | ---: |
| NONE | 29 | 10 | 8 | 13 |
| A→B | 1 | 9 | 1 | 1 |
| B→A | 0 | 0 | 6 | 2 |
| A↔B | 0 | 1 | 2 | 17 |

The 60 true-NONE A/B cases include null and driver families. Full observed-Z graph metrics remain separate. Every false/missed edge records truth and estimate, support interval/fraction, counts, true/fitted source and target baselines, self terms, driver flags, asymmetry, shared-decay overlap and a same-protocol fixed-other-parameters likelihood ablation. Ablation gains are in-sample, not OOS evidence.

## Uncertainty is stratified, not repaired

| ZERO method | Available worlds | Covered true terms | Coverage | Mean width |
| --- | ---: | ---: | ---: | ---: |
| Fixed attribution | 200 | 65/412 | 15.78% | .03725 |
| Inverse Hessian | 200 | 355/412 | 86.17% | .58178 |
| Parametric refit | 20 | 6/20 | 30% | .31952 |
| Profile likelihood | 20 | 12/20 | 60% | .33379 |

The two 20-world rows are criticality-only audits, not directly comparable with the 200-world matrix coverage. Parametric refits retain two failed refits out of 320; no unavailable protocol/method combination is scored as zero coverage. No new interval method was introduced.

Coverage counts only true contributions above `.035`. Rho coverage is separate. All preregistered strata are frozen: information target, realized count, events per half-life, half-life, true rho/eta, edge magnitude and inverse-curvature condition. For example, ZERO Hessian coverage moves from 66.0% in SPARSE to 98.1% in RICH, while attribution coverage remains between 13.6% and 17.5% across the four targets. Wide Hessian intervals and small audit denominators preclude a new calibrated-uncertainty claim.

Attribution deliberately retains historical zero-history responsibilities even for boundary-aware point fits. That mismatch is part of this audit of the **unmodified** method, not a newly calibrated history-aware bootstrap. Its support fraction is not a posterior probability.

## Geometry and epistemic states

Among successful KNOWN graph fits, the low-condition group has `n=40`, graph error 57.5%; the high-condition group has `n=12`, graph error 33.3%. The high group misses the minimum 15-world denominator, the 50% error requirement and the required +20 percentage-point error gap. The abstention warrant therefore fails; no condition threshold was adjusted afterward.

Across all 200 ZERO fits, log10 inverse-curvature condition has descriptive Pearson correlations .273 with graph error, .014 with absolute rho error and .014 with fixed-attribution coverage failure. Optimizer-failure correlation is unavailable because ZERO has no failed fits. These are pooled descriptive associations, not observed Fisher information or causal evidence. The artifact includes each protocol's groups, denominators and associations.

ZERO truth-required structural states are HIGH 7, PARTIAL 6, LOW 182, UNRESOLVED 5. KNOWN yields HIGH 12, PARTIAL 5, LOW 178, UNRESOLVED 5. The lower coverage of either available uncertainty instrument is sufficient for LOW even when process residuals look acceptable. Across protocols only three optimizer failures occur: one each for ORACLE, WARM_2 and WARM_10. Those failures remain explicit.

In-sample process calibration is 99.5% for every protocol. This does not establish predictive or economic value, trustworthy structure, calibrated criticality or causality. Structural states require synthetic truth and are not deployable financial labels. All market, causal, predictive, economic and repair claim flags remain false.

## Independent evidence contract and product surface

The independent verifier imports no instrument or analysis calculations. It authenticates the registry and seeds with its own Ogata replay, reconstructs exposures and the oracle state, computes conditional likelihoods through a scalar event recurrence, reconstructs historical Hessian and attribution intervals/support, checks retained refit samples and all profile-grid likelihood arithmetic, and recomputes errors, graph decisions, edge ablations/tags, contrasts, confusion matrices, strata, geometry associations, states and terminal predicates.

The original optimizer condition is recorded before covariance serialization. Its plausibility is checked with explicit singular-value perturbation bounds for nine-decimal covariance rounding. All decision/state geometry uses the independently reproducible sealed covariance instead. A serialization repair for a NumPy edge boolean and this numerical representation correction changed no fit, world, scientific threshold or decision rule. All 200 source-keyed checkpoints were reused; no score-driven rerun or estimator repair occurred.

`GET /dynamics/certification/hawkes-boundary-decomposition` returns a verified, authenticated, read-only projection. It never fits or ingests data. Successful verification is cached under child bytes, both parent bytes and all child/parent source seals; returned objects are copied so callers cannot poison the cache. A changed or malformed seal fails closed with HTTP 409. The first request performs the full independent reconstruction and is intentionally slow; this is not a low-latency market service.

At `/dynamics?program=event-dynamics&milestone=d0.4.1.1`, the Boundary/Structure Microscope shows paired rho curves, protocol-specific confusion and false-edge counts, coverage filters, geometry groups/associations, ten preregistered representative realizations, true/fitted matrices, lower-level edge evidence, unavailable methods and terminal witnesses. Historical D0.4 and D0.4.1 views remain separately addressable. All numerical views originate in frozen evidence.

## Release verification and portability

The local release checks cover the full repository suite, all twelve Dynamics verifiers, the 112-file frozen Forge byte manifest, Python compilation/formatting, API fail-closed/cache checks, frontend lint/format/types, 25 new real-adapter assertions plus the 12 parent assertions, and client/server production builds. Responsive browser verification exercised the actual authenticated API at 1440px and 390px, protocol/coverage/representative controls, correct observed-driver Z labels and home/Dynamics navigation. There was no framework error overlay, page error or page-level horizontal overflow. The browser and both isolated servers were closed afterward.

Browser authentication used a disposable account in ignored test storage and direct Dynamics navigation, avoiding the existing login-to-market-terminal redirect. Market endpoints were blocked; backend request logs contain only disposable authentication, paper-position reads and the synthetic evidence API. No market data was fetched by this verification.

The first [release CI run](https://github.com/RaghhavMalani/finsight-alpha/actions/runs/37265491042) passed the frontend and truth-contract jobs but exposed an exact hash comparison between stored events and independently regenerated Linux events at rho `.99`. Numerical replay had agreed, but platform floating-point rounding gave the regenerated realization a different content hash. Exact stored artifact/latent/retained/exposure hashes remain mandatory. Cross-platform seed replay now compares event times with zero relative tolerance and at most `2e-9` absolute tolerance, two nine-decimal serialization units; event counts, marks, registry and shared retained identities remain exact. A regression test accepts a one-unit replay difference, rejects an invented stored hash and rejects a `1e-6` timestamp discrepancy.

Only the verifier source seal and release-envelope hash changed in this follow-up. Every timestamp, fit, interval, score, label, scientific gate and terminal witness remains identical, proven by the unchanged records and summary content addresses above. The original scientific snapshot and failed CI record remain in history. No refit, new simulation, score-based tuning or parent alteration occurred.

All commits preserve `Raghhav Malani <96712854+RaghhavMalani@users.noreply.github.com>` as author and committer. The authorship gate reports no accidental attribution declarations and preserves legal third-party attribution. The primary user checkout was not edited or switched; this work used the attached diagnostic worktree.

## Stop boundary

The result is **EVIDENCE_INSUFFICIENT**, not a repaired estimator, forced pass or proof of intrinsic structural impossibility. D0.4.1 stays frozen and partially characterized. A future investigation would require fresh authorization and a new seed-disjoint preregistration; no D0.4.2 work begins here.
