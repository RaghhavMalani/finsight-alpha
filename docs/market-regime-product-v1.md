# Market Regime Intelligence v1 — Real PIT Integration

This is one product iteration on frozen instruments, not D0.4.3 and not another synthetic-world research tournament. D0.4 through D0.4.2 were normally merged to `main`, preserving their twelve commits. The annotated `dynamics-v0.4.2` tag identifies merge commit `00aa63d2ce1e060e763b78a3ee05605ffd1a4623`. The complete nonlinear and event research history, evidence artifacts and D0.4.2 source seals remain unchanged.

## What is implemented, and what is not activated

The integration supports SPY, QQQ and IWM with provider-neutral publication-evidenced inputs, append-only installation, a real ALFRED vintage adapter, read-only authenticated APIs, historical caching, and NOW / REPLAY / COMPARE. The default product view is a real asset; legacy experiments are in a secondary evidence drawer. Synthetic demos remain available only as explicit SYNTHETIC choices with asset `DEMO`.

No publication-stamped daily/intraday market export or configured FRED/provider credential was available in the implementation environment. Therefore the three real asset views are deliberately UNAVAILABLE. Contract tests use clearly simulated publications and do **not** constitute real-market validation. An ordinary current-history download cannot honestly close this activation gap. The code accepts genuine feeds when an operator supplies them; it does not advertise empty synthetic demos as real data.

The existing five analytics modules are reused without changing an estimator, threshold, label, objective weight, normalization, or research claim:

- Multi-horizon realized/EWMA volatility and clustering, with the frozen component definitions.
- Exchange-time weekday × intraday-bucket seasonality against prior-session baselines.
- Rolling seven-factor exposure/neutrality with HAC uncertainty and return attribution.
- Regime-conditioned momentum statistics, including small-sample abstention.
- The 121-point disclosed policy landscape and historical optimizer movement.

Hawkes remains aggregate event pressure/intensity only. Exact graphs, causal interpretations and precise edge confidence are not trusted. Market certification, validated alpha, causal claims, trusted graphs and precise edge-confidence flags remain false. There is no live execution, HFT claim, RL integration, new estimator or tuned diffusion repair.

## Time and evidence contract

The input schema is `regime-pit/1`. Each row contains:

| Field | Meaning |
| --- | --- |
| `stream` | `daily`, `intraday`, `factors`, `macro`, or `events` |
| `observed_at` | Time of the measured economic observation or completed market interval |
| `available_at` | Actual publication/availability time, backed by explicit provider evidence |
| `as_of` | Source capture timestamp; this is provenance, **not** a replacement for publication time |
| `source` | Provider and dataset identity |
| `revision` | Publication/vintage version |
| `quality` | `PUBLICATION_TIMESTAMP`, or macro-only `CONSERVATIVE_VINTAGE_DAY` |
| `publication_evidence` | Provider reference or immutable raw-snapshot reference proving the chosen availability |
| `values` | Stream-specific payload |

All timestamps require a timezone and normalize to UTC. The order is `observed_at <= available_at <= source as_of`. A replay admits a row only when **both** observation and availability are no later than the requested cutoff. Capture may be later than a historical cutoff when a genuine original vintage is reconstructed; capture alone proves nothing about historical availability.

Daily and intraday bars require numeric `open`, `high`, `low`, `close`, `volume`, valid OHLC bounds, and nonnegative volume. Optional supported measurements are `strategy_return`, `spread_bps`, `liquidity`, `order_imbalance`, and `trade_count`. Spread and liquidity require explicit definitions; no quote midpoint/spread or depth is invented from closing prices. OHLC is retained in the publication identity even though the frozen analytics consume close/volume and optional measurements.

Factor values are nested as `{"values":{"MKT":0.001,...}}` and use finite decimal simple returns. Supported names remain `MKT, SMB, HML, MOM, QUAL, VOL, LIQ`; construction and units must be documented. No supplied strategy return means attribution is explicitly labeled `ASSET_BUY_AND_HOLD_RETURN`, derived from published closing prices. If any strategy returns are supplied, missing strategy values are not patched with asset returns.

Macro values are `{"series":"CPIAUCSL","value":310.1,"direction":"HIGH_IS_STRESS"}` (or `LOW_IS_STRESS`). Aggregate events have an empty values object and a documented event-observation policy. An aggregate event timestamp does not identify a causal edge.

