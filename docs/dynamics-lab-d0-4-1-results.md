# D0.4.1 — Hawkes uncertainty and edge identifiability

## Outcome and release boundary

**PARTIALLY_CHARACTERIZED**, with five of ten preregistered promotion gates supported. Structural identifiability is partially characterized; the residual process-calibration check is supported. Predictive and economic value are not tested, and causal identification is not established. Neither market nor causal claims are eligible.

This milestone stops at a synthetic measurement study. It does not graduate the event instrument for financial deployment, authorize economic backtests, or begin D0.4.2. The child branch preserves the complete D0.4 lineage without merging either event milestone into `main`.

The frozen artifact is [`eval/dynamics/d0_4_1/hawkes_identifiability.json`](../eval/dynamics/d0_4_1/hawkes_identifiability.json). The [preregistration](dynamics-lab-d0-4-1-preregistration.md) was committed before execution and its grid and thresholds remain unchanged.

Its canonical content address is `36544d42957205ec62982f289afb16cdf95d54a1cb6bd58b74871038f5c83c54`.

## Historical evidence is immutable

D0.4 remains at commit `a625ab85bc407213a3e46c241394ba8a0f060d64` with canonical hash `020c2c0f8c875ef32915512db14427a5fa543a8a0169e907a6825a6f9f1c4039` and file SHA-256 `364a918006f4e02eadc024d206202e96ed8e3af5862baacd76bd8b0e87fca47f`. No parent source or evidence was modified or regenerated. Existing `.gitattributes` recreates the frozen CRLF byte form on every platform; normalized Git blobs have a different byte hash but the same canonical JSON content.

The 12 parent worlds were not used for tuning. D0.4.1 uses exactly 420 new deterministic seeds, `41001..41420`:

| Family | Worlds | Measurement |
| --- | ---: | --- |
| Univariate calibration | 120 | Six branching ratios × four target-information regimes × five baseline/decay variants |
| Directional identification | 180 | Null, weak/strong directions, bidirectional systems, self-excitation and observed Z |
| Near-critical recovery | 80 | True spectral radii .70, .85, .93, .97 and .99 |
| Controls | 40 | Poisson, seasonality, renewal, bursts, independent streams and common drivers |

The information regimes target 100, 300, 1,000 and 3,000 stationary events. These are targets, not realized counts. Each world records the actual event stream, horizon, expected immigrants/offspring, kernel half-life and realized events per half-life.

## Uncertainty is the experiment

The incumbent positive-parameter, three-start, shared-exponential-decay Hawkes MLE keeps the D0.4 likelihood, bounds, starts, stability barrier and optimizer stopping rules. An analytic gradient and exact vectorized recurrence accelerate the unchanged objective. The stability penalty is differentiated rather than assigned a zero-gradient plateau. This is objective equivalence, not a claim that every finite-precision optimizer trajectory or approximate inverse-Hessian matrix is byte-identical to D0.4.

All worlds receive the L-BFGS inverse-Hessian approximation and the existing fixed-fit event-attribution bootstrap. A preregistered 44-world univariate audit also receives 16-refit parametric bootstrap and a 49-point profile-likelihood calculation. No method was selected by observed coverage.

| Instrument | Eligible worlds | Nonzero parameters | Coverage | Mean width | Median width | Branching bias | RMSE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Inverse-Hessian approximation | 420 | 655 | 89.8% | .775 | .639 | −.0477 | .1834 |
| Fixed-fit attribution | 420 | 655 | 19.1% | .0428 | .0273 | −.0477 | .1834 |
| Parametric refit | 44 | 44 | 65.9% | .3073 | .2251 | −.0937 | .2165 |
| Profile likelihood | 44 | 44 | 72.7% | .2899 | .2060 | −.0937 | .2165 |

Coverage here counts true branching contributions above .035. The artifact also records family/information strata, spectral-radius coverage and widths, available/failed methods, refit failures and profile nuisance-fit failures. Bias and RMSE refer to the same incumbent point estimate within each method's eligible subset, not to four competing point estimators.

The populations are different: the 420-world methods and 44-world methods must not be ranked as a paired tournament. Sixteen bootstrap refits are a deliberately small computational audit, not a precision guarantee for nominal 95% tail quantiles. Eight of 704 bootstrap refits failed; their omissions and the per-world failure counts are explicit. All 44 profile grids completed their nuisance optimizations, but discrete 49-point intervals can lose endpoint precision.

