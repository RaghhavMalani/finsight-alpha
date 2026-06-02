# FinSight Alpha

A professional financial engineering + AI project. This repository is built in
phases; each phase adds a self-contained, production-quality capability that the
later phases build on.

---

## Phase 1 - Market Data Collection, Cleaning & Exploratory Analytics

Phase 1 builds the **data foundation** for everything that follows. It is a clean
market-data analytics engine that can:

1. **Download** historical OHLCV (Open, High, Low, Close, Volume) price data from
   Yahoo Finance for any list of tickers (Indian `.NS` and US symbols).
2. **Clean** the data: validate it is non-empty, normalise the index into a
   proper `Date` column, and tag every row with its `Ticker`.
3. **Compute** core financial metrics: simple returns, log returns, cumulative
   returns, rolling volatility, drawdown, and max drawdown.
4. **Summarise** each asset with descriptive statistics (annualised return,
   annualised volatility, Sharpe ratio, max drawdown, etc.).
5. **Persist** raw and processed datasets to disk as CSV so later modules (ML,
   option pricing, risk, RAG) can reuse them without re-downloading.
6. **Visualise** price history, cumulative returns, rolling volatility, and
   drawdowns for exploratory data analysis (EDA).

---

## Project structure

```
finsight-alpha/
  data/
    raw/                     # Raw OHLCV downloads (one CSV per ticker)
    processed/               # Cleaned data + analytics columns (one CSV per ticker)
  notebooks/
    01_market_data_eda.ipynb # Interactive exploratory analysis
  src/
    __init__.py
    config.py                # Dates, tickers, paths
    data/
      __init__.py
      market_data.py         # download_stock_data()
    analytics/
      __init__.py
      metrics.py             # returns, volatility, drawdown, summary stats
    visualization/
      __init__.py
      plots.py               # price, returns, volatility, drawdown charts
  tests/
    test_metrics.py          # pytest unit tests for the math
  requirements.txt
  README.md
  main.py                    # End-to-end pipeline
```

---

## Installation

> Requires Python 3.9+.

```bash
# 1. (Recommended) create and activate a virtual environment
python -m venv .venv
# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt
```

---

## How to run

### Run the full pipeline

From the `finsight-alpha/` directory:

```bash
python main.py
```

This will:

- download data for the default tickers (5 Indian + 5 US),
- write raw CSVs to `data/raw/`,
- compute analytics and write processed CSVs to `data/processed/`,
- print a summary-statistics table to the console.

### Run the tests

```bash
pytest -q
```

### Explore interactively

```bash
jupyter notebook notebooks/01_market_data_eda.ipynb
```

---

## The financial meaning of the metrics

### 1. Returns

A **return** measures the percentage change in an asset's price over a period. It
is the fundamental unit of finance because investors care about *growth*, not the
raw price level.

- **Simple (arithmetic) return** for period *t*:

  \[ R_t = \frac{P_t - P_{t-1}}{P_{t-1}} = \frac{P_t}{P_{t-1}} - 1 \]

  Intuitive and additive *across assets* (a portfolio's simple return is the
  weighted average of its holdings' simple returns).

- **Log (continuously compounded) return**:

  \[ r_t = \ln\!\left(\frac{P_t}{P_{t-1}}\right) \]

  Additive *across time* (the log return over many days is the sum of the daily
  log returns) and closer to normally distributed, which is why most quantitative
  models (Black-Scholes, GBM Monte Carlo) work in log space.

### 2. Cumulative returns

The **cumulative return** is the total growth of 1 unit of currency invested at
the start, compounding each period's simple return:

\[ C_t = \prod_{i=1}^{t}(1 + R_i) - 1 \]

A cumulative return of `0.5` means the investment grew by 50% over the window.

### 3. Volatility

**Volatility** is the standard deviation of returns - a measure of *risk* or how
much returns fluctuate. **Rolling volatility** computes this over a moving window
(e.g. 21 trading days) so you can see how risk changes through time. We annualise
daily volatility by multiplying by \(\sqrt{252}\) (there are ~252 trading days in
a year).

### 4. Drawdown

A **drawdown** is the percentage drop from a historical peak in cumulative value:

\[ DD_t = \frac{V_t - \max_{s \le t} V_s}{\max_{s \le t} V_s} \]

It is always \(\le 0\). The **maximum drawdown** is the worst (most negative)
drawdown observed - the largest peak-to-trough loss an investor would have
suffered. It is one of the most important *practical* risk measures because it
captures the pain of a sustained decline.

---

## Roadmap (later phases)

The clean datasets produced here feed directly into:

- **ML**: feature engineering / price & volatility forecasting.
- **Black-Scholes**: option pricing using the volatility estimated here.
- **Monte Carlo**: simulating price paths with drift/volatility from log returns.
- **Portfolio optimisation**: mean-variance optimisation using the return and
  covariance estimates.
- **RAG**: retrieval-augmented analytics over the stored datasets and reports.
- **Cloud deployment**: serving the pipeline and models as an API.
