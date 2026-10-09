# Research OS v0.1 — implementation plan

Status: approved on 2026-10-08 with the flagship amendment below. Implementation is authorized through steps 1–4 only. Hard stop at the engine gate, before VectorBT; the measured gate evidence must be reviewed first.

PR #22 was merged normally after confirming head `f931e20da2cf3c92e6d9a958209b9a0b3145b5c0` and all checks were green. Branch `feat/research-os-v0.1` starts at new main, `2f2abb731851f44ba1189491b95d7c17f16464b2`.

## Outcome

Deliver one working Paper → Hypothesis → Preregistration → Experiment → Falsification → Replication workflow, including all twelve requested capabilities. FinSight owns definitions, provenance, attempt accounting and claim eligibility. External engines only compute against that contract.

This phase follows the approval rule in `docs/upgrade-plan.md`: “Start in plan mode: read the relevant code, propose the files to add, change or delete, and wait for my OK.” Merge and branch creation were separately authorized and are complete.

## What exists and what can be reused

- `src/eval/canonical.py`: canonical JSON bytes and content hashes; reuse without changing it.
- `src/data/as_of.py`: explicit observation/availability cutoff; reuse, with additional Research OS validation that rejects malformed or unavailable evidence rather than silently accepting it.
- `src/truth/contracts.py` and `src/truth/ledger.py`: existing computation identity and tenant-scoped durable analysis records. Research OS adds its own immutable specification/result store and binds to existing truth records; it does not reinterpret existing analysis runs.
- `src/rag/document_loader.py`: PDF/TXT/DOCX extraction. Paper Lab wraps it with explicit extraction failure, source-byte identity and evidence-location checks. It does not use the filings RAG answerer to invent methodology.
- `src/findings/schema.py`: established evidence, artifact and experiment reference vocabulary. Reuse compatible references; do not change the completed Agents finding or verifier model.
- `src/execution/engines.py`, `worker_process.py`, `fingerprints.py` and worker protocol: isolated computation, bounded resources and engine identity. Reuse these boundaries for VectorBT after the common contract gate passes.
- `src/replay/factors.py`: existing US/India capture identity and honest `CAPTURE_ONLY` semantics. Reuse the captures; no market-provider expansion or invented historical vintages.
- Existing Replay publisher, hash reader, licence checks, Forge shell and Observatory graph conventions remain the foundations for public inspection.

The present `/research` API is company filings retrieval, `/paper` is paper trading, and `/research` frontend is a placeholder. None supplies the requested academic-paper workflow. The VectorBT worker currently requires an external backend module that is absent; it must not be presented as an already functioning engine integration.

## Common identities and lifecycle

Typed, versioned contracts cover Paper, PaperClaim, Hypothesis, DatasetSnapshot, FeatureDefinition, Split, TestDefinition, CostModel, TestingFamily, Preregistration, Run, StatisticalResult, Artifact and Replication. Unknown fields, invalid timestamps and non-finite values fail closed. Revisions create new identities and retain their parents.

Every result binds hypothesis ID/hash, preregistration hash and freeze receipt, actual code commit, dataset/content hash, input availability cutoff, explicit split identity, feature/test definitions, seed, complete parameters, dependency/environment identity and output artifact identity. Those bindings are checked when executing, storing, publishing and reading a result.

Local authoring is authenticated and tenant scoped. Frozen objects are content addressed and append only; an existing identity cannot be overwritten with different bytes. Run attempts and holdout openings are recorded before computation, including errors, aborted runs and unsuccessful parameter choices. Reopening a holdout never resets its counter.

Specification and result identity are separate from execution receipts so rerunning the same frozen computation can demonstrate reproducible metrics without fabricating execution time or hiding a repeated holdout opening.

## Capability and file map

