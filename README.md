# FinSight Alpha

**A local-first, AI-ready financial market analytics dashboard** built with
Python, Streamlit, Plotly, pandas, NumPy, and yfinance.

FinSight Alpha downloads market data for Indian and US equities/ETFs, computes a
full suite of analytics (returns, volatility, drawdown, correlation, sector
breakdowns, risk classification, data-quality checks), and presents everything
in a classy, finance-terminal-style Streamlit dashboard.

> **Runs entirely on your machine.** No cloud accounts, API keys, databases,
> Docker, or billing required. Just install and run.

---

## What Phase 1 delivers

- **Market data collection** - multi-ticker OHLCV download via yfinance.
- **Cleaning** - standardized schema, failed tickers skipped gracefully.
- **Returns** - simple, log, and cumulative returns.
- **Volatility** - rolling and annualized.
- **Drawdown** - drawdown curve and max drawdown.
- **Correlation** - returns correlation matrix + highest/lowest pairs.
- **Sector analysis** - sector-level return / volatility / drawdown summaries.
- **Risk summary** - volatility-based risk classification + downside deviation.
- **Data quality report** - missing values, duplicates, date coverage, completeness.
- **Professional dashboard** - 7 interactive pages with a dark, modern UI.

---

## What Phase 2 adds: Financial Math Engine

Phase 2 upgrades the basic analytics into a reusable, benchmark-aware
**risk-adjusted performance engine**:

- **CAGR** - Compound Annual Growth Rate (smoothed annual return over the real
  calendar span).
- **Sharpe Ratio** - excess return per unit of *total* volatility.
- **Sortino Ratio** - excess return per unit of *downside* volatility.
- **Beta** - sensitivity to a market benchmark (Nifty ETF for `.NS`, SPY for US).
- **CAPM Expected Return** - the return an asset *should* earn given its beta.
- **Benchmark support** - the dashboard auto-fetches the matching benchmark and
  degrades gracefully (beta/CAPM show `-`) if it's unavailable.
- **`clean_returns` helper** - strips `inf`/`NaN` so one bad row can't poison a
  metric.

These appear as new KPI cards, ranking tables, and charts (CAGR bar, Sharpe vs
Sortino bar, beta bar, and a CAGR-vs-volatility scatter colored by Sharpe). See
[`docs/phase_2_financial_math_engine.md`](docs/phase_2_financial_math_engine.md)
for the formulas and intuition.

---

## What Phase 3 adds: Black-Scholes Option Pricing and Greeks

Phase 3 introduces a professional option pricing engine based on the Black-Scholes-Merton model:

- **Call and Put Pricing** - theoretical fair value of European options.
- **The Greeks** - Delta, Gamma, Vega, Theta, and Rho to measure risk sensitivities.
- **Implied Volatility Solver** - recovers market volatility from observed option prices using Brent's method.
- **Option Pricing Lab** - a dedicated interactive dashboard page.
- **Sensitivity Charts** - Plotly visualizations showing how option prices and Greeks change with spot price and volatility.

These tools prepare the platform for advanced derivatives analysis, portfolio hedging, and tail-risk Monte Carlo simulations. See
[`docs/phase_3_black_scholes_and_greeks.md`](docs/phase_3_black_scholes_and_greeks.md)
for detailed documentation.

---

## What Phase 4 adds: Monte Carlo Simulation + VaR/CVaR Risk Engine

Phase 4 introduces a professional simulation-based risk engine:

- **GBM price path simulation** - Monte Carlo price-path simulation using Geometric Brownian Motion.
- **Simulation summary statistics** - expected, median, worst/best returns and probability of loss.
- **Historical, Parametric, and Monte Carlo VaR** - Value-at-Risk across three methodologies.
- **Historical, Parametric, and Monte Carlo CVaR** - Expected Shortfall (CVaR) tail risk metrics.
- **Monte Carlo Risk Lab** - a dedicated interactive dashboard page.
- **Simulation charts and fan chart** - visualizations of simulated paths, percentile bands, return distributions, and VaR/CVaR histograms.

