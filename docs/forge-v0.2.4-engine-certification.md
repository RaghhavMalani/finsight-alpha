# FinSight Forge v0.2.4 engine certification status

Status: **release blocked at C1 and C4**. Do not create `forge-v0.2.4` or the commit
`feat: certify Forge execution engines` from this evidence.

## What is certified

- Four independent Python environments install and invoke the real upstream engines.
- Every engine has an immutable upstream revision, full dependency-lock hash,
  adapter/worker hash, runtime identity, platform identity, and fingerprint hash.
- Every native probe produces byte-identical canonical JSON in two fresh processes.
- hftbacktest and legacy HFT agree exactly on their declared L2 book overlap.
- VectorBT versus hftbacktest correctly returns `NOT_COMPARABLE` for bars outside
  the capability intersection.
- The host contracts preserve native events and canonical event projections with
  input-market-event lineage and bind fingerprints into results, replay manifests,
  verifier results, trajectories, and certification benchmark artifacts.
- Seven deterministic synthetic tapes and an independent oracle exist in
  `src/execution/tapes.py`.

## Why the release is blocked

The native adapters do not yet run all applicable tapes through each real engine.
The frozen artifact therefore fails `C1_ACCOUNTING_EVENTS` and
`C4_STRESS_MUTATIONS` for every engine and
lists each unsupported tape explicitly. In particular:

- VectorBT currently certifies only exact fixed-fee accounting.
- Nautilus proves deterministic event-clock ingestion but does not yet submit and
  normalize the common market/limit strategy.
- hftbacktest proves real L2 reconstruction with configured latency, queue, partial
  fill exchange, and fees, but does not yet drive canonical orders/fills on all
  queue and race tapes.
- Legacy HFT proves its delayed book event loop and serves as an independent L2
  oracle, but does not yet normalize its order-status stream for all applicable
  tapes.

## Reproduce

Run:

```powershell
python scripts\certify_execution_engines.py
```

Exit is deliberately non-zero while `release_eligible` is false. The deterministic
evidence is written to
`eval/certification/forge_v0_2_4/engine_probe_artifact.json`.

The repository test suite passes with a workspace-local temp directory:

```powershell
python -m pytest -q --basetemp=.pytest-v024
```

Observed result on the frozen host: **359 passed, 6 warnings**.
