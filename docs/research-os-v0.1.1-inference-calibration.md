# A separate inference-method calibration tournament

PR #23 is the canonical closed-gate v0.1 baseline. Its preregistration, worlds, attempts, artifacts, findings and gate identities remain immutable. This milestone does not repair that study, publish market evidence, add a trading engine or authorize a momentum replication.

The user approved this new milestone and the bounded candidate set. Files are scoped to `src/research_os/calibration_v011/`, new freeze/run/verify scripts, `tests/research_os/calibration_v011/`, a separate `data/exports/research_os_v0_1_1/` evidence directory, and this document/new findings. Existing inference and market adapters remain untouched. The master plan's proposal/approval requirement is satisfied by that explicit approval; no additional implementation approval is inferred necessary.

## Frozen design

Four candidates: incumbent Bartlett HAC with normal reference, the same covariance with residual-df t reference, null-restricted noncircular moving-block residual bootstrap-t, and an independently specified stationary pairs bootstrap-t. HAC bandwidth remains six; covariance correction is n/(n-k). Bootstrap length is ceil(sqrt(n)) and budget 999, fixed before outcomes. A finite-df t reference is a candidate heuristic rather than an asserted small-sample theorem.

Thirty settings cross n=120/240/480 with ten declared templates: IID Gaussian; Gaussian AR(1) rho=.3/.6/.8; IID t5; AR(1) t5 rho=.6; Gaussian-innovation GARCH(.10,.85); and regressions with two autocorrelated nonzero-mean controls under AR(.6), GARCH and control-dependent heteroskedastic errors. Innovation or unconditional error SD is one. The target is the OLS intercept. Burn-in is 1,024. Planted effects are 0/.1/.2/.4, sharing the same world for a power curve through explicitly declared location equivariance.

Discovery uses 1,000 worlds per setting and evaluates all four methods. A fixed lexicographic rule ranks point-size/coverage/bias violations, then planted power, worst null size and declared order. Exactly one method is selected unless every method has an invalid world. Even a selected method with discovery violations remains uncertified. The immutable selection receipt must be committed before any confirmation world is generated.

Confirmation uses 5,000 fresh worlds per setting for that method only. All seed integers exceed 2^256 and have distinct phase/data/bootstrap domains, disjoint from the old v0.1 seeds. No confirmation method selection, fallback, bandwidth tuning or added candidates is permitted. Checkpoints resume the same inputs and completed outcomes; they do not replace attempts or redraw worlds.

## Practical confirmation gate

For every setting, both greater-tail and two-sided Type-I error must have simultaneous upper bounds <=7%; nominal 95% interval coverage must have a simultaneous lower bound >=92%. Ninety one-sided exact Clopper-Pearson bounds allocate a total alpha .04 using Bonferroni, without an independence assumption. Standardized absolute coefficient bias, including a separately allocated Monte Carlo t margin (.01 family budget), must be <=.10 in every setting. That bias margin is approximate under non-Gaussian data and is described as such. Failures or missing worlds close the gate; they are never dropped from denominators.

Reported-SE/empirical-SD and its reciprocal, coefficient bias/MCSE, and both power curves with fixed-effect pointwise intervals are retained. SE ratios and power curves are diagnostic; they are not extra post-outcome selection rules. Discovery is not certification. A four-world infrastructure canary cannot select a candidate or earn a gate badge.

The null-restricted p-values and unrestricted bootstrap-t intervals have distinct constructions; neither is described as an exact inversion of the other. Stationary pairs resampling preserves the joint control/outcome sequence. Residual resampling has stronger exchangeability assumptions, deliberately challenged by the controlled heteroskedastic DGP.

Only untouched confirmation can earn `CONFIRMED_FOR_FROZEN_DGPS`, subject to review. Every other outcome remains closed or unavailable. Even success applies only to these DGPs, sample sizes, target and fixed resampling settings; it does not establish market calibration or reopen v0.1.

References: [statsmodels Bartlett HAC](https://www.statsmodels.org/stable/generated/statsmodels.stats.sandwich_covariance.cov_hac.html), [SciPy exact binomial intervals](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats._result_classes.BinomTestResult.proportion_ci.html), and [Politis/Romano stationary bootstrap publication](https://mathweb.ucsd.edu/~politis/DPpublication.html). Complete machine-readable definitions are in the new preregistration, frozen before any inference outcome.

## Pre-confirmation serialization guard correction

The first confirmation command was rejected before opening any world. Sorted JSON keys changed the HAC_NORMAL discovery average-power audit value by one floating-point bit (0.6977444444444444 versus 0.6977444444444445). Reconstructing the declared setting order reproduces the original selection receipt exactly; no tolerance, new selection, changed inference or replaced discovery result is used. The rejected command and both exact execution-file hashes are retained in `pre-confirmation-guard-repair.json` and the attempt chain. Confirmation records its actual repaired guard-code identity, while byte/AST checks require all DGP, method, metric, selector, seed and world-computation code to remain unchanged. The full original source identity remains in discovery. Resume still requires identical phase code and environment.

Read-only cross-version verification is distinct from same-environment execution. Comparing the 120 stored discovery rows under NumPy 2.4.6/SciPy 1.17.1 versus the original 2.3.4/1.16.3 changed floating summary values by at most 6.4116e-15, with zero count or decision differences. The independent reader permits absolute arithmetic differences <=1e-12; artifact bytes, counts, candidate selections and every gate decision remain exact. It neither regenerates worlds nor changes acceptance thresholds. Actual execution and checkpoint guards still require the frozen phase environment. The measured comparison is retained separately.

## Completed result and review packet

The frozen rule selected NULL_MBB_T from discovery. Untouched confirmation completed all 150,000 worlds with zero failed worlds, passing only 2/30 settings: IID Gaussian and control-dependent heteroskedastic regression at n=480. The new gate is **NOT_CONFIRMED**, and no replacement method is certified. At Gaussian AR rho=.8, n=120, two-sided size was 9.22% (simultaneous upper bound 10.65%) and interval coverage was 89.54% (simultaneous lower bound 88.03%). No fallback, tuning or additional candidate was evaluated on confirmation.

The [findings and full setting table](findings/inference-calibration-v0.1.1.md) include the actual heatmaps. The separate export manifest seals every preregistration, receipt, outcome, NPZ artifact, test receipt and these findings. Each published artifact records project-generated synthetic provenance, its actual execution/source identity and publication status; it contains no third-party market data. Counts and verdicts are exact even in the independent cross-library reader.

Run `python scripts/verify_inference_calibration_v011.py` to audit the sealed evidence without generating worlds. Run `pytest -q tests/research_os tests/sabotage/test_research_os_guards.py` for the focused contracts and independent statistical references. The CI canary uses four separate worlds per setting and always reports CANARY_ONLY; it cannot select or certify a method. Research OS v0.1 remains permanently CLOSED; VectorBT and market replication require separate authorization and preregistration.
