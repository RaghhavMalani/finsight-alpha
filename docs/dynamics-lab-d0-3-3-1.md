# Dynamics Lab D0.3.3.1 - Confirmation Generalization Autopsy

## Result

**D0.3.3 remains `NO_GRADUATE`. D0.3.3.1 returns `EVIDENCE_INSUFFICIENT`.**

The confirmation failure is real, but the frozen evidence does not isolate one repairable cause strongly enough to justify another targeted estimator iteration. Both target families lost final certification, two confirmation linear controls produced false structure, and development cases clustered near one diffusion decision boundary. At the same time, neither oracle power nor measured path support fell enough to activate its diagnostic flag. The result is mixed evidence, not a rescued milestone and not a data-limited finding.

The real-market result remains M1 / ABSTAIN and was not rerun:

> No nonlinear structure was certified by an estimator whose nonlinear identification power is currently insufficient.

## Protocol and freeze boundary

D0.3.3 evaluated 80 deterministic development worlds and 80 seed-disjoint, untouched confirmation worlds. Each split contains 20 double-well worlds, 20 state-dependent diffusion worlds, 20 linear controls, and 20 no-basin controls. Before confirmation, D0.3.3 froze its estimator source, development-selected operating points, gate definitions, seed plan, and graduation rule. Confirmation did not select a threshold or a subset.

D0.3.3.1 is diagnostic only. It consumes the frozen D0.3.3 records and deterministically regenerates the already-defined trajectories solely to recover path-information metadata. It does not fit the estimator, change a threshold, rerun confirmation selection, or generate a market claim.

- D0.3.3 sealed estimator source SHA-256: `2c3ef88b93d3f85e0f6bd9e5f7af07b7d25ca78a54438ae50d1b6c14198d566d`
- D0.3.3.1 diagnostic source SHA-256: `bb7de63ebe041c1a0f8e9a986c772c6f2c2e9a9866af1015028204ead7b79429`
- D0.3.3.1 artifact content address: `8795e18c6f2edc7b98c03f06d892c7eda1827fbcae7f1294708d80df6a9d74ff`
- D0.3.3.1 artifact file SHA-256: `6c8fce8ce0880ca109b88f2bf77e76a1187869e5b75533ee427450d0960853c2`
- `no_retuning`: true
- `market_claim_eligible`: false

The artifact records and verifies the full content and file hashes for D0.2.1, D0.3, D0.3.1, D0.3.2, D0.3.2.1, and D0.3.3. The D0.3.2.1 and D0.3.3 source hashes are also sealed.

## Development versus confirmation

Positive worsening always means confirmation became worse. Margins are measured in the favorable direction from the frozen gate. Wilson intervals are stored in the artifact for every proportion.

| Metric | Development | Confirmation | Frozen gate | Dev margin | Conf margin | Worsening | Outcome |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Linear specificity | 20/20, 100% | 18/20, 90% | at least 95% | +5 pp | -5 pp | +10 pp | FAIL |
| False nonlinear discovery | 0/20, 0% | 2/20, 10% | at most 5% | +5 pp | -5 pp | +10 pp | FAIL |
| False basin discovery | 1/40, 2.5% | 0/40, 0% | at most 5% | +2.5 pp | +5 pp | -2.5 pp | PASS |
| Double-well detection | 19/20, 95% | 15/20, 75% | at least 80% | +15 pp | -5 pp | +20 pp | FAIL |
| Basin precision | 38/38, 100% | 30/30, 100% | descriptive | n/a | n/a | 0 pp | descriptive |
| Basin recall | 38/40, 95% | 30/40, 75% | at least 75% | +20 pp | 0 pp | +20 pp | PASS |
| Potential topology accuracy | 17/20, 85% | 15/20, 75% | at least 75% | +10 pp | 0 pp | +10 pp | PASS |
| State-diffusion detection | 16/20, 80% | 13/20, 65% | at least 80% | 0 pp | -15 pp | +15 pp | FAIL |
| Numerical failure | 0/100, 0% | 0/100, 0% | at most 2% | +2 pp | +2 pp | 0 pp | PASS |
| Sealed holdout compliance | 100/100, 100% | 100/100, 100% | 100% required | 0 pp | 0 pp | 0 pp | PASS |

