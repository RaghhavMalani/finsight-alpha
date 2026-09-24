# Dynamics Lab D0.3.2 — Estimator Tournament

D0.3.2 holds the D0.3.1 evidence universe fixed and changes only the estimator family. The byte-frozen parent is `347a7d7de2992434d50eba2b8c1afd80b0fe69a872cbf77f2ac8b1334b551e72`; all five estimators replay the same 290 stochastic worlds, timestamp gaps, 72/28 train/holdout boundary, proper scoring, calibration checks, and promotion rules.

The tournament contains the frozen spline-likelihood incumbent, Kramers–Moyal conditional moments, local-polynomial drift/diffusion, sparse stochastic equation discovery (SINDy), and a fixed-inducing-point RBF Gaussian-process field estimator. Results remain separated across specificity, nonlinear detection, state-dependent diffusion, false structure, basin precision/recall, topology, truth reconstruction, sealed out-of-sample likelihood/calibration, deterministic work units, and numerical failures. D0.3.2 deliberately has no aggregate winner score.

SINDy additionally records term precision, term recall, normalized coefficient error, and exact structural-equation match. Each family receives its own nonlinear-drift and state-diffusion identifiability envelope.

## Reproduce and verify

```powershell
python scripts/verify_release_authorship.py
python scripts/freeze_dynamics_d0_3_2.py
python scripts/verify_dynamics_d0_3_2.py
```

The freeze command refuses to replace a different artifact. The verifier checks canonical content addressing, byte-level D0.3.1 lineage, estimator membership/order, common-world accounting, the prohibition on aggregate selection, and the unchanged real-market claim boundary.

## Promotion boundary

An estimator graduates only when it materially improves nonlinear sensitivity while preserving at least 90% linear specificity, no more than 5% false nonlinear discoveries, no more than 5% false basin discoveries, at least 70% state-diffusion detection, at least 70% basin recall, at least 70% topology recovery, and at most 2% numerical failures. D0.3.3 routing is disabled unless estimator-specific envelopes justify it. Hawkes dynamics, neural SDEs, automatic routing, and real-market claim promotion remain outside scope.

The real-market result remains M1 / ABSTAIN without a new frozen experiment:

> No nonlinear structure was certified by an estimator whose nonlinear identification power is currently insufficient.

## Authorship gate

Repository-local Git author and committer identity is pinned to `Raghhav Malani <96712854+RaghhavMalani@users.noreply.github.com>`. The release gate scans the candidate worktree and HEAD message for accidental AI co-author or generated-by declarations. It does not remove or weaken copyright, license, NOTICE, or dependency attribution.

## Frozen result

The final source-sealed reference artifact has content address `b5302ed706d4ee75cc40e2275f32c75f61aa0c1853fcf3cc46b24db892a85c9f`, file SHA-256 `033732cb23c86a12a63cc0783ee84ae518fe7fcddb76cd5eb9aced899b8f19d0`, and tournament-source SHA-256 `e39007ceceb3e232dfcf6c4c24099f3a8ca9ff3d7014e319a9cb44b7bd255222`.

| Estimator        | Specificity | Nonlinear detection | State diffusion | Basin recall | Topology | False nonlinear |
| ---------------- | ----------: | ------------------: | --------------: | -----------: | -------: | --------------: |
| Frozen spline    |       96.7% |                3.0% |            3.3% |        10.0% |     0.0% |            3.3% |
| Kramers–Moyal    |      100.0% |                0.4% |            0.0% |         2.5% |     0.0% |            0.0% |
| Local polynomial |      100.0% |                0.4% |            0.0% |         2.5% |     0.0% |            0.0% |
| SINDy            |      100.0% |                1.3% |            0.0% |        22.5% |    10.0% |            0.0% |
| Sparse GP        |      100.0% |                1.3% |            0.0% |        12.5% |     5.0% |            0.0% |

SINDy achieved 93.6% mean term recall, but only 47.5% mean term precision, 1.16 median normalized coefficient error, and 11.5% exact structural-equation match. This is useful diagnostic evidence, not law recovery sufficient for promotion.

No estimator graduated. Every challenger preserved specificity and false-nonlinear control, but all failed the required material nonlinear-sensitivity gain, state-diffusion recovery, basin-recall, and topology gates. Estimator routing is therefore disabled and D0.3.3 is not warranted by this checkpoint.
