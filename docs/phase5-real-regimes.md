# Phase 5 — Real US + India regime intelligence (v0.1)

F4 REGIMES now shows a registered, sealed volatility/HMM stack over admitted public
market-factor evidence for two markets, with every unavailable module named and
explained. This page records what shipped, how it is bounded and how it was
verified. The sealed real-evidence results are in
[`findings/real-regimes-v0.1.md`](findings/real-regimes-v0.1.md); the approved
plan with its binding decisions is [`phase5-real-regimes-plan.md`](phase5-real-regimes-plan.md).

This is a product and descriptive-research phase. It is not an inference-calibration
tournament, a Research OS retry, a rerun of the frozen momentum study, an alpha
claim, a trading strategy or an execution integration. All six claim flags stay
false: `market_claim_eligible`, `validated_alpha`, `inference_certified`,
`causal_claim_eligible`, `trusted_graph`, `precise_edge_confidence`.

## What the two markets are

| View | Series | Unit | Calendar | Badges |
| --- | --- | --- | --- | --- |
| US MARKET-FACTOR REGIME | French MKT (Rm−Rf), not SPY or any ticker | session | XNYS from `exchange_calendars` (`PACKAGE_EVIDENCE`) | `CAPTURE_ONLY` |
| INDIA MARKET-FACTOR REGIME | IIMA MKT, not NIFTY 50 or any index | observed record | XNSE `UNAVAILABLE`; XBOM and weekday substitution forbidden | `CAPTURE_ONLY · CALENDAR_UNAVAILABLE` (+ `STALE_INPUT` when the latest record is > 45 days old) |
| SPY / QQQ / IWM REGIME (operator machine only) | Alpaca IEX daily bars, IEX minute bars | session | XNYS | `ALPACA IEX · LOCAL ONLY · CONSERVATIVE_MARKET_TIME · IEX_ONLY · UNADJUSTED` |

`CAPTURE_ONLY` means every admitted factor value becomes available at its capture
clock, so nothing is visible before the run that captured it. The common analytical
window starts 2000-01-01; each library's full coverage is reported separately in the
`LIBRARY_COVERAGE` journal entry.

India uses observation-step semantics throughout: transitions per observed record,
expected durations in observations, GARCH persistence per observation step and the
12–1 signal as a "252/21 observation-index approximation · CALENDAR_UNAVAILABLE". It
never says days, trading days or sessions, is never annualised and has no session-gap
diagnostics.

## Architecture

```
French / IIMA capture ──► Data Organ admission (public-regime-evidence tenant, CAPTURE_ONLY)
                              │  hash-chained journal: SOURCE_VERSION, ADMISSION, LIBRARY_COVERAGE
                              ▼
              SeriesRunner (plugin-series-computation/1, no holdout, no targets, no splits)
   regimes.volatility ─► PLUGIN_OUTPUT admissions (realized_vol_20, volatility_state, garch_conditional_vol)
        │                         │
        ▼                         ▼
   regimes.hmm4            regimes.hmm2 (mkt + admitted realized_vol_20) ─► PLUGIN_OUTPUT hmm2_state
                                  │
                         regimes.factors · regimes.momentum
                              ▼
   snapshot (verified lineage per run) ─► positive-whitelist projection ─► content-addressed Replay
```

* **Series SDK** — `finsight/plugins/series.py` and `derived.py`. A `SeriesModel`
  declares bound inputs (admitted signals or earlier sealed plugin outputs), seals a
  `plugin-series-run/1` result with a lineage digest and never calls `holdout`; the
  runner asserts the opening count is unchanged. Sealed outputs are re-admitted as
  `PLUGIN_OUTPUT` signals bound to the producer's run, result and lineage digest, so a
  consumer's inputs are verifiable all the way back to the capture bytes.
* **Volatility** — the frozen D0.4.2 `volatility_path` states, ARCH-LM (`het_arch`,
  5 lags) and `arch` 8.x GARCH(1,1) with robust covariance. `BOUNDARY` and
  `UNCONVERGED` fits are retained and flagged; half-life is reported only inside the
  stationary domain. Inference is `DIAGNOSTIC_ASYMPTOTIC`. An independent SciPy
  reference lives in the tests only.
* **HMMs** — the existing `train_hmm_regime_model` (hmmlearn) for a two-state
  diagnostic over `mkt` + admitted `realized_vol_20`, and the existing four-state
  Phase 1a feature set. Posteriors are a custom log-space **forward filter**; smoothed
  `predict_proba` output is never published. States are labelled
  `VOL_RANK_k_OF_K` by ascending fitted return variance. Convergence means the last
  log-likelihood change is below tolerance — hitting the iteration cap is not
  convergence.
