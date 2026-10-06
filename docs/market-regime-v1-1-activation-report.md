# Market Regime v1.1 — free data activation report

Audit date: 2026-10-05. Status: **ACTIVATED — CONSERVATIVE_MARKET_TIME / IEX ONLY**. Real SPY, QQQ and IWM datasets are installed and NOW, REPLAY and COMPARE pass. This activation uses free IEX market data, existing ALFRED macro captures and the free Kenneth French library. No paid feed or trading orders were used.

The implementation is in the existing `market-regime/v1.1-real-activation` worktree. The original dirty checkout was preserved. Frozen Dynamics source files, analytics, thresholds, weights and certification evidence are unchanged. No new research milestone or partial-factor estimator was introduced. Credentials are read from the local environment file into the process, never copied into snapshots or committed. Raw inputs, captures, QA outputs and the isolated browser database remain ignored.

## Evidence and coverage

> Historical market availability reconstructed conservatively; exact historical receive timestamp unavailable.

> Coverage: IEX ONLY. Not consolidated US market volume, trades or liquidity.

Historical bars use `source=ALPACA_IEX`, `quality=CONSERVATIVE_MARKET_TIME`, original provider timestamps, immutable raw-page and row hashes, and `available_at=observed_at+900 seconds`. They are never labeled `PUBLICATION_TIMESTAMP`. The latency rule is a disclosed reconstruction; later corrections to historical values remain possible. It does not establish independently witnessed historical receive timing.

Alpaca daily timestamps label the start of the New York day. The adapter treats the completed 1Day interval end as the next New York midnight, including DST, then adds the latency rule. Minute bars end one minute after their provider timestamp. Intraday imports use actual XNYS regular sessions, holidays and early closes. Empty minutes and absent daily sessions are not fabricated. Requests explicitly select `feed=iex`, `adjustment=raw`, and `asof=-`; price basis is UNADJUSTED. IEX trade counts and volume remain venue coverage. Spread, liquidity and order imbalance are not inferred.

All history is retained for replay. The adapter passes at most the latest 2,000 visible daily rows into the unchanged frozen engine, after cutoff filtering. The installed histories are below that bound. NOW means latest installed admitted evidence; it is not wall-clock live coverage.

## Installed real inputs

Requested daily range: 2016-01-01 through 2026-10-04 inclusive. The provider returned the coverage below; a requested start does not imply complete 2016 history.

| Asset | Daily rows | First / last provider date | Missing requested daily sessions | Intraday rows | Intraday sessions | ALFRED rows | Daily factor rows | French library rows |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SPY | 1,556 | 2018-11-01 / 2026-10-02 | 1,147 | 35,093 | 90 | 5,301 | 2,680 | 9,516 |
| QQQ | 1,555 | 2020-07-27 / 2026-10-02 | 1,148 | 34,671 | 90 | 5,301 | 2,680 | 9,516 |
| IWM | 1,555 | 2020-07-27 / 2026-10-02 | 1,148 | 34,909 | 90 | 5,301 | 2,680 | 9,516 |

SPY has one isolated 2018-11-01 bar, then the same July 2020 onward coverage as the other assets. QQQ and IWM start on 2020-07-27. All three end on 2026-10-02. Intraday completed-bar timestamps span `2026-05-27T13:31:00Z` to `2026-10-02T20:00:00Z`, over 90 sessions. Missing observations remain missing.

Returned daily rows by year (unlisted years have no rows):

| Asset | 2018 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SPY | 1 | 111 | 252 | 251 | 250 | 252 | 250 | 189 |
| QQQ | 0 | 111 | 252 | 251 | 250 | 252 | 250 | 189 |
| IWM | 0 | 111 | 252 | 251 | 250 | 252 | 250 | 189 |

## Macro and factor provenance

Each asset reuses 3,103 CPIAUCSL and 2,198 UNRATE observations from the existing unrestricted ALFRED original-vintage captures. Raw snapshot payload hashes were verified. Availability remains the next New York midnight after each vintage day (`CONSERVATIVE_VINTAGE_DAY`), with original capture `as_of` retained. Both series retain the existing disclosed `HIGH_IS_STRESS` input direction.

Original ALFRED snapshot identities:

