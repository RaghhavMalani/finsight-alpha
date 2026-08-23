# Agent evaluation evidence

This directory defines the input contract for FinSight's public coding-agent
scorecard. It does not contain hand-authored benchmark results.

One JSON object per line represents the final attempt for one
`commit_sha / task_id / seed / world` tuple. The strict schema is
[`schema/attempt-record.schema.json`](schema/attempt-record.schema.json).

Build a report with:

```bash
python scripts/build_agent_eval_report.py \
  --input path/to/attempts.jsonl \
  --output-dir data/exports/agent-eval \
  --require-complete
```

Use `--require-gates` for a release gate. A report is complete only when all
six metrics have enough evidence; a failed measured gate is still a complete,
publishable result. Evidence gaps are not converted to zero.

## Required provenance

Every attempt pins the commit, prompt, data snapshot, plan, seed, and recording
time. `run_id` and all provenance hashes are lowercase SHA-256 digests. The
loader rejects unknown fields, duplicate attempts, duplicate run IDs, and
duplicate nested evidence IDs.

## Worlds

Contamination uses paired runs with identical `task_id`, `seed`, and `pair_id`:

- `real`: the ordinary point-in-time research world.
- `counterfactual`: the same task with the suspected shortcut or future signal
  removed, permuted, or made unavailable.

The pair is excluded and reported as incomplete unless both Sharpe values are
present. Never substitute a missing world with zero.

## Replay artifacts

Each replay entry is the SHA-256 and byte count of the complete canonical run
artifact. Replay index 0 is the reference. The public gate requires five or
more runs per recorded group and exact agreement with replay 0.

## Human calibration

`human_label` must come from the frozen calibration set and must not be copied
from the programmatic judge. Cohen's kappa is deliberately reported as
undefined for a single-class calibration set, even when raw agreement is 100%.
