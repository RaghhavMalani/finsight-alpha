# FinSight Forge v0.2.4 engine certification

Status: **certification system release eligible**. The release describes Forge's
ability to issue independently verified positive and negative engine verdicts. It
does not claim that every integrated engine reached C4.

## Engine verdicts

| Engine | Cumulative level | Status | Blocking tapes |
| --- | --- | --- | --- |
| VectorBT 1.1.0 | C4 | CERTIFIED | none |
| NautilusTrader 1.231.0 | C4 | CERTIFIED | none |
| hftbacktest 2.4.4 | C0 | FAILED_CERTIFICATION | T03, T04, T12 |
| legacy HFT 0.5.0 | C0 | FAILED_CERTIFICATION | T12 |

Certification remains cumulative for each engine. A failed C1 semantic tape
therefore leaves that engine at C0 even when its worker replay is deterministic.
There is no global engine-certification level. The release artifact reports
`certification_summary: MIXED`, `minimum_engine_level: C0`, and
`maximum_engine_level: C4`.

## System release result

The release gate is scoped to the Forge certification system. Its artifact records
PASS for:

- the Forge-owned independent oracle suite;
- complete C0-C4 verdict evidence for all four declared engines;
- artifact hash and identity consistency;
- byte-identical replay verification;
- C3 comparison and invalid-comparison rules;
- all required production host-boundary mutations;
- exact preservation of failed engine levels and blocking tapes;
- the full Forge test suite;
- fresh isolated locked environments with unpatched official packages;
- source stability during certification; and
- preservation of the original global-gate artifact.

The current artifact is
`eval/certification/forge_v0_2_4/engine_probe_artifact.json` with canonical
artifact hash:

```text
9ee9dabbadaa0e260e942d9c304c3c5dd0571e49470d8e8a4f35a0151c3f3166
```

The independent verifier reports `internally_consistent: true` and
`system_release_eligible: true`. The full suite passed **427 tests,
0 failures, 0 errors**.

## Preserved pre-release artifact

The original artifact remains byte-identical at
`eval/certification/forge_v0_2_4/history/engine_probe_artifact.global-gate.4eb935391746fa7ee7c26d451ae38e2f890fd4e7aeeafb3435c11300228e0401.json`.
Its canonical artifact hash is:

```text
4eb935391746fa7ee7c26d451ae38e2f890fd4e7aeeafb3435c11300228e0401
```

Its file SHA-256 is
`e0b7057093553cbc8b2c4b8e463bc8aa5fdb6e25223e052e22f67250914bc61f`.
The new artifact names this evidence in `supersedes_artifact` and explains that
the old gate conflated system validity with the minimum third-party engine level.

## Evidence and negative findings

Twelve Forge-owned deterministic tapes, T01-T12, are graded outside each worker.
Workers do not receive expected executions or accounting answers. Forge
independently reconstructs cash, position, fees, equity, and average-cost PnL from
native fills. Two worker processes per engine must produce byte-identical output.
C3 evidence contains twenty-two passing shared-semantic comparisons and one
intentional queue comparison rejected as
`QUEUE_MODEL_NOT_IN_COMMON_CAPABILITY_SET`.

hftbacktest 2.4.4 exposes partial executions in native order records without
applying them correctly to position and balance. T03 reports a one-unit execution
with unchanged account state; T12 accounts only its final two-unit fill; T04 does
not expose or account for the complete multi-level execution. This matches open
upstream issue [#316](https://github.com/nkaz001/hftbacktest/issues/316). Candidate
PR [#323](https://github.com/nkaz001/hftbacktest/pull/323), at commit
`22856574ca1d877594ecd8fb0f5ef33e1e702cbb`, remains open, unmerged, and was not
applied to the certified package.

Legacy HFT's T12 declaration also remains supported. Its matcher emits native
PARTIAL and FINISHED statuses for the requested queue sequence. The matcher and
`Strategy` share one mutable `OrderRequest`: matching increments `volume_filled`
on PARTIAL and strategy accounting increments it again. The final native account
therefore records 2 of 3 filled base units. Forge's adapter reconstructs both
native fills correctly, so this is an implementation defect rather than an
unsupported semantic or adapter normalization error.

Twenty-nine production host-boundary mutations pass for every engine fingerprint.
Attacks on actual native semantic records remain part of each engine's cumulative
C4 verdict, which is why failed C1 engines are not promoted. Their negative
results do not invalidate the host-boundary mutation harness.

## Capability use after v0.2.4

Reward-bearing Reality Ladder work may use the certified VectorBT and
NautilusTrader capabilities. hftbacktest partial-fill accounting, multi-level
sweeps, and queue partial fills remain blocked. Legacy HFT T12 queue partial-fill
accounting remains blocked. Capability-scoped certification is deferred to a
later refinement.

The `forge-v0.2.4` tag identifies the certification-system release and must not be
read as four C4 engine certifications.

## Reproduce

Provision environments at a path that does not exist:

```powershell
python scripts\prepare_certification_environments.py --destination .engine-envs\v024-release
```

Run and independently verify the certification:

```powershell
python scripts\certify_execution_engines.py --environment-root .engine-envs\v024-release
python scripts\verify_engine_certification.py
```

Both commands exit successfully only when the system release evidence is valid.