- CPIAUCSL: `02eed207e3eec80f7bfed72bec62f4224b6ef5e0db9d9aca89798a4829bdb970`.
- UNRATE: `5977f1b70f0b5240244035eeb55e38617e05cc3e4eeebaa4986dd8605d3f6270`.

The French library retains 9,516 source rows per asset: 2,680 each for current daily FF3, FF5 and Momentum, plus 738 each for historical monthly FF3 and FF5 archive releases. Each original ZIP, source URL, release identity, frequency, content hash and capture timestamp is preserved. FF5 RMW/CMA remain distinct library factors; they are never aliased to QUAL/VOL/LIQ.

The discovered official historical archive links contain **monthly** data. They are retained as monthly release evidence and are not upsampled into daily observations. A release known only by month becomes available after that entire release month. Current daily FF3/FF5/Momentum files enter only at their actual captures on 2026-10-05 (`CAPTURE_ONLY`), approximately 12:10:10–12:10:12 UTC. Neither source-library releases nor derived daily factor inputs can be backdated to earlier replay cutoffs.

The frozen seven-factor neutrality result remains **UNAVAILABLE**: QUAL, VOL and LIQ are absent. Current FF3/Momentum inputs preserve the available subset, but this activation does not introduce a new partial-factor regression. Event pressure, consolidated microstructure, spread, liquidity and order imbalance remain UNAVAILABLE.

## Forward receive-time collection

The free `wss://stream.data.alpaca.markets/v2/iex` collector authenticated and subscribed successfully. A bounded 30-second smoke capture archived **127 real market messages** in **111 immutable capture files**. These were quote messages; no completed live minute bar was claimed or used to relabel historical bars.

Each capture preserves exact raw frame and SHA-256 hash, symbol/feed, provider event timestamp, local UTC receipt time and nanoseconds, per-message hash and capture timestamp. Receipt time is recorded immediately after `recv()`, before parsing or disk I/O. The host clock is disclosed without a provider clock-accuracy claim. Datetime receipt timestamps round upward at the microsecond boundary, preserving exact nanoseconds separately.

Forward completed original minute bars may be appended as `RECEIVE_TIMESTAMP_CAPTURED`. Progressive daily bars, updated bars and corrections remain in the raw archive; they do not overwrite installed original intervals. Historical and captured evidence are disclosed as MIXED when both occur. The smoke collector has stopped; longer collection is an explicit operator command below.

## Real-data acceptance checks

All assets pass NOW and COMPARE, and REPLAY at `2026-06-26T04:15:00Z`, `2026-08-08T04:15:00Z` and `2026-09-22T04:15:00Z`. Each replay compares a cutoff-only prefix with full future history, then adds genuinely later-available macro/factor rows and archive releases. Entire replay outputs remain byte-identical and the compiler call count does not increase. Raw market rows were checked against immutable provider-page content and symbol/feed identities.

| Check | Result |
| --- | --- |
| Installed SPY / QQQ / IWM real datasets | PASS |
| NOW / three-cutoff REPLAY / COMPARE for each asset | PASS |
| Future-append and late-release replay invariance; no refit | PASS |
| Repeated ingestion preserves all three installed snapshot identities | PASS |
| Conservative / receive-stamped distinction and IEX-only contracts | PASS |
| Missing factors and no future French vintage leakage | PASS |
| Local WebSocket receipt survives disk and replay | PASS |
| Backend product/API/frozen-regime regression tests | 75 PASS |
| Frontend evidence-contract assertions | 37 PASS |
| Type checking, targeted lint, production build | PASS |
| Authenticated desktop NOW / REPLAY / COMPARE for every asset | PASS |
| Mobile comparison layout and conservative/IEX disclosure | PASS |
| Uncaught browser errors | 0 |

Browser QA used the actual authenticated API and frontend. SPY and QQQ cold NOW projections were rendered first. Subsequent mode checks reused independently compiled real snapshots in the existing service cache only after verifying each dataset-visible input hash, snapshot hash and frozen-source version. No synthetic fixtures or replacement API endpoints were used. Mobile checks used a 390 × 844 viewport and confirmed no document-width overflow; data tables retain their own scrolling.

`market_claim_eligible=false`, `validated_alpha=false`, `causal_claim_eligible=false`, `trusted_graph=false` and `precise_edge_confidence=false` remain unchanged. The 75-test run emitted one dependency deprecation warning from Starlette/httpx. The frozen projection verifier validates unchanged parent evidence; no claim of a new full 697-test release CI run is made.

