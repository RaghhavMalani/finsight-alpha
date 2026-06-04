# Phase 2: Financial Math Engine

Phase 1 gave FinSight Alpha clean market data plus basic analytics (returns,
volatility, drawdown). Phase 2 turns those building blocks into a proper,
reusable **financial math and risk-adjusted performance engine**.

Everything here is **local-first**: no cloud, no API keys, no database. The new
math lives in `src/analytics/metrics.py`, benchmarks are configured in
`src/config.py`, charts are in `src/visualization/plots.py`, and the dashboard
surfaces it all in `app/streamlit_app.py`.

---

## Why this matters

A high return alone tells you almost nothing. A stock that returned 40% by
swinging wildly is very different from one that returned 35% smoothly. Phase 2
adds the metrics professionals actually use to compare investments on a
**risk-adjusted** basis: CAGR, Sharpe, Sortino, Beta, and CAPM.

---

## The metrics

### Returns helpers (recap from Phase 1)
- **Simple returns**: `price_today / price_yesterday - 1`.
- **Log returns**: `ln(price_today / price_yesterday)` — additive over time.
- **Cumulative returns**: growth of 1 unit invested, compounded.

### `clean_returns(returns)`
A small but important helper. It replaces `+inf` / `-inf` (which appear when a
price was `0` and a division blew up) with `NaN`, then drops all missing values.
Most metrics call this first so a single bad row cannot poison a mean, standard
deviation, or covariance.

### Daily & annualized volatility
- **Daily volatility** = standard deviation of daily returns.
- **Annualized volatility** = daily volatility × √252.

Volatility is the most common measure of risk: how much returns bounce around.

### CAGR — Compound Annual Growth Rate

```
CAGR = (Ending Value / Beginning Value) ** (1 / years) - 1
```

CAGR is the single constant yearly rate that would grow the first price into the
last price. It smooths out the bumps and answers: *"What steady annual return
would have produced this result?"* Unlike a simple total return, it is
comparable across assets held for different lengths of time.

`calculate_cagr(df, price_col, date_col)` uses the **real calendar span**
(via `365.25` days/year) so a 6-month and a 5-year track record are compared
fairly.

### Sharpe Ratio

```
Annual Return     = mean(daily returns) * 252
Annual Volatility = std(daily returns)  * sqrt(252)
Sharpe            = (Annual Return - Risk Free Rate) / Annual Volatility
```

Sharpe measures **excess return per unit of total risk**. Higher is better — you
are getting more reward for the volatility you endure. The risk-free rate
(default **5%**) is what you could earn with no risk (e.g. government bonds), so
Sharpe only rewards return *above* that baseline.

> Edge case: if volatility is `0`, the ratio is undefined and we return `NaN`
> (shown as `-` in the UI) rather than dividing by zero.

### Downside Deviation & Sortino Ratio

Standard deviation punishes big *up* moves just as much as big *down* moves —
but investors don't mind upside! **Downside deviation** measures volatility of
only the returns **below a target** (default `0`):

```
Downside Deviation = sqrt( mean( (returns below target)^2 ) ) * sqrt(252)
```

The **Sortino ratio** is Sharpe's smarter cousin — it divides excess return by
downside deviation instead of total volatility:

```
Sortino = (Annual Return - Risk Free Rate) / Downside Deviation
```

So a fund that is only volatile *on the way up* is not penalised.

### Beta

```
Beta = Covariance(asset returns, benchmark returns) / Variance(benchmark returns)
```

Beta measures how sensitive an asset is to its **benchmark** (the market):

| Beta        | Interpretation                                  |
|-------------|-------------------------------------------------|
| `= 1`       | Moves with the market                           |
| `> 1`       | Amplifies market moves (aggressive)             |
| `0 < β < 1` | Dampens market moves (defensive)                |
| `< 0`       | Moves opposite to the market (rare; a hedge)    |

The asset and benchmark return series are aligned by date and missing rows are
dropped before the calculation. If there is no overlap or the benchmark has zero
variance, beta is `NaN`.

