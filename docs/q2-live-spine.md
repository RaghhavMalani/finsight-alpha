# Q2 Live Spine

The product updates without a refresh, and everything live is recorded so it replays identically later.

## Shape

```
feeds (src/live/feeds) --fetch in thread--> scheduler (asyncio, src/live/scheduler.py)
   --> LiveStore.append (stamps available_at) --> Bus.publish --> /live/stream (SSE), /live/recent
          |                                   \--> triggers   --> research.progress (SUGGESTED), stored + published
          \--> feed.health record per attempt  --> LiveRisk   --> risk.alert, stored + published
```

The bus only carries stored records. Live and replay therefore emit the same sequence of the same bytes.

## Store (`src/live/store.py`)

- One JSONL segment per UTC day of `available_at`, under `FINSIGHT_LIVE_DIR`, else `$FINSIGHT_DATA_DIR/live`,
  else `~/.finsight-forge/live`. A root inside the repository is refused. JSONL over SQLite: a day file is
  append-only by construction, diffable, and replays by reading lines in order.
- `available_at` is the store's ingestion clock. A feed cannot set it; a claimed value is overwritten and kept in
  `provenance.feed_claimed_available_at` for audit. Stamps never go backwards when the wall clock does.
- Idempotent by `(source, source_id, revision)`; `id = sha256(source \x1f source_id \x1f revision)`. A revised
  value is a new revision row, never an overwrite.
- Content-hash revisions (`provenance.revision_basis: CONTENT_HASH`: EIA, quotes, prediction markets, RSS) are
  duplicates only when equal to the latest stored revision, so A -> B -> A stores the return as `A~1`.
- `observed_at`, `effective_at` and `provenance.fetched_at` never exceed `available_at`: up to 10 minutes ahead
  is clamped and flagged (`<field>_clamped_from`), beyond that refused. Future-intent times (NWS onset/expiry)
  live in the payload. Also refused: missing provenance or licence fields, unknown type or confidence, NaN/Infinity.
- One writer process per root (OS lock on `store.lock`; readers and offline replay open read-only). A batch is
  all-or-nothing; memory changes only after write + fsync, and a failed write is truncated back. A torn tail
  from a crash is moved to `quarantine/` at open; a damaged day is reported in `seal_errors` and never sealed,
  without blocking startup or other days. A wall clock stepping back or jumping forward is flagged in provenance.
- `seal_day(day)` (past days only; also run at startup and after each UTC midnight) copies the segment to
  `sealed/<day>.<sha16>.jsonl` and writes `sealed/<day>.manifest.json` (sha256, rows, seq range, source and type
  counts). Re-sealing is a no-op; a changed segment or sealed file fails closed. Replay reads only verified sealed
  bytes. Nothing is written under `data/exports`.

## Record and event schema (`live-observation/1`)

Every SSE event, `/live/recent` item and stored line has exactly these fields:

| field | meaning |
|---|---|
| `seq` | store-wide append order; SSE `id:` |
| `id` | content address of `(source, source_id, revision)` |
| `type` | `market.tick`, `geo.event`, `macro.release`, `news.headline`, `prediction.update`, `risk.alert`, `research.progress`, `feed.health`; SSE `event:` |
| `source`, `source_id`, `revision` | provider identity and the provider's own revision clock (USGS `updated`, ALFRED vintage, NWS `sent`, ...) |
| `observed_at` | when the thing happened (quake origin, bar end, period start) |
| `available_at` | when FinSight learned it (store clock) |
| `effective_at` | the source's publication/validity time, or `null` when the source gives none |
| `licence` | `status`, `attribution`, `terms_url`, `redistribution` (`PUBLIC` / `LOCAL_ONLY`), optional `note` |
| `confidence` | `OFFICIAL`, `PROVISIONAL`, `UNOFFICIAL`, `DERIVED` (authority, not probability) |
| `provenance` | `feed`, credential-free `url`, `fetched_at`, `content_sha256` of the response, `parser`, `delay` label; derived records add `inputs` |
| `payload` | type-specific values; `payload.kind` names the shape |

`news.headline` is an addition to the brief's list: central-bank headlines are neither geo nor macro.

## Feeds

| feed | type | cadence | delay label (abridged) | licence |
|---|---|---|---|---|
| `usgs` | geo.event | 2 min | near real time; automatic solutions revised | public domain |
| `gdelt` | geo.event | 15 min | 15-minute batch; machine-coded from news | open with citation |
| `nws` | geo.event | 5 min | active Severe/Extreme alerts as issued | public domain |
| `celestrak` | geo.event | daily (>= 2 h apart) | element sets; epoch is the set time | cited, usage policy |
| `fred` | macro.release | daily | ALFRED vintage days, admitted next NY midnight | citation requested; local only |
| `eia` | macro.release | daily | spot prices appear days after trade date | public domain |
| `yfinance_us` | market.tick | 2 min | DELAYED, unofficial, commonly up to 15 min | unverified; local only |
| `alpaca_iex` | market.tick | 1 min | IEX venue only; not consolidated | licensed; local only |
| `nse` | market.tick | 1 h | end of day; operator-imported bhavcopy | unverified; local only |
| `polymarket` | prediction.update | 5 min | indicative outcome prices, polled | unverified; local only |
| `kalshi` | prediction.update | 10 min | last trade and top of book at poll | unverified; local only |
| `rss` | news.headline | 30 min | publisher pubDate; headlines only | Fed public domain; ECB local only |