## Hashes and audit artifacts

Installed content hashes (distinct from ingestion snapshot identities):

| Asset | Dataset content hash | NOW snapshot hash |
| --- | --- | --- |
| SPY | `d582fe277f8247718eb1eda33006e23ef9e0d8500950c5a027fbcd803b7e95cd` | `b72fbeb5182b8bb225305c7362372bd5d5a08b20cd354fc29ffffa44c8e569b6` |
| QQQ | `8b3ccc88e7639efc55e201048a586c8fb58037f01f3a95f02f16125e10cb9eea` | `d87e5122a9d86ccb4d879e0b3ddefeaecc637f3b4dee899e9d904a7e36dce302` |
| IWM | `017036eaa8036d49492cea06fdcb7dc0e5be9d24f3e38997f17ceabcabc8aa63` | `bcc4b05c7b0a8163002dddd7720e9b52acdeca4d45c10e408686a505a05ab8b4` |

Per-stream normalized row hashes:

| Asset | Stream | SHA-256 |
| --- | --- | --- |
| SPY | daily | `4fb1f489f16de907b43caea52bdae017045630752836fd790b38b632c22099e7` |
| SPY | factors | `918031d7d422d7f7f7a62a4cb4bb22dc4553537b530c3d00856d6aed8a468c09` |
| SPY | intraday | `bd0b2e3ab1470232ff03ba10d5e434389d9432bf2678218bb2f03aff4574ccf0` |
| SPY | macro | `2bd43edbd4971013ef7c9ce5cc2e8bee082cb7a19ab23b7a0c2dafc0c992462e` |
| QQQ | daily | `86bd3638cac9339a0e7fb1f20078fb5c631f94afa2ea7beb5f0c3e4e21f42717` |
| QQQ | factors | `918031d7d422d7f7f7a62a4cb4bb22dc4553537b530c3d00856d6aed8a468c09` |
| QQQ | intraday | `5f7e387f5caccd2899e2844859fc130767946155d89bb0115bd31a4786ff0d01` |
| QQQ | macro | `2bd43edbd4971013ef7c9ce5cc2e8bee082cb7a19ab23b7a0c2dafc0c992462e` |
| IWM | daily | `e35c9032557924987d01bf8fb4495efe6c54cfe0fade616b5f8f316787a2e7f7` |
| IWM | factors | `918031d7d422d7f7f7a62a4cb4bb22dc4553537b530c3d00856d6aed8a468c09` |
| IWM | intraday | `88c16ac0f815fd50701e800a69b9f75bb8f1598a989de179d6390879657b203f` |
| IWM | macro | `2bd43edbd4971013ef7c9ce5cc2e8bee082cb7a19ab23b7a0c2dafc0c992462e` |

The ignored `data/regime_intelligence/v1/activation-qa/activation-report.json` contains all replay input/snapshot hashes, raw page identities, French ZIP hashes/URLs, quality summaries, coverage ranges and browser assertions. Full actual NOW, REPLAY and COMPARE results and screenshots are saved alongside it. Original provider snapshots remain under `provider-snapshots/`; no credentials are serialized.

## Operator commands

Run from this worktree with credentials set in the process, or use an explicit local `--env-file` path. The existing ALFRED source captures must remain available.

```powershell
python scripts/ingest_regime_alpaca.py --start 2016-01-01 --end 2026-10-05 --intraday-sessions 90
python scripts/collect_regime_alpaca.py --duration-seconds 0 --max-messages 100000
python scripts/ingest_regime_captures.py --asset SPY --as-of 2026-10-06T20:00:00Z
python scripts/verify_regime_free_activation.py
```

Repeat captured-bar ingestion separately for QQQ and IWM at the actual desired cutoff. The collector stops on its duration/message bound or operator interruption. Neither product GET requests nor catalog reads initiate provider downloads.

Provider semantics: [Alpaca historical bars](https://docs.alpaca.markets/us/reference/stockbars), [bar aggregation and conditions](https://docs.alpaca.markets/us/docs/market-data-faq), [Alpaca real-time IEX and updated bars](https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data), [French FF3 archives](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_factors_archive.html), [French FF5 archives](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_5_factors_2x3_archive.html), [FRED vintage fields](https://fred.stlouisfed.org/docs/api/fred/series_observations.html).
