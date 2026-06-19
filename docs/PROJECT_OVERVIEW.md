# FinSight Alpha — Project Overview

A local-first, AI-powered **quant research, derivatives, and risk terminal**. It
combines a Python analytics/quant core, a FastAPI service layer, an LLM/RAG
intelligence layer, and a browser-based "Bloomberg-style" terminal front-end.

It runs entirely on your machine — market data from free sources (Yahoo Finance,
SEC EDGAR), and the AI layer on a local LLM (Ollama) or an optional cloud key.
No paid data feeds, no cloud account required.

---

## 1. High-level architecture

```
                          ┌──────────────────────────────────────────┐
   Browser  ◀────────────▶│  frontend/terminal.html  (single-page UI) │
   (terminal)             │  vanilla JS + Chart.js + Plotly + Cytoscape│
                          │  + lightweight-charts + GridStack          │
                          └───────────────▲──────────────────────────┘
                                          │ JSON over HTTP (same origin)
                          ┌───────────────┴──────────────────────────┐
                          │   backend/  (FastAPI + Uvicorn)           │
                          │   ~16 routers: quote, strategy, options,  │
                          │   risk, portfolio, factors, graph, news,  │
                          │   research, backtest, market-data, ...     │
                          └───────────────▲──────────────────────────┘
                                          │ imports
                          ┌───────────────┴──────────────────────────┐
                          │   src/  (the quant + AI engine library)   │
                          │   data · analytics · pricing · simulation │
                          │   risk · ml · regime · rag · graph · news │
                          │   visualization · utils                   │
                          └───────────────▲──────────────────────────┘
                                          │
                  Yahoo Finance · SEC EDGAR · Ollama / OpenAI / Groq / Gemini
```

There are **two front-ends** over the same `src/` engine:
- `frontend/terminal.html` — the new dark, multi-tab terminal (primary).
- `app/streamlit_app.py` — the original Streamlit dashboard (still works).

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Language | Python 3.10+ , modern JavaScript (no build step) |
| API / service | FastAPI, Uvicorn, Pydantic |
| Data / numerics | pandas, NumPy, SciPy |
| Market data | yfinance (Yahoo Finance) |
| Filings | SEC EDGAR API (free, no key) |
| ML | scikit-learn, hmmlearn (regimes), joblib |
| RAG / NLP | sentence-transformers (MiniLM embeddings), FAISS, rank-bm25, pypdf, python-docx |
| LLMs | Ollama (local, default) · OpenAI · Anthropic · Gemini · Groq (provider-agnostic client) |
| Charts (web) | lightweight-charts (TradingView), Plotly.js (3D), Chart.js, Cytoscape.js (graphs) |
| Layout (web) | GridStack (drag/resize tiles) |
| Dashboard (alt) | Streamlit + Plotly |
| Testing | pytest (offline, network-free suites) |
| Optional/paused | Docker, GCP (BigQuery, Cloud Storage), PostgreSQL scaffolding |

---

## 3. The quant / financial-engineering core (`src/`)

**Market analytics** (`src/analytics`): log & simple returns, cumulative returns,
rolling & annualized volatility, drawdown / max drawdown, CAGR, Sharpe, Sortino,
beta, CAPM expected return, correlation matrices, sector analysis, downside
deviation, data-quality reporting.

**Derivatives pricing** (`src/pricing`): full **Black-Scholes-Merton** engine —
call/put pricing, all Greeks (Delta, Gamma, Vega, Theta, Rho), implied-volatility
solver (Brent's method), and an **implied-volatility surface** builder (solves IV
across strike × maturity, interpolates to a grid).

**Simulation** (`src/simulation`): **Geometric Brownian Motion Monte Carlo** path
simulation, simulation summary stats, probability of loss, and a `mc_distribution`
module that reconstructs the full price distribution over time (the 3D probability
cone).

**Risk** (`src/risk`): **VaR & CVaR** (historical, parametric, Monte-Carlo),
**Markowitz portfolio optimization** (efficient frontier, min-variance, max-Sharpe,
risk parity, risk-contribution analysis).