| Capability | Proposed implementation | Verification |
|---|---|---|
| Paper Lab | `src/research_os/papers.py`, academic-paper records in `contracts.py`; bounded local PDF/TXT/DOCX import and manually registered claims, sample, variables, equations, reported results and limitations | Source-byte substitution, unsupported extraction, invalid page/text anchors, missing-method fields, invented numerical attribution |
| Hypothesis Registry | `src/research_os/contracts.py`, `registry.py`; explicit null/alternative, direction, universe, dependent/independent variables, controls, endpoint and falsification criteria | Immutable revision chains, target-as-feature, unknown variables, inconsistent direction and endpoint |
| Preregistration | `src/research_os/preregistration.py`; freeze dataset/version, cutoff, split/purge/embargo, feature lags, test, metric, costs, seeds, family and acceptance rule before execution | Mutation after freeze, backdated receipt, execution before freeze, seed/parameter mismatch, omitted costs |
| Experiment Registry | `src/research_os/registry.py`, `runner.py`, `provenance.py`; immutable records, complete attempt ledger, holdout-opening records and environment fingerprint | Reproducibility, cross-tenant substitution, stale hashes, omitted trials, result/run binding |
| Statistical Test Engine | `src/research_os/statistics.py`; explicit Welch, paired, bootstrap, permutation, HAC/Newey-West and moving-block bootstrap implementations with effect estimates and CIs | Independent SciPy/statsmodels references, analytic fixtures, dependence assumptions, degenerate inputs and null/planted calibration |
| Multiple Testing | `src/research_os/multiple_testing.py`, `sharpe.py`; Holm/BH, PSR/DSR and complete family/trial accounting | Published formula fixtures, correction monotonicity, trial omission, correlated-search assumptions and wrong Sharpe units |
| Power Analysis | `src/research_os/power.py`; prospective MDE, sample-size/power calculations and explicit assumptions | Independent analytic/noncentral-t references and Monte Carlo; underpowered results cannot be labelled a demonstrated absence |
| Robustness Runner | `src/research_os/robustness.py`; preregistered subsamples, windows, controls, costs, leave-one-period/sector-out variants | Same frozen feature clock, tracked family membership, data availability, omitted sectors and variant substitution |
| Placebo / Negative Controls | `src/research_os/placebos.py`; shuffled dates, random signals, wrong direction and permuted outcomes | Deterministic seeds, exchangeability checks, dependence-aware controls and deliberately planted leakage |
| Replication Console | `src/research_os/replication.py`; ORIGINAL/EXACT/CLOSE/TEMPORAL/CROSS_MARKET with effect sizes, CIs, sample sizes and specification differences | Comparable units, evidence-backed original result, temporal/universe disjointness, same-dataset mislabelling and missing original methodology |
| Experiment DAG | `src/research_os/dag.py`, `frontend-v2/src/research/ExperimentDag.tsx`; typed hypothesis/baseline/ablation/placebo/replication relations with inspectable run IDs | Cycles, dangling links, wrong hypothesis binding and stale artifact selection |
| Sabotage / mutation suite | `tests/research_os/`, `tests/sabotage/test_research_os_guards.py`, `scripts/verify_research_os_mutations.py` | Future and revised-factor leakage, target-as-feature, split contamination, cost omission, artifact/hash substitution; deliberately broken guards must be killed by independent tests |

Additional public/API files:

- Add `src/research_os/__init__.py`, `service.py`, `projection.py` and `cli.py` for an executable, reusable application boundary.
- Add `backend/routes/research_os.py`; register it in `backend/main.py`. Preserve existing `/research` filings and `/paper` trading endpoints. Authoring, freeze and execution remain local/authenticated; anonymous public inspection uses checked artifacts.
- Add `frontend-v2/src/research/ResearchWorkspace.tsx`, `contracts.ts`, `client.ts`, `research.css`, `PaperLab.tsx` and `ReplicationConsole.tsx`; replace the `/research` placeholder in `src/routes/research.tsx`. Reuse existing terminal tokens and controls. The interface supports actual local authoring/import/freeze/run workflows and read-only public inspection, rather than just a diagram.
- Add `scripts/freeze_research_os.py`, `scripts/verify_research_os.py`, `frontend-v2/scripts/verify-research-os.mjs` and `docs/research-os-v0.1.md`.
- Add a dedicated `data/exports/research_os_v0_1/` frozen showcase and dedicated derived public research payloads. Append only new Research OS entries/routes to `frontend-v2/public/replay-manifest.json`; preserve all existing payload bytes, entries, grants and source clocks. Reuse the existing input cutoff, with distinct actual freeze/execution/publication receipts; never backdate those receipts.
- Update `pyproject.toml` and `.github/workflows/ci.yml` for tested statistical dependencies, contract/mutation/calibration checks and browser verification. VectorBT is an optional, isolated engine dependency introduced only after the contract gate.
- Add `docs/screenshots/research-os-v0.1-*-1440.png` and `*-390.png` from genuine public inspection. Local-authoring QA uses separate authenticated test fixtures and is not presented as public evidence.
- No file deletions planned.

