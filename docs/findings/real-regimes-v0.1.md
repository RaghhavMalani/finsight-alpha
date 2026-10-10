# Both market factors sit in their calmer regime; India's evidence is 284 days old

At the sealed cutoff `2026-10-10T13:09:33.975258Z`, the filtered two-state HMM puts
both the US and the Indian market factor in `VOL_RANK_1_OF_2`, the lower-variance
regime, with filtered posteriors of 1.000 and 0.999. They are evaluated at their own
`state_at`: 2026-08-31 for the US and 2025-12-31 for India, 243 days apart. India's
latest admitted IIMA record is 284 calendar days before the cutoff, so its view carries
`STALE_INPUT` (HIGH) as well as `CALENDAR_UNAVAILABLE`.

This is **CAPTURE_ONLY — market factor, not a ticker**. US is French MKT (Rm−Rf), not
SPY; India is IIMA MKT, not NIFTY 50. Every number below is descriptive, from sealed
`plugin-series-run/1` computations over admitted captures, with zero holdout openings.
No market, alpha, inference, causal, graph or edge-confidence claim is made; all six
claim flags are false. Event pressure, Hawkes→HMM and intraday seasonality are
`UNAVAILABLE` for both markets, factor neutrality is `PARTIAL`, and the fracture score
is a volatility-only partial subtotal.

## Evidence