Fixed attribution conditions on the estimated intensity and parent responsibilities, so it misses substantial parameter-estimation uncertainty. Its narrow intervals and 19.1% coverage are a replicated warning, not a calibrated edge-confidence statement. The broader Hessian approximation does not solve the problem: wide, sometimes extreme rho intervals are also evidence of poor geometry. Refit and profile methods improve over fixed attribution in the audit, but neither passes the 85% coverage tolerance.

## Graph recovery, decomposed

These metrics cover all 180 directional-identification worlds and score off-diagonal directed edges. Self-excitation appears in parameter/uncertainty records and the UI but is not part of exact cross-graph scoring.

| Metric | Result |
| --- | ---: |
| True / false positive edges | 196 / 51 |
| Missed true edges | 24 |
| Precision / recall / F1 | 79.4% / 89.1% / 83.9% |
| Exact graph recovery | 69.4% |
| Direction accuracy conditional on detection | 80.0% |
| Missed-edge rate | 10.9% |
| False edges among discoveries | 20.6% |
| Reversed-edge rate | 14.5% (32 / 220 true edges) |
| Relationship abstention | 3.3% |

The direction frontier stores true A/B asymmetry and exact recovery in each information cell. Strong A→B reaches the 80% criterion at the sparse target; asymmetric/symmetric bidirectional systems first reach it at moderate information; observed Z requires the rich target. Reversing the weak directed topology shifts its observed frontier substantially. Each cell has only five worlds, so this is a descriptive finite-grid boundary, not a smooth or statistically precise power curve. A first passing cell is not proof of monotone recovery.

Null cross-edge discovery is 30%, latent-common-shock false A/B discovery is 20%, and control false excitation including self terms is 60%. Those are serious limitations. D0.4.1's edge-support diagnostic is not D0.4's complete model-comparison/OOS detection decision: it deliberately measures the incumbent fit and uncertainty without claiming that raw supported coefficients have passed every parent confounder gate. The larger study does not retract the immutable 12-world parent result, but it prevents extending that result into a blanket structural claim.

## Criticality and boundaries

| True ρ | Mean fitted ρ | RMSE |
| ---: | ---: | ---: |
| .70 | .6661 | .0836 |
| .85 | .8000 | .0883 |
| .93 | .7353 | .3499 |
| .97 | .7194 | .3634 |
| .99 | .4920 | .5997 |

Near-critical classification accuracy is 62.5%; false near-critical control alarms are 0%. Overall Hawkes rho bias is −.0309 with RMSE .1910. The mean curves pool all four information regimes and matrix variants; they are not information-conditioned causal explanations.

Simulation initializes excitation at its stationary mean and discards ten kernel half-lives. That does not sample a fully stationary distribution, particularly near instability. The likelihood observes only the retained window and starts with zero observed history. Short, near-critical windows therefore combine boundary mismatch, fluctuating realized information and parameter non-identifiability. These are documented limitations of this measurement setup; the frozen worlds do not isolate their separate causal contributions. No boundary correction or threshold tuning was performed on this suite.

One primary fit did not converge: `critical_rho_0.97_sparse_v3`. It stays in the registry and numerical-failure accounting. Residual time-rescaling calibration is 97.9%, but this is an in-sample check after fitting and can coexist with poor parameter/graph recovery. It establishes neither OOS predictive value nor correct structure.

## Reproducibility and implementation repairs

The first execution exposed expensive event-by-event optimizer evaluations and in-memory-only collection. The final runner uses an exact bounded-exponent prefix-sum likelihood, source-keyed per-world checkpoints, atomic writes and explicit completion messages. Tests compare its likelihood to the historical D0.4 equation and gradients to numerical derivatives, including tied cross-channel events, large gaps and chunk boundaries.

Before the first release freeze, covariance replay exposed a serialization sensitivity: SVD-based Gaussian sampling can rotate finite samples in nearly repeated eigenspaces after rounding the covariance. The final Hessian rho calculation uses the symmetric principal covariance root at sealed-record precision. The Gaussian distribution, seed, sample count and interval rule are unchanged; this is a numerical replay repair, not coverage tuning.

