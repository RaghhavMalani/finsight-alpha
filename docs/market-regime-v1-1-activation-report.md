# Market Regime Intelligence v1.1 — activation report

Audit date: 2026-10-05. Status: **BLOCKED_REQUIRED_EQUITY_PIT_INPUTS**. This is an activation report, not a new analytics or research milestone. Real SPY/QQQ/IWM activation is not complete.

## Release and scope

The complete v1 integration was normally merged into `main` at `b5b56bf649b6b718e6cec89d126e69919c4f306a`, preserving its commits. Annotated tag `market-regime-v1.0` identifies that merge. Its tree is identical to the previously verified v1 product tree. The short-lived `market-regime/v1.1-real-activation` branch starts from this release.

[Main release CI](https://github.com/RaghhavMalani/finsight-alpha/actions/runs/37299301660) passed: 697 regression tests, 36 anti-gaming checks, all thirteen frozen Dynamics verifiers, frontend contract checks, type checking, lint and production build. Author and committer remain `Raghhav Malani <96712854+RaghhavMalani@users.noreply.github.com>`.

No analytics definition, threshold, Hawkes logic, fracture weight, landscape objective or frozen Dynamics evidence was changed. The original dirty checkout was not edited. Credentials and raw provider responses are not committed.

## Installed asset datasets

The live product catalog was checked against the managed checkout's actual `data/regime_intelligence/v1` root. No per-asset input file is installed. The row counts below are installation counts, not invented zero-valued market observations.

| Asset | Installed provider | Daily rows | Intraday rows | Installed macro rows | Asset content hash |
| --- | --- | ---: | ---: | ---: | --- |
| SPY | UNAVAILABLE | 0 | 0 | 0 | UNAVAILABLE |
| QQQ | UNAVAILABLE | 0 | 0 | 0 | UNAVAILABLE |
| IWM | UNAVAILABLE | 0 | 0 | 0 | UNAVAILABLE |

For **each** asset: date range, first publication timestamp and last publication timestamp are UNAVAILABLE. Factor coverage, aggregate-event coverage, liquidity, spread, order imbalance and trade count are UNAVAILABLE. Required daily and intraday OHLCV are missing. Real macro evidence is staged separately below; it has not been represented as an installed equity dataset.

Catalog results for SPY, QQQ and IWM were `source=real`, `scope=REAL_PIT`, `available=false`, zero publication cutoffs, and reason `No valid publication-evidenced input installed`. Explicit `DEMO` entries remained `SYNTHETIC` and available. They were not used to fill real asset views. Catalog requests remained read-only with no provider downloads.

## Source access and actual macro acquisition

Provider credentials were not configured in the process/user/machine environment or the managed worktree. A deeper check of the original checkout's local environment file found FRED and Finnhub credentials. Values were neither displayed nor copied into this branch. Existing cached FRED point-snapshot history was not treated as original vintage history.

The existing `FredVintageProvider` successfully fetched unrestricted original real-time history for CPIAUCSL and UNRATE. The existing adapter validated and normalized **5,301 real macro observations**. Both series use `HIGH_IS_STRESS` as the disclosed input direction; no stress estimator or normalization was changed. This direction is an input definition, not a causal or trading claim.

| Provider / series | Observation rows | Distinct series vintages | Observed date range | Availability quality |
| --- | ---: | ---: | --- | --- |
| FRED/ALFRED: CPIAUCSL | 3,103 | 669 | 1947-01-01 to 2026-08-01 | CONSERVATIVE_VINTAGE_DAY |
| FRED/ALFRED: UNRATE | 2,198 | 800 | 1948-01-01 to 2026-09-01 | CONSERVATIVE_VINTAGE_DAY |

Availability is conservatively the following midnight in `America/New_York`, not retrieval time. Vintage days are not precise intraday publication clocks. The original source-capture `as_of` is retained. [FRED observations documentation](https://fred.stlouisfed.org/docs/api/fred/series_observations.html) describes the real-time fields used by the existing adapter.

- CPIAUCSL first/last admitted availability: `1972-07-22T04:00:00Z` / `2026-09-12T04:00:00Z`.
- UNRATE first/last admitted availability: `1960-03-16T05:00:00Z` / `2026-10-03T04:00:00Z`.
- CPIAUCSL normalized observation content hash: `2f01eea7eb22f0672f2579d38735d9a78ca48ec00bef39cacea28d5b1b0e1127`.
- UNRATE normalized observation content hash: `114148136ab5cd3217030d4a68fc2cb48af7d00209df07dc862ec6162637debf`.
- CPIAUCSL publication evidence: immutable snapshot `02eed207e3eec80f7bfed72bec62f4224b6ef5e0db9d9aca89798a4829bdb970`.
- UNRATE publication evidence: immutable snapshot `5977f1b70f0b5240244035eeb55e38617e05cc3e4eeebaa4986dd8605d3f6270`.

Raw responses are retained under ignored `data/regime_intelligence/v1/provider-snapshots/fred-alfred/`. These shared macro captures are not three activated asset datasets. Their normalized hashes include source-capture provenance; a later fresh capture is not asserted to have the same hash.

A read-only probe using the configured Finnhub credential returned **HTTP 403** for SPY `stock/candle`, resolution `D`. No paid access was purchased, no account or entitlement was changed, and no price rows were installed. QQQ/IWM probes were not repeated after the access denial. No other equity-provider credential or genuine bar export was found in the audited locations. Generated pytest files named SPY were recognized as simulated fixtures and excluded.

An ordinary current historical-bar response is not substituted for an original publication/receive-stamped export. [Alpaca's documented updated-bar behavior](https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data) illustrates why a bar's observation timestamp alone cannot identify the original version that was available at a historical cutoff.

## Smoke checks on real macro evidence

The actual normalized macro observations were passed through the existing `PITDataset` validation and `visible_payload` filter in memory. No equity calendar or bar metadata was installed. At each cutoff, an initial prefix was compared with the full captured history. Appending genuinely later-published macro rows left the visible-input identity unchanged. Rows whose economic observation or availability exceeded the cutoff were excluded.

| Cutoff (UTC) | Visible real macro rows | Future-publication rows excluded | Later revisions of already-visible observations excluded | Macro-only input invariance |
| --- | ---: | ---: | ---: | --- |
| 2008-09-15T23:59:59Z | 3,599 | 1,702 | 157 | PASS |
| 2020-03-16T23:59:59Z | 4,717 | 584 | 153 | PASS |
| 2022-10-03T23:59:59Z | 4,924 | 377 | 179 | PASS |

The matching prefix/full visible-input hashes were:

- 2008 cutoff: `791387938b5fd29fd236c2ddd5e2e4782b730bdacd85796e0d58ef3465cbb6a0`.
- 2020 cutoff: `2341398fedf2fac4420845b90787a88f0e18493a40ddd02efa4abc87fc3944f9`.
- 2022 cutoff: `06f601029767b899b3936d1cfb3d9c7580140d9e509ba118ca325af12c1997f0`.

These are **real macro input-filter checks, not full product replay or cache/no-refit checks**. Full product invariance requires genuine daily and intraday equity evidence. The v1 regression suite's simulated-publication invariance tests continue to pass, but are not described as real activation QA.

## Activation acceptance status

| Requested check | Status |
| --- | --- |
| One installed real dataset per asset | BLOCKED — required daily/intraday publication evidence absent |
| Real NOW dashboard | NOT RUN — no installed equity input |
| Full REPLAY at three historical cutoffs | NOT RUN — macro-only filtering verified, full state unavailable |
| Full COMPARE between historical cutoffs | NOT RUN — no installed equity input |
| Whole replay(T) future-append byte invariance and no refit | NOT RUN on real assets |
| Whole replay(T) late macro/factor revision invariance | NOT RUN on real assets; macro input exclusion verified; factors absent |
| UI provenance versus installed real source records | NOT RUN — no installed equity input |
| Real/synthetic catalog and contract distinction | PASS — real assets unavailable, demos explicitly synthetic |
| Desktop/mobile real-data browser QA | NOT RUN — data-dependent activation blocked |

`market_claim_eligible=false`, `validated_alpha=false`, `causal_claim_eligible=false`, `trusted_graph=false`, and `precise_edge_confidence=false` were checked directly against the unchanged product claims.

## Exact input needed to finish

Provide genuine daily **and** intraday exports for SPY, QQQ and IWM with original version/publication or receive-time evidence, or configure an entitled feed that supplies that evidence. Every row must retain `observed_at`, `available_at`, source `as_of`, `source`, `revision`, `quality`, and `publication_evidence`. Include the actual price basis, timezone, session/calendar policy and construction definitions. Do not replace historical availability with today's download time.

Once those inputs exist, use the [existing operator ingestion path](market-regime-product-v1.md), augment with the captured/refreshable ALFRED evidence, and run the requested real NOW / three-cutoff REPLAY / COMPARE and invariance/UI checks. Factors, events and optional microstructure streams may remain UNAVAILABLE. No new adapter framework, estimator, threshold tuning, research grid, cross-asset module or live execution is part of this activation branch.