**ML signals** (`src/ml`): leakage-aware feature engineering (lags, RSI, MACD,
Bollinger, momentum, volatility), direction/return/volatility targets,
walk-forward validation, model training/evaluation, and an ensemble "signal
research" pipeline that suppresses weak-edge signals.

**Regime detection** (`src/regime`): HMM / Gaussian-mixture market-state models
(calm/bull, high-vol/bear, etc.), regime features, labeling, and integration with
the signal layer.

---

## 4. The AI / LLM layer

**Provider-agnostic LLM client** (`src/rag/llm_client.py`): one interface over
Ollama (local, free, default), OpenAI, Anthropic, Gemini, and Groq. Detects which
providers are usable, degrades gracefully, never crashes the app.

**RAG document intelligence** (`src/rag`, ~25 modules):
- **Automatic filing retrieval** via **SEC EDGAR** (ticker → CIK → latest 10-K/10-Q
  → text). Reliable and key-free for US filers.
- Ingestion pipeline: load (PDF/TXT/DOCX) → chunk → **local MiniLM embeddings** →
  **FAISS** vector store → **hybrid retrieval** (semantic + BM25) → reranking.
- **Grounded, cited answers**: the LLM answers only from retrieved context with
  inline `[n]` citations and an abstention rule; a `grounded` flag reports whether
  the answer actually cited the evidence (honest anti-hallucination signal).
- Rule-based + LLM **factor extraction** from filings, exportable to the ML layer.

**Dependency knowledge graph** (`src/graph`): an LLM maps a company's economic
network (suppliers, customers, competitors, commodities, segments, regulator),
validated into a clean graph; a deterministic config fallback (sector peers) when
no LLM is present. The sensitivity endpoint then **regresses the focal stock's
returns on each dependency's returns** to quantify "if X moves +1%, the stock
moves +β%," and attaches recent performance + news per node.

**News sentiment** (`src/news`): pulls headlines (yfinance), scores each with a
finance-tuned lexicon, and aggregates to a Bullish/Neutral/Bearish read.

**Strategy critique**: the Strategy Lab sends backtest metrics to the LLM, which
returns a quant-reviewer critique (overfitting check, robustness, concrete fixes).

---

## 5. The terminal front-end — features by tab

A single dark SPA served by FastAPI at `/terminal`, with a security header, a live
ticker tape, a **Cmd-K command palette**, and number-key tab shortcuts.

- **Overview** — security header, KPI strip (YTD, 1Y, vol, Sharpe, Sortino, max DD,
  RSI), price chart with SMA50/200, 52-week range bar, period returns, drawdown,
  rolling volatility, return distribution, a Technicals panel (RSI/MACD/trend), and
  a **News & Sentiment** feed. Every panel header opens a **deep-dive modal** with
  richer charts + plain-English interpretation (skew, kurtosis, VaR/CVaR, regime).
- **Workspace** — a **composable, drag-and-resize tiling board** (GridStack): add
  any widget (price, technicals, drawdown, vol, news, sentiment, Monte Carlo,
  dependency graph) for *any* ticker; mix tickers across tiles; layout saved
  locally. The "Aladdin launchpad" view.
- **Strategy Lab** — composable **entry/exit rules** (RSI, SMA, MACD, momentum;
  ALL/ANY logic), transaction costs, **in-sample vs out-of-sample** split
  (walk-forward rigor), a **TradingView candlestick chart** (volume, B/S markers,
  support/resistance), equity vs buy & hold, full stats (Sortino, profit factor,
  exposure, win rate), monthly returns, **trade log**, **parameter optimization**
  (Sharpe surface), and an **AI Strategy Analyst** critique.
- **Compare** — overlay N tickers rebased to 100 + a side-by-side metrics table.
- **Portfolio** — paste holdings → **aggregate VaR/CVaR, vol, Sharpe, max DD**, each
  asset's **% contribution to portfolio risk**, and a correlation heatmap.
