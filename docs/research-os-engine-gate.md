# Research OS engine gate: closed

The approved steps 1–4 have produced the first frozen US–India market-factor momentum study. **Do not integrate VectorBT.** The common engineering contract checks pass, but the scientific calibration fails the acceptance criterion committed before outcomes.

Preregistration commit: `4301093`; hash: `e8b48dd1a00aa7e6d0d2cb3bd2c82840afc4b557ec17d38da4f9253b48370a84`. Actual inference/calibration/study code commit: `2e72e56`. The review branch's HEAD is the gate evidence commit; its full SHA is reported with the review link. Original code, data, seeds, dependency environment and artifact identities are retained in the measured records.

| Evidence | Measured result |
|---|---|
| Research contracts/workflow/frozen evidence/sabotage suite | 157 passed, zero failed or collection errors |
| Independent statistical references | 63 passed: Welch 16, paired 8, HAC matrix 12, bootstrap 4, permutation 4, Holm/BH 6, PSR 4, DSR expected maximum 4, noncentral-t power 4, Wilson 1 |
| Other statistical reference-module checks | 8 passed; module total 71 |
| Explicit source mutations | 12/12 killed; clean baseline 137 passed; collection errors excluded |
| Null calibration | 8,000 worlds, 1,000 for each of eight settings; **NOT_CALIBRATED** |
| Planted-effect power | 8,000 worlds; all power lower bounds exceed 97% |
| Failed null settings | HAC IID: 6.5% [5.13%, 8.20%]; HAC regression AR(1): 7.1% [5.67%, 8.86%]; nominal 5% excluded |
| Family null checks | Holm FWER 4.0% [2.95%, 5.40%]; BH global-null FDR 4.3% [3.21%, 5.74%] |
| Frozen flagship | All 46 trial slots retained, including two unavailable sector-panel entries |
| Computational repeats | Both primary run/artifact identities identical; 48 total recorded holdout openings |

The four-way scorecard is `STATISTICAL=INCONCLUSIVE`, `ECONOMIC=UNAVAILABLE`, `REGIME_DEPENDENCE=INCONCLUSIVE`, `CROSS_MARKET=INCONCLUSIVE`. Primary descriptive monthly factor-neutral effects: US +0.309% [−0.341%, +0.960%], India −1.018% [−1.892%, −0.145%]. Both have Holm p=1.0 and low prospective power. These are **CAPTURE_ONLY — market factor, not a ticker**, with no historical-vintage PIT, investable or validated-alpha claim.

See [the findings and forest plot](findings/momentum-regimes.md), [workflow/contract documentation](research-os-v0.1.md), and `data/exports/research_os_v0_1/manifest.json` for sealed artifact bytes. Default verification succeeds because it correctly preserves the closed gate; passing integrity checks must not be presented as passing scientific calibration.

Full regression and remote CI results are reported separately when measured. The post-gate F6 UI, public Replay publication and browser screenshots are deferred under the approved hard stop. No trading engine or replacement preregistration was added to repair the result.