## Paper and evidence handling

A paper's reported methodology/result and a researcher's proposed extension are separate fields with separate provenance. Missing information remains missing. No LLM fills gaps; unsupported OCR or inaccessible source text is explicit. A registration can remain a draft while missing required fields. It cannot earn an EXACT replication label from incomplete methodology.

Paper import preserves the source hash and page/text evidence anchors. Public payloads contain metadata, permitted small evidence excerpts and derived results; privately imported full paper text is not republished by default. Provenance for user-uploaded data is never upgraded to a licensed public source without a checked grant.

The primary empirical showcase is Phase 4's regime-dependent momentum, US versus India: 12–1 momentum with monthly rebalance, HMM and volatility-clustering regimes, French/IIMA controls, HAC/block-bootstrap/permutation, Holm/BH/DSR, at least 1,000 null worlds and planted-power worlds, cost frontier, shuffled-regime placebo, wrong-direction signal, leave-2008/2020-out and first/second halves. Freeze exact definitions, seeds, endpoint, family and falsification criteria before computing outcomes.

The available licensed captures contain market and style factors, not constituent security panels. The frozen implementation therefore tests explicitly declared **time-series momentum on the market factor**, not cross-sectional stock momentum or a ticker portfolio. It cannot certify investable execution or statutory Indian transaction costs from these captures. Those economic claims stay unavailable; a disclosed hypothetical cost sensitivity is still computed. Use narrow adapters to the existing factor loader, HMM training function, volatility-clustering module and truth ledger; this does not complete Phase 2's plugin SDK or Phase 3's data organ.

Bailey and López de Prado's Deflated Sharpe Ratio is the **methodological/statistics-validation paper**, not the primary empirical showcase. Independently verify PSR/DSR formulas and evidence handling; never invent the paper's original data, seeds or CIs. Missing original replication evidence stays unavailable.

Results have exactly four top-level verdict dimensions: `STATISTICAL`, `ECONOMIC`, `REGIME_DEPENDENCE`, `CROSS_MARKET`. Each permits `SUPPORTED`, `NOT_SUPPORTED`, `INCONCLUSIVE`, `UNAVAILABLE`. The fixed revised captures remain visibly `CAPTURE_ONLY`, “market factor, not a ticker,” with no historical-vintage PIT or alpha claims in findings, manuscript and any result interface.

Computational repeatability and exact replication of a paper are distinct. EXACT requires matching original evidence/methodology; it stays unavailable where those inputs are missing. CLOSE/TEMPORAL/CROSS_MARKET document actual differences and show effect sizes/CIs. Real-factor retrospective results do not reconstruct historical vintages or prove tradable alpha.

## Scientific rules

- Predeclare the primary endpoint, test direction, minimum meaningful effect, significance family, seeds and rejection/falsification rule. Holdout results cannot select the primary test or best parameters.
- Costs apply before strategy outcomes are tested; zero costs require an explicit study rationale, not an omitted cost model.
- Bind both observation time and source availability/vintage. An observation date never proves that a revised factor release was historically available. CAPTURE_ONLY data support a disclosed fixed-vintage retrospective study, not historical PIT assertions.
- Dependence and exchangeability are explicit test requirements. Block bootstrap/HAC serve dependent series; IID permutation or bootstrap cannot silently inherit an invalid financial-time-series interpretation.
- Report estimates, units, CIs, raw/corrected p-values, sample sizes, power and failure reasons. Statistical rejection, economic relevance and market/alpha claim eligibility are separate states.
- PSR/DSR use unannualized sample Sharpe and complete trial information with documented assumptions. Missing trial counts, degenerate variance or unsupported dependence yield an explicit unavailable/diagnostic state.
- Holm/BH use the frozen family, including unsuccessful runs; the best backtest cannot disappear from trial accounting after selection.
- Prospective power uses preregistered effect/variance assumptions. Underpowered negatives remain inconclusive; no post hoc observed-power evidence of absence.
- Calibration reports empirical type-I error/power and binomial CIs across null/planted controls. CALIBRATED is earned by a predeclared criterion, never a decorative badge. Include at least 1,000 deterministic null worlds for the relevant supported test settings.
- Market, causal and validated-alpha flags remain false for this infrastructure showcase. Significance, a successful rerun or a VectorBT result cannot elevate them.

