# Lovable Prompt — FinSight Agent Terminal

Copy everything between the lines into Lovable. Then read the **"Wiring it to your real backend"** section at the bottom — without it, Lovable will build a beautiful shell with mock data.

---

Build **FinSight**, an agent-first quant finance terminal — a Bloomberg-terminal-class web app where **a single conversation stream is the entire interface**. There are no page navigations and no sidebar menus. The user types one thing into one input; the app answers by appending rich, interactive "cards" into the stream, like an analyst composing your screen live.

## Core paradigm: the agent workspace

- The whole app is one scrolling **conversation stream** (max-width 1060px, centered) plus a **command bar** fixed at the bottom.
- The command bar accepts three kinds of input, auto-detected:
  1. **A bare ticker** ("NVDA") → renders a Security Overview card.
  2. **A command + ticker** ("OPT NVDA", "BT AAPL", "MC SPY") → renders that module's card. Commands work in either order ("NVDA OPT" too) and remember context: after any card about NVDA, typing just "MC" applies to NVDA. Show the current context ticker as a small cyan chip under the input ("CONTEXT: NVDA").
  3. **Plain English** ("compare NVDA and MSFT risk for a conservative investor") → an **AI Analyst card**: first a live "tool trace" (small violet-bordered rows appearing one by one: "› get_price_metrics ✓", "› get_news_sentiment ✓"), then a streamed text answer.
- **Never overwhelm**: nothing is on screen until summoned. First load shows only a hero ("WHAT ARE WE ANALYZING?") with 4 starter cards and the command bar. Every rendered card ends with a row of **suggestion chips** (pill buttons) proposing logical next moves — that's how features are discovered, progressively.
- **Ctrl/Cmd-K** opens a command palette listing all modules with fuzzy search. Typing in the command bar shows an autocomplete dropdown above it (command + description). "/" focuses the input. Up/down arrows recall input history.

## Design system (exact — strict black/navy monochrome-blue, NO orange/amber/yellow anywhere, NO emojis anywhere)

- Background near-black navy `#04060b` with two faint radial glows (cyan top-right, blue bottom-left). Panels `#0a101c`→`#0d1526` gradient, 1px border `#182240`, radius 10px, deep soft shadows.
- Text `#d7e1f5`, dim `#7d8aa5`, faint `#48546f`. Accents: electric blue `#5d8dff` (primary — prices, buttons, focus rings, brand), cyan `#39d0d8` (interactive/chips), green `#3ddc97` (gains only), red `#ff5d73` (losses/risk only), violet `#8b7cf7` (AI/agent only).
- Fonts: JetBrains Mono for all numbers, tickers, commands, labels; Inter for prose. Tiny uppercase letter-spaced mono labels (9px, tracking .14em) over KPI values.
- Motion: cards animate in with a 280ms rise (translateY 10px→0 + fade). Skeleton shimmer while loading. Subtle pulse on the "LIVE" connection dot. No gratuitous animation anywhere else.
- Top bar (46px): brand "FIN|SIGHT — AGENT TERMINAL", an infinitely scrolling **ticker tape** (mono, green/red changes, pauses on hover, click loads that ticker), UTC clock, LIVE status dot, CTRL·K button.
- User inputs echo right-aligned in blue-bordered bubbles. System notes are small centered mono text.
- Absolutely no emojis in chips, buttons, traces, or anywhere else — use plain text labels and simple glyphs (`›`, `✓`, `●`) only.

## Module cards (each = one card type appended to the stream)

Every card: header row (ticker in mono bold + colored module badge + right-aligned meta), body, then suggestion chips. All charts dark-themed (transparent background, gridlines `#161c2b`, mono 10px axis labels). Use Recharts or Plotly.

1. **DES — Security Overview** (badge blue): big last price + day change (colored), 52-week range slider bar with glowing position dot, KPI grid (CAGR, Sharpe, Sortino, Ann. Vol, Max DD, Beta, RSI), period returns row (1M/3M/6M/YTD/1Y as colored KPIs), main price chart with SMA50/SMA200 dotted overlays and soft blue area fill, small drawdown area chart (red) + daily-return histogram (cyan) side by side, tail-risk row (VaR95, CVaR95, skew, kurtosis). Chips: Options · Monte Carlo VaR · Backtest · Regimes · Factors · News · "What are the biggest risks?"
2. **OPT — Options Lab** (badge cyan): inline controls (Spot, Strike, T, σ, r, call/put + PRICE button). Results: a **model-comparison KPI row — Black-Scholes vs Binomial (Euro) vs Binomial (American) vs Monte Carlo ± stderr** — then a full Greeks row (Δ Γ ν Θ ρ), then two charts: Price-vs-Spot and Delta-vs-Spot.
3. **CHAIN — Option chain** (badge cyan): expiry tab buttons (30D/60D/90D…), a straddle-style table — calls on the left, strikes centered, puts on the right, with Δ and Θ/day columns; ATM rows highlighted with a faint blue tint.
4. **SURF — Vol surface** (badge violet): interactive 3-D implied-vol surface (strike × maturity × IV%), dark colorscale navy→blue→cyan→red.
5. **MC — Monte Carlo risk** (badge red): GBM percentile **fan chart** (P5–P95 red band, P25–P75 blue band, median blue line), KPI row (spot, drift, vol, E[return], P(loss)), a 3×3 table of VaR/CVaR by method (Historical / Parametric / Monte Carlo), simulated-returns histogram.
6. **PORT — Portfolio lab** (badge green): free-text holdings input ("AAPL:0.25, MSFT:0.25, NVDA:0.5") + ANALYZE. Results: KPI row (ann. return, vol, Sharpe, max DD, VaR, CVaR), horizontal risk-contribution bars, correlation heatmap (cyan −1 → dark 0 → red +1) with values printed in cells.
7. **BT — Backtester** (badge green): strategy select (SMA cross / RSI mean-reversion) + fast/slow params + RUN. Equity curve (green) vs buy-&-hold (gray dotted), strategy-vs-benchmark stats table (total return, CAGR, Sharpe, max DD, vol — colored), trades count + recent trades list with green BUY / red SELL.
8. **REG — Regime detection** (badge violet): current-regime banner ("● Low-Vol Bullish — confidence 98% · 57d in state · risk LOW", dot colored by regime), price scatter colored by regime (green=low-vol bull, cyan=recovery, steel-blue=high-vol bear, red=stress), regime transition-probability heatmap, per-regime performance table.
9. **FAC — Factor exposures** (badge blue): alpha/R² KPIs + horizontal factor-beta bars (positive blue, negative red).
10. **CORR — Correlation matrix** (badge blue): heatmap across the default watchlist.
11. **NEWS — Headlines** (badge blue): scored headline list with per-headline sentiment (colored) and an aggregate sentiment KPI.
12. **FA — Fundamentals** (badge green): KPI wall of financials/ratios, billions abbreviated ("394.33B").
13. **AI ANALYST** (badge violet): the plain-English handler described above — tool trace rows appearing live, then a streaming answer with bold/code markdown, "thinking" dots while working. Chips afterward: relevant module shortcuts + "Go deeper".