### CAPM — Capital Asset Pricing Model

```
Expected Return = Risk Free Rate + Beta * (Market Return - Risk Free Rate)
```

CAPM estimates the return an asset *should* earn given its market risk: the
risk-free rate plus a premium proportional to beta. The `(Market Return -
Risk Free Rate)` term is the **equity risk premium** — the extra reward for
taking on market risk. We use the benchmark's CAGR as the market return.

---

## Benchmark support

Beta and CAPM need a "market" to measure against. `src/config.py` picks one
automatically:

```python
get_default_benchmark_for_ticker("RELIANCE.NS")  # -> "NIFTYBEES.NS" (Nifty ETF)
get_default_benchmark_for_ticker("AAPL")         # -> "SPY"          (S&P 500 ETF)
```

The dashboard fetches the matching benchmark(s) **alongside** your selected
tickers, but keeps them in a separate frame so they never appear as an analyzed
asset or pollute the comparison charts. If a benchmark can't be downloaded,
beta/CAPM degrade gracefully to `-`.

---

## `calculate_summary_statistics`

The one-stop function for a price series. It now accepts an optional
`benchmark_prices` series and returns an expanded dictionary:

| Key                      | Meaning                                  |
|--------------------------|------------------------------------------|
| `observations`           | Number of price points                   |
| `start_price` / `end_price` / `latest_close` | First / last price       |
| `total_return`           | End / start − 1                          |
| `cagr`                   | Compound annual growth rate              |
| `average_daily_return`   | Mean daily return                        |
| `annualized_return`      | Geometric annualized return              |
| `annualized_volatility`  | Daily volatility × √252                  |
| `sharpe_ratio`           | Risk-adjusted (total risk)               |
| `sortino_ratio`          | Risk-adjusted (downside risk)            |
| `max_drawdown`           | Worst peak-to-trough decline             |
| `best_day` / `worst_day` | Largest single-day gain / loss           |
| `beta`                   | Sensitivity to benchmark (`NaN` if none) |
| `capm_expected_return`   | CAPM expected return (`NaN` if no benchmark) |

All Phase 1 keys are preserved, so nothing that previously consumed this
dictionary breaks.

---

## Visualization

New chart builders in `src/visualization/plots.py`:

- `plot_cagr_bar(summary_df)` — annualized growth per ticker.
- `plot_sharpe_sortino_bar(summary_df)` — Sharpe vs Sortino side by side.
- `plot_beta_bar(summary_df)` — market sensitivity, with a reference line at β=1.
- `plot_risk_adjusted_scatter(summary_df)` — Annualized Volatility (x) vs CAGR
  (y), colored by Sharpe ratio. Top-left (high growth, low risk) is best.

---

## Dashboard changes

- **Single Asset Analysis**: new KPI cards for CAGR, Sharpe, Sortino, Beta (vs
  the asset's benchmark), and CAPM Expected Return; expanded summary table.
- **Multi-Asset Comparison**: new risk-adjusted bar/scatter charts and ranking
  tables (highest CAGR, Sharpe, Sortino; lowest drawdown and volatility; highest
  total return; highest/lowest beta).
- **Risk Summary**: Sharpe, Sortino, Beta, and CAPM columns added to the table.

---

## Safety & edge cases

- Division by zero (zero volatility / zero downside / zero benchmark variance)
  returns `NaN`, never an exception.
- Missing or `inf` values are cleaned before every calculation.
- Missing benchmark data → beta/CAPM are `NaN`, shown as `-`.
- All tests run **offline** on small hardcoded DataFrames.

---

## Running & testing

```bash
# Dashboard
streamlit run app/streamlit_app.py

# Tests (offline, no internet)
pytest -q
```

---

## What's next

Phase 3+ builds on this engine: portfolio construction and optimization,
factor models, and the advanced tail-risk measures (VaR, CVaR, Monte Carlo)
currently shown as Phase 4 placeholders on the Risk Summary page.
