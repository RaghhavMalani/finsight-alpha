# FinSight Forge master roadmap

Status: active master sequence.
Updated: 2026-09-10.

FinSight Forge advances through two coordinated tracks. Research artifacts define
truth; product surfaces observe those artifacts. UI code may project, navigate,
filter, and visualize research evidence, but it must never create, mutate, grade,
or silently infer benchmark truth.

| Milestone | Research / agent track | UI / product track |
| --- | --- | --- |
| v0.2.5 | Real single-agent baseline — complete | Observer Foundation — complete |
| v0.2.5.1 | Behavioral Discrimination Hardening — active | Reality Terrain + Replay — finishing |
| v0.3 | Multi-agent ablations | MarketWorld graph + Research Lab |
| v0.4 | Learned experiment routing | Routing / decision visualization |
| v0.5 | Delayed outcome resolution | Forecast ledger + outcome UI |
| v0.6 | RLVR | Learning / policy-improvement console |

## Research track

```text
v0.2.5      Real single-agent baseline             COMPLETE
v0.2.5.1    Behavioral discrimination hardening    ACTIVE
v0.3        Multi-agent ablations
v0.4        Learned experiment routing
v0.5        Delayed outcome learning
v0.6        RLVR
```

v0.2.5.1 is not a UI dependency and does not wait for a product phase. It runs on
its own branch against a new sealed distribution, produces a new content-addressed
artifact, and reuses no v0.2.5 trajectories. Its research contract is frozen in
[`forge-v0.2.5.1-behavioral-hardening.md`](forge-v0.2.5.1-behavioral-hardening.md).

v0.3 holds tasks, models, budgets, verifier semantics, and artifact bindings fixed
while comparing:

```text
SINGLE AGENT
PLANNER + RESEARCHER
PLANNER + RESEARCHER + SKEPTIC
```

The primary ablation is quality improvement versus coordination overhead:

```text
delta Q = Q_multi-agent - Q_single-agent
delta C = C_multi-agent - C_single-agent
delta T = T_multi-agent - T_single-agent
delta H = H_multi-agent - H_single-agent
```

## UI track

```text
Phase 1     Observer Foundation                     COMPLETE
Phase 2     Run Observer                            COMPLETE
Phase 3     Reality Terrain + Replay                FINISHING
Phase 4     MarketWorld Counterfactual Graph
Phase 5     Research Lab
Phase 6     Experiment + Quant surfaces
Phase 7     Hardened Bench / v0.2.5.1 integration
Phase 8     Multi-agent comparison UI
Phase 9     Learned routing visualization
Phase 10    Outcome + RLVR console
```

Phase 7 consumes the independently verified v0.2.5.1 projection. Until that
artifact exists and verifies, the Hardened column remains `UNAVAILABLE`.

The Bench comparison will expose, at minimum:

- Verified Research Success;
- False-Alpha Acceptance;
- Abstention Accuracy and `NOT_COMPARABLE` Accuracy;
- Experiment Selection Regret, including USD, tool-call, high-fidelity, and
  wall-time components;
- cost per verified finding and measured latency.

Every model/task cell links to its Run Observer trajectory and the exact oracle
resource comparison. The UI displays the verifier-owned regret record; it does
not recompute regret in TypeScript.

## Governing release rule

Research and UI changes may advance concurrently but cannot contaminate one
another. A research release requires its own sealed suite, source manifest,
complete task/model/seed grid, fail-closed spend ledger, and independent artifact
verification. A UI release requires read-only projections and leaves unsupported
research versions visibly unavailable.