- **Options** — a **Groww-style option chain** (calls | strike | puts + Greeks) with
  **hover tooltips explaining each Greek**, click-to-add legs, and a **hedging
  strategy analyzer** (protective put, collar, straddle, spreads): payoff diagram,
  net Greeks, breakevens, max P/L, suggested hedges.
- **Backtest** — quick preset strategies (SMA cross / MACD / RSI) with candlestick.
- **Factors** — multivariate **OLS factor exposures** (market, size, value,
  momentum, quality, low-vol ETFs) with betas, annualized alpha, and R².
- **Vol Surface** — interactive **3D implied-volatility surface** (Plotly).
- **Monte Carlo** — GBM simulation calibrated to the stock, **percentile fan**,
  VaR/CVaR cards, and the return-distribution histogram.
- **Graph** — the LLM dependency graph (Cytoscape), node size ∝ |β|, with the
  ranked sensitivity + news side panel.
- **Research** — auto-fetch SEC filings and ask **grounded, cited** questions.

---

## 6. Data sources

- **Yahoo Finance** (`yfinance`) — daily OHLCV for US + Indian equities/ETFs/indices,
  option chains, and news headlines.
- **SEC EDGAR** — 10-K / 10-Q filings (US filers), free and key-free.
- **Local documents** — drop PDFs/TXT/DOCX for RAG over anything (annual reports,
  RBI/SEBI docs, transcripts).

---

## 7. How to run

```bash
# 1. install
python -m venv .venv && .venv\Scripts\Activate.ps1      # Windows
pip install -r requirements.txt

# 2a. the terminal (recommended)
pip install fastapi uvicorn
uvicorn backend.main:app --reload
#   → open http://127.0.0.1:8000/terminal

# 2b. or the Streamlit dashboard
streamlit run app/streamlit_app.py

# 3. AI features (optional): install Ollama, then
ollama pull llama3.1          # local + free
#   or set OPENAI/ANTHROPIC/GOOGLE/GROQ API key in .env

# tests
pytest -q
```

---

## 8. Honest limitations (and where the real credibility is)

- **Data is daily and free-tier** — great for research and backtests, not tick-level
  or real-time. Some non-US names have thin option/news coverage.
- **AI features need an LLM** — graph extraction, RAG answers, and the strategy
  critique require Ollama running or an API key; they degrade gracefully otherwise.
- **Forecasting (HSMM/TFT) is scoped, not shipped** — see
  `docs/forecasting_hsmm_tft.md`. Market forecasting has a low signal ceiling and is
  deliberately *not* faked.
- **Not a production trading system** — no order routing, no live execution.

What actually impresses a quant/risk reviewer here isn't breadth alone — it's the
**rigor**: leakage-aware walk-forward validation, in-sample vs out-of-sample
reporting, honest VaR/CVaR, citation-grounded RAG with an anti-hallucination flag,
and regression-based dependency sensitivity. That's the difference between a
"student dashboard" and a credible quant platform.

---

## 9. Repository map

```
finsight-alpha/
  backend/        FastAPI app + ~16 routers (the service layer)
  frontend/       terminal.html (the SPA terminal)
  app/            streamlit_app.py (alternative dashboard)
  src/
    data/         market data service, providers, storage
    analytics/    returns, vol, drawdown, Sharpe/Sortino, beta, correlation
    pricing/      Black-Scholes, Greeks, IV, vol surface
    simulation/   GBM Monte Carlo, probability distribution
    risk/         VaR/CVaR, portfolio optimization
    ml/           features, models, walk-forward, signal engine
    regime/       HMM / mixture regime detection
    rag/          EDGAR, ingest, embeddings, FAISS, retrieval, LLM client, graph factors
    graph/        dependency graph + sensitivity
    news/         headlines + sentiment
    visualization/ Plotly/theme helpers
  scripts/        CLI: build_rag_index, ask_rag, fetch_filings, build_graph
  tests/          offline pytest suites
  docs/           phase docs, forecasting scope, this overview
```