## Implementation sequence and gates

1. **Common contracts and registries.** Implement immutable paper/hypothesis/data/split/preregistration/run/artifact/family objects and complete lifecycle validation. Add independent property, metamorphic and sabotage tests. Commit and run the contract suite.
2. **Executable inference.** Implement statistical, multiple-testing/Sharpe and prospective-power engines, independent reference tests and null/planted calibration. Add robustness/placebo/replication/DAG records. Freeze and commit the showcase's complete specification before computing its results.
3. **First real workflow.** Run the frozen paper-linked showcase and its negative/robustness/replication variants; retain failed and unavailable results with full provenance. Demonstrate exact computational reruns separately from paper-replication claims.
4. **Mandatory engine gate — STOP.** All common experiment/result contracts and independent guard/reference tests must pass without a trading engine. Report the gate commit, exact independent-reference counts, the full frozen ≥1,000-null-world calibration (code/data/seed hashes and binomial CIs), planted power, mutation/sabotage results, and first frozen flagship findings. Calibration acceptance is fixed before running; a smaller CI canary cannot replace full scientific acceptance. No outcome may be optimized, repaired, hidden or rerun under changed preregistration. Stop for review before any VectorBT integration or post-gate release work.
5. **VectorBT adapter.** Add `src/research_os/adapters/vectorbt.py`, adapter contracts and `tests/research_os/test_vectorbt_adapter.py`. Reuse the bounded worker/fingerprint/protocol infrastructure; add only the minimal engine-specific implementation. Exercise native VectorBT in its isolated environment, with validation/holdout separation, predeclared grids, next-observation signal timing and explicit costs. Independently compare tiny analytically known cases, not just the package against itself. Missing installation or unsupported data semantics remains unavailable. Preserve FinSight run/family/claim identities across all parameter choices.
6. **F6 workflow and publication.** Add local forms/actions and public read-only inspection, CIs/power/robustness views, replication comparison and the experiment DAG. Reuse current design conventions; no terminal redesign. Add desktop/mobile screenshots and end-to-end browser QA.
7. **Release validation.** Run lint, TypeScript, build, every `verify-*.mjs`, new/old browser checks, mutation tests and full Linux pytest. Keep F5/F7 behavior verified in Chrome/Edge/Firefox. Open one Research OS v0.1 PR with actual coverage, limitations and a postable result.

NautilusTrader, hftbacktest, an independent second HFT engine and Kalshi adapters follow this version, in the requested order. Their future interface is the common contract, not another bespoke registry.

## Protected scope and release acceptance

CI must reject changes to frozen Dynamics code/artifacts, existing Agents evidence models/payloads, licence policy or existing market-source definitions. Existing public payload hashes and their manifest entries remain unchanged. New Research OS publication must still satisfy the current licence/hash/raw-price guards.

Acceptance requires an executable import/register/freeze/run/falsify/replicate path, not just checked fixtures; independent statistical and mutation tests; complete result identities and attempt accounting; a genuinely executed VectorBT adapter after the gate; genuine 1440/390 public screenshots; and green regression CI. An unavailable exact paper replication, an underpowered hypothesis, a failed calibration or a negative finding is displayed honestly and never repaired with invented numbers.

Postable result: record the imported paper evidence → explicit hypothesis → frozen spec and hash → effect/CI/power → placebo and robustness failures → replication comparison → DAG and immutable run provenance. The final three-sentence finding will use only executed results; no outcome is promised in this plan.

## Primary method references

- [SciPy Welch test and confidence intervals](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ttest_ind.html).
- [SciPy permutation tests and exchangeability conventions](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.permutation_test.html).
- [statsmodels Holm/BH multiple-testing implementations](https://www.statsmodels.org/stable/generated/statsmodels.stats.multitest.multipletests.html).
- [statsmodels HAC covariance](https://www.statsmodels.org/stable/generated/statsmodels.stats.sandwich_covariance.cov_hac.html).
- [statsmodels power analysis](https://www.statsmodels.org/stable/generated/statsmodels.stats.power.TTestIndPower.html).
- [Bailey and López de Prado, The Deflated Sharpe Ratio](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf).
- [VectorBT's native computation capabilities](https://vectorbt.dev/getting-started/features/).