These tools allow for advanced scenario generation and tail-risk quantification. See
[`docs/phase_4_monte_carlo_var_cvar.md`](docs/phase_4_monte_carlo_var_cvar.md)
for detailed documentation.

---

## What Phase 5 adds: Portfolio Optimization Engine

Phase 5 introduces a professional Portfolio Optimization Engine based on Markowitz Modern Portfolio Theory:

- **Markowitz Optimization** - calculate minimum variance and maximum Sharpe Ratio portfolios.
- **Efficient Frontier** - compute and visualize the efficient frontier.
- **Risk Contribution & Parity** - analyze component risk contribution and construct risk parity portfolios.
- **Asset Allocation Comparison** - compare multiple portfolio strategies simultaneously.
- **Portfolio Optimization Lab** - a dedicated interactive dashboard page.
- **Example Portfolios** - built-in Indian and US portfolio examples.

These features enable professional-grade portfolio construction and risk budgeting. See
[`docs/phase_5_portfolio_optimization.md`](docs/phase_5_portfolio_optimization.md)
for detailed documentation.

---

## What Phase 6 adds: Machine Learning Forecasting Engine

Phase 6 introduces a professional Machine Learning Forecasting Engine to generate predictive signals:

- **Financial feature engineering** - add lags, rolling averages, momentum, volatility, and technical indicators (RSI, MACD, Bollinger Bands) without data leakage.
- **Direction classification** - predict whether the price will go up or down.
- **Future return regression** - predict the expected percentage return over N days.
- **Future volatility regression** - predict the expected realized volatility over N days.
- **Time-series validation** - strict chronological train/test splitting and robust walk-forward validation.
- **Feature importance** - analyze which signals the models rely on most.
- **ML Forecasting Lab** - a dedicated interactive dashboard page.

These tools allow for advanced signal generation and quantitative research. See
[`docs/phase_6_ml_forecasting.md`](docs/phase_6_ml_forecasting.md)
for detailed documentation.

---

## What Phase 6.5 adds: Professional Signal Research Lab

- **Universal Signal Extraction** - Institutional feature engineering pipelines that auto-adapt to any ticker (Indian or US) and its corresponding benchmark.
- **Dynamic Benchmarking** - Automatically compares an asset's beta and momentum relative to the correct regional index (e.g., NIFTYBEES vs SPY).
- **Ensemble Forecasting** - Combining Logistic Regression, Random Forest, and Gradient Boosting to increase prediction robustness.
- **Strict Validation Rules** - The signal engine suppresses recommendations (defaults to "No Edge") if Out-of-Sample ROC-AUC is below 0.55 or model edge is weak, preventing false confidence.
- **Signal Research Dashboard** - Focused visualizations for walk-forward validation folds, probability distributions, and institutional signal strength.

See [`docs/ml_signal_research_lab.md`](docs/ml_signal_research_lab.md) for detailed documentation.

---

## Installation

> Requires Python 3.10+ (3.11 recommended).

