# FinSight Forge v0.2.4.1 Reality Ladder Freeze

Status: **frozen and independently verified**.

This release runs one fixed dual moving-average strategy through the two engines
that reached C4 in v0.2.4. It uses three deterministic synthetic market regimes
and five fixed seeds. No model selection, parameter search, ML, external market
data, hftbacktest result, or legacy-HFT result enters the reward-bearing evidence.

## Frozen design

| Dimension | Frozen value |
| --- | --- |
| Strategy | Long/flat dual moving average, fast 5, slow 20, quantity 100 |
| Causality | Signal uses observations through `t`; order submits at `t+1` |
| Regimes | `TRENDING`, `MEAN_REVERTING`, `HIGH_VOLATILITY` |
| Seeds | `101`, `211`, `307`, `401`, `503` |
| Engines | VectorBT C4 and NautilusTrader C4 |
| Logical native runs | 75 |
| Stage records | 90, including 15 analytical L0 records |

The ladder uses six measured checkpoints because L3 is split into fee/slippage
and latency checkpoints for causal attribution:

1. L0 analytical next-observation fills with no costs.
2. L1 VectorBT screening under the same locked-book assumptions.
3. L2 Nautilus event replay under the same assumptions.
4. L3 native fees plus deterministic quoted-spread slippage.
5. L3 with an additional 2.5-second insert latency.
6. L4 with the same costs and latency in a counterfactual stressed market.

VectorBT and Nautilus call the exact semantic adapter functions whose source was
bound into the v0.2.4 certification artifact. A new source-hashed batch harness
only amortizes package import and JIT startup; it measures every logical tape
individually. Nautilus runs are split across six processes so its process-global
cash-borrowing venue registry receives unique certified T01–T10 tape IDs.

## Result

All values below are means across the full 15-case grid.

| Checkpoint | Engine | Sharpe | Gross return | Net return | Fees | Slippage | Latency cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| L0 analytical | Forge oracle | 4.7991 | 1.4347% | 1.4347% | 0.00 | 0.00 | 0.00 |
| L1 screening | VectorBT | 4.7991 | 1.4347% | 1.4347% | 0.00 | 0.00 | 0.00 |
| L2 event replay | Nautilus | 4.7991 | 1.4347% | 1.4347% | 0.00 | 0.00 | 0.00 |
| L3 fees/slippage | Nautilus | 4.6118 | 1.4084% | 1.3638% | 44.64 | 26.27 | 0.00 |
| L3 latency | Nautilus | 3.7292 | 1.1110% | 1.0663% | 44.67 | 323.67 | 297.40 |
| L4 market stress | Nautilus | 0.3449 | 0.4094% | 0.3517% | 57.71 | 495.33 | 380.27 |

The primary metric is Sharpe. The alpha survival ratio uses L1 screening as its
denominator and L4 as its numerator:

```text
alpha survival ratio = 0.344925 / 4.799068 = 0.071873 (7.2%)
```

The signed Sharpe changes reconcile exactly from L1 to L4:

| Cause | Sharpe change |
| --- | ---: |
| Model/semantic translation | 0.0000 |
| Fees and deterministic quoted-spread slippage | -0.1873 |
| Latency | -0.8825 |
| Counterfactual market stress | -3.3843 |

The zero model/semantic change is expected and useful: under the deliberately
shared immediate-fill assumptions, the C4 VectorBT and Nautilus paths converge.
The strategy retained only **7.2%** of screened risk-adjusted performance, and
counterfactual market stress caused the largest degradation.

| Regime | VectorBT L1 | Nautilus L2 | L4 stress | Survival |
| --- | ---: | ---: | ---: | ---: |
| Trending | 10.2309 | 10.2309 | 1.7152 | 16.8% |
| Mean reverting | 3.8384 | 3.8384 | -0.4527 | -11.8% |
| High volatility | 0.3279 | 0.3279 | -0.2278 | -69.5% |

Negative regime survival means the stressed strategy crossed from positive to
negative risk-adjusted performance. The aggregate ratio remains defined because
the aggregate L1 denominator is positive.

## Engine trust boundary

The v0.2.4.1 benchmark schema requires an explicit task allowlist:

```json
{
  "allowed_engines": {
    "vectorbt": {"minimum_certification": "C4"},
    "nautilus": {"minimum_certification": "C4"}
  }
}
```

The tool plane checks this policy before parsing a request or invoking an engine.
The release evidence binds VectorBT to fingerprint
`b4fcc771680deab5207dfadc9d0f6227ff89a581a265888bc48b7c358ecd1b2c`
and Nautilus to
`03096be87e991faf462834d403630627a436f1c04e0ccfa2bc1ed5aefa824c03`.
hftbacktest is recorded as C0 and rejected because it is absent from the task
allowlist; a direct C1 requirement also rejects C0 before execution.

This release applies the whole-engine rule
`Certification(engine) >= Required(capability)`. Capability-scoped certification
remains later work.

## Evidence and verification

The immutable artifact is
`eval/reality_ladder/forge_v0_2_4_1/reality_ladder_artifact.json`.

```text
artifact hash: db37154941316875261869460ee67c7382213c1a12fcdbb5fab84c48284e2e9c
evidence hash: 414c0ec6436a2ea55151a7dda457893cbe7509b966e1d8ba19930c9f80e02f30
source certification: 9ee9dabbadaa0e260e942d9c304c3c5dd0571e49470d8e8a4f35a0151c3f3166
```

The artifact hash binds the complete frozen run, including measured runtimes. The evidence hash excludes timing and process-request fields, so deterministic numerical replay has a stable identity.

Verify all artifact, task, source, world, strategy, record, metric,
certification, trust, aggregate, and causal-decomposition bindings:

```bash
python scripts/verify_reality_ladder_freeze.py
```

Regeneration is intentionally fail-closed if the artifact already exists. In a
clean checkout without the frozen output, provide the fresh v0.2.4 environment
root explicitly:

```bash
python scripts/run_reality_ladder_freeze.py \
  --engine-env-root .engine-envs/v024-system-release-20260906
```

## Scope

This is synthetic execution evidence for one auditable strategy. It does not
claim live-market performance, market impact realism, partial-fill evidence,
queue-position evidence, strategy optimality, or generalization beyond the
frozen regime generator. Those limits are recorded so v0.2.5 can evaluate
whether an agent correctly rejects execution-fragile alpha under a fixed budget.
