# FinSight Forge v0.2.3 — Simulation Engine Federation

Forge v0.2.3 keeps one `ResearchAgent` and adds multiple optional simulation
executors behind one canonical evidence boundary. It does not add personas,
multi-agent orchestration, a learned router, RLVR, or live trading.

The last pre-federation source checkpoint is annotated tag `forge-v0.2.2`,
which peels to commit `bcd48df`.

## Architecture

```text
ResearchAgent
    |
ForgeToolPlane (typed, provenance-bearing)
    |
SimulationToolPlane
    |
EngineRegistry
    +-- JSON/stdin --> VectorBT worker environment
    +-- JSON/stdin --> Nautilus worker environment
    +-- JSON/stdin --> hftbacktest worker environment
    `-- JSON/stdin --> legacy-hft worker environment
    |
canonical SimulationOutcome / SimulationResult
    |
five host-side execution verifiers
```

Forge core imports none of the four external engine packages. A configured
worker command is an argument vector and always runs with `shell=False`, a
bounded timeout, bounded stdout, and a minimal environment that excludes
credentials. Each engine environment installs its engine and its canonical
backend module separately. The repository worker entrypoints are:

| Engine | Entrypoint | Backend module expected in isolated environment |
| --- | --- | --- |
| VectorBT | `python -m src.execution.workers.vectorbt_worker` | `finsight_vectorbt_worker_backend` |
| Nautilus | `python -m src.execution.workers.nautilus_worker` | `finsight_nautilus_worker_backend` |
| hftbacktest | `python -m src.execution.workers.hftbacktest_worker` | `finsight_hftbacktest_worker_backend` |
| legacy HFT | `python -m src.execution.workers.legacy_worker` | `finsight_legacy_hft_worker_backend` |

An engine package missing from its worker environment produces `UNAVAILABLE`.
An installed engine without a request-specific canonical backend produces
`UNSUPPORTED`. The default registry configures no commands and therefore does
not claim any external-engine result. CI uses the project-owned
`conformance-reference` worker only to test the JSON protocol, accounting,
normalization, replay, and sabotage guards; it is explicitly not market truth.

The process boundary is dependency isolation, not a kernel security boundary.
Production external workers should run in separate containers or VMs with
network policy, read-only input mounts, no secrets, CPU/memory limits, and
worker-specific dependency locks.

## Canonical evidence contract

`SimulationRequest` content-addresses:

- world, strategy, input dataset, and Forge-core dependency lock;
- UTC start/end, seed, scenario, and backtest/paper mode;
- required capabilities;
- explicit fees, latency, queue, slippage, and market-impact assumptions.

The dataset hash must equal the canonical hash of the supplied worker inputs.
Only `BACKTEST` and `PAPER` are valid modes.

`SimulationResult` records:

- engine ID, version, commit/revision, adapter version, runtime, optional Rust
  version state, engine dependency-lock hash, worker hash, and SPDX expression;
- request/world/strategy/dataset/assumption hashes and seed;
- normalized orders, fills, independent account state, and runtime;
- PnL, turnover, fees, slippage, drawdown, fill rate, queue position, latency,
  and Sharpe as `EpistemicValue` objects;
- result and replay hashes computed by Forge, not trusted from a worker.

Every canonical metric is present. A metric without evidence carries one of
`UNAVAILABLE`, `UNSUPPORTED`, `NOT_MEASURED`, or `ERROR`, a reason, and no
numeric value. Absence cannot be encoded as zero.

The host rejects unknown response fields, request/hash mismatch, engine or
license mismatch, invalid provenance, unbound worlds/strategies/datasets,
assumption changes, and self-supplied replay hashes that do not recompute.
There is no grade, reward, verifier, or promotion field in the worker schema.

## Reality Ladder

The ladder is a sequence of increasingly realistic evidence stages:

1. `L0_MATHEMATICAL`
2. `L1_VECTORIZED`
3. `L2_EVENT_REPLAY`
4. `L3_MICROSTRUCTURE`
5. `L4_COUNTERFACTUAL_STRESS`

For a consistent metric `M`, Forge computes:

```text
Execution Reality Gap = M_initial - M_final
Alpha Survival Ratio  = M_final / M_initial
```

At least two measured stages are required and a zero initial metric produces
`NOT_MEASURED`, never infinity or a false zero. Strategy promotion requires
both a configured minimum final metric and minimum survival ratio.

## Independent verifiers

External workers are untrusted executors and never grade themselves.

- `ExecutionIntegrityVerifier` rebinds hashes and seed, checks signal/order/fill
  causality and information availability, then independently reconstructs cash
  and positions from fills.
- `FillPlausibilityVerifier` compares fills with host-known contemporaneous
  bid/ask, declared slippage, book volume, queue-ahead quantity, and order size.
- `LatencyRobustnessVerifier` requires measured results at
  `{0,1,5,10,25,50,100}` milliseconds and computes
  `D_L = (M(0)-M(L))/(abs(M(0))+epsilon)`.
- `CrossEngineConsistencyVerifier` checks common world/strategy bindings and
  fails metric disagreement beyond a configured simplified-model tolerance.
- `MicrostructureRobustnessVerifier` requires queue, fees, slippage, latency,
  spread, partial-fill, volatility, and liquidity stresses and gates worst-case
  alpha survival.

These are a separate execution-verifier suite. The existing research-finding
verifiers and the frozen v0.2.1/v0.2.2 artifacts are unchanged.

## Prediction-market research pack

`src/prediction_markets` is an independent implementation. It contains:

- open-lower/closed-upper `$1` event-band settlement;
- Normal, Student-t, and Cauchy CDFs;
- `F(U)-F(L)` probability and fair-value calculations;
- symmetric spreads, linear inventory skew, bounded
  Avellaneda–Stoikov quotes, and a documented GLFT-style finite-inventory
  approximation.

No third-party Kalshi bot/client code was copied, vendored, or installed. Any
repository without an explicit compatible license remains concepts-only.

## Benchmark surface

`eval/tasks/forge_v0_2_3_execution` contains exactly twelve strict,
content-addressable task specifications:

1. moving-average parameter sweep;
2. walk-forward selection;
3. event-replay reproduction;
4. VectorBT/Nautilus equivalence;
5. fill-discrepancy diagnosis;
6. latency edge decay;
7. queue-position sensitivity;
8. L2/L3 fill difference;
9. legacy simulator disagreement;
10. event-band probability;
11. inventory-aware event-market making;
12. full Reality Ladder survival.

This is an executable contract/conformance suite, not a published performance
leaderboard. External-engine numbers remain unavailable until separately locked
workers and datasets are configured and replayed.
