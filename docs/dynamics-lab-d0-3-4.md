# Dynamics Lab D0.3.4: Evidence-complete replication

## Executive result

D0.3.4 executed the preregistered nonlinear dynamics replication without estimator changes, threshold changes, development worlds, early stopping, or market-data reuse.

The frozen program executed all 400 planned synthetic worlds and admitted all 400 evidence records. The result is `PARTIALLY_CHARACTERIZED`.

- The basin-recall and false-basin controls replicated as supported capabilities.
- Numerical stability replicated with no failed worlds.
- State-dependent diffusion detection replicated as a limitation.
- The remaining measures are unresolved because either no D0.3.3 acceptance gate existed or the replication interval did not establish the requested boundary.
- The market claim remains `ABSTAIN`.

This is not a tuning result. It is an evidence-complete measurement of the frozen D0.3.3 estimator under a larger, independently seeded experiment.

## Why this milestone exists

D0.3.3 recovered selected capabilities on a confirmation set, but it did not answer whether those results would persist under a larger fixed replication or whether the observed errors came from a small number of identifiable mechanisms.

D0.3.3.2 therefore froze an evidence contract before any new scientific worlds were generated. That contract requires every D0.3.4 world to retain:

- raw-scale SINDy coefficient and sign evidence for every bootstrap;
- selected support frequencies and exact-support status;
- inferred fixed points, clustered roots, and topology gates;
- diffusion residual bins, estimated diffusion values, true diffusion values, and gate outcomes;
- the full deterministic seed ledger and parent artifact seals.

D0.3.4 uses that contract to distinguish a capability that replicated, a limitation that replicated, and an outcome that remains unresolved. It does not reduce the experiment to a single pass rate.

## Preregistered design

The run contains four fixed roles with 100 worlds each.

| Role | Worlds | Purpose |
| --- | ---: | --- |
| Linear control | 100 | Measure specificity and false nonlinear discovery |
| No-basin control | 100 | Measure false basin discovery |
| Double-well | 100 | Measure basin recall, topology accuracy, and structural recovery |
| State-dependent diffusion | 100 | Measure diffusion-regime detection |
| **Total** | **400** | **Fixed before execution** |

The seed base is `193000`, with role-specific offsets. These seeds are disjoint from D0.3.1, D0.3.2, D0.3.2.1, and D0.3.3.

The run had:

- 400 planned worlds;
- 400 executed worlds;
- 400 evidence-complete admitted worlds;
- 0 development worlds;
- 0 tuning events;
- no early stopping;
- the frozen D0.3.3 estimator and decision equations;
- Wilson 95% intervals for every binomial rate.

## Replication results

| Measure | Result | Wilson 95% interval | D0.3.3 delta | Classification |
| --- | ---: | ---: | ---: | --- |
| Linear specificity | 95.0% | 88.82% to 97.85% | +5.0 pp | Unresolved |
| False nonlinear discovery | 5.0% | 2.15% to 11.18% | -5.0 pp | Unresolved |
| False basin discovery | 1.5% | 0.51% to 4.32% | +1.5 pp | Capability supported |
| Double-well detection | 85.0% | 76.72% to 90.69% | +10.0 pp | Unresolved |
| Basin precision | 100.0% | 97.79% to 100.0% | 0.0 pp | Unresolved |
| Basin recall | 85.0% | 79.39% to 89.29% | +10.0 pp | Capability supported |
| Potential topology accuracy | 74.0% | 64.63% to 81.60% | -1.0 pp | Unresolved |
| State-dependent diffusion detection | 69.0% | 59.37% to 77.22% | +4.0 pp | Limitation replicated |
| Numerical failure | 0.0% | 0.0% to 0.95% | 0.0 pp | Capability supported |

Every D0.3.4 interval overlaps its D0.3.3 confirmation interval. The point deltas are descriptive, not evidence of a directional performance change.

`Basin precision` is unresolved despite a 100% point estimate because D0.3.3 did not preregister a precision gate. D0.3.4 does not invent a post hoc threshold.

## What the exact error records show

### Control false positives

The no-basin control produced three false basin discoveries. The linear control produced five false nonlinear discoveries, all assigned to the `STATE_DIFFUSION` classification route.

These are exact counts from retained world-level decision evidence, not reconstructed summaries.

### State-dependent diffusion false negatives

The 31 missed state-dependent diffusion worlds separate into four conjunction patterns.

