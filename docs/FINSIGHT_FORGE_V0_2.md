# FinSight Forge v0.2 — Agent Execution Substrate

Forge v0.2 answers the milestone question with one bounded policy: a single
`ResearchAgent` can load a frozen benchmark task, retrieve point-in-time data
through typed tools, execute generated Python in a supervised sandbox, submit a
machine-actionable finding, and receive verifier-derived reward without manual
intervention.

Multi-agent orchestration, learned routing, RLVR, and delayed outcome rewards
remain outside this release.

## Execution flow

```text
BenchmarkCase + frozen MarketWorld
              |
        ResearchAgent state machine
              |
       provenance-bearing tools
              |
   two deterministic sandbox replays
              |
        ResearchFinding artifact
              |
 temporal / evidence / numerical /
 reproducibility / robustness verifiers
              |
      bounded verified reward
              |
       immutable JSONL trajectory
```

The research state machine is:

```text
UNDERSTAND → FORM_HYPOTHESIS → PLAN → GATHER_EVIDENCE
→ WRITE_EXPERIMENT → EXECUTE → INTERPRET → SUBMIT_FINDING
```

Natural language is only a rendering. `ResearchFinding` is the accepted result
contract and now includes evidence, numerical claims, content-addressed
artifacts, sandbox experiments, confidence, and explicit limitations.

## Sandbox contract

Every program is bound to an immutable `SandboxManifest` containing the task,
as-of boundary, seed, Python version, installed dependency lock hash, frozen
input hash, CPU/memory/time allowances, network policy, declared dependencies,
and program hash. The worker returns an `ExecutionResult` with:

- exit status and termination reason;
- stdout and stderr hashes;
- artifact hashes;
- runtime and peak resident memory;
- manifest hash and frozen-input integrity result;
- a replay identity that excludes nondeterministic metering noise.

The worker starts with `python -I` in a fresh directory. A Python audit hook and
guarded importer restrict reads to frozen inputs, writes to artifacts, disable
network and child processes, enforce declared dependencies, and reject seed or
input mutation. The host supervisor independently enforces wall time, resident
memory, output size, artifact count, and artifact bytes.

Sabotage coverage is executable in `tests/test_forge_sandbox.py`:

| Attack | Result |
| --- | --- |
| Network access | `policy_violation` |
| Read outside workspace | `policy_violation` |
| Write outside artifacts | `policy_violation` |
| Infinite loop | `timeout` |
| Memory bomb | `memory_limit` |
| Seed mutation | `seed_mismatch` |
| Frozen input mutation | `integrity_failure` |
| Undeclared dependency | `policy_violation` |

## Typed capability plane

The agent receives seven capabilities and never the `MarketWorld` object:

- `world.describe`
- `world.get_snapshot`
- `market.get_history`
- `fundamentals.get_asof`
- `filings.search`
- `experiment.execute_python`
- `finding.submit`

Every result includes `as_of`, `dataset_id`, `snapshot_hash`, logical
`retrieved_at`, and `epistemic_state`. Experiment execution always produces two
fresh replays. Trusted `ExecutionResult` objects travel out-of-band to the
reproducibility and robustness verifiers, so an agent cannot earn those gates by
inventing attestation hashes in its finding.

## FinSight Bench v0.2

The suite in `eval/tasks/forge_v0_2` contains ten heterogeneous frozen tasks:

1. future filing contamination;
2. historical enterprise-value reproduction;
3. Black-Scholes price and Greeks;
4. dominant valuation sensitivity;
5. point-in-time momentum;
6. leaked alpha labels;
7. covariance instability;
8. VaR realized coverage;
9. future-volatility regime leakage;
10. evidence-backed filing retrieval.

The deterministic baseline is deliberately narrow: its recipes encode the
method requested by each benchmark question, but no golden expected values.
This makes it an executable systems baseline, not a claim of general research
intelligence. Model-adapter baselines and the 3 × 10 × 5 baseline matrix are the
next measurement step.

## Run

```bash
python -m forge.run \
  --task forge_v0_2/task_007 \
  --agent research-agent \
  --model deterministic-baseline \
  --seed 42
```

The run writes `finding.json`, `episode.json`, and one append-only
`trajectory.jsonl` record under `data/exports/forge-v0.2`. The terminal summary
shows the task, world, trajectory and finding hashes; all verifier gates; reward;
cost; tool calls; and sandbox runtime.

## Verify

```bash
pytest -q --basetemp data/exports/pytest-forge \
  tests/test_forge_world.py \
  tests/test_forge_benchmark.py \
  tests/test_forge_sandbox.py \
  tests/test_forge_tool_plane.py \
  tests/test_forge_research_agent.py \
  tests/sabotage/test_forge_guards.py
```

This substrate is defense in depth for benchmark code, not a replacement for a
kernel or hypervisor security boundary against hostile native extensions. Forge
v0.2 allows only the declared pure-Python experiment surface by default; any
future expansion to native scientific packages should add an OS/container
boundary and repeat the sabotage suite before being considered trusted.
