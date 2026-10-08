# Research OS v0.1: contracts and the engine gate

The approved steps 1–4 are executable locally: paper import and anchored claim registration, immutable hypotheses and preregistrations, statistical inference, full calibration, market-factor momentum, robustness, negative controls, replication records and a validated experiment DAG. **The scientific engine gate is closed (`NOT_CALIBRATED`).** VectorBT and the post-gate F6 interface/public Replay release have not been implemented.

## Local workflow

Install the project dependencies in a local environment (`python -m pip install -e . pytest httpx`). All authoring requires an explicit organization; HTTP routes additionally use the existing authenticated principal. Public production cannot initiate these heavy computations.

```powershell
python -m src.research_os.cli --organization 1 import-paper my-paper.pdf --title "Study title" --author "Author" --source-url "https://author.example/paper"
python -m src.research_os.cli --organization 1 register Hypothesis hypothesis.json
python -m src.research_os.cli --organization 1 register Preregistration specification.json
python -m src.research_os.cli --organization 1 freeze <preregistration-hash>
python -m src.research_os.cli --organization 1 run <freeze-receipt-hash> US:PRIMARY --seed 1729
python -m src.research_os.cli --organization 1 attempts
python -m src.research_os.cli --organization 1 inspect <object-hash>
python -m src.research_os.cli --organization 1 artifact <artifact-hash> --run <run-hash>
```

The angle-bracket arguments above are identifiers returned by the prior command. Existing source captures must be present locally, match their actual receipt bytes and match the frozen snapshot. Execution requires committed computation code. Missing captures or unavailable methods cannot yield a successful scientific result. The v0.1 execution adapter supports the frozen US/India market-factor protocol. It rejects changed hypothesis semantics, feature definitions, tests or parameters instead of silently computing the original study under new labels. New papers and hypotheses can be authored; executing a different protocol requires a separately tested adapter.

`/research-os/objects`, `/papers`, `/freeze/{identity}`, `/run`, `/attempts` and `/artifacts/{identity}` provide the same local workflow. `/truth/{attempt}/{artifact_hash}` binds a successful immutable artifact to the existing tenant-scoped truth ledger. This optional explicit binding is separate from the canonical Research OS store; no old truth record is reinterpreted. Existing filings `/research` and paper-trading `/paper` remain separate.

## Contract and lifecycle

Paper, claim, hypothesis, snapshot, feature, split, test, cost, family, preregistration, freeze receipt, run, statistical result, artifact and replication contracts reject unknown fields and non-finite values. Paper claims carry checked page/text offsets; missing original methods/data/seeds/CIs remain absent. Revisions retain their parent identity. Frozen specification and immutable result identities are separate from actual execution receipts.

SQLite stores objects by organization and content hash, with triggers rejecting overwrite/delete. Attempts are appended transactionally into a hash chain before computation. Holdout openings, success, failure, abort and truth-ledger binding remain recorded. A repeated frozen computation retains a new attempt and holdout opening; it does not reset the counter. This is a local audit store, not protection against an administrator replacing the entire database.

Unavailable and unsuccessful trials remain in the family. An unavailable slot contributes p=1 only inside conservative correction arithmetic; it is displayed as unavailable with no invented p-value. Holm is the confirmatory correction. BH is disclosed because the correlated study family may not satisfy its FDR dependence assumptions. PSR/DSR require unannualized Sharpe and declared moment/search assumptions; serially dependent factor results do not acquire an inferential DSR badge.

Welch/paired inference uses SciPy, HAC uses statsmodels, bootstrap uses explicit IID/circular-block assumptions, and sign permutation requires independent symmetric observations. The flagship also reports paired block regression bootstrap and circular-shift diagnostics. Those secondary diagnostics do not replace the frozen HAC endpoint or repair failed calibration. Prospective power uses a frozen alternative/variance and an explicit AR(1) effective-sample approximation.

## Frozen evidence and verification

`data/exports/research_os_v0_1/` holds the committed preregistration, original freeze receipt, calibration protocol and all measured worlds, first flagship results, method-paper metadata/anchor, computational repeatability, mutation evidence, final test counts, Windows regression results, attributed derived-publication receipt and byte manifest. Every first outcome was computed after preregistration commit `4301093`; the original calculation commit is `2e72e56`.

```powershell
python scripts/verify_research_os.py
python scripts/verify_research_os.py --full-calibration
python -m pytest -q tests/research_os tests/sabotage/test_research_os_guards.py
```

The default verifier checks frozen hashes, historical preregistration, output/run bindings, all family members, exact calibration acceptance, attempts, repeatability, mutation evidence, protected scopes and the closed gate. A full verification recomputes the identical frozen null/planted protocol and compares its input hashes, metrics and acceptance; it does not create a new favorable calibration or overwrite the original. PR CI uses a deterministic 32-world infrastructure canary. The canary always says `CANARY_ONLY`; scientific acceptance still requires the full ≥1,000-world protocol.

The mutation harness changes real source guards/arithmetic in isolated copies and runs independent tests. Collection errors do not count as kills. The initial harness preflight imported the real package; that invalid run was rejected, the shadow-package import was made explicit, and no surviving mutation was relabelled as a kill.

## Evidence interpretation

The primary study is **CAPTURE_ONLY — market factor, not a ticker**. Monthly 12–1 features exclude the immediately preceding month; training-only HMM parameters remain fixed and held-out states use forward filtering. Existing Dynamics volatility-clustering logic is reused without editing frozen code. Capture availability remains in 2026 even for observations in 1926 or 1993. No historical-vintage PIT, causal or investable alpha claim is allowed.

The fixed source cutoff is distinct from later freeze, execution and publication receipts. Neither the full plugin SDK nor data-organ phases are claimed complete. Economic and sector-panel endpoints remain unavailable because the factor captures do not contain securities, execution or statutory Indian fee inputs. Hypothetical cost sensitivities are disclosed rather than presented as real fees.

Read [the first frozen finding](findings/momentum-regimes.md) and the actual forest plot for measured effects, CIs, power and all four verdicts. Review this closed gate before authorizing any engine integration or separately preregistered methodological follow-up. Public interface/browser screenshots belong to the post-gate release sequence; this gate does not claim browser coverage or a deployed Research UI.

Method references: [SciPy Welch inference](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ttest_ind.html), [statsmodels HAC](https://www.statsmodels.org/stable/generated/statsmodels.stats.sandwich_covariance.cov_hac.html), [multiple testing](https://www.statsmodels.org/stable/generated/statsmodels.stats.multitest.multipletests.html), [power](https://www.statsmodels.org/stable/generated/statsmodels.stats.power.TTestPower.html), and [Bailey/López de Prado DSR](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf).
