# FinSight Forge

> **An RL environment and evaluation harness for coding agents, instantiated in finance.**

FinSight is a reproducible research lab where a coding agent works against a
point-in-time financial data plane and a programmatic verifier grades what it
produces. The verifier result is shaped to be an RL reward; the evidence trail
is designed to make that reward auditable.

This is one repository with two readings:

| Infrastructure reading | Finance reading |
| --- | --- |
| Deterministic artifacts, seed control, counterfactual evaluation, fault injection, judge calibration, per-commit regressions | As-of data contracts, snapshot lineage, options pricing, Monte Carlo risk, regime models, walk-forward signals, grounded research |
| The systems story for Databricks and NVIDIA | The domain-depth story for JPMorgan and Goldman Sachs |

The terminal remains a useful observer and demo surface. It is no longer the
definition of the project.

The first Forge vertical slice is now executable: framework-independent
research tasks and findings, a strict `MarketWorld`, deterministic temporal /
evidence / numerical / reproducibility gates, shaped verified rewards, and
versioned frozen benchmark fixtures. See
[`docs/FINSIGHT_FORGE.md`](docs/FINSIGHT_FORGE.md) for the contracts and the
honest implementation boundary.

## The numbers this repository publishes

FinSight's coding-agent scorecard is calculated from strict, versioned JSONL
evidence. Values are never hard-coded into this README, and missing evidence is
rendered as `NOT MEASURED`, `PARTIAL`, or `UNDEFINED` rather than zero.

| Metric | Published definition | Default evidence gate |
| --- | --- | --- |
| Replay fidelity | Byte-identical replay comparisons / all replay comparisons | Exactly 100% across at least 5 runs per group |
| Contamination estimate | Mean(real-world Sharpe - counterfactual-world Sharpe) | Every measured pair has both worlds |
| Cost per verified finding | Total attempt cost in USD / verifier-passing findings | Failed attempts remain in the numerator |
| Recovery rate | Recovered deterministic faults / injected deterministic faults | At least 90% |
| Judge-human agreement | Cohen's kappa over paired categorical labels | At least 0.80; single-class samples are undefined |
| Regression + seed variance | Pass rate and population variance of per-seed pass rates, per commit | 100% pass, zero variance, at least 5 complete seeds |

Build the scorecard:

```bash
python scripts/build_agent_eval_report.py \\
  --input path/to/attempts.jsonl \\
  --output-dir data/exports/agent-eval \\
  --require-complete
```

Use `--require-gates` to make every configured target a release condition. The
input schema lives in
[`eval/schema/attempt-record.schema.json`](eval/schema/attempt-record.schema.json),
and the exact formulas and anti-gaming rules are documented in
[`docs/AGENT_EVALUATION_PROTOCOL.md`](docs/AGENT_EVALUATION_PROTOCOL.md).

## What is implemented now

| Layer | Current repository evidence |
| --- | --- |
| Evaluation | Six-metric deterministic scorecard, strict provenance schema, stable JSON/Markdown reports, explicit completeness state |
| Forge environment | Machine-actionable task/finding contracts, availability-dated `MarketWorld`, deterministic counterfactual forks, four-stage verifier suite, bounded reward model |
| Frozen tasks | FinBench/Forge v0.1 harness with two point-in-time cases and future-data/replay sabotage tests |
| Negative controls | Sabotage tests for replay mutation, missing counterfactuals, denominator stuffing, unrecovered faults, judge drift, seed failure, and incomplete task/seed grids |
| Truth foundation | Mandatory `as_of` boundaries, content-addressed computation contracts, epistemic states, tenant-licensed immutable snapshots, run and forecast ledgers |
| ML timing | Expanding lagged regime thresholds, horizon purge, independent embargo, purged validation, untouched outer holdout |
| Quant verifier | Published-reference Black-Scholes checks, finite-difference Greeks, Monte Carlo convergence, VaR coverage, Markowitz oracle, shuffled-label control, RAG retrieval set |
| Product surface | FastAPI backend and React/TanStack terminal displaying server-owned computation truth |

