# Q1 — Truth layer fundamentals

Point-in-time correctness is owned by the Truth layer (`src/truth` + `src/data_organ`).
The separate AsOf project is retired; this repo never imported it. Docs that named it as
a layer now point here. `AsOfContext` (`src/data/as_of.py`) is an in-repo class and stays.

## What changed

- `src/data_organ/sec_edgar.py` — SEC EDGAR XBRL `companyfacts` provider.
  - Endpoints: `https://www.sec.gov/files/company_tickers.json` (ticker -> CIK) and
    `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`. No other URL is allowed.
  - Header `User-Agent: FinSight-Forge research (github.com/RaghhavMalani/finsight-alpha)`; no email.
  - Fair access is enforced in code: a process-wide sliding one-second window, at most
    10 requests/second (`RateLimiter` refuses a higher setting).
  - Licence recorded on every capture: `PUBLIC_INFORMATION`, terms
    <https://www.sec.gov/about/privacy-information>, fair access <https://www.sec.gov/developer>.
    `permitted_uses` is `research_local` only: no derived-publication grant is registered.
  - Bounded declared schema of 11 concepts (revenues, revenue from contracts, operating income,
    net income, operating cash flow, diluted EPS, assets, liabilities, equity, cash, shares
    outstanding). Duration concepts become `<field>_q` (80–100 days) or `<field>_fy`
    (350–380 days); year-to-date durations are excluded and counted, not admitted.
  - One Data Organ capture per unit (`USD`, `USD/shares`, `shares`), like the IEX intraday split.
- `src/data_organ/contracts.py` — `validate_observation` keeps optional filing provenance
  (`filed`, `form`, `fiscal_year`, `fiscal_period`, `effective_start`, `frame`, `xbrl_concept`)
  when a provider supplies it, and quarantines rows a provider marks with `quarantine_reason`.
  Rows without these keys normalize exactly as before, so existing admission identities are unchanged.
- `src/truth/fundamentals.py` — `fundamentals(ticker, field, as_of)` via `FundamentalsBook`.
- Tests: `tests/data_organ/test_sec_edgar.py`, `tests/test_truth_fundamentals.py`,
  opt-in `tests/data_organ/test_sec_edgar_live.py`; fixtures in `tests/data_organ/fixtures/`.

## Mapping

Each XBRL fact row becomes one observation. A later filing for the same concept and period
is a new row; nothing is overwritten.

| Datum | Value |
| --- | --- |
| `effective_at` | XBRL period `end` (Data Organ `observed_at`, UTC date-only convention) |
| `available_at` | next America/New_York midnight after the EDGAR `filed` date |
| `revision` | accession number (`accn`) |
| `observed_at` | fetch clock (capture `captured_at`) |
| `source`, licence | `sec:edgar-companyfacts`, `PUBLIC_INFORMATION` |
| provenance | `form`, `fiscal_year`, `fiscal_period`, `filed`, `effective_start`, `frame`, concept |

Availability rule, in one line: EDGAR dates a filing accepted after 17:30 ET to the next business
day, so dissemination always precedes the end of the filing date; the next New York midnight is
the most conservative clock the `filed` date alone can justify (same rule as the ALFRED vintage day).

Quarantined at admission, with reasons: filing date before period end; `available_at` before
period end or after the capture clock; undeclared units; non-numeric values; missing
provenance; and disagreeing values for one period at the same filing instant. Identical values at
the same instant collapse to the lowest accession and are counted in capture metadata.

## `fundamentals(ticker, field, as_of)`

```python
from src.data_organ.registry import Registry
from src.truth.fundamentals import FundamentalsBook

book = FundamentalsBook.from_registry(Registry(path), tenant_id)
book.fundamentals("AAPL", "revenues_fy", "2024-03-01T00:00:00Z")
```

- Only rows with `available_at <= as_of` are visible. Among them, the most recent period wins;
  within that period the latest available filing wins, so a restatement counts only once filed.
