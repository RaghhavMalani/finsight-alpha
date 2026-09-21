# Dynamics Lab D0.3.2.1 — Identifiability Ceiling & Failure Decomposition

D0.3.2.1 asks whether the frozen nonlinear worlds are intrinsically distinguishable or whether the practical estimators fail to extract information that is present. It replays the exact 290 D0.3.2 worlds and does not modify, tune, or rerun any practical estimator.

The diagnostic oracle receives only the correct candidate family or structural support. It never receives the true coefficients, diffusion scale, or state-diffusion parameter. Every parameter is estimated from the same pre-holdout observations, followed by a sealed likelihood-ratio comparison at a prespecified 5% threshold.

Benchmark cells are classified as:

- `DATA_LIMITED`: oracle power is below 80%.
- `ESTIMATOR_LIMITED`: oracle power is at least 80%, but the best practical power is below 80%.
- `IDENTIFIABLE`: both oracle and practical power are at least 80%.
- `NEGATIVE_CONTROL`: linear OU cell.
- `OUT_OF_FAMILY_CONTROL`: deliberate misspecification for which no privileged oracle is manufactured.

The artifact also records a local-Gaussian conditional KL diagnostic, explicitly labeled N80 bounds or extrapolations, SINDy moving-block term-stability spectra, oracle-support coefficient errors, and a four-stage double-well topology waterfall: true drift, oracle-support fit, unrestricted SINDy field, and the practical certified result.

## Frozen result

- Artifact content address: `b6b8b5e7851791254df33935fe28ffcb433d4533013f7a0d13380705f614f781`
- Artifact file SHA-256: `ce4d92b294c802b72be531a969011e3c82196881173ae172ff62c1b1f8609688`
- Sealed source SHA-256: `1f10fc1b70b8772aca4a137807e642ba73cb99c8e9ffb0a575bacc7e89c76920`
- Frozen population: 290 worlds across 29 cells, with 40 moving-block SINDy bootstraps per world.

The power surface contains 21 `DATA_LIMITED` cells, 2 `ESTIMATOR_LIMITED` cells, no `IDENTIFIABLE` nonlinear cell, 3 `NEGATIVE_CONTROL` cells, and 3 `OUT_OF_FAMILY_CONTROL` cells. The two estimator-limited cells are:

| Cell                   | Oracle power | Best practical power |   Gap |
| ---------------------- | -----------: | -------------------: | ----: |
| `diffusion-g0.65-n600` |          80% |                  10% | 70 pp |
| `double-well-n500`     |          80% |                  20% | 60 pp |

For `double-well-n500`, basin recovery falls from 100% under the oracle-support fit to 90% for the unrestricted SINDy field and 20% after the practical certification gate. The per-run failure attribution is one structure-selection loss, seven certification-gate losses, and two certified successes. This isolates the dominant final-stage loss without treating the oracle as a deployable estimator.

Measured N80 is reached only by the strong state-diffusion oracle at 600 observations. Every cubic curve and the weak state-diffusion curve is right-censored at the largest tested sample; the medium state-diffusion oracle has an explicitly labeled Jeffreys-smoothed extrapolation of approximately 19,120 observations. No practical estimator reaches measured or defensibly extrapolated N80.

The resulting route is narrow: D0.3.3 targeted repair is warranted for the two estimator-limited cells, while a new estimator is not warranted and Hawkes remains deferred.

## Reproduce and verify

```powershell
python scripts/verify_release_authorship.py
python scripts/freeze_dynamics_d0_3_2_1.py
python scripts/verify_dynamics_d0_3_2_1.py
```

The freeze command refuses to replace a different artifact. Verification checks the D0.3.2 byte hash and content address, exact world hashes, source seal, oracle boundary, real-market non-rerun, and Hawkes deferral.

## Claim boundary

The real-market result remains M1 / ABSTAIN:

> No nonlinear structure was certified by an estimator whose nonlinear identification power is currently insufficient.

The real case is not labeled data-limited or estimator-limited because doing so would require a separately frozen mapping from observational properties to the synthetic oracle surface.