Keys come from the environment only (`FRED_API_KEY`, `EIA_API_KEY`, `APCA_API_KEY_ID`/`APCA_API_SECRET_KEY` or
`ALPACA_*`). A missing key gives `UNAVAILABLE: no key (...)`; the feed is never polled and the rest keep working.
NSE needs `FINSIGHT_NSE_BHAVCOPY` and `FINSIGHT_NSE_CALENDAR` (official session evidence) and otherwise reports the
provider's own UNAVAILABLE reason; it never scrapes. Requests carry
`User-Agent: FinSight-Forge research (github.com/RaghhavMalani/finsight-alpha)` (yfinance uses its own client),
never follow redirects, and stop reading at a byte cap. GDELT follows only `https://data.gdeltproject.org`
export files named by its index, checks the published md5, and bounds the unzipped CSV. RSS refuses DOCTYPE and
ENTITY declarations. The frontend child process gets an environment without provider credentials.
Data Organ's `fetch` writes captures into `data/exports`, so FRED reuses the shared ALFRED parser
(`src.regime_intelligence.providers.alfred_observations`) with its own transport instead.

## Scheduler

Per feed: first run staggered, then cadence +/-10% jitter. Failure backoff 30 s doubling, capped at
min(cadence, 1 h), never below the feed's `min_interval_s` or a server `Retry-After`. Health per feed: status
(`UP`, `DEGRADED`, `DOWN` after 3 consecutive failures, `UNAVAILABLE`), last attempt/success, lag, error rate over
the last 20 attempts, consecutive failures, partial errors, rows/new/rejected, next due, licence and delay label.
Each attempt writes a `feed.health` record. Daily feeds respect their cadence across restarts (last success is
read back from stored health).

## Risk reacts live (`src/live/risk_live.py`)

Thin adapter, read-only, over the reviewed policy `eval/risk_manager/v0.1/policy.json` (loaded with
`src.risk_manager.policy.load`, every alert checked with `validate_rule`). Input: each stored `feed.health`.

- `R-DATA-ATTEMPT` (HIGH): feed DOWN. `R-DATA-HEALTH` (MEDIUM): feed DEGRADED.
  `R-DATA-FRESHNESS` (MEDIUM): last success older than the policy's daily 7-day bound.
- Alerts only on outcome transitions, each citing the health record it was computed from. A finding clears only
  when the feed is UP again (DEGRADED -> DOWN is worse, not resolved); last outcomes are rebuilt from stored
  alerts at startup.
- Not covered: `R-DATA-GAPS`, `R-DATA-MIRROR`, all MODEL, RESEARCH, PORTFOLIO, SIMULATOR and SYSTEM rules. They
  need retained evidence bundles, not live feed inputs. No Risk publication artifact is written.

## Research triggers (`src/live/triggers.py`)

Declarative rules over stored inputs; places are `src.geo.usgs.HUBS`. M6+ quake within 500 km of a hub;
GDELT material conflict (QuadClass 4, >= 50 mentions) within 300 km; Extreme NWS alert within 150 km;
a fresh (<= 3 days) ALFRED revision; a prediction-market move >= 10 pp. Output is a stored `research.progress`
record with `status: SUGGESTED`, `auto_run: false`, `cost_usd: 0`. Nothing runs a model.

## Run

```bash
python -m finsight live                    # API :8000 with live feeds + frontend dev server :5173
python -m finsight live --no-frontend
python -m finsight live --offline          # replay recorded (sealed) segments; no network, no writes
python -m finsight live --scheduler-only --duration 300   # headless; prints health JSON at the end
.\live.ps1 [same flags]                    # Windows PowerShell
```

The API starts the spine only when `FINSIGHT_LIVE` is `online` or `offline` (the launcher sets it); a plain
`uvicorn backend.main:app` is unchanged. Routes sit behind the usual session gate and are local only (503 in
production). `GET /live/stream?type=a,b&since_seq=N` (also honours `Last-Event-ID`; 15 s keep-alive comments;
backlog older than the in-memory ring comes from the store; an `event: gap` frame reports events a slow client
lost or history no longer held, so a client knows to re-poll `/live/recent`);
`GET /live/health`; `GET /live/recent?type=&since=<seq or ISO available_at>&limit=`.

## Tests

`tests/live` (no network): provenance completeness over every fixture feed, idempotency across restarts,
backdating sabotage (fails with the guard line removed), stamps never go backwards, sealing and tamper
detection, replay equivalence through the real scheduler (fails if the bus publishes anything but stored
records), SSE framing/filter/resume via TestClient, backoff and health, missing keys, Risk transitions,
triggers. `FINSIGHT_NETWORK_TESTS=1` enables a USGS smoke test.

## Limits

- The store loads every segment's keys at startup; fine for months, not years. A key index is the next step.
- Offline replay paces gaps 60x faster, capped at 2 s; it replays sealed days (or open segments if none sealed).
- ALFRED day granularity means a release published today is admitted from the next New York midnight.
- Polymarket/Kalshi/Yahoo/NSE/ECB are `LOCAL_ONLY` until their terms are reviewed.