The dataset declares the asset, exchange timezone, `UNADJUSTED` or genuinely `TOTAL_RETURN` price basis, calendar policy, bucket length, session length, annualization, and stream definitions. Corporate-action adjustments without vintage evidence must not be called historically available total-return prices. Operators must preserve genuine exchange holidays/early closes; the adapter does not manufacture a market calendar.

### Missing data and the frozen state boundary

An absent stream is UNAVAILABLE, not zero. Two published daily bars are required for a snapshot; module-specific warm-up and rank conditions still apply. Incomplete seven-factor coverage leaves F unavailable even if a smaller regression is estimable. Consequently a fully covered fracture/landscape may remain unavailable. Sparse inputs must not be promoted to complete state vectors just to make a chart render.

The frozen instrument evaluates a state at each **published daily price bar**. The product displays requested `as_of` and actual `state_at` separately. A macro release or event published after the last price-bar publication appears in input provenance but enters the next bar state, under the unchanged D0.4.2 definition. NOW means latest installed publication, not a guaranteed live market timestamp.

## Provider adapters and operator ingestion

Product GET routes never download data. Ingestion is an explicit operator action, not a public upload endpoint. Installed datasets are shared operator-selected market inputs for authenticated users: do not install tenant-private data or feeds whose license prohibits the intended access. Raw snapshots and runtime datasets are ignored by Git; credentials and licensed data must never enter a commit.

`VersionedExportProvider` accepts the complete JSON schema for all five streams. `publication_csv` is a numeric daily/intraday OHLCV adapter requiring `observed_at,available_at,as_of,revision,quality,publication_evidence` plus values columns and an explicit provider identity. Date-only CSVs are rejected. Structured factors, vintages and events use JSON.

Validate a complete export without installing it:

```sh
python scripts/ingest_regime_pit.py /path/to/SPY-publications.json --validate-only
```

Install or append an export (the universe is SPY/QQQ/IWM):

```sh
python scripts/ingest_regime_pit.py /path/to/SPY-publications.json
```

The default directory is `$FINSIGHT_DATA_DIR/regime_intelligence/v1`. `--root` chooses a deliberate operator directory. Files are named by asset. A metadata template with an empty observations list can be combined with `--daily-csv`, `--intraday-csv`, and `--source`; prepare actual definitions before the first install.

Repeated captures of the same publication retain their original source capture/evidence. A newly published macro/factor vintage is appended rather than overwriting the previous row. Same-identity changed values are refused. Existing dataset metadata cannot silently change. Daily/intraday/event rewrites are explicitly unsupported by this frozen analytics boundary and refused, not quietly restated. An exclusive per-asset import lock and atomic file replacement prevent overlapping imports; a stale lock requires operator investigation. Do not remove one while an importer is active.

### ALFRED/FRED vintage macro

Set `FRED_API_KEY` in the process environment, never in the input document or command argument. The adapter requests unrestricted real-time history (`realtime_start=1776-07-04`, output type 1), preserves original row vintage intervals, rejects incomplete pagination and rejects point-snapshot response periods that would mask original vintage dates. Immutable source responses use the existing snapshot store with sanitized request metadata. A provider outage can reuse only an exact-request cached snapshot, retaining its original capture timestamp.

```sh
python scripts/ingest_regime_pit.py /path/to/SPY-publications.json \
  --fred CPIAUCSL:HIGH_IS_STRESS --as-of 2026-10-05T20:00:00Z
```

ALFRED supplies vintage **days**, not reliable intraday publication clocks. Availability is conservatively the following midnight in `America/New_York`, including daylight-saving conversion. The row carries `CONSERVATIVE_VINTAGE_DAY`; the UI exposes this limitation. Download time and the vintage-query cutoff are never assigned as original publication time. FRED does not provide the missing intraday equity or factor/event/liquidity streams. `--validate-only` with `--fred` still explicitly requests and snapshots provider data, but does not install a dataset.

