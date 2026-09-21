# Dynamics Lab D0.3.3 - Targeted Nonlinear Recovery

D0.3.3 repairs only the two estimator-limited failure modes isolated by D0.3.2.1. It does not add an estimator and does not begin Hawkes dynamics.

The double-well workstream keeps the existing SINDy field estimator and replaces brittle point-root recurrence with moving-block bootstrap root clustering, root persistence, stable-unstable-stable sign topology, barrier support, and a sealed holdout contradiction gate. The state-diffusion workstream keeps the same drift and log-diffusion libraries, but learns positive conditional variance from cross-fitted irregular-time innovations and alternates weighted drift and diffusion fitting.

## Evaluation order

The development and confirmation seeds are disjoint. The algorithm, source, operating-point rule, and graduation gates were locked before confirmation. The historical `double-well-n500` and `diffusion-g0.65-n600` cells were reopened only after confirmation and were not used for threshold selection.

1. Evaluate 80 deterministic development worlds.
2. Lock the source and development-selected operating points.
3. Evaluate 80 untouched confirmation worlds.
4. Reopen 20 historical D0.3.2.1 worlds as an audit.

Locked source SHA-256: `2c3ef88b93d3f85e0f6bd9e5f7af07b7d25ca78a54438ae50d1b6c14198d566d`.

## Frozen result

Artifact content address: `af7c56599b554871efc703256241f3afa256918112055f66d08436a86168bcd4`.

Artifact file SHA-256: `73df3fa04b3a03577ba2adfcd512b9aa5a596c8807a2f804bfe0edf5bb1316b7`.

| Confirmation gate           | Result |    Threshold | Decision |
| --------------------------- | -----: | -----------: | -------- |
| Linear specificity          |    90% | at least 95% | FAIL     |
| False nonlinear discovery   |    10% |   at most 5% | FAIL     |
| False basin discovery       |     0% |   at most 5% | PASS     |
| Double-well detection       |    75% | at least 80% | FAIL     |
| Basin recall                |    75% | at least 75% | PASS     |
| Potential topology accuracy |    75% | at least 75% | PASS     |
| State-diffusion detection   |    65% | at least 80% | FAIL     |
| Numerical failure           |     0% |   at most 2% | PASS     |
| Sealed holdout compliance   |   100% |     required | PASS     |

The decision is `NO_GRADUATE`. The repaired verifier substantially reduced double-well certification attrition from 52.9% to 11.8%, but the confirmation set missed the 80% detection gate. State-diffusion reconstruction error passed in every confirmation world, yet only 65% cleared the locked discovery rule. Linear controls also exposed a 10% false nonlinear discovery rate.

The post-confirmation historical audit improved `double-well-n500` from 20% to 90% and `diffusion-g0.65-n600` from 10% to 80%. Those improvements do not override the failed confirmation gates.

## Claim boundary

The real-market result remains M1 / ABSTAIN and was not rerun:

> No nonlinear structure was certified by an estimator whose nonlinear identification power is currently insufficient.

Hawkes remains deferred because D0.3.3 did not graduate.

## Reproduce and verify

```powershell
python scripts/verify_release_authorship.py
python scripts/freeze_dynamics_d0_3_3.py
python scripts/verify_dynamics_d0_3_3.py
```

The freeze script refuses to replace a different artifact. Verification reconciles parent bytes, source bytes, preregistration and lock hashes, disjoint seed plans, confirmation world hashes, metrics, graduation, the real-market boundary, and Hawkes deferral.
