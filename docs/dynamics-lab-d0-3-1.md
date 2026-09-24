# Dynamics Lab D0.3.1: Nonlinear Power Recovery and Identifiability

## Scientific question

Under what conditions can the frozen D0.3 estimator reliably detect nonlinear
stochastic dynamics when they truly exist?

D0.3.1 does not tune the estimator. It freezes the complete M0-M3 hierarchy,
spline selection, regularization grid, bootstrap rules, promotion thresholds,
and sealed-holdout protocol before generating any benchmark world.

## Frozen lineage

- D0.3 artifact hash: `751a3a42b87c198a2ec58905b968ff0f898c1f59b97d9d79199e30dff2d6e8b6`
- D0.3 artifact byte SHA-256: `429f8a0f8a8e08c1bf2668ad58709d0b5eaabfb40cb31ebf86e32de0c827d515`
- D0.3 estimator source SHA-256: `2aab7a25cb8d311fa8902fbb5d66d943a054cf5ae910bf8e6e9af600ebf5013a`
- D0.3.1 artifact hash: `347a7d7de2992434d50eba2b8c1afd80b0fe69a872cbf77f2ac8b1334b551e72`

The artifact verifier fails if either the D0.3 artifact bytes or estimator
source bytes change.

## Controlled universe

The calibrated reference artifact contains 290 deterministic worlds across 29 cells spanning:

- linear OU controls;
- weak, medium, and strong cubic drift at multiple sample sizes;
- weak, medium, and strong state-dependent diffusion;
- double-well topology controls;
- asymmetric drift;
- measurement noise and missing observations;
- random-walk, jump-contamination, and regime-switch violations.

Every transition carries its measured elapsed time. The same nested
pre-holdout complexity selection and sealed outer holdout used by D0.3 are run
for every world.

## Frozen capability card

The frozen reference is labeled `CALIBRATED` because it contains ten seeded
repetitions per cell. Wilson intervals remain attached to every frontier cell.

| Measure | Result |
| --- | ---: |
| Linear specificity | 96.7% |
| False nonlinear discovery | 3.3% |
| Nonlinear detection | 3.0% |
| Nonlinear false negative | 97.0% |
| State-dependent diffusion detection | 3.3% |
| Basin precision | 57.1% |
| Basin recall | 10.0% |
| Potential topology accuracy | 0% |
| Median weighted drift reconstruction error | 0.1213 |
| Median weighted diffusion reconstruction error | 0.0198 |

The basin result must be read with its counts: four matched stable points from
seven inferred points against forty true stable points. The detector remains
far below the prespecified 80% capability threshold.

## Interpretation

The current estimator is specific but underpowered. It does not hallucinate
nonlinearity in the measured linear controls, but it also does not promote any
known nonlinear drift or state-diffusion world, including strong controls.

The frozen real-market D0.2.1 survivor therefore keeps its D0.3 result:

```text
selected theory       M1 OU
nonlinear verdict     REJECT
identifiability       LOW
market claim          ABSTAIN
```

This means no nonlinear structure was certified. It does not establish that
the market dynamics are linear.

## Next decision

D0.3.2 is justified as a controlled estimator tournament. Candidate methods
may include Kramers-Moyal, local polynomial, SINDy, and Gaussian-process drift,
but they must run on the same disclosed synthetic worlds and survive the same
false-discovery, topology, reconstruction, and sealed-OOS gates.

Hawkes dynamics, symbolic regression, and economic promotion remain outside
this milestone.

## Reproduction

```powershell
python scripts/freeze_dynamics_d0_3_1.py --repetitions 10 --profile reference
python scripts/verify_dynamics_d0_3_1.py
python -m pytest tests/test_nonlinear_identifiability.py tests/test_nonlinear_identifiability_api.py -q
```
