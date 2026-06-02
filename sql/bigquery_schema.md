# BigQuery Schema (Analytics Warehouse)

BigQuery stores the **bulk time-series and computed analytics** so the API and
dashboard can query years of history across many tickers quickly and cheaply.
PostgreSQL (Cloud SQL) stores *metadata*; BigQuery stores *data at scale*.

Dataset: `${GCP_PROJECT_ID}.${BIGQUERY_DATASET}` (default dataset
`finsight_alpha`).

## Table: `market_prices_daily`

Raw, cleaned daily OHLCV bars (one row per ticker per day).

| Column    | Type      | Notes                                  |
|-----------|-----------|----------------------------------------|
| Date      | DATE      | Trading day                            |
| Open      | FLOAT64   | Adjusted open                          |
| High      | FLOAT64   | Adjusted high                          |
| Low       | FLOAT64   | Adjusted low                           |
| Close     | FLOAT64   | Adjusted close (used for returns)      |
| Volume    | INT64     | Share volume                           |
| Ticker    | STRING    | Symbol, e.g. `AAPL`, `RELIANCE.NS`     |
| Provider  | STRING    | Source provider, e.g. `yfinance`       |

Recommended physical layout:
- **Partition** by `Date` (DAY) to prune by date range.
- **Cluster** by `Ticker` so single-symbol queries scan less.

## Table: `market_analytics_daily`

Per-day computed analytics derived from prices.

| Column             | Type    | Notes                                  |
|--------------------|---------|----------------------------------------|
| Date               | DATE    | Trading day                            |
| Ticker             | STRING  | Symbol                                 |
| simple_return      | FLOAT64 | P_t / P_{t-1} - 1                      |
| log_return         | FLOAT64 | ln(P_t / P_{t-1})                     |
| cumulative_return  | FLOAT64 | Compounded growth since start          |
| rolling_volatility | FLOAT64 | Annualised rolling stdev of returns    |
| drawdown           | FLOAT64 | Decline from running peak (<= 0)       |

Same partitioning/clustering recommendation (`Date` + `Ticker`).

## Loading

`src/data/bigquery_client.py::BigQueryClient.upload_dataframe(df, table_name)`
appends a DataFrame to the named table (creating the dataset if needed). Use
`write_disposition="WRITE_TRUNCATE"` for full refreshes, or `WRITE_APPEND`
(default) for incremental daily loads.