The guarded replay utility accepts only the pre-freeze point-fit source commit `36d4b68`. It changes only Hessian-derived uncertainty and asserts identical truth, event streams, fits, graph decisions and other methods across all 420 records. Its input candidate hash was `87a46b744284c51adec0c97ca0309aac7be438df7626403159b05aa319fc1a56`; the preserved-evidence digest is `c3305d19f448fa50a4f1a1e522aacbba6417701ad1502934dd5fee094236c496`. It refuses to alter an already frozen D0.4.1 artifact. The final artifact seals this utility and all instrument/verifier sources.

The independent verifier imports no generator calculations. It reconstructs the full parameter/seed grid, likelihoods, bootstrap intervals/support, profile likelihoods, spectral intervals, graph decisions, information accounts, aggregate metrics, capability gates and observatory projections. It rejects nonfinite/malformed evidence, seed overlap, parent mutation, source changes, incomplete grids, impossible stability arithmetic and newly enabled market/predictive/economic/causal claims. Verification is a truth-contract check, not a scientific promotion pass.

```powershell
python scripts/verify_dynamics_d0_4_1.py
pytest -q tests/test_hawkes_identifiability.py tests/test_hawkes_identifiability_api.py
```

For a new deterministic execution, `python scripts/freeze_dynamics_d0_4_1.py --workers 6` resumes only matching generator/preregistration/parent checkpoints. A candidate that fails verification stays in ignored local staging and is never served as certified evidence.

## Event Identifiability Observatory

`GET /dynamics/certification/hawkes-identifiability` exposes a verified, read-only projection, not the full event archive or a live experiment. Its cache key includes the child bytes, immutable parent bytes and every source seal, so a previously successful request cannot mask changed evidence.

At `/dynamics?program=event-dynamics&milestone=d0.4.1`, the observatory shows ten preregistered representatives with known/inferred graphs, supported versus unresolved edges, contributions and intervals, fixed-attribution support fractions, true/fitted matrices, coverage comparisons, criticality calibration, the direction frontier, capability dimensions and evidence seals. OOS edge gains are explicitly not tested. The original D0.4 workbench remains separately accessible.

Every number and rendered edge derives from the frozen projection. Support fractions are neither posterior probabilities nor a causal arrow license. A low-resolution frontier cell that fails 80% recovery is marked unresolved, not converted into an individual-world impossibility claim.

The first request performs a full independent verification, taking about 70 seconds on the development machine. Subsequent reads reuse only the successfully verified projection while checking the artifact, parent and source seals again. This is a research observatory, not a low-latency financial service.

## Release verification

The release checks cover 31 D0.4.1 scientific/API cases and the full 581-test repository suite, all eleven frozen Dynamics verifiers, the frozen Forge baseline verifier, Python compilation/formatting, frontend lint/format/type checks, twelve real-adapter assertions, and the client/server production build. The authorship gate checks the requested repository identity and absence of accidental authorship declarations.

The initial Windows full-suite run passed 578 tests and exposed three legacy Forge observer failures: Git had converted LF-sealed files to CRLF. Manifest-checked line-ending restoration and a missing `.gitattributes` rule repaired checkout bytes without changing any frozen Git blob, manifest or result. All four observer tests then passed. A clean complete rerun and release CI check the corrected state; CI also verifies every manifest-bound Forge file hash and fully reconstructs all Dynamics milestones.

The historical Forge semantic verifier passed locally under Python 3.12, but its exact summary comparison differs under CI's Python 3.11 floating-sum behavior: the reproduced overall mean cost differs by approximately `1.7e-18`. Its source and evidence remain unchanged. The added cross-platform Forge checkout gate is explicitly a byte-hash check, not a claim of version-independent semantic replay.

Authenticated local-browser verification exercised the real API projection, representative selection, desktop layout and a 390px mobile viewport. There was no framework error overlay or page-level horizontal overflow after the navigator fix. Lightweight SVG evidence graphs preserve the existing console rather than introduce a new rendering stack.

One verification caveat is recorded explicitly: the existing login redirect briefly opened the legacy market terminal and fetched market-cache data into disposable browser-test storage. That cache is ignored, not committed and never read by this synthetic experiment; no financial event pack or market experiment was introduced. The browser and local verification servers were closed afterward.

## What remains future work

Independent, newly preregistered work could investigate boundary-aware likelihoods, stationary initialization, joint uncertainty, additional bootstrap repetitions and more detailed asymmetry sweeps. These are possible future questions, not fixes trained on this suite and not implementation started here. D0.4.1 ends with its known capability boundary intact.
