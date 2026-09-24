# FinSight Forge v0.2.5 — Real Single-Agent Baseline

Status: 54-episode real API baseline complete and independently verified. Local release checks pass; the release tag follows remote CI.

**REAL API MODEL BASELINE**

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

## Authorized OpenAI baseline

The exact configuration is [forge_v0_2_5_openai.json](../eval/models/forge_v0_2_5_openai.json).
Run sequentially in this order, with no transfer between allowances:

| Model | Reasoning | Hard cap | Input / cached input / output USD per million |
| --- | --- | --- | --- |
| gpt-5.6-luna | medium | $0.50 | $0.20 / $0.02 / $1.20 |
| gpt-5.6-terra | medium | $2.50 | $2.00 / $0.20 / $12.00 |
| gpt-5.6-sol | high | $5.00 | $4.00 / $0.40 / $20.00 |

The global hard cap is **$8.00** against approximately $9.80 of available credit.
The benchmark cannot increase these limits or consume another model's allowance.
Prices were checked on 2026-09-08 against the official
[Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
[Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), and
[Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) documentation.
These are fixed standard-service token prices for this experiment; no long-context,
batch, priority, external tools, or cross-provider calls are enabled.

Seeds 101, 211, and 307 identify task/world repetitions. The adapter sends neither
model seeds nor temperature. They do not promise deterministic API outputs.
Requested model aliases are frozen; every returned model identifier is recorded,
and the independent verifier rejects returned-version drift within a tier.
No unavailable model is silently substituted.

## Run and checkpoint

Configure `OPENAI_API_KEY` locally in the environment, `.env.local`, or `.env`
(these files are ignored by Git). Do not put credentials into the model JSON.

```text
python scripts/run_real_single_agent_baseline.py --preflight
python scripts/run_real_single_agent_baseline.py
python scripts/verify_real_single_agent_baseline.py data/exports/forge_v0_2_5_real_baseline
```

Preflight is read-only and makes zero API calls. The default live command enforces
the fixed $8 configuration; a different cap or OpenAI adapter is rejected.

Before Luna, a disclosed bootstrap estimate assumes 30,000 total tokens per
episode split equally between input and output ($0.378 for 18 episodes). Before
each later tier, the runner reprices mean observed episode input/output usage
at that tier's prices without assuming cache discounts. It refuses to start
if the projected remaining tier cannot fit. This estimate is not a guarantee:
Sol's higher reasoning effort may consume more output tokens. Request reservations
remain authoritative even when actual usage differs from the estimate.

Before **every paid request**, the runner durably reserves uncached input cost
using a conservative UTF-8 byte bound plus message framing allowance, together
with the maximum requested output cost. It also reserves input space within
the episode token limit. Output is capped at 4,096 tokens per request, or the
remaining episode token allowance after reserved input. All tiers use this rule.
If the full request cannot fit its dollar allowance, it stops before dispatch.

HTTP calls have no automatic retries, redirects, or model fallback. Raw response
bytes are persisted before parsing; provider request ID, response model and ID,
raw usage, cached input, reasoning output, raw response hash, request hash, and
computed cost are bound to each successful turn. Reasoning is a subset of output;
cached input is a subset of input. Neither is counted twice. Costs are explicitly
**token estimates, not invoices**; billed cost is null unless actual billing data
is available. An uncertain response retains the full reservation and blocks resume.

The hidden checkpoint directory retains a hashed request ledger, raw responses,
source/configuration freeze, tier estimates, and episode trajectories. A budget
refusal marks the interrupted episode `BUDGET_EXHAUSTED` in its failure reason.
A completed episode is never retried. An incomplete episode, orphan paid response,
unresolved reservation, changed configuration/source, or stale process lock blocks
automatic resumption for inspection; removing evidence is not a recovery procedure.

## Release gates

No `forge-v0.2.5` tag is created by the runner. A release still requires:

- All 54 episodes completed and accounted for, with no missing trajectories.
- Zero budget bypasses; every reservation and settled cost independently verified.
- Frozen requested identities and recorded returned versions, raw usage and costs.
- Complete false-alpha metric and independent ACCEPT / REJECT / ABSTAIN grading.
- No sealed verifier data exposed in API requests.
- The unchanged Reality Ladder hash and all artifacts independently verified.
- Full CI green for the release commit.

Poor model decisions remain measured outcomes. Evidence integrity and spending
failures prevent a release; successful API completion alone does not authorize one.
This measures behavior in six deliberately constructed Forge research tasks and
must be presented as a **REAL API MODEL BASELINE**.

## Live accounting correction (2026-09-08)

The first Luna tier exposed a verifier bug: well-formed but out-of-order tool
attempts increment the tool-plane counter without creating successful action
records. Comparing `tool_calls` to the number of recorded actions incorrectly
rejected those trajectories. The verifier now reconstructs attempts from the
saved model outputs and checks the resulting counters. A regression test covers
both the rejected attempt and tampering that removes it from the counter.

The first 11 raw trajectories remain byte-identical and their original verifier
outputs are preserved. All 11 were regraded with the fixed verifier before
generation resumed. The incomplete Luna / seed 211 / case 006 attempt is retained
as `INTERRUPTED_EXCLUDED`; only that cell was retried. The other completed cells
were never regenerated.

The final artifact contains 54 admitted episodes across the frozen three-model,
three-seed, six-task grid and 55 total episode attempts. Token-estimated cost is
$0.52861666 across all attempts and $0.52846606 across admitted episodes. The
excluded attempt cost remains charged against the original $8 global cap and
$0.50 Luna cap.

The historical engine certification independently verifies against all 332
source hashes at `forge-v0.2.4`. The Reality Ladder independently verifies with
artifact hash `db37154941316875261869460ee67c7382213c1a12fcdbb5fab84c48284e2e9c`.

Recovery evidence includes the original partial checkpoint, original verifier
records, original execution source, fixed-verifier records, excluded request
metadata, and a packaging-repair audit showing zero API calls after episode 54.
The final artifact independently verifies with baseline ID
`c5b27e19e981b4e554a4ca1c7800d4e186f4511645f642e0536c79ff57d03bbb`.

Release validation completed locally: 471 backend tests passed; frontend lint,
TypeScript, and production build passed; the truth-contract checks passed; and
the exact configured API key is absent from every final artifact file.
