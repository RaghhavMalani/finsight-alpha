# FinSight Forge v0.2.1 — Benchmark Freeze

Forge v0.2.1 freezes the single-agent execution substrate before any
multi-agent orchestration or RLVR work. The release adds a reproducible
150-episode systems baseline, trajectory replay with mutation detection,
explicit cost accounting, grader separation, and a broader sabotage suite.

Multi-agent orchestration and RLVR remain explicitly out of scope.

## Frozen baseline

The immutable artifact is in
`data/exports/forge_v0_2_baseline` and carries the logical tag
`FORGE_BASELINE_V0_2`.

- Baseline ID: `980fd548426b1cb9cc7d00697b2efc74021235685a97e1b07f66f5db9e4a6b15`
- Matrix: 10 frozen tasks × 5 seeds × 3 configurations = 150 episodes
- Verified episodes: 108/150
- Recorded failures: 42/150
- Overall reward variance: `0.00992946306217239`

The artifact contains exactly:

- `manifest.json`
- `episodes.jsonl`
- `task_summary.csv`
- `model_summary.csv`
- `failures.jsonl`
- `README.md`

The three configurations are a deterministic scripted policy plus weak and
strong deterministic error emulators. The emulators are deliberately named
offline profiles and do not represent external LLM quality measurements. No
model, embedding, network, or paid-data API was called.

Cost accounting is componentized into inference, embedding, retrieval,
compute, and external-data USD fields, with token counts and sandbox execution
counts recorded separately. All USD amounts in this offline freeze are exactly
zero. Local compute is unpriced and reported as elapsed seconds instead of
being mislabeled as free production compute.

## Reward-discrimination result

The freeze detects reward saturation:

- verified mean reward: `0.991920`
- failed mean reward: `0.800556`
- minimum failed reward: `0.639171`
- episodes above 0.95 reward: `72.0%`

The scripted configuration has effectively zero reward variance, and failed
episodes still receive high scalar rewards. The current scalar reward must not
be used for learning unchanged. Before RLVR, add harder partial-credit tasks
and graded statistical, citation-quality, and robustness checks.

## Grader separation

`eval/splits/forge_v0_2.json` freezes train, development, and holdout task IDs.
Expected numerical values and verifier implementations stay on the trusted
host. Neither the agent tool plane nor sandbox receives them; the sandbox sees
only its frozen task input and writes only content-addressed artifacts.

## Replay

Replay locates an episode by trajectory hash, reconstructs its task seed,
world snapshot, profile, tool trace, sandbox manifest, artifacts, finding,
verifier output, and reward, then reports field-level fidelity:

```bash
python -m forge.replay <trajectory_hash> \
  --search-root data/exports/forge_v0_2_baseline
```

An exact recorded episode replays at 100% fidelity after normalization of
volatile process metering. Tests prove that mutations to the seed, world
snapshot, dependency lock, source code, tool result, or task are detected.
Stored usage is used only to reproduce the recorded reward; live replay
metering remains separately observable.

## Sandbox threat matrix

The sabotage suite covers the original controls plus more hostile paths:

| Attack | Enforced result |
| --- | --- |
| `subprocess`, `os.system`, spawn, fork | blocked |
| sockets, DNS, `urllib`, `requests` | blocked |
| dynamic import, `eval` import, `importlib` | blocked |
| threads and concurrent execution | blocked |
| wall-clock and sleep access | blocked |
| system entropy and seed mutation | blocked |
| verifier import or undeclared dependency | blocked |
| traversal, outside reads, symlinks | blocked |
| inherited environment secrets | absent |
| oversized stdout | bounded by supervisor |
| time, memory, and artifact abuse | bounded by supervisor |

This is a benchmark execution boundary, not a kernel or hypervisor security
boundary. Native extensions, interpreter or kernel exploits, hardware side
channels, and strong multi-tenant isolation remain out of scope. Any future
native scientific dependency must add an OS/container boundary and rerun the
complete sabotage suite before it is trusted.

## Commands

Regenerate a freeze only into a new, non-existing directory:

```bash
python -m forge.baseline \
  --output data/exports/<new-baseline-directory>
```

Run the complete verification suite:

```bash
pytest -q --basetemp data/exports/pytest-forge-v0-2-1
```

