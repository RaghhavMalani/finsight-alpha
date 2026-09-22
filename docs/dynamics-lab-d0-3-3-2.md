# Dynamics Lab D0.3.3.2 — Evidence Instrumentation Contract

## Status

**Contract ready. No scientific worlds were executed. No outcome is claimed.**

D0.3.3 remains `NO_GRADUATE`, and D0.3.3.1 remains
`EVIDENCE_INSUFFICIENT`. This milestone changes neither conclusion. It freezes
the evidence that D0.3.4 must retain while keeping the D0.3.3 estimator source
and thresholds byte-for-byte unchanged.

The contract is content-addressed and fail-closed. It seals the D0.3.3 and
D0.3.3.1 parent artifacts and sources, contains zero world records, and rejects
scientific results, effect-size estimates, threshold selection, estimator
changes, real-market reruns, and Hawkes work.

## Required evidence streams

### SINDy term stability

Every applicable world must retain:

- the complete drift library and its identity;
- the true structural support and its identity;
- every bootstrap coefficient vector;
- selected terms and a structural-support identity per bootstrap;
- coefficient signs per term and bootstrap;
- term inclusion counts and frequencies; and
- coefficient uncertainty, including quantiles and selected-fit dispersion.

This is sufficient to distinguish unstable true terms from stable true terms
surrounded by recurrent false support.

### State-dependent diffusion

Every applicable world must retain the drift and `g(x)` reconstruction scores,
all cross-fitted residuals, state-support bin boundaries, samples per bin,
conditional-variance estimates, true and estimated `g(x)` per bin, and
diffusion contrasts.

The final decision is frozen as the exact Boolean conjunction:

```text
LLR >= 0.00
AND max/min ratio >= 1.70
AND bootstrap dominance >= 0.50
```

Each gate is stored separately with its value, comparator, threshold, result,
and contribution to the final decision. The record also stores the sorted
failed-gate set as a decomposition key, so D0.3.4 can aggregate exclusive
failure mechanisms without inferring them after the run.

### Topology

Every applicable world must retain all roots before clustering, derivative at
each root, stable/unstable classification, cluster assignments, root clusters,
bootstrap persistence, the selected root certificate, basin assignment, each
individual topology gate, and the final topology decision.

The frozen topology decision retains the D0.3.3 logic: a
stable–unstable–stable triplet, minimum local occupancy of four, holdout gain
of at least `-0.20`, and a minimum persistence/stability/sign/barrier score of
at least `0.40`.

## Future D0.3.4 artifact

The contract includes a JSON Schema for one world record and a run-level
artifact specification. D0.3.4 must preregister the seed ledger, retain exactly
100 records for each of the four roles, fail closed on incomplete evidence,
report Wilson 95% intervals for every capability proportion, and decompose
failures by exact failed-gate combination.

The future run may estimate operating characteristics. It may not use this
evidence to retune the D0.3.3 estimator or thresholds.

## Capture API

The instrumentation is deliberately separate from the sealed estimator:

```text
capture_sindy_bootstrap_evidence
capture_state_diffusion_evidence
capture_topology_stage_evidence
make_world_evidence_record
verify_world_evidence_record
```

These functions consume already-computed intermediates. Building or verifying
the D0.3.3.2 artifact does not call the simulator or estimator.

## Freeze and verification

```powershell
python scripts/freeze_dynamics_d0_3_3_2.py
python scripts/verify_dynamics_d0_3_3_2.py
python -m pytest tests/test_evidence_instrumentation.py -q
```

The verifier rejects parent or source drift, changed thresholds, populated
world records, any scientific result, a promoted market claim, changed schemas,
or modified capture-source bytes.