| | US MARKET-FACTOR REGIME | INDIA MARKET-FACTOR REGIME |
| --- | --- | --- |
| Source | [French daily factors](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_daily_CSV.zip) + [momentum](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Momentum_Factor_daily_CSV.zip) | [IIMA four factors and market returns](https://faculty.iima.ac.in/iffm/Indian-Fama-French-Momentum/DATA/2025-12_FourFactors_and_Market_Returns_Daily_SurvivorshipBiasAdjusted.csv) |
| Captured (CAPTURE_ONLY) | 2026-10-10T13:07:20Z (FF3), 13:08:46Z (MOM) | 2026-10-10T13:09:33Z |
| Full library coverage | MKT/SMB/HML/RF 1926-07-01 → 2026-08-31 (26,317 rows each); MOM 1926-11-03 → 2026-08-31 (26,216) | MKT/SMB/HML/MOM/RF 1993-10-01 → 2025-12-31 (8,004 rows each) |
| Analysis window (D1) | 2000-01-01 → 2026-08-31: 6,705 observations | 2000-01-01 → 2025-12-31: 6,466 observations |
| Admitted / quarantined | 33,525 / 0 | 32,330 / 0 |
| Calendar | XNYS, `exchange_calendars` 4.13.2: 6,705 expected sessions, 0 missing, 0 unexpected → `VERIFIED` (package evidence, not an exchange receipt) | XNSE `UNAVAILABLE`; observation-step semantics |
| Module status | volatility, hmm2, hmm4, coupling, momentum `AVAILABLE`; factors, fracture `PARTIAL` | volatility, hmm2, hmm4, coupling, momentum `PARTIAL` (observation steps); factors, fracture `PARTIAL` |
| Lineage | 5 / 5 runs `VERIFIED` to capture bytes and licence | 5 / 5 runs `VERIFIED` |

## Current state at cutoff

| | US (per session) | India (per observed record) |
| --- | --- | --- |
| hmm2 filtered state | `VOL_RANK_1_OF_2`, posterior 0.9996 | `VOL_RANK_1_OF_2`, posterior 0.9993 |
| hmm4 filtered state | `VOL_RANK_1_OF_4`, posterior 0.885 | `VOL_RANK_2_OF_4`, posterior 0.992 |
| Last hmm2 state change | 2026-04-28 | 2025-05-27 |
| Frozen D0.4.2 volatility state | `LOW_VOL` | `NORMAL` |
| 20-observation realised volatility | 0.61% (9.7% annualised by √252 on XNYS evidence) | 0.62% (no annualisation) |
| 12–1 signal | +11.5%, `POSITIVE` (252/21 session index) | −4.3%, `NEGATIVE` (252/21 observation-index approximation · CALENDAR_UNAVAILABLE) |
| Open medium/high issues | 0 | 2: `STALE_INPUT` HIGH, `CALENDAR_UNAVAILABLE` MEDIUM |

Posteriors come from a custom forward filter. They are filtered, not smoothed, and not
calibrated probabilities.

## Volatility clustering

Both series show strong conditional heteroskedasticity. These are asymptotic
diagnostics (`DIAGNOSTIC_ASYMPTOTIC`) with one preregistered lag choice, not calibrated
tests.

| | US | India |
| --- | --- | --- |
| ARCH-LM (5 lags) | LM 1,641.3; p below double precision | LM 762.0; p ≈ 1.9 × 10⁻¹⁶² |
| GARCH(1,1), `arch` 8.0.0, robust covariance | α 0.119 (se 0.011), β 0.861 (se 0.012), `CONVERGED` | α 0.142 (se 0.022), β 0.843 (se 0.026), `CONVERGED` |
| Persistence α+β · half-life | 0.980 · 34.1 sessions | 0.984 · 43.4 observations |
| Frozen D0.4.2 state counts | NORMAL 3,749 · LOW_VOL 1,256 · HIGH_VOL 1,162 · VOL_CLUSTER 414 · VOL_BREAK 38 · VOL_SHOCK 27 · warm-up 59 | NORMAL 3,499 · LOW_VOL 1,052 · HIGH_VOL 1,027 · VOL_CLUSTER 744 · VOL_BREAK 51 · VOL_SHOCK 34 · warm-up 59 |

Neither fit is at a parameter boundary, and both half-lives are inside the stationary
domain.

## HMM regimes

The two-state diagnostic HMM uses MKT plus the admitted `realized_vol_20` output of the
sealed volatility run, bound by run identity. It separates a calm regime from a regime
with roughly 2.5 times the return standard deviation in both markets.

| | US calm / stressed | India calm / stressed |
| --- | --- | --- |
| Return σ per step | 0.74% / 1.84% | 0.80% / 1.98% |
| Mean return per step | +0.059% / −0.016% | +0.066% / −0.028% |
| Occupancy | 65.3% / 34.7% | 65.6% / 34.4% |
| Expected duration | 137.9 / 69.5 sessions | 104.3 / 51.9 observations |
| Converged (last |ΔLL| < 0.01) | yes, 22 iterations | yes, 21 iterations |

The four-state Phase 1a feature model converges in 56 (US) and 47 (India) iterations.
Its states are ranked by fitted return variance, not named bull or bear.

These within-run paths are `PARAMETER_RETROSPECTIVE`: each date's state is filtered,
but with parameters estimated through the cutoff. Over the 6,227 dates present in both
series (2000-01-31 → 2025-12-31, inner join, no fill), the two markets share the same
hmm2 rank on 71.0% of dates. That is descriptive co-movement of two retrospective
paths, not transmission, lead–lag or causality.

## Momentum by regime (descriptive)

**The 12–1 market-factor signal itself, by filtered hmm2 state.** This is the signal,
not a return.

| | n | Mean | Median | Positive |
| --- | ---: | ---: | ---: | ---: |
| US calm | 4,307 | +13.3% | +13.1% | 90.2% |
| US stressed | 2,146 | −4.1% | −5.7% | 42.6% |
| India calm | 4,228 | +11.5% | +6.9% | 64.9% |
| India stressed | 1,986 | +10.5% | +5.5% | 56.3% |

Both the signal and the state are functions of past market-factor returns, so much of
this association is mechanical. India's split is far weaker than the US one.

**MOM FACTOR BY REGIME — cross-sectional momentum-factor diagnostic.** This is the
published long–short MOM factor on the observation after each lagged filtered state. It
is never the return of a 12–1 market-timing signal.

| | n | Mean per step | Positive | Descriptive Sharpe |
| --- | ---: | ---: | ---: | ---: |
| US calm | 4,362 | +3.2 bp | 54.5% | 0.71 (√252) |
| US stressed | 2,323 | −2.3 bp | 52.3% | −0.23 (√252) |
| India calm | 4,228 | +6.9 bp | 56.4% | 0.084 per observation |
| India stressed | 2,218 | +1.0 bp | 50.7% | 0.007 per observation |

These splits use parameter-retrospective states, no costs, no inference and no
correction for the many ways a sample can be cut. They are not a strategy or evidence
of regime dependence. The frozen Phase 4 Research OS card remains the only verdict
carrier, byte-bound by `data/exports/research_os_v0_1/flagship.json` (sha256
`a645b612…`): STATISTICAL `INCONCLUSIVE`, ECONOMIC `UNAVAILABLE`, REGIME_DEPENDENCE
`INCONCLUSIVE`, CROSS_MARKET `INCONCLUSIVE`. Phase 5 does not recompute or override it.

## Partial factor neutrality

The published MOM factor is regressed on MKT, SMB and HML, with Bartlett Newey–West
(3 lags) and approximate normal 95% intervals (`DIAGNOSTIC_ASYMPTOTIC`). Seven-factor
neutrality is `UNAVAILABLE` because QUAL, VOL and LIQ are not admitted.

| | US (n 6,705, R² 0.151) | India (n 6,466, R² 0.017) |
| --- | --- | --- |
| MKT | −0.203 [−0.249, −0.157] `EXPOSED` | −0.039 [−0.100, +0.022] `NEUTRAL` |
| SMB | +0.002 [−0.065, +0.069] `NEUTRAL` | −0.040 [−0.102, +0.021] `WATCH` |
| HML | −0.429 [−0.521, −0.337] `EXPOSED` | −0.134 [−0.193, −0.074] `WATCH` |

US MOM's market loading changes sign between regimes: +0.125 [+0.083, +0.167] in the
calm state and −0.301 [−0.364, −0.237] in the stressed state. Again, this is
parameter-retrospective.

The unit-notional arithmetic attribution (prior-only rolling windows) sums to:
- US: raw +0.737 = factor-explained −0.502 + residual +1.239 over 6,645 observations.
- India: raw +2.940 = factor-explained +1.164 + residual +1.776 over 6,406 observations.

These are not compounded P&L and not alpha.

## Idempotent scheduling on real infrastructure (D6)

| Dispatch | Head | Result |
| --- | --- | --- |
| [38052277371](https://github.com/RaghhavMalani/finsight-alpha/actions/runs/38052277371) | `655ab44` | No prior receipt → `PUBLISHED`: 10 sealed runs (one per computation per market), 0 holdout openings, re-projected from the runtime (`RE_PROJECTED`, 10 runs); committed `0ebbdd9` |
| [38053525411](https://github.com/RaghhavMalani/finsight-alpha/actions/runs/38053525411) | `800236b` | Fresh runner, identical capture bytes → `{"status": "UNCHANGED", "new_runs": 0, "holdout_openings": 0}`; runtime `UNCHANGED_ZERO_RUNS`; nothing committed |
| [38054445190](https://github.com/RaghhavMalani/finsight-alpha/actions/runs/38054445190) | `7682bcf` | Publication code changed (library coverage) → `PUBLISHED`: 10 new sealed runs, 0 openings; sealed history appended, earlier artifacts byte-identical; committed `f4a7d95` |
| [38055871865](https://github.com/RaghhavMalani/finsight-alpha/actions/runs/38055871865) | `f4a7d95` | Fresh runner, identical bytes, final code → `UNCHANGED`, 0 runs, 0 openings; runtime `UNCHANGED_ZERO_RUNS`; 22 artifacts verified; nothing committed |

The two sealed cutoffs agree on every published state because their input bytes are
identical. The sealed multi-cutoff timeline therefore shows two entries, as known at
each run.

## Identities at the current cutoff

* Receipt `data/exports/regimes_v0_1/receipt-e307e1ed….json`; profile sha256 `b12b8ed7…`;
  execution commit `7682bcf`, `dirty_computation: false`.
* US runs: volatility `a3a69ddc…`, hmm2 `fda7bf8d…`, hmm4 `6ef2e72e…`, factors
  `19d59987…`, momentum `bde2a485…`; snapshot `regimes:snapshot:dc4ce03a…`.
* India runs: volatility `81bd2285…`, hmm2 `b1f80b32…`, hmm4 `d3d07180…`, factors
  `46df1ebd…`, momentum `d380cdb0…`; snapshot `regimes:snapshot:e7545843…`.

## What this does not show

These results do not show:
- a tradable signal or a validated regime dependence;
- a calibrated probability;
- an Indian session-level result;
- anything about SPY, NIFTY 50 or another instrument;
- event, liquidity, correlation or macro stress.

What would change the picture:
- a fresh IIMA release (clears `STALE_INPUT`);
- an evidenced XNSE session manifest (session semantics for India);
- admitted QUAL/VOL/LIQ factors (seven-factor neutrality);
- an admitted event stream with genuine clocks and a licence (event pressure and IOHMM).

The local SPY/QQQ/IWM tier runs only on the operator machine and is never published.