The sample sizes are small enough that point estimates should not be over-read. For example, confirmation double-well detection has a Wilson 95% interval of 53.1% to 88.8%, state-diffusion detection 43.3% to 81.9%, linear specificity 69.9% to 97.2%, and false nonlinear discovery 2.8% to 30.1%. These intervals reinforce the decision not to invent a precise root-cause ranking.

## Failure localization

### Double well

The compatible sequential waterfall was:

| Stage | Development | Confirmation |
| --- | ---: | ---: |
| Oracle family discrimination | 19/20, 95% | 20/20, 100% |
| Field reconstruction correctness | 16/20, 80% | 17/20, 85% |
| Root recovery | 16/20, 80% | 17/20, 85% |
| Stable/unstable sign sequence | 16/20, 80% | 14/20, 70% |
| Bootstrap root persistence | 16/20, 80% | 14/20, 70% |
| Basin recovery | 16/20, 80% | 14/20, 70% |
| Potential topology recovery | 16/20, 80% | 14/20, 70% |
| Final certification | 16/20, 80% | 14/20, 70% |

The largest confirmation-only sequential loss is the 17.6% attrition from field/root support to the stable-unstable-stable sign sequence. Raw waterfall final certification is 17/20 development versus 15/20 confirmation; sequential counts are stricter because they require every prior compatible stage to pass.

### State-dependent diffusion

The frozen evidence supports raw stage rates, but not a complete sequential waterfall. D0.3.3 did not freeze a standalone drift-reconstruction pass criterion or a preregistered state-support coverage pass threshold. Those stages are therefore `UNAVAILABLE`, and attrition across them is not fabricated.

| Available stage | Development | Confirmation |
| --- | ---: | ---: |
| Oracle family discrimination | 14/20, 70% | 15/20, 75% |
| Innovation construction | 20/20, 100% | 20/20, 100% |
| Conditional variance signal | 17/20, 85% | 19/20, 95% |
| g(x) reconstruction | 20/20, 100% | 20/20, 100% |
| Diffusion decision | 16/20, 80% | 13/20, 65% |
| Final certification | 16/20, 80% | 13/20, 65% |

The measured loss appears at the locked diffusion decision rather than at oracle discrimination, innovation construction, conditional-variance signal, or g(x) reconstruction. The missing intermediate pass criteria prevent a stronger causal claim.

### Linear controls

Development had 0/20 false-positive controls. Confirmation had 2/20: `confirmation-linear-control-05` and `confirmation-linear-control-10`. Neither split produced a spurious certified root, and the stored nonlinearity score was zero throughout. The false positives arise from the diffusion non-constancy decision, which is why `CONTROL_FALSE_STRUCTURE` is active.

## Path-information findings

The path diagnostics do not support a broad claim that confirmation trajectories were less informative.

For double-well worlds, confirmation had more median barrier crossings (25 versus 14) and completed basin transitions (14 versus 8.5). Median state-space coverage remained 100% in both splits. The median observed range was slightly lower (3.051 versus 3.215), while samples near the unstable point were higher (37.5 versus 25.5). Median left and right basin occupancies remained substantial. These observations do not activate `STATE_COVERAGE_DROP`.

For state-dependent diffusion, median support coverage was 100% in both splits and median visited x-range increased from 1.871 to 1.956. Confirmation had fewer minimum samples per support bin (2.5 versus 4), a slightly lower visited fraction of the ground-truth diffusion range (0.547 versus 0.571), lower conditional-variance contrast (4.51 versus 5.29), and lower estimated g(x) contrast (1.83 versus 2.31). The joint preregistered conditions for `DIFFUSION_SIGNAL_UNDERSAMPLED` were not met, so that flag remains false.

Effective sample size is `UNAVAILABLE`: the repository did not contain an accepted implementation, and this diagnostic milestone did not add a statistical dependency.

## Threshold sensitivity, without retuning

The analysis uses fixed descriptive bands only. No operating point was selected or changed.

