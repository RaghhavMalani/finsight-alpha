# D0.4.1.1 — Hawkes Boundary & Structural Failure Decomposition

## Diagnostic contract, locked before execution

Start from D0.4.1 head `3befb6d316af44313ce04fb0e5dbee75f2f41055`. This is a diagnostic experiment, not an estimator repair or a new promotion of Hawkes structure. Do not change any historical world, point estimator, threshold, graph-support rule, bootstrap/profile policy or capability verdict. No market data, economic backtest, neural estimator, agent routing or D0.4.2 is in scope.

| Parent | Canonical content address | SHA-256 of checkout bytes |
| --- | --- | --- |
| D0.4 | `020c2c0f8c875ef32915512db14427a5fa543a8a0169e907a6825a6f9f1c4039` | `364a918006f4e02eadc024d206202e96ed8e3af5862baacd76bd8b0e87fca47f` |
| D0.4.1 | `36544d42957205ec62982f289afb16cdf95d54a1cb6bd58b74871038f5c83c54` | `3d80b5ec6e7f9a37f6cae58f4d2905a3032eb7e04e4733ee802d09994c156304` |

Both artifacts and all their sealed sources remain immutable. D0.4.1 stays `PARTIALLY_CHARACTERIZED`.

## Question and matched registry

How much uncertainty undercoverage, false-edge discovery, direction error and near-critical rho bias is attributable to the observation boundary, and how much remains associated with finite information, likelihood geometry or an unobserved common driver?

Exactly 200 new latent realizations use seeds `511001..511200`, disjoint from both parents. Each is generated once and evaluated under nine observation protocols: 1,800 primary fits, not 1,800 independent worlds.

- **Criticality — 100 latent worlds:** rho `.70, .85, .93, .97, .99` × information targets `100, 300, 1000, 3000` × five fixed variants. All are univariate; beta variants are `.8, 1.2, 1.8, 2.4, 3.2`, and baseline is `.55 + .10 × variant`.
- **Graph aliasing — 100 latent worlds:** `NONE`, `DIRECTED_WITH_SELF`, `BIDIRECTIONAL`, `OBSERVED_DRIVER`, `LATENT_DRIVER` × the same four targets × five variants. Observed baselines are `.60 + .08 × variant - .05 × channel`. The directed family alternates A→B/B→A by variant; cross contribution `.22`, destination self `.28`, source self `.10`. Bidirectional contributions are `.22/.22` for even variants and `.12/.32` for odd variants, with self `.10/.10`. NONE has zero cross terms and self `.20/.25` except variant zero, which is Poisson. Driver worlds have a third latent channel, Z→A and Z→B `.28`, Z self `.10`, A/B self `.10`, no true A/B cross edge; Z is available only in OBSERVED_DRIVER. Z baseline follows the same channel formula.

Horizon is target events divided by the true mean stationary rate of the **observed** channels, with a minimum of two synthetic time units. A target is not a realized sample count. Store full latent timestamps, retained observed timestamps, actual counts, horizon, kernel half-life and events per half-life.

## Latent generation and initial-state limitation

Use an exponential Hawkes Ogata realization with the same true baseline/branching/shared-beta interpretation as D0.4.1. Initialize the simulation at the stationary mean kernel state and record that initialization explicitly. Generate 128 kernel half-lives of pre-window events, then the retained window `[0,H)`.

This does **not** claim an exactly stationary initial distribution, especially near rho one. The matched contrast isolates observation treatment for one realization; it does not identify the causal contribution of the latent starting distribution. The known-history likelihood receives all observable generated prehistory, with a negligible but recorded remote-initialization tail. The oracle receives the exact true excitation vector at time zero, including hidden-source contributions and the remote tail, not true mu, alpha, beta or G.

## Boundary protocols

Every protocol uses exactly the same retained events and horizon. Fit-input objects contain only retained events, horizon, exposed prehistory, protocol label and (for ORACLE only) initial excitation. Truth is supplied only to scoring after fitting.