Also build a matching **sign-in screen** (same design system, centered 380px card, email+password, register toggle) shown when the API returns 401.

Include a HELP command that renders a command-guide table card.

Everything must feel instant, dense but never cluttered, keyboard-first, and cinematic in the way a real trading terminal is: dark, precise, quietly glowing.

---

## Wiring it to your real backend (do this after Lovable generates the UI)

Lovable will mock the data. Your real engine is the FinSight FastAPI backend in this repo. To connect:

1. Run the backend locally: `uvicorn backend.main:app --reload` (CORS already allows `*`).
2. In the Lovable project, set an env var `VITE_API_BASE=http://127.0.0.1:8000` and prefix every fetch with it. Use `credentials: 'include'` on every request (session cookie auth).
3. Auth: `POST /auth/register` and `POST /auth/login` with `{email, password}`; session is an httponly cookie; `GET /auth/me` checks it; 401 anywhere → show sign-in.
4. Endpoint contract (all GET unless noted):

| Command | Endpoint | Key response fields |
|---|---|---|
| DES | `/quote/{ticker}` | `last, prev, change_pct, name, metrics{cagr, sharpe_ratio, sortino_ratio, annualized_volatility, max_drawdown, beta}, series[{date, close, sma50, sma200, drawdown, vol}], range52{high, low, pos}, rsi, periods{1M,3M,6M,YTD,1Y}, return_hist{centers, counts}, stats{...}, dist{var95, cvar95, skew, kurtosis}` |
| OPT | `/options/price?S&K&T&r&sigma&type` | `price, models{black_scholes, binomial, binomial_american, monte_carlo, monte_carlo_stderr}, greeks{delta, gamma, vega_per_1pct, theta_per_day, rho_per_1pct}, sensitivity{spot[], price[], delta[]}` |
| CHAIN | `/options/chain/{ticker}` | `spot, sigma, atm, expiries[{days, T, rows[{strike, call{price,delta,theta}, put{...}}]}]` |
| SURF | `/vol/surface/{ticker}` | `spot, source, strikes[], maturities[], iv[][]` |
| MC | `/risk/montecarlo/{ticker}?horizon=1&n=4000` | `S0, mu, sigma, summary{expected_return, probability_of_loss,...}, risk{historical_var, historical_cvar, parametric_var, parametric_cvar, monte_carlo_var, monte_carlo_cvar}, fan{times, p5, p25, p50, p75, p95}, return_hist{centers, counts}` |
| PORT | `POST /portfolio/risk` body `{holdings:[{ticker, weight}]}` | `metrics{annual_return, annual_vol, sharpe, max_drawdown, var95, cvar95}, contributions[{ticker, pct_contribution}], correlation{tickers, matrix}` |
| BT | `/backtest/{ticker}?strategy=sma_cross&fast=50&slow=200` | `dates[], equity[], benchmark[], n_trades, trades[], stats{strategy{...}, buy_hold{...}}` |
| REG | `/regime/{ticker}?model=hmm&n_states=4` | `timeline[{date, close, state, label}], labels{}, current{current_regime, current_regime_probability, current_regime_duration, current_regime_risk_level}, transition_matrix{states, matrix}, performance[]` |
| FAC | `/factors/{ticker}` | `alpha_annual, r2, n_days, exposures[{factor, beta}]` |
| CORR | `POST /analytics/correlation` body `{tickers:[...]}` | correlation matrix |
| NEWS | `/news/{ticker}` | scored headlines + aggregate |
| FA | `/fundamentals/{ticker}` | nested financials (US tickers) |
| Tape | `/tape?symbols=AAPL,MSFT,...` | `items[{ticker, last, change_pct}]` |
| Watchlist | `/assets` | `default[], all[], sectors{}` |
| AI Analyst | `POST /agent/stream` body `{question, ticker, provider:"auto", max_steps:6}` | Server-Sent Events: `{type:"tool",...}`, `{type:"token", text}`, `{type:"done", answer, steps}` |

Note: a fully wired version of this exact terminal already lives at `frontend/terminal.html` in this repo, served at `http://127.0.0.1:8000/terminal` — use it as the reference implementation.
