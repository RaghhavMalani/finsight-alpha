# Nervous system v0.1: approved implementation scope

PR #24 was merged normally at 651df088052628ad59f4dbe12c499dcb8437e30a, after verifying the unchanged green head 09fe27f. Research OS v0.1 remains NOT_CALIBRATED/CLOSED and v0.1.1 remains NOT_CONFIRMED. The inference-calibration line is closed for now. Its two passing settings are descriptive evidence, not separately certified domains. No further tournament, momentum rerun, execution-engine integration or new market source belongs in this branch.

The user explicitly approved the detailed Phase 2 implementation in the attached review decision. This document makes that authorized scope concrete; it does not request a second implementation approval.

## Files and logical commits

1. Add `finsight/plugins/` (public Model SDK, typed contracts, availability-aware signal store, nested split adapter, runner, honesty hooks, engine adapters and Replay projection). Add `src/truth/run_registry.py` and a facade in `src/truth/ledger.py`. Add DuckDB/Parquet dependencies and packaging discovery to pyproject.toml. Reuse AsOfContext, canonical hashes, the existing split helper and existing scientific engines.
2. Add independent property/metamorphic and sabotage tests under `tests/plugins/`: future append and revision invariance; asset rename and return-price scaling; both observation/availability cutoff enforcement; tenant isolation; strict plugin input/output types; future-feature and target leakage; every attempted configuration and holdout opening recorded; deterministic run identity; idempotent repeat execution and failure accounting.
3. Wrap HMM, the GBM classifier suite, the existing MLP, Hawkes, volatility clustering, Monte Carlo/VaR and D0.4.2 modules. Their implementations stay unchanged. Missing inputs or unsupported operations return an explicit unavailable result. Computation readiness is separate from inference certification, market-claim eligibility and validated alpha; the latter flags stay false.
4. Add a 30-line `examples/momentum_plugin.py` and a local CLI/export workflow. Execute the plugin on a checked-in, source-sealed PIT fixture; record the actual run, nested boundaries, selected configuration, controls, trace and issues. This is SYNTHETIC_REFERENCE infrastructure evidence, not a new market or inference study. Existing real factor snapshots are CAPTURE_ONLY and cannot establish historical PIT availability.
5. Add one checked Replay entry and an F8 plugin-run view using existing shell/reference tokens and fail-closed Replay reads; add desktop/mobile screenshots and browser sabotage checks. Keep the existing model scenes and F5/F7 browser behavior. Add local/authenticated registry read hooks as needed; expose no anonymous raw store or computation endpoint.
6. Add `.github/workflows/organs.yml` for idempotent scheduled recomputation from already checked inputs, honesty/Risk Manager hooks and SHA publication; no new network data adapters. Add `docs/plugin-guide.md`, source/coverage receipts and CI verification. Keep Phase 3's Data Organ and the later Research OS product out of this PR.

## Boundaries

Signal identity includes tenant, signal, asset, observed_at, available_at, source and immutable version. Revisions are append-only. Reads use both clocks and the predecessor available at each decision; a later append/revision cannot backfill an earlier decision. Parquet files are content-addressed; DuckDB indexes only admitted, committed files. Duplicate/conflicting same-time records are rejected, and tenant constraints apply to every operation.

The platform supplies nested chronological fit/validation/holdout boundaries with horizon purge, embargo and target-information checks. Candidate ranking uses validation only. Record a holdout-opening event before access, including failed access. Repeat/idempotent runs reuse completed evidence without reopening holdout. A changed configuration is another recorded attempt; it does not erase failures or prior openings.

Honesty hooks are engineering controls and diagnostic checks, not a new calibration tournament or an inference certificate. Null/planted controls, leakage sabotage and factor-exposure diagnostics preserve explicit supported/unavailable statuses and reasons. No p-value or universal-calibration claim is inferred from successful plumbing. Risk hooks turn actual failures, excess openings or unsupported evidence into linked issue records.

Historical Research OS receipts, artifacts and findings stay byte-identical. The read-only historical guard audit will verify discovery versus the *recorded confirmation commit*, not versus unrelated new HEAD files. Its frozen numerical sources/execution guard remain unchanged. Tests will prove that changes to the recorded computation or receipts are rejected. The old closed-gate verifier remains binding.

## Completion and verification

Stop when the SDK, store and registry work end-to-end and the 30-line plugin has an actual source-labelled Observatory/Replay entry. Verify archive bytes, all focused metamorphic/sabotage contracts, full pytest, frontend lint/tsc/build, every verify-*.mjs and browser checks. Open a review PR with 1440px/390px screenshots and a three-sentence Postable result plus exact recording screens. Do not automatically merge the new platform PR.