The complete MCP tool surface, isolated generated-code sandbox, multi-agent
workflow, statistical/robustness verifier stages, 30-task benchmark, outcome
resolution, cost-aware router, and RLVR training loop remain roadmap work. They
are not claimed as shipped. See
[`docs/V2_TRUTH_FOUNDATION.md`](docs/V2_TRUTH_FOUNDATION.md) for the boundary.

## Why finance

Finance makes evaluator shortcuts expensive and visible. A plausible result
can still be wrong because it observed a future filing, relabelled a historical
regime using future volatility, skipped a label-horizon purge, ignored trading
cost, or reported a simulated quantity as historical. FinSight turns those
failure modes into verifier inputs:

```text
frozen snapshot + as_of + seed + prompt + plan + commit
                         |
                    coding attempt
                         |
       numerical / temporal / evidence / replay gates
                         |
           verified finding + auditable reward
```

The hard dependency rule is architectural: quant, determinism, and verification
must not depend on the agent framework. Orchestration is a replaceable shell;
the evidence and reward contract are the project.

## Verification

Run the fast negative controls and metric-contract tests:

```bash
pytest -q tests/test_agent_eval_metrics.py tests/sabotage
```

Run the Forge environment and frozen-task checks:

```bash
pytest -q tests/test_forge_world.py tests/test_forge_benchmark.py tests/sabotage/test_forge_guards.py
```

Grade a directory of machine-actionable finding submissions:

```bash
python scripts/run_forge_benchmark.py \
  --tasks eval/tasks/forge_v0_1 \
  --submissions path/to/findings \
  --output data/exports/forge-v0.1/report.json
```

Run the full repository suite:

```bash
pytest -q
```

Run the cross-layer quant validation suite:

```bash
python scripts/run_validation_suite.py
```

That suite evaluates deterministic pricing, risk, portfolio, signal, and RAG
checks and writes `data/exports/validation/validation_report.json` plus a
Markdown report. Its default Monte Carlo checkpoints range from 10,000 through
10,000,000 paths. Use `--returns-csv` to supply a different historical return
series.

## Run locally

Requires Python 3.10+ and Node.js for the observer UI.

```bash
python -m venv .venv

# Windows
.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn backend.main:app --reload
```

In a second terminal:

```bash
cd frontend-v2
npm ci
npm run dev
```

The API documentation is at `http://127.0.0.1:8000/docs`; the frontend dev
server prints its local URL.

## Repository map

```text
src/eval/          strict evidence model, six metrics, stable report renderer
src/findings/      framework-independent research task/finding/artifact schema
src/world/         strict point-in-time worlds and counterfactual forks
src/verifiers/     temporal, evidence, numerical, and replay gates
src/rewards/       cost-aware verified reward shaping
src/benchmark/     frozen-task loader and deterministic episode runner
eval/schema/       machine-readable attempt contract
eval/tasks/        versioned Forge benchmark fixtures
tests/sabotage/    negative controls for evaluator protections
src/truth/         epistemic states and content-addressed computation contracts
src/data/          as-of boundary, snapshots, lineage, licensing, providers
src/validation/    independent quant and retrieval validation oracles
src/pricing/       Black-Scholes, Greeks, implied volatility, surfaces
src/risk/          VaR/CVaR and portfolio optimization
src/ml/            point-in-time features, walk-forward signals, stress tests
src/rag/           tenant/ticker-isolated grounded research
backend/           FastAPI observer and computation API
frontend-v2/       React/TanStack observer terminal
```

## Scope line

This is an agent-systems and research-infrastructure project, not a SaaS
checkout flow. Billing, plan entitlements, usage quotas, growth analytics, and
org-admin polish are intentionally frozen unless commercialization becomes the
goal. Engineering time goes to deterministic execution, verification,
counterfactuals, calibration, and frozen evaluations.
