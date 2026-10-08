# Phase 1b: Agents reference redesign

Branch `feat/agents-reference-redesign` starts at main's PR #21 merge, `21554639b5a55728d3a79c0c1424ad9016446a00`. Scope is Agents presentation and verification. The terminal shell, key bindings, Replay exporter/manifest/payloads, licence policy, data sources and frozen backend/model inputs are unchanged.

## Reference and composition

The unchanged `docs/forge-reference.html` supplies background `#050607`, panel `#0B0D10`, rules `#1A1E23`, amber `#F0A929`, Inter for words and JetBrains Mono for measurements. The existing 1360 px shell column contains the Agents page. One panel level, 22 px page titles, 14 px panel headings and readable body text replace the dense home console.

Overview has the reference's four-metric strip, task/model/seed matrix, recorded verification issues, alphabetical model table and reality ladder. A native modal run drawer shows actual actions, verdict, checks and identifiers, with links into the existing 2D/3D trajectory and evidence inspector. Runs, Bench, Worlds and Artifacts use the reference's compact tables and filters. Existing URLs, run/node selections and canonical metric values are preserved. The retained 3D inspector uses a stable HTML label portal so switching views does not race label-root cleanup. Mean latency is labelled mean, rather than median.

## Evidence boundary

Transport and evidence are separate labels. Replay reads recorded artifacts; configured Local Live reads frozen records from the local API. Neither executes a model from this interface. The v0.2.5 baseline records real API execution **on synthetic research tasks**, not real market alpha. The reality ladder remains a synthetic reference experiment. World references do not invent missing standalone manifests. Pending releases show no measurements.

The existing SHA-checked publication and projection adapters remain the data path. Presentation uses expected verdicts, verifier checks and false-alpha flags already in those projections. It does not reconstruct checks or infer expected outcomes from task names. Contradictory grades, unsupported verdicts, duplicate task/model/seed cells, model/coverage mismatches and substituted run identities fail closed. No public payload is regenerated.

## Verification

`frontend-v2/scripts/verify-agents.mjs` covers genuine frozen records and agent-specific grade/source/identity sabotage. Its production-browser mode checks desktop/mobile Agents pages, the drawer, keyboard focus, URL filters and unavailable evidence. Public screenshots use unmodified Replay with no request interception. Mocked Local Live and signed-out checks run separately and create no screenshots.

Run lint, TypeScript, production build, every `verify-*.mjs`, existing browser QA, the Agents browser script and the full Linux backend CI suite. The Chrome/Edge/Firefox checker rechecks native F5/F7 behavior and waits for each exact command destination to settle before entering the next command; shell behavior is unchanged. Screenshots are under `docs/screenshots/phase1b-agents-*`. Final measured validation is recorded in the PR.

## Postable result

Agents now presents the frozen API baseline through the supplied Forge reference layout. The overview keeps unverified runs, exact verifier failures and synthetic task scope visible while opening each run's recorded actions and evidence. It changes how evidence is inspected without claiming market alpha or live model execution.

Record **60 seconds**: F9 Overview and its four headline numbers (10s) → task matrix, open the wrong-verdict run and failed checks (15s) → full trajectory, action/turn/check tabs and source provenance (15s) → Runs filters and a pending Bench release (10s) → synthetic reality ladder and missing world manifests (10s).

## Later work

Research OS v0.1 and Paper → Hypothesis → Experiment → Falsification follow separately. Forward hooks, weights/gradients, activation-driven connections and WebSocket/replay transport belong to a later Model/Agent Observatory extension.