| Frozen gate | Threshold and band | Dev median margin | Conf median margin | Dev near boundary | Conf near boundary |
| --- | --- | ---: | ---: | ---: | ---: |
| Topology certificate score | 0.40 +/- 0.10 | -0.400 | -0.400 | 12/60, 20.0% | 7/60, 11.7% |
| Root persistence support | 0.40 +/- 0.10 | -0.353 | -0.369 | 9/60, 15.0% | 7/60, 11.7% |
| Diffusion twice log-likelihood ratio | 0.00 +/- 2.00 | +1.144 | +4.195 | 10/40, 25.0% | 9/40, 22.5% |
| Diffusion max/min ratio | 1.70 +/- 0.10 | +0.069 | -0.172 | 4/40, 10.0% | 5/40, 12.5% |
| Diffusion bootstrap dominance | 0.50 +/- 0.10 | +0.107 | +0.330 | 5/40, 12.5% | 3/40, 7.5% |

`THRESHOLD_MARGIN_BRITTLE` is active because 10/40 development cases, exactly 25%, fall inside the predeclared LLR band. This is a descriptive warning. It is not evidence for a replacement threshold, and the confirmation set is not used to choose one.

## Deterministic diagnostic flags

Active:

- `CERTIFICATION_ATTRITION`: double-well detection worsened by 20 percentage points and state-diffusion detection by 15 percentage points.
- `CONTROL_FALSE_STRUCTURE`: 2/20 confirmation linear controls produced a false-positive diffusion decision.
- `THRESHOLD_MARGIN_BRITTLE`: 10/40 development cases were within +/-2 of the frozen diffusion LLR threshold.

Inactive because their deterministic evidence rules were not met:

- `ORACLE_POWER_DROP`
- `FIELD_RECOVERY_DROP`
- `ROOT_PERSISTENCE_DROP`
- `STATE_COVERAGE_DROP`
- `DIFFUSION_SIGNAL_UNDERSAMPLED`
- `NUMERICAL_INSTABILITY`

Every active flag carries its evidence and affected world IDs in the artifact. No aggregate root-cause score is computed.

## SINDy structure stability

`UNAVAILABLE: bootstrap term-level evidence was not frozen`

D0.3.3 is not rerun to fill this panel. True-term stability, false-term stability, coefficient sign stability, and coefficient variability therefore remain unknown.

## What is known

- The D0.3.3 confirmation failure is reproducible under its frozen source, gates, and disjoint world plan.
- Final target-family certification worsened in both double-well and state-diffusion worlds.
- Double-well sequential attrition localizes most clearly at sign-sequence recovery.
- State-diffusion raw intermediate evidence remains strong, while the locked final decision falls from 80% to 65%.
- Confirmation paths do not show a broad oracle or coverage collapse under the preregistered flag rules.
- Linear-control specificity fails because two confirmation diffusion decisions are false positives.
- A quarter of development diffusion cases sit near the frozen LLR boundary.

## What remains unknown

- A complete causal waterfall for state-dependent diffusion, because standalone drift and support-coverage pass criteria were not frozen.
- Whether SINDy true terms separate cleanly from spurious terms across bootstraps, because term-level evidence was not preserved.
- Whether the observed confirmation gaps reflect a stable population effect or finite-sample variation; each target family has only 20 worlds per split.
- A unique repair target. Certification attrition, control false structure, and threshold proximity coexist without one sufficient causal explanation.

## Scientific decision

The next-milestone decision is `EVIDENCE_INSUFFICIENT`.

The rule permits `TARGETED_GENERALIZATION_REPAIR_WARRANTED` only when confirmation retains preregistered support across both target families and a specific downstream stage loses that information. The frozen evidence identifies downstream losses, but does not meet the full support condition across both target families and leaves important state-diffusion stages unavailable. Another targeted repair is therefore not scientifically warranted by this artifact.

`DATA_LIMITED_NO_REPAIR` is also unsupported because neither an oracle-power loss nor the preregistered path-support loss flag is active.

Hawkes remains deferred. D0.3.3 did not graduate, and D0.3.3.1 does not authorize a new model family.

## Verification

```powershell
python scripts/verify_dynamics_d0_2_1.py
python scripts/verify_dynamics_d0_3.py
python scripts/verify_dynamics_d0_3_1.py
python scripts/verify_dynamics_d0_3_2.py
python scripts/verify_dynamics_d0_3_2_1.py
python scripts/verify_dynamics_d0_3_3.py
python scripts/verify_dynamics_d0_3_3_1.py
```

The D0.3.3.1 verifier independently reconstructs headline metrics from lower-level records and rejects parent/source hash changes, frozen-gate changes, inconsistent rate arithmetic, mismatched world IDs, seed overlap, unsupported flags, missing evidence, boundary violations, and any market eligibility claim.