* **Three time layers** — CURRENT STATE AT CUTOFF (PIT-valid for the admitted
  capture), WITHIN-RUN PATH (`PARAMETER_RETROSPECTIVE`: filtered, with parameters
  estimated through the cutoff) and SEALED MULTI-CUTOFF TIMELINE (the
  as-known-at-each-run sequence of published snapshots).
* **Factors** — `PARTIAL_FACTOR_DIAGNOSTIC`: the published MOM factor on MKT, SMB and
  HML with Bartlett Newey–West (3 lags), prior-only rolling windows and a
  raw = factor-explained + residual identity check. Seven-factor neutrality is
  `UNAVAILABLE` (QUAL, VOL and LIQ are not admitted).
* **Momentum view** — the primary panel conditions the 12–1 market-factor **signal
  itself** on the filtered hmm2 state. "MOM FACTOR BY REGIME — cross-sectional
  momentum-factor diagnostic" is a separate panel and is never described as a 12–1
  strategy return. The frozen Phase 4 Research OS card is the only verdict carrier.
* **Matrix** — each market at its own `state_at`; historical agreement uses only dates
  present in both series; no forward fill, transmission, prediction or causal claim.
* **Unavailable by evidence** — event pressure and Hawkes→HMM (IOHMM): no admitted
  event stream; intraday seasonality: public daily libraries have no intraday
  evidence (local IEX tier only); fracture: partial subtotal, volatility component
  only, never a full score.

## Publication boundary

Only `ken-french:daily-factors` and `iima:daily-factors` carry a `publish_derived`
grant, so only `US-MKT` and `IN-MKT` derived views reach anonymous Replay. The six
kinds — `snapshot`, `timeline`, `factors`, `lineage`, `history` (per market) and
`matrix` — are positive-whitelist projections, validated fail-closed in Python
(`src/regimes/publication.py`) and again in the browser
(`frontend-v2/src/regimes/contracts.ts`): no source values, raw keys, smoothed
posteriors, settings, contracts, local rows, synthetic worlds or granted claims.
Lineage artifacts show identities and clocks only (`source_values: LOCAL_ONLY`).
`scripts/regimes_archive.py` keeps every earlier artifact, route and frozen export
byte-identical, and the Phase 3 and Research OS guards delegate only reviewed
`regimes:*` identities and `/regimes/*` routes to it.

The local tier never leaves the operator machine. Its authenticated read-only API
(`/regimes/*`, `LOCAL MODEL RUN` badge) returns 503 in production, 401 without an
organisation and 404 without a local runtime; GETs never fetch, compute or write.

## Scheduling and idempotence (D6)

`organs.yml` runs nightly on `main` and on `workflow_dispatch`. A dispatch publishes
only to the branch it runs on; `scope=regimes` skips the Data Organ refresh so a
branch proof never forks its hash-chained history. Each run:

1. verifies the plugin registry, the Data Organ history and the prior Phase 5 history;
2. captures French and IIMA through the Data Organ (`collect_regime_inputs.py --network`);
3. compares the admitted capture bytes, the frozen profile SHA-256 and every plugin's
   computation-source closure with the committed receipt — if all match, nothing is
   computed or published (`UNCHANGED`, zero runs, zero openings);
4. otherwise seals one new run per computation per market, publishes the derived
   views and appends one entry to each market's sealed history;
5. re-verifies the publication against its runtime (`verify_regimes.py --runtime`,
   which reports an unchanged night as `UNCHANGED_ZERO_RUNS`) and every earlier
   archive, then commits only derived artifacts, receipts and the Replay pointer.

It never opens a holdout and never executes the Phase 2 plugin reference.

## Operator commands

```bash
# Public evidence (network needed for French and IIMA)
python scripts/collect_regime_inputs.py --network
python scripts/export_regimes_replay.py
python scripts/verify_regimes.py --runtime data/exports/replay-source/regimes-runtime

# Local SPY/QQQ/IWM tier from an installed regime-pit/1 Alpaca IEX dataset
python scripts/collect_regime_inputs.py --local-dataset <path-to-installed-dataset>
python scripts/export_regimes_replay.py --local   # seals local runs; publishes nothing
# then run the backend with a signed-in organisation and open /dynamics in Local Live

# Browser verification against a production preview
cd frontend-v2 && npm run build && node scripts/preview-built.mjs &
node scripts/verify-regimes.mjs --url http://127.0.0.1:4174
```