| Protocol | Boundary exposure |
| --- | --- |
| ZERO | No prehistory or initial state; call the frozen D0.4.1 fit directly |
| KNOWN | All observable pre-window event timestamps |
| ORACLE | Fixed true target-wise initial excitation vector; no parameters or source attribution |
| STATIONARY_MEAN | Starting excitation implied by the **trial** parameters' stationary mean, not the true mean |
| WARM_1 / WARM_2 / WARM_5 / WARM_10 | Observable prehistory in the last 1/2/5/10 **true simulation** kernel half-lives; cutoffs are fixed observation design, not fitted parameters |
| LEFT_CENSORED | All observable prehistory except channel A, whose observation starts at time zero |

LEFT_CENSORED equals ZERO in univariate worlds by construction; this is a consistency control, not another independent replicate. Full observable history cannot reveal an unobserved Z stream. The ORACLE initial vector does not reveal future hidden events and is not an oracle of graph structure.

For non-ZERO protocols only the likelihood's initial-condition term changes. Positive log parameterization, shared decay, three starts, bounds, `.995` stability barrier and all L-BFGS-B settings remain identical to the frozen incumbent. The diagnostic adapter is not installed as a production estimator. Test its zero-boundary likelihood and gradients against the frozen function, and compare analytic boundary gradients with numerical derivatives.

## Existing uncertainty policies, no interval-method tournament

Apply the frozen inverse-Hessian and fixed-fit attribution functions to every fitted protocol, with the same 256 Hessian rho draws, 64 attribution draws, nominal 95% intervals and `.035` support lower-bound rule. Attribution deliberately keeps its historical zero-history responsibilities even for boundary-aware point fits: this is a controlled audit of the **unmodified uncertainty instrument**, not a newly calibrated history-aware bootstrap. State this mismatch in the artifact and UI; never call its support a posterior probability.

Variant zero of each of the 20 criticality cells receives the unchanged 16-refit parametric bootstrap and 49-point profile method on ZERO only. Other protocol/method combinations are explicitly outside this audit, never counted as failures or zero coverage. This avoids silently changing bootstrap simulation/refit boundaries or profiling rules while retaining all four existing methods on new seeds.

Coverage/width strata are fixed before execution:

- true rho/eta: `[0,.7)`, `[.7,.9)`, `[.9,.97)`, `[.97,1)`;
- realized retained events: `<100`, `100–299`, `300–999`, `1000–2999`, `>=3000`;
- events per kernel half-life: `<1`, `1–4.99`, `5–19.99`, `>=20`;
- kernel half-life: `<.3`, `.3–.69`, `>=.7`;
- true edge magnitude: `(.035,.15)`, `[.15,.30)`, `>=.30`;
- inverse-Hessian condition: `<1e4`, `1e4–1e6`, `>=1e6`, unavailable.

Count coverage only for true contributions above `.035`, as in D0.4.1. Preserve all fit failures, method failures, denominators and unavailable strata. Report rho coverage separately. L-BFGS inverse curvature is an approximation, not observed Fisher information. Associations with it are not causal mechanisms or a deployable abstention rule.

## Lower-level decomposition

For each protocol store mu/alpha/beta/G/rho errors, exact fit/optimizer/covariance, unchanged uncertainty outputs and graph support, plus conditional time-rescaling diagnostics under that protocol. Compare ZERO minus KNOWN and ZERO minus ORACLE parameter estimates; define error improvement as ordinary absolute error minus reference absolute error (positive means improvement).

Store paired graph/support changes and fitted likelihood differences on the same retained events. Also evaluate the known-history likelihood at both fits, so likelihood comparisons on a common observation model are distinguished from unlike conditional objectives.

For every false and missed edge store truth/estimate, interval, support fraction, same-protocol edge-ablation likelihood delta with all other fitted parameters fixed, source/target observed counts and fitted/true base rates, self terms, observed/latent driver flags, pair asymmetry and shared-kernel overlap. The ablation is in-sample and not OOS evidence. No refit or repair is performed.

For false edges freeze evidence-compatible tags, not causal root-cause claims:

1. BOUNDARY_INDUCED_EDGE: present in ZERO and absent in both successful KNOWN and ORACLE fits on the same events;
2. DIRECTION_REVERSAL: its opposite is a true directed edge and the inferred edge is false;
3. COMMON_DRIVER_ALIASING: false A/B edge in an observed or latent driver world;
4. SELF_TO_CROSS_LEAKAGE: false cross edge with a true source or target self contribution above `.035`, absent a common-driver tag;
5. SPARSE_EVENT_FALSE_EDGE: fewer than 300 realized retained events;
6. SYMMETRIC_EDGE_AMBIGUITY: at least one true pair edge and true directional asymmetry at most `.05`;
7. UNEXPLAINED: none of the above evidence applies.

Multiple compatible tags may apply. The first applicable tag in this order is the deterministic primary category. A tag is not an identified physical cause. Missed/reversed edges stay explicit even if no false-edge mechanism tag applies. Confusion matrices over NONE/A_TO_B/B_TO_A/BIDIRECTIONAL score the A/B subgraph, with full off-diagonal graph metrics separately retaining observed-Z edges.

## Mechanical epistemic states

These are ground-truth-required **diagnostic** labels, never inferred financial certification:

- UNRESOLVED if optimizer unsuccessful, fewer than 50 retained events, or condition unavailable;
- LOW if there is a false/reversed edge, condition at least `1e8`, or any nonzero contribution fails either available Hessian or attribution coverage;
- HIGH if the full cross graph is exact, at least 300 events, condition below `1e4`, both available methods cover all nonzero terms and median attribution width is at most `.5`;
- PARTIAL otherwise.

Process calibration remains a separate in-sample residual diagnostic, with the incumbent KS/lag-one rules. Prediction/economics remain NOT_TESTED; causality remains NOT_ESTABLISHED. Market and causal eligibility are false everywhere.

## Preregistered terminal decisions

Primary boundary contrasts use the 60 criticality latents with true rho at least `.93`, counting successful ZERO/KNOWN/ORACLE triples; require at least 48 triples. Compute ordinary, known and oracle rho RMSE across exactly those paired latents.

BOUNDARY_REPAIR_WARRANTED requires oracle RMSE at least 25% lower and known-history RMSE at least 20% lower than ZERO, at least 60% of paired latents improving absolute rho error by `.02` under ORACLE, and mean oracle improvement at least `.05`. This warrants a future boundary investigation, not a claim that structure is certified or that the starting-distribution problem has been resolved.

Otherwise IDENTIFIABILITY_AWARE_ABSTENTION_WARRANTED requires, among successful KNOWN graph fits, at least 15 fits each in low (`<1e4`) and high (`>=1e6`) condition groups, high-condition graph-error rate at least `.50` and at least `.20` greater than the low-condition rate. This is an association warrant for a new independently tested abstention study, not a fitted or deployed abstention policy.

Otherwise return EVIDENCE_INSUFFICIENT. The order is fixed. No threshold or method is selected by the resulting score. Remaining error after an oracle is not proof of intrinsic graph non-identifiability: optimization, initialization, model misspecification and finite information can remain inseparable.

## Freeze, product and stop

Checkpoint each latent's complete nine-protocol record atomically under source/preregistration/parent-content keyed caches. Freeze only after an independent verifier reconstructs registry/seed identities, exposures, oracle state, conditional likelihood arithmetic, intervals/support, error vectors, paired contrasts, every edge tag, confusion counts, uncertainty strata, epistemic labels, terminal decision and source/parent seals.

The Boundary/Structure Microscope exposes verified projections: matched rho curves, per-realization protocols, topology confusion, false-edge tags, conditional coverage, geometry associations, explicit unavailable methods and decision predicates. No chart is allowed invented data or causal arrows.

Run all parent verifiers, new adversarial/API tests, full repository tests, frontend types/build/lint/format, responsive browser verification and CI. Preserve exact author/committer `Raghhav Malani <96712854+RaghhavMalani@users.noreply.github.com>` and legal attribution. Stop after the diagnostic artifact and one terminal decision; implement no repair and do not merge the event lineage to main.
