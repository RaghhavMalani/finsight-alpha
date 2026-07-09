# FinSight Alpha - Project Overview

FinSight Alpha is a local-first quant research, derivatives, risk, and AI
research terminal. It combines a Python analytics engine, a FastAPI service
layer, an LLM/RAG intelligence layer, and a browser-based terminal UI.

The active app surface is intentionally narrow:

- `backend/` - FastAPI app, auth gate, API routers, and static page serving.
- `frontend/terminal.html` - primary browser terminal.
- `frontend/risk.html` - focused risk page.
- `frontend/login.html` - login page.
- `src/` - reusable quant, AI, data, graph, and visualization engine.

The old dashboard stack has been removed so the project can move as one product.

---

## 1. High-level Architecture

```text
Browser
  -> frontend/terminal.html, risk.html, login.html
  -> backend/ FastAPI routes
  -> src/ engine modules
  -> Yahoo Finance, SEC EDGAR, local docs, optional LLMs, optional cloud stores
```

FastAPI serves the browser UI at the same origin as the API, which keeps local
runs simple and avoids CORS friction for the terminal pages.

---

## 2. Tech Stack

| Layer | Technology |
| --- | --- |
| Language | Python 3.10+, browser JavaScript |
| API | FastAPI, Uvicorn, Pydantic |
| UI | HTML, CSS, vanilla JS, Plotly.js, Chart.js, Cytoscape, GridStack, lightweight-charts |
| Data | pandas, NumPy, SciPy, yfinance, optional provider APIs |
| Filings | SEC EDGAR |
| ML | scikit-learn, hmmlearn, joblib |
| RAG | sentence-transformers, FAISS, rank-bm25, pypdf, python-docx |
| LLMs | Ollama, OpenAI, Anthropic, Gemini, Groq |
| Testing | pytest |
| Optional cloud | Docker, Cloud Run, BigQuery, Cloud Storage, Cloud SQL |

---

## 3. Engine Modules

`src/data/`
: Market data service, providers, caching, fundamentals, options, BigQuery, and
  Cloud Storage clients.

`src/analytics/`
: Returns, volatility, drawdown, CAGR, Sharpe, Sortino, beta, CAPM, correlation,
  sector analysis, downside deviation, and data-quality reports.

`src/pricing/`
: Black-Scholes pricing, Greeks, implied volatility, and volatility surfaces.

`src/simulation/`
: Geometric Brownian Motion Monte Carlo, distribution reconstruction, VaR/CVaR
  support data.

`src/risk/`
: Historical, parametric, and Monte Carlo VaR/CVaR plus portfolio optimization,
  efficient frontier, max Sharpe, min variance, and risk parity tools.

`src/ml/`
: Feature engineering, target construction, model training, walk-forward
  validation, and institutional signal suppression rules.

`src/regime/`
: HMM, Gaussian mixture, and KMeans regime detection, labeling, transitions,
  duration, and performance summaries.

`src/rag/`
: EDGAR discovery, document loading, chunking, embeddings, vector stores,
  retrieval, reranking, grounded answers, source policy, factor extraction, and
  research briefs.

`src/graph/`
: Dependency graph extraction and sensitivity analysis.

`src/news/`
: News headline collection and finance-oriented sentiment scoring.

`src/agent/`
: Tool orchestration over the project engine.

---

## 4. Backend Routes

The API is organized by feature area under `backend/routes/`:

- `auth`, `health`, `assets`
- `market_data`, `quote`, `tape`, `fundamentals`
- `analytics`, `pricing`, `risk`, `portfolio`, `backtest`, `strategy`
- `ml`, `regime`, `factors`
- `research`, `graph`, `news`, `agent`

The backend also serves:

- `/terminal` -> `frontend/terminal.html`
- `/risk` -> `frontend/risk.html`
- `/login` -> `frontend/login.html`
- `/docs` -> FastAPI docs

---

## 5. Terminal Features

The primary UI is the browser terminal. It currently aims to cover:

- Overview: price, KPIs, returns, drawdown, volatility, technicals, news.
- Workspace: draggable/resizable tiles for multiple tickers and widgets.
- Strategy Lab: rules, backtests, transaction costs, parameter search, AI critique.
- Compare: rebased multi-ticker charts and metric tables.
- Portfolio: holdings, aggregate risk, VaR/CVaR, correlation, risk contribution.
- Options: option chain, Greeks, payoff analysis, hedging tools.
- Backtest: preset strategies.
- Factors: factor exposures and annualized alpha.
- Vol Surface: interactive implied-volatility surface.
- Monte Carlo: simulation fan, VaR/CVaR, return distribution.
- Graph: dependency graph and sensitivity panel.
- Research: filing discovery and grounded cited Q&A.

---

## 6. Run Locally

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open `http://127.0.0.1:8000/terminal`.

Optional local LLM:

```bash
ollama pull llama3.1
```

Tests:

```bash
pytest -q
```

---

## 7. Repository Map

```text
finsight-alpha/
  backend/        FastAPI app, schemas, routes
  frontend/       terminal, risk, and login pages
  src/            quant, data, AI, graph, news, visualization modules
  scripts/        RAG/document/graph helper CLIs
  tests/          offline pytest suites
  docs/           phase notes and roadmap
  infra/          Docker and GCP deployment notes
  sql/            warehouse and metadata schemas
  data/           local runtime data, ignored artifacts, sqlite user DB
```

---

## 8. Honest Limitations

- Free market data is useful for research, not institutional real-time trading.
- yfinance can rate-limit or change behavior; production needs keyed providers
  and ingestion jobs.
- ML/regime features must be constantly checked for lookahead bias.
- RAG quality depends on document freshness, citation discipline, and graceful
  LLM failure handling.
- The terminal UI is powerful but too monolithic; it should be modularized.
- This is not an order-routing or live-execution system.

The credibility of the project will come from correctness, validation, and clear
risk assumptions more than from adding more tabs.