| Failed gate pattern | Worlds |
| --- | ---: |
| All three gates | 3 |
| Dominance and likelihood-ratio gates | 7 |
| Ratio gate only | 20 |
| Ratio and likelihood-ratio gates | 1 |

The largest failure mode is therefore the ratio gate in isolation. The result localizes the limitation without authorizing a threshold change.

### Double-well false negatives

The 15 missed double-well worlds separate into six exact patterns.

| Failed gate pattern | Worlds |
| --- | ---: |
| Barrier, certificate, minimum occupancy, triplet, persistence, sign, and stability | 2 |
| Barrier, certificate, minimum occupancy, persistence, and sign | 1 |
| Barrier, certificate, persistence, and sign | 5 |
| Barrier, certificate, and sign | 4 |
| Certificate and persistence | 2 |
| Minimum occupancy | 1 |

The error is not attributable to one universal gate. The retained waterfall and pattern records allow future work to separate topology reconstruction from downstream certificate logic without changing this result.

## SINDy structural diagnostics

Across all eligible roles, true terms were selected with frequency `0.99677`, false terms with frequency `0.50529`, giving a separation of `0.49148`.

| Role | True-term recall | Structural precision | False-term selection | Exact support | Sign correctness | Frequency separation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Double-well | 99.78% | 44.94% | 81.50% | 6.03% | 98.50% | 0.0931 |
| Linear | 99.47% | 29.95% | 58.16% | 10.81% | 99.25% | 0.2853 |
| No-basin control | Not applicable | 0.00% | 25.84% | 46.41% | Not applicable | Not applicable |

The estimator usually retains the true terms and their signs, but it also selects many false terms. Exact support recovery is correspondingly low in the linear and double-well roles. This is a structural-identification limitation even when the downstream classification is correct.

## Interpretation

The replication supports a narrow claim: with the D0.3.3 estimator frozen, basin recall, false-basin control, and numerical execution remained within their preregistered capability boundaries over this 400-world suite.

It also supports a narrow negative claim: state-dependent diffusion detection did not clear its preregistered boundary and the limitation replicated. Most misses are concentrated in the ratio gate.

It does not support any of the following claims:

- that the estimator identifies the exact sparse drift structure reliably;
- that every topology gate has replicated independently;
- that state-dependent diffusion detection is solved;
- that a traded observable follows the tested stochastic differential equation;
- that the method has predictive or economic value in a live market;
- that changing the failed gate would improve out-of-sample performance.

No real-market rerun was performed. No Hawkes or event-dynamics work was started. No repair was attempted after seeing the replication.

## Evidence and reproducibility

The frozen artifact is stored at:

```text
eval/dynamics/d0_3_4/evidence_complete_replication.json
```

Evidence seals:

```text
artifact content address: d44263a550cbec7ea6952944917cf52e9c268646a42fb0f1fdc1bd83e78eb502
artifact file SHA-256:     68ed57e60db15e8584742c67da9b2c39c6ef6256282765d29444f3ad88af9850
```

To verify the committed artifact and replay all contract checks:

```bash
python scripts/verify_dynamics_d0_3_4.py
```

To regenerate the complete artifact from the frozen implementation:

```bash
python scripts/freeze_dynamics_d0_3_4.py
```

Regeneration is intentionally expensive. It simulates 400 worlds and retains full bootstrap, topology, and diffusion evidence. The verifier checks the content address, source seals, parent seals, seed ledger, world counts, per-world evidence completeness, exact aggregate identities, classification logic, and market-claim boundary.

## Read-only product surface

The backend exposes a bounded projection at:

```text
GET /dynamics/certification/evidence-complete-replication
```

The projection includes aggregate metrics, uncertainty intervals, exact error patterns, topology waterfalls, structural diagnostics, execution controls, and evidence seals. It deliberately excludes raw world evidence.

The Dynamics Lab route accepts a stable deep link:

```text
/dynamics?program=nonlinear&milestone=d0.3.4
```

Earlier milestones remain separately navigable. D0.3.3.2 is presented as an instrumentation contract with zero scientific worlds, preventing evidence from being assigned to the wrong milestone.

## Next research boundary

Any follow-up repair must be a new milestone with a new preregistration. The D0.3.4 result suggests two candidates for independent study:

1. isolate why the diffusion ratio gate dominates false negatives without choosing a replacement threshold on these worlds;
2. separate stable true-term recovery from high false-term inclusion before making stronger structural-identification claims.

The 400 D0.3.4 worlds must remain confirmation evidence. They cannot become a development set for the next estimator and still support an honest replication claim.
