# FinSight Forge v0.2.5 — Real Single-Agent Baseline

Status: implementation complete; live model freeze pending.

This milestone measures whether one language-model research agent spends a
limited experiment budget well enough to accept robust alpha, reject fragile
alpha, and abstain when the evidence or engine trust is insufficient. It does
not contain planner, skeptic, multi-agent, learned-routing, or RLVR behavior.

## Frozen task design

The suite contains six sealed cases and three deliberately paired 2.0-Sharpe
screens:

| Internal case class | Required behavior | Earliest sufficient stop |
| --- | --- | --- |
| Obviously fragile alpha | Reject | Screen |
| Dies under latency | Reject | Latency |
| Dies under stress | Reject | Counterfactual stress |
| Robust candidate | Accept | Counterfactual stress |
| Insufficient evidence | Abstain | Screen |
| Required engine is uncertified | Abstain after fail-closed refusal | Event replay |

Internal class labels, expected verdicts, required stages, future evidence,
and verifier logic are sealed. The model receives only an opaque case ID,
hypothesis, acceptance rule, budget, engine trust policy, tool definitions,
and evidence returned by actions it actually takes.

Every task is bound to:

- engine certification artifact
  `9ee9dabbadaa0e260e942d9c304c3c5dd0571e49470d8e8a4f35a0151c3f3166`;
- Reality Ladder artifact
  `db37154941316875261869460ee67c7382213c1a12fcdbb5fab84c48284e2e9c`.

The published `forge-v0.2.4.1` tag remains unchanged.

## Research contract

Each episode permits at most 12 tool calls, five engine runs, two
high-fidelity runs, 30,000 tokens, USD 1.00, and 180 wall-clock seconds. The
live runner also applies a user-authorized cap across all 54 episodes.

An engine run in this behavioral benchmark is a logical promotion that reveals
the next sealed result from a frozen task world. The execution mode is recorded
as `frozen_evidence_replay`; VectorBT and Nautilus are not launched anew for
every model episode. This isolates experiment-routing behavior and avoids
claiming native compute that did not occur. Native semantic confidence comes
from the bound v0.2.4 certification and v0.2.4.1 Reality Ladder artifacts.

The only final verdicts are `ACCEPT`, `REJECT`, and `ABSTAIN`. Engine trust is
checked before sealed evidence is read. A C0 hftbacktest engine asked to meet a
C1 requirement returns a refusal without metrics and without consuming an
engine run.

Paid-call checkpoints are append-only and durable. A resumed run skips every
completed model/seed/task tuple. The final artifact is created only after six
tasks × three models × three seeds have produced 54 episodes.

## Evidence and independent grading

Each trajectory records provider/model identity and version, whether the
provider supports seeds, temperature, seed, prompt hash, tool schema hash,
public task hash, sealed world hash, certification and Reality Ladder hashes,
token use, cost, latency, model outputs, tool results, and a content hash.

The independent verifier recomputes action results, engine trust, budgets,
model-to-action binding, final decision binding, required-gate evidence,
trajectory hashes, episode summaries, and artifact hashes. Post-hoc changes to
metrics or decisions fail verification.

Headline metrics are Verified Research Success, False-Alpha Acceptance Rate,
Correct Rejection Rate, Correct Acceptance Rate, Abstention Accuracy,
Critical-Gate Failure Rate, mean tool and engine runs, mean cost and latency,
Cost per Verified Finding, and Unnecessary High-Fidelity Promotion Rate. A
secondary behavioral score is `1` for a verified finding, `-1` for false-alpha
acceptance, and `0` otherwise.

## Live freeze inputs still required

The model file must contain exactly three real identities:

```json
{
  "schema_version": "forge-real-single-agent-models/0.2.5",
  "models": [
    {
      "provider": "PROVIDER",
      "model": "EXACT_MODEL_ID",
      "model_version": "EXACT_VERSION_OR_PROVIDER_SNAPSHOT",
      "model_kind": "live",
      "temperature": 0.0,
      "seed_supported": true,
      "input_usd_per_million_tokens": 0.0,
      "output_usd_per_million_tokens": 0.0
    }
  ]
}
```

The runner accepts a provider adapter by `module.path:factory` and requires the
authorized total spend explicitly:

```text
python scripts/run_real_single_agent_baseline.py \
  --models MODEL_FILE.json \
  --client-factory PACKAGE.MODULE:factory \
  --max-total-cost-usd LIMIT
```

No live model call has been made and no v0.2.5 release tag exists yet. The
baseline can be frozen only after the exact model IDs, versions, prices, seed
support, provider adapter, and total API spending limit are supplied.