The [FRED observations documentation](https://fred.stlouisfed.org/docs/api/fred/series_observations.html) and [ALFRED help](https://alfred.stlouisfed.org/help) define the real-time/vintage source contract. Equity providers may issue late-trade aggregate updates: the [Alpaca stock-data documentation](https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data) is one reason ordinary returned bar timestamps are not sufficient publication evidence.

## Read-only API and cache

All routes are behind the existing authenticated session gate:

| GET route | Result |
| --- | --- |
| `/dynamics/regime-product/assets` | Supported universe, source scope, availability, publication cutoffs, activation requirements |
| `/dynamics/regime-product/snapshot?asset=SPY&source=real&as_of=...` | One full snapshot; omit `as_of` for latest installed evidence |
| `/dynamics/regime-product/compare?asset=SPY&source=real&left=...&right=...` | Two complete snapshots from one input read, plus server-calculated B−A state deltas |

Synthetic sources `demo-full` and `demo-sparse` require `asset=DEMO`, never a real ticker. No GET mutates provider state. Missing files return 404 UNAVAILABLE; invalid contracts/cutoffs return 422; changed frozen evidence returns 409; an exhausted concurrent replay wait returns 503. Insufficient visible daily history returns an explicit UNAVAILABLE snapshot, not invented analytic values.

Each snapshot includes input and snapshot content addresses, frozen analytics version, source/revision/quality references for each stream, requested cutoff, evaluated state timestamp, attribution target, full analytics and historical transition ledgers. Source `as_of` can differ from requested `as_of` and is labeled accordingly.

The in-process replay key is `(visible input hash, as_of, asset, analytics version + frozen source seal)`. Future rows and revisions with availability after T are filtered **before** hashing. File mtime or whole-input revision is not the replay identity. Future appends therefore hit the same cache and leave the complete replay(T) byte-identical. Visible historical additions legitimately change the input identity; they are not silently represented as the old snapshot.

The LRU is bounded to 24 completed projections and uses per-key single-flight futures to avoid duplicate concurrent fits. Responses are deep copies. Worker restart/eviction can recompute a requested snapshot; the guarantee is no refit on a retained cache hit, not permanent cross-process storage. Both comparison cutoffs use one immutable dataset read. Frozen parent/source validation runs before serving cached real projections.

## Product modes and interaction

NOW shows latest installed evidence with refresh controls and explicit data gaps. REPLAY accepts an arbitrary UTC cutoff, a publication-session selector and a scrubber that applies only on deliberate confirmation. Every module, objective surface, optimizer trail and source summary changes together. It does not relabel a current-data chart as historical.

COMPARE displays A/B regimes, seven state dimensions, fracture components and two full module dashboards/landscapes. Narrow screens stack them; wide screens place them side by side. Each snapshot retains its own source evidence, cutoff, sample conditions and UNAVAILABLE states.

The transition timeline shows the six unchanged fracture components: volatility, correlation, liquidity, aggregate events, factors and macro. Contributions remain `1/6 × absolute component change`; the ≥0.10 transition threshold and ≥0.25 severe label are frozen. Partial coverage exposes only an available subtotal, never a complete fracture score. Selecting a publication replays the complete dashboard. Historical ledgers are reconstructed with the frozen fracture function from the frozen timeline vectors; display rounding can differ by at most numerical display precision, and the latest ledger is the exact current-state ledger.

Frontend runtime adapters fail closed on unknown versions, elevated claim flags, mismatched real/synthetic scope, invalid publication times, invented missing streams, vector bounds, incorrect fracture arithmetic, future timeline entries and inconsistent comparison deltas. Charts consume server-projected evidence; they do not create market claims in the browser.

## Verification and release discipline

Focused tests cover strict observation timing, OHLCV validity, immutable import/repeated capture, future append byte invariance with no refit, late factor/macro revision invariance, missing streams, complete fracture accounting, compare consistency, provider quality, source vintage timing, read-only routes and authentication. Frontend negative-contract cases, TypeScript, lint, production build and responsive authenticated browser checks complement the existing full regression suite and all thirteen frozen Dynamics verifiers.

All release author and committer identities remain `Raghhav Malani <96712854+RaghhavMalani@users.noreply.github.com>`. Nothing in this iteration changes the frozen scientific outcome, upgrades a capability decision, or trains against the prior replication worlds. Real-data activation is complete only after legitimate provider inputs are installed and inspected; code completion alone is not that scientific or operational claim.