- Results are `AVAILABLE` (value + full provenance), `NOT_MEASURED` (value `None` with a reason:
  never captured, ticker unknown, or not yet filed by `as_of`) or `AMBIGUOUS` (same-instant
  filings disagree; never guessed). A reported zero is `AVAILABLE` with `0.0`.
- Every observation is re-checked on load: period end <= `available_at` <= capture clock,
  `filed` >= period end, and `available_at` must equal the rule applied to `filed`, so a
  backdated availability is rejected. `as_of` needs an explicit timezone; unknown fields raise.
- Ticker -> CIK uses the SEC map captured with the data. It is a present-day link, not a
  point-in-time identity (ticker reuse is not modelled); observations are keyed by CIK.

## How to run

```sh
APP_ENV=test python -m pytest tests/data_organ tests/test_truth_fundamentals.py \
  -p no:cacheprovider --basetemp=<temp dir outside the checkout>
FINSIGHT_NETWORK_TESTS=1 python -m pytest tests/data_organ/test_sec_edgar_live.py ...  # live, opt-in
```

Admitting a live capture into a local registry:

```python
from src.data_organ import sec_edgar
from src.data_organ.registry import Registry
from src.data_organ.service import Service

service = Service(Registry("local/admissions.duckdb"), "local/captures")
for cap, raw, rows in sec_edgar.fetch_companyfacts("AAPL"):
    service.ingest("1", cap, raw, rows, window=("2009-01-01", "2100-12-31"))
```

On failure, record it with `service.unavailable("1", sec_edgar.SOURCE, str(error))`; prior evidence is kept.

## Verified

- New suites pass offline: 18 tests (provider 10, fundamentals 8); the live test skips by default.
- Sabotage, each confirmed by temporarily removing the guard and watching the tests fail:
  - removing the `available_at <= as_of` filter fails three fundamentals tests (restatement visible early);
  - removing the backdating check fails the rejection test;
  - removing the parser's filed-before-period-end check fails the quarantine test.
- Existing `tests/data_organ`, truth, legacy fundamentals and EDGAR tests (87 passed, 1 live skipped),
  `scripts/verify_data_organ.py` and `python -m compileall -q backend src tests` pass.
- No frozen artifact (`data/exports/**`, `eval/**`, `frontend-v2/public/**`) was touched; nothing was published.

## Knowingly left

- **Live SEC access is blocked from this host.** With the required User-Agent, SEC returned
  HTTP 403 "Request Rate Threshold Exceeded" for both endpoints (4 requests total, well under
  the limit). SEC's fair-access guidance asks for a contact in the User-Agent, so the
  email-free header is the likely cause, but an IP block cannot be ruled out. An operator
  decision is needed, for example a project role mailbox. The live smoke test fails until then.
- Because of that, the restatement fixture is **synthetic and labelled so** (fictitious company,
  CIK `9999999999`, ticker `FIXT-SYN`). It mirrors the companyfacts schema; it is not SEC data.
- Rule 201/202 hardship filings can carry a filing date earlier than electronic availability;
  this is not detectable from companyfacts and is not modelled.
- Fiscal Q4 is not derived (FY minus 9-month YTD); year-to-date facts are excluded.
- No API route or UI. No publication grant for derived SEC data.
- **India:** no free fundamentals source with a clean licence and filing timestamps. NSE and
  BSE terms prohibit systematic or automated collection without written consent (NSE also bars
  reproduction without written permission). MCA company filings were not assessed in detail
  (public-document access is fee-based). Nothing was scraped; India fundamentals stay unavailable.
- **Market Regime v1.1:** no equity point-in-time activation is possible from this work. Its
  input contract (`src/dynamics/market_regime_inputs.py`, `src/regime_intelligence/contracts.py`)
  takes daily/intraday ETF bars, factor returns, macro and events for SPY/QQQ/IWM, and has no
  fundamentals stream. The missing equity inputs are QUAL/VOL/LIQ factor-return series (they need
  a survivorship-free point-in-time universe with daily consolidated prices and volume, not
  per-company filings) and consolidated spread/liquidity/imbalance. Nothing was changed there.
