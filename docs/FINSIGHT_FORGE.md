# FinSight Forge v0.1

FinSight Forge now has an executable research-environment nucleus. It does not
yet autonomously write or sandbox research code, coordinate a specialist team,
or train an RL policy. It does provide the stable contracts those systems can
target and the deterministic reward boundary they cannot bypass.

## Architecture boundary

```text
ResearchTask + frozen MarketWorld
               |
        framework-neutral policy
               |
        ResearchFinding
        /      |       \
 evidence   claims   replay hashes
        \      |       /
 temporal / evidence / numerical / reproducibility
               |
      verified quality - explicit resource penalties
               |
        EpisodeResult + bounded reward
```

The agent framework is outside this dependency chain. Existing ReAct and MAF
runtimes can be adapted to the benchmark policy interface without importing
into the world, verifier, numerical, or reward layers.

## What is implemented

| Layer | Shipped behavior |
| --- | --- |
| Research contracts | Strict `ResearchTask`, `ResearchFinding`, `EvidenceReference`, `NumericalClaim`, and `ResearchArtifact` records with canonical hashes |
| MarketWorld | Explicit `as_of`, seed, information policy, defensive data views, observed-time and availability-time filtering |
| Counterfactuals | Deterministic `add`, `multiply`, and `replace` column interventions; parent worlds and future rows remain unchanged |
| Temporal verifier | Requires task/world cutoff identity and rejects observations or availability timestamps after the boundary |
| Evidence verifier | Resolves content hashes and snapshot IDs inside the frozen world, checks required datasets, and checks claim citations |
| Numerical verifier | Compares named finite claims to frozen oracles with explicit absolute/relative tolerances |
| Reproducibility verifier | Requires content-addressed artifacts and a configurable number of byte-identical replay hashes |
| Reward | Weighted verified quality minus cost, latency, tool-call, failed-gate, temporal-leak, and budget-overrun penalties; bounded to `[-1, 1]` |
| Benchmark | Strict JSON loader, deterministic episode IDs, submission grader, two v0.1 point-in-time fixtures, and negative controls |

Every result is serializable and content-addressed. Re-evaluating the same case,
finding, verifier configuration, and declared resource usage produces the same
episode ID and reward.

## MarketWorld invariant

In a strict world, every dataset names both when a fact describes and when it
became available. A fiscal period ending in December does not make a February
filing visible in December.

```python
from src.world import ColumnShock, MarketWorld

world = MarketWorld(as_of="2024-06-30", seed=17)
world = world.with_dataset(
    "sec_facts",
    frame,
    observed_at="period_end",
    available_from="filed_at",
)

visible = world.data("sec_facts")
stress = world.fork(
    "revenue_-20pct",
    (ColumnShock("sec_facts", "revenue", "multiply", 0.8),),
)
```

`data()` returns a defensive copy. A fork hashes its interventions, identifies
its parent, updates the affected dataset snapshot, and applies shocks only to
rows visible at the cutoff.

## Benchmark policy interface

The runner accepts either a `ResearchFinding` or a `PolicyOutput` carrying the
finding plus explicit resource usage:

```python
from src.benchmark import BenchmarkRunner, PolicyOutput
from src.rewards import ResourceUsage

def policy(task, world):
    # Any agent/runtime may work here. It must return the strict finding schema.
    finding = investigate(task, world)
    return PolicyOutput(
        finding,
        ResourceUsage(cost_usd=0.08, latency_seconds=4.2, tool_calls=7),
    )

episode = BenchmarkRunner().run(case, policy)
```

Wall-clock time is not sampled implicitly by the grader because it would make
replays non-deterministic. The execution layer must submit metered usage as
evidence. A future isolated sandbox will own and attest that measurement.

## Frozen v0.1 cases

The repository currently ships two deliberately small contract tests:

- `pit_total_return` includes an observed-but-not-yet-available row and a future
  row. The only valid price path contains the two rows the market could know.
- `filing_gross_margin` includes a later restatement of the same fiscal period.
  The valid answer must use the filing version available at the historical
  boundary.

These are the executable seed of FinSight Bench, not a claim that a meaningful
public leaderboard exists yet. The target remains 30 diverse golden tasks
before publishing comparative agent results.

## Run and grade

```bash
pytest -q tests/test_forge_world.py tests/test_forge_benchmark.py tests/sabotage/test_forge_guards.py

python scripts/run_forge_benchmark.py \
  --tasks eval/tasks/forge_v0_1 \
  --submissions path/to/findings \
  --output data/exports/forge-v0.1/report.json
```

Each submission file is named `<task_id>.json` and contains either a raw
`ResearchFinding` or an envelope with `finding` and `usage` objects. Empty
evidence, claims, or artifacts are valid schema but fail the corresponding
required verifier. This keeps parsing separate from research quality and
produces useful failure data for a future curriculum.

## Explicitly not shipped

- typed MCP tool servers;
- isolated generated-code execution and sandbox attestations;
- multi-agent PI / scientist / skeptic / verifier orchestration;
- statistical and robustness verifier stages;
- learned cost-aware routing;
- forecast outcome resolution and calibration reports;
- preference-data generation or RLVR policy training;
- a 30-task benchmark or measured public leaderboard.

The next highest-leverage milestone is the deterministic sandbox plus typed
experiment tools. That turns the current finding/evaluation contract into a
real coding-agent environment while preserving the framework-independent
verification boundary.
