# FinSight Forge v0.2.2 — Reward Calibration & Evaluation Hardening

Forge v0.2.2 recalibrates evaluation over the exact 150 trajectories frozen in
v0.2.1. It does not rerun an agent, alter a finding, change a verifier output,
or overwrite `FORGE_BASELINE_V0_2`. Multi-agent orchestration and RLVR remain
out of scope, and the derived report explicitly does not authorize training.

## Evaluation contract

One scalar no longer represents validity, research quality, and efficiency:

```python
EvaluationResult(
    verified=...,
    critical_gate_passed=...,
    verifier_scores=...,
    verifier_statuses=...,
    research_quality=...,
    efficiency_score=...,
    training_reward=...,
)
```

Temporal validity, evidence provenance, numerical correctness, and
reproducibility are critical gates. Robustness is a quality gate. Verifier
scores aggregate with a weighted geometric mean using epsilon `0.05`, so a weak
correctness leg cannot be hidden by four perfect scores.

Efficiency is independently computed from cost, latency, and tool-budget
utilization. It is visible before it is applied to the training reward.

The calibrated training signal is:

```text
research_quality × efficiency_score × failure_multiplier
```

The empirically selected critical-failure multiplier is `0.40`: the largest of
`0.25`, `0.30`, `0.35`, and `0.40` that satisfies every frozen acceptance
criterion. A robustness-only failure uses `0.65`, retaining more partial credit
without being confusable with a verified result.

## Derived immutable artifact

`data/exports/forge_v0_2_reward_calibration` contains exactly:

- `calibration_manifest.json`
- `old_vs_new_scores.csv`
- `discrimination.json`
- `distributions.json`
- `failure_analysis.md`

Calibration ID:

```text
2539fc405cd5ff30fd318bd049cc071b35f7de56a8dcf2a63279564141c6a136
```

Source baseline ID:

```text
980fd548426b1cb9cc7d00697b2efc74021235685a97e1b07f66f5db9e4a6b15
```

The calibration command validates the baseline manifest identity and every
source artifact hash before and after rescoring. It refuses an existing output
directory and rejects any output path that overlaps the source baseline.

## Separation result

| Metric | Legacy reward | Calibrated training reward |
| --- | ---: | ---: |
| Pairwise discrimination AUC | 1.0000 | 1.0000 |
| Median verified − failed | 0.1482 | 0.6128 |
| Failed reward > 0.80 | 59.5% | 0.0% |
| All episodes > 0.95 | 72.0% | 0.0% |
| Overall variance | 0.00993 | 0.07377 |
| Tasks above variance floor | 70.0% | 100.0% |

The unchanged AUC is informative: the old reward already ordered verified
episodes above failures. Its defect was capability compression. Calibration
expands the margin while preserving ordering and partial credit.

The selected calibrated distribution has verified median `0.9403`, failed
median `0.3275`, and failed mean `0.3626`.

## Task diagnostics

Every task now reports verified rate, old and new reward mean/standard
deviation/min/max, failure labels, critical-failure rate, tool calls, compute and
wall time, replay rate, and a difficulty band. The frozen slice contains one
easy task, seven medium tasks, and two hard tasks; none currently qualifies as
adversarial by verified-rate threshold.

## Failure taxonomy

The 42 failures receive deterministic multi-label categories derived only from
trusted verifier checks and execution results. The dominant categories are:

- replay mismatch / nondeterminism: 14 episodes;
- robustness failure / premature submission: 11 episodes;
- numerical error: 10 episodes, including 3 statistical errors;
- missing evidence / invalid provenance / unsupported claim: 7 episodes.

No frozen episode has a sandbox execution failure; that is distinct from a
finding whose replay attestation was deliberately corrupted by an offline
emulator.

## Causal replay diff

Replay now reports the first divergent component and field, the action step and
tool where applicable, affected downstream components, and unaffected
components. Complex values are represented by content hashes. The report is
described precisely as observed deterministic dependency propagation—not as a
randomized causal intervention.

```text
FIRST DIVERGENCE   tool_sequence
FIELD              actions[2].arguments.code
STEP               3
TOOL               experiment.execute_python
AFFECTED           finding, verifier_output, reward
UNAFFECTED         task, world_snapshot, ...
```

An exact replay still reports `CAUSAL DIFF NONE` and `100.000%` fidelity.

## Source checkpoint and warnings

Git tag `forge-v0.2.1` identifies commit `9d65c53`, while the baseline ID,
trajectory hashes, artifact hashes, and world hashes retain their separate
experimental meanings. The repository-owned FastAPI startup deprecation was
migrated to lifespan before that tag. Six remaining third-party or legacy-ML
warnings are classified in `FINSIGHT_FORGE_WARNING_TRIAGE.md` and are not
suppressed.

## Run

```bash
python -m forge.calibrate
python -m forge.replay <trajectory_hash>
```
