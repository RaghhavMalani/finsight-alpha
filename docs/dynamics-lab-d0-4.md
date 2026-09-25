# Dynamics Lab D0.4: Hawkes event-process certification

D0.4 tests whether FinSight can distinguish genuine event excitation from arrival noise and clustering confounders when the data-generating process is known. It uses synthetic continuous-time events only and authorizes no market, economic, or causal claim.

## Scientific question

> Can FinSight reliably distinguish genuine event self-excitation and cross-excitation from ordinary arrival noise, changing baseline intensity, common shocks, and other processes that merely look clustered?

D0.4 starts a new scientific program from `dynamics-v0.3.4` at commit `fef3d212c86716d33d9041cb014b757cd5574e19`. It does not regenerate, reinterpret, or train on any D0.3.x artifact.

The nonlinear program remains frozen as `PARTIALLY_CHARACTERIZED`.

## Theory contract

The univariate exponential Hawkes intensity is:

```text
lambda(t) = mu + sum(alpha * exp(-beta * (t - ti)))
```

Its branching ratio is `eta = alpha / beta`. A stationary univariate fit requires `eta < 1`.

The multivariate intensity is:

```text
lambda_i(t) = mu_i + sum_j sum(alpha_ij * exp(-beta_ij * (t - tk_j)))
```

The branching matrix is `G_ij = alpha_ij / beta_ij`. A stationary multivariate fit requires `spectral_radius(G) < 1`.

Every fitted edge means conditional temporal excitation under the model. It never establishes economic causation.

## Continuous-time evidence

D0.4 retains every event timestamp and both observation boundaries. The likelihood uses the exact point-process form:

```text
log L = sum_k log(lambda(t_k)) - integral(lambda(t), observation_window)
```

The implementation does not discretize events into arbitrary bars. The frozen evidence preserves:

- Baseline intensities
- Excitation and decay matrices
- Branching matrix and spectral radius
- Train and out-of-sample likelihoods
- Optimizer convergence and inverse-Hessian conditioning
- Fixed-fit event-attribution bootstrap intervals
- Time-rescaling intervals and Kolmogorov-Smirnov calibration
- Residual lag-one autocorrelation
- Observation windows and censoring boundaries
- Competing Poisson and renewal likelihoods
- Every falsification gate

## Frozen synthetic suite

The suite contains 12 deterministic worlds:

| World | Required interpretation |
| --- | --- |
| Homogeneous Poisson | Reject excitation |
| Seasonal Poisson | Reject after periodic baseline modeling |
| Weak Hawkes | Detect only if the preregistered evidence gates clear |
| Moderate Hawkes | Detect |
| Near-critical Hawkes | Detect and report proximity to instability |
| Clustered Weibull renewal | Reject in favor of the renewal alternative |
| Refractory process | Reject or expose misspecification |
| Exogenous bursts | Reject after observed burst-window modeling |
| Independent streams | Recover no cross-excitation |
| Directed A to B Hawkes | Recover the directed excitation |
| Bidirectional Hawkes | Recover both directions |
| Common shock into A and B | Abstain from an A-to-B interpretation |

The null tournament includes homogeneous Poisson, Fourier seasonal Poisson, observed exogenous-window Poisson, and continuous-time Weibull renewal models.

## Independent verification

The verifier does not rerun the simulator or optimizer. It recomputes the following values from frozen timestamps and fitted parameters:

- World and artifact content addresses
- Timestamp order, event counts, and censoring boundaries
- Branching matrices and spectral radii
- Train and out-of-sample Hawkes likelihoods
- Homogeneous, seasonal, exogenous-window, and Weibull-renewal baseline likelihoods
- Time-rescaling intervals and calibration
- Optimizer objectives, identifiability accounting, and bootstrap edge decisions
- Every world classification and falsification-register entry
- Every numerator, denominator, estimate, and interval in the capability vector
- Claim-boundary invariants
- Nonlinear-program freeze identity
- Line-ending-independent seals for the generator and verifier sources

The verifier fails closed when evidence is missing, inconsistent, unstable, or rehashed after tampering.

## Frozen result

The D0.4 result is `PARTIALLY_CHARACTERIZED`.

The frozen record is `eval/dynamics/d0_4/hawkes_certification.json`, content-addressed as:

```text
020c2c0f8c875ef32915512db14427a5fa543a8a0169e907a6825a6f9f1c4039
```

| Capability | D0.4 | Interpretation |
| --- | ---: | --- |
| False excitation discovery | 0.0% | Supported on frozen controls |
| True excitation detection | 80.0% | Supported, with weak Hawkes rejected |
| Cross-excitation precision | 100.0% | Supported |
| Cross-excitation recall | 66.7% | Supported by the preregistered gate |
| Mean branching-ratio error | 0.069 | Measured |
| Branching-ratio interval coverage | 33.3% | Unresolved limitation |
| Exact direction recovery | 50.0% | Unresolved limitation |
| Near-critical detection | 100.0% | Supported |
| Seasonality confounding | 0.0% | Supported |
| Common-shock confounding | 0.0% | Supported through abstention |
| Time-rescaling calibration | 91.7% | Supported |
| Numerical failure | 0.0% | Supported |
| Abstention | 8.3% | One common-shock abstention |

The Weibull renewal competitor removes the initial false excitation on clustered non-Hawkes arrivals. The instrument still undercovers branching contributions and recovers the exact directed edge set in only one of two cross-excitation worlds. Those limitations prevent a synthetic-certification graduation.

## Verdict separation

Every world reports four distinct verdicts:

```text
PROCESS FIT          ACCEPT / REJECT / ABSTAIN
PREDICTIVE VALUE     ACCEPT / REJECT / ABSTAIN
ECONOMIC VALUE       NOT_TESTED
CAUSAL INTERPRETATION NOT_ESTABLISHED
```

Every artifact also carries:

```text
causal_claim_eligible = false
market_claim_eligible = false
```

## Stop boundary

D0.4 stops at frozen synthetic certification. It does not begin financial event ingestion, economic backtesting, agent routing, reinforcement learning, neural point processes, or D0.4.1 confounder development.

The next event milestone requires a new preregistration. The D0.4 worlds cannot become development or tuning data for that work.