```bash
python -m venv .venv
# Windows
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

---

## Run the dashboard

```bash
streamlit run app/streamlit_app.py
```

Then in the sidebar: choose an asset universe (Indian / US / Custom), pick
tickers and a date range, and click **Load / Refresh Data**.

### Run the batch pipeline (optional)

```bash
python main.py
```

### Run the tests

```bash
pytest
```

Tests are fully offline (no internet needed) - they use small hardcoded frames.

---

## Dashboard pages

1. **Market Overview** - headline KPIs (best/worst performer, average volatility,
   worst drawdown), normalized price comparison, cumulative return comparison,
   and a risk-return scatter.
2. **Single Asset Analysis** - KPI cards (latest close, total return, CAGR,
   annualized volatility, Sharpe, Sortino, beta, CAPM expected return, max
   drawdown, average daily return, best/worst day) plus price, daily returns,
   cumulative returns, rolling volatility, and drawdown charts, with a summary
   statistics table.
3. **Multi-Asset Comparison** - normalized price and cumulative-return curves,
   risk-adjusted charts (CAGR, Sharpe vs Sortino, beta, risk-adjusted scatter),
   plus rankings for CAGR, Sharpe, Sortino, drawdown, volatility, total return,
   and beta.
4. **Correlation Heatmap** - returns correlation heatmap, highest and lowest
   correlated pairs, and a plain-English explanation.
5. **Sector Comparison** - sector summary table and return / volatility /
   drawdown bar charts.
6. **Risk Summary** - per-asset risk classification, annualized volatility,
   downside deviation, max drawdown, Sharpe / Sortino / beta / CAPM, a risk
   ranking table, and placeholders for VaR / CVaR (coming in Phase 4).
7. **Data Quality Report** - rows per ticker, missing values, duplicates, first
   and last available dates, completeness percentage, and a coverage chart.

You can also export the combined processed data, summary statistics, and
correlation matrix as CSV from the sidebar (saved to `data/exports/`).

---

## Project structure

```
finsight-alpha/
  app/
    streamlit_app.py          # The dashboard (MAIN deliverable)
  data/
    raw/  processed/  exports/
  notebooks/
    01_market_data_eda.ipynb
  src/
    config.py                 # dates, tickers, sectors, display names, paths
    data/
      market_data.py          # MarketDataService
      storage.py              # local CSV/Parquet save/load/export
      providers/
        base.py               # MarketDataProvider (ABC)
        yfinance_provider.py   # default provider
    analytics/
      metrics.py  correlation.py  sector_analysis.py
      risk_summary.py  data_quality.py
    visualization/
      plots.py  theme.py
    utils/
      logging_utils.py
  tests/
    test_metrics.py  test_data_quality.py  test_risk_summary.py
  requirements.txt  README.md  main.py

# Optional / paused (not required for the dashboard):
  backend/   # FastAPI (Phase 1C) - paused
  infra/     # Docker + GCP deployment (Phase 1D) - paused
  docs/      # cloud architecture notes - paused
```

---

## Current Status

- **Phase 1**: Core Dashboard (Data loading, summary KPIs, Plotly charts).
- **Phase 2**: Financial Math Engine (Risk-adjusted performance, correlation, drawdown).
- **Phase 3**: Option Pricing Lab (Black-Scholes, Greeks, Implied Volatility).
- **Phase 4**: Monte Carlo Risk Lab (GBM simulation, VaR, CVaR).
- **Phase 5**: Portfolio Optimization Lab (Markowitz efficient frontier, Max Sharpe).
- **Phase 6**: ML Signal Research Lab (Walk-forward classification, institutional signals).
- **Phase 7**: Market Regime Detection Engine (HMM, Gaussian Mixture, state transition).

---

## Future phases

- **Phase 8**: Financial Document Intelligence (RAG engine, auto document discovery, factor extraction).
- **Phase 9** - Optional cloud deployment (revisited later).

> **Note:** Cloud deployment is **paused for now to avoid cost**. The project is
> local-first. The FastAPI backend (`backend/`) and cloud/infra files (`infra/`,
> `docs/`) remain in the repo as optional, paused future work and are not needed
> to run the dashboard.

---

## Financial metrics (recap)

- **Returns**: simple `P_t/P_{t-1} - 1`; log `ln(P_t/P_{t-1})` (additive over time).
- **Cumulative return**: compounded growth `prod(1+R) - 1`.
- **Volatility**: standard deviation of returns; annualized by `* sqrt(252)`.
- **Drawdown / max drawdown**: decline from the running peak; worst such decline.
- **Correlation**: co-movement of returns - the basis of diversification.
- **Downside deviation**: volatility of only negative returns (downside risk).
- **CAGR**: `(End/Start)^(1/years) - 1` - smoothed annual growth rate.
- **Sharpe**: `(Annual Return - Rf) / Annual Volatility` - reward per unit risk.
- **Sortino**: like Sharpe, but divides by downside deviation only.
- **Beta**: `Cov(asset, market) / Var(market)` - sensitivity to the benchmark.
- **CAPM**: `Rf + Beta * (Market Return - Rf)` - expected return for the risk taken.
