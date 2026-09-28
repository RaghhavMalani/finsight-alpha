# Dynamics D0.4.1 — Hawkes Uncertainty & Edge Identifiability

## Preregistered scope

D0.4.1 is a frozen, simulation-only measurement study of uncertainty calibration and structural edge identifiability for the exponential Hawkes instrument introduced in D0.4. It is not a model-development round. D0.4 worlds are sealed evidence and cannot tune D0.4.1.

| Parent evidence | Frozen value |
| --- | --- |
| Commit | `a625ab85bc407213a3e46c241394ba8a0f060d64` |
| Artifact | `eval/dynamics/d0_4/hawkes_certification.json` |
| Canonical hash | `020c2c0f8c875ef32915512db14427a5fa543a8a0169e907a6825a6f9f1c4039` |
| File SHA-256 | `364a918006f4e02eadc024d206202e96ed8e3af5862baacd76bd8b0e87fca47f` |

The parent artifact remains byte-identical throughout this program.

## Frozen registry

Exactly 420 new worlds use consecutive seeds `41001..41420`. The verifier rejects duplicate seeds, D0.4 seed overlap, missing cells, or reordered identities.

- **Univariate calibration — 120:** six branching ratios `[0.05, 0.20, 0.40, 0.60, 0.80, 0.92]` × four information regimes × five fixed baseline/decay variants.
- **Directed graph recovery — 180:** nine regimes × four information regimes × five variants: null, weak/strong A→B, weak/strong B→A, symmetric/asymmetric bidirectional, A→B plus B self-excitation, and observed Z→A plus Z→B.
- **Near-critical recovery — 80:** five spectral radii `[0.70, 0.85, 0.93, 0.97, 0.99]` × four information regimes × four matrix/decay variants.
- **Controls — 40:** eight controls × five variants: homogeneous Poisson, seasonal Poisson, clustered Weibull renewal, refractory renewal, exogenous bursts, independent streams, latent common shocks, and an observed common driver.

| Information regime | Target stationary events |
| --- | ---: |
| Sparse | 100 |
| Limited | 300 |
| Moderate | 1,000 |
| Rich | 3,000 |

Horizon follows the known stationary rate. Evidence records target and realized counts, expected immigrants and offspring, horizon, kernel half-life, and events per half-life. Every truth matrix is checked for its preregistered spectral radius and stability.

## Frozen estimator and uncertainty

The estimator is the constrained exponential Hawkes MLE from D0.4, using an algebraically equivalent recursive likelihood. Positive parameters use the log scale. Three deterministic L-BFGS-B starts use branching initializations `0.08`, `0.24`, and `0.55`. Decay is shared. Spectral radius `>= 0.995` receives the stability barrier. An edge is present only when its event-attribution bootstrap lower bound exceeds `0.035`.

All worlds receive inverse-Hessian delta intervals and 64-draw fixed-fit event-attribution bootstrap intervals. Replicate zero of every univariate and near-critical cell—44 worlds—also receives 16-refit parametric-bootstrap intervals and a univariate profile-likelihood interval where defined.

Intervals are nominal 95%; failed fits remain visible. The profile cutoff is `1.920729410347062`. Thresholds cannot change after evidence generation.

## Frozen metrics

- interval coverage and width, parameter bias/RMSE, spectral-radius calibration, and numerical failures;
- expected and realized information diagnostics;
- off-diagonal precision, recall, F1, exact graph, conditional direction accuracy, reversed/false/missed edges, and abstention;
- the lowest information regime where a structural cell reaches 80% exact-graph recovery;
- time-rescaling calibration, lag-one residual dependence, control false excitation, and common-driver failure decomposition.

## Capability contract

D0.4.1 introduces `STRUCTURAL_IDENTIFIABILITY`, separate from `PROCESS_CALIBRATION`, `PREDICTIVE_VALIDITY`, `ECONOMIC_UTILITY`, and `CAUSAL_IDENTIFICATION`. Only structural identifiability is eligible for new evidence. Predictive, economic, and causal claims remain false or not tested. A simulated Hawkes edge is conditional excitation, not real-world causality.

## Preregistered promotion gates

| Gate | Threshold |
| --- | ---: |
| Null-control false edge discovery | ≤ 5% |
| Moderate/strong edge detection | ≥ 80% |
| Parametric-bootstrap branching coverage | ≥ 85% |
| Directional precision / recall | ≥ 90% / ≥ 80% |
| Near-critical accuracy / false alarms | ≥ 80% / ≤ 5% |
| Latent-common-shock false A/B edge | ≤ 5% |
| Residual calibration | ≥ 75% |
| Numerical failures | ≤ 2 worlds |

The bootstrap gate is finite-sample tolerance around nominal 95% coverage, not a revised confidence level.

## Evidence, product, and stop contracts

The artifact contains registry, truth, events, fits, uncertainty, graph decisions, decomposed errors, aggregate metrics, claim flags, source seals, parent seals, and an observatory projection. An independent verifier rejects seed overlap, parent mutation, incomplete grids, invalid matrices, unsupported metrics, altered decisions, source-seal changes, and newly enabled predictive, economic, or causal claims.

The Event Dynamics workbench gains an **Event Identifiability Observatory** for the frozen true/inferred graph, edge support, branching matrix, spectral-radius calibration, interval coverage, direction frontier, capability vector, and seals. Every visible edge traces to a frozen world and uncertainty decision.

D0.4.1 stops after the artifact, verifier, API projection, observatory UI, tests, and documentation. It does not use real market data, claim economic value, add neural estimators or agents, or begin D0.4.2.
