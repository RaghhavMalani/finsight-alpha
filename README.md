# FinSight Alpha

FinSight Alpha is a local-first financial research terminal: a FastAPI backend,
a browser-based HTML terminal, and a Python quant/AI engine for market analytics,
risk, options, ML signals, regime detection, RAG research, news, and dependency
graphs.

The current product direction is:

- `backend/` serves the API and the browser pages.
- `frontend/terminal.html` is the primary UI.
- `frontend/risk.html` and `frontend/login.html` are supporting pages.
- `src/` is the reusable engine for data, analytics, pricing, risk, ML, RAG,
  graph, news, and visualization helpers.

The old dashboard stack has been removed from the active project surface.

---

## Run Locally

Requires Python 3.10+.

```bash
python -m venv .venv

# Windows
.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open:

- Terminal UI: `http://127.0.0.1:8000/terminal`
- Risk page: `http://127.0.0.1:8000/risk`
- API docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/health`

Run the optional batch pipeline:

```bash
python main.py
```

Run tests:

```bash
pytest -q
```

---

## Main Parts Of The Project

### 1. Foundation

Files:

- `requirements.txt`
- `.env.example`
- `.env.cloud.example`
- `src/config.py`
- `src/utils/`

What to fix first:

- Pin dependencies or split them into `requirements-core.txt` and optional
  `requirements-rag.txt`.
- Keep real secrets only in `.env`, never in committed examples.
- Add clear app settings for local, test, and cloud modes.

### 2. Data Layer

Files:

- `src/data/`
- `src/data/providers/`
- `sql/`

Role:

- Pulls market data and fundamentals.
- Wraps yfinance, Alpha Vantage, Finnhub, Polygon, BigQuery, Cloud Storage, and
  local caches.

What to improve:

- Move away from yfinance as the only practical default for production use.
- Add a durable cache or ingestion store.
- Add rate-limit handling, retries, and provider health reporting.

### 3. Analytics, Pricing, Risk, And Simulation

Files:

- `src/analytics/`
- `src/pricing/`
- `src/risk/`
- `src/simulation/`

Role:

- Returns, volatility, drawdown, Sharpe, Sortino, beta, CAPM, correlation.
- Black-Scholes, Greeks, implied volatility, vol surfaces.
- VaR, CVaR, Monte Carlo, portfolio optimization.

What to improve:

- Keep tests tight around formulas and edge cases.
- Add benchmark fixtures for known portfolio/risk results.
- Surface assumptions clearly in API responses.

### 4. ML And Regime Detection

Files:

- `src/ml/`
- `src/regime/`
- `backend/routes/ml.py`
- `backend/routes/regime.py`

Role:

- Feature engineering, targets, walk-forward validation, signal models, and
  market state detection.

What to improve:

- Audit for lookahead bias.
- Make walk-forward validation visible in the UI.
- Add model cards: data span, features, target, validation quality, and why a
  signal is suppressed.

### 5. RAG And Research Intelligence

Files:

- `src/rag/`
- `backend/routes/research.py`
- `scripts/build_rag_index.py`
- `scripts/fetch_filings.py`
- `scripts/ask_rag.py`

Role:

- Discovers filings, loads documents, chunks text, embeds, retrieves, reranks,
  and generates cited research answers.

What to improve:

- Treat heavy dependencies as optional.
- Add stronger source freshness and citation checks.
- Make LLM failures graceful and obvious to the user.

### 6. Agent, Graph, News

Files:

- `src/agent/`
- `src/graph/`
- `src/news/`
- `backend/routes/agent.py`
- `backend/routes/graph.py`
- `backend/routes/news.py`

Role:

- Orchestrates research tools, dependency graph analysis, and sentiment/news
  summaries.

What to improve:

- Make agent actions auditable.
- Cache graph/news calls.
- Add confidence/freshness labels in API responses and UI panels.

### 7. Backend API

Files:

- `backend/main.py`
- `backend/routes/`
- `backend/schemas/`
- `src/auth/`

Role:

- Serves the UI, API routes, login, cookies, and router orchestration.

What to improve before production:

- Lock down CORS instead of `allow_origin_regex=".*"` with credentials.
- Set production cookie flags deliberately.
- Add structured request logging and error monitoring.
- Add a CI workflow that runs tests on every push.

### 8. Frontend

Files:

- `frontend/terminal.html`
- `frontend/risk.html`
- `frontend/login.html`

Role:

- Main user-facing product. The terminal is the strongest product direction.

What to improve:

- Split the large HTML file into maintainable JS/CSS modules or move to a small
  frontend build stack.
- Add loading, empty, and error states everywhere.
- Keep design tokens shared across terminal, risk, and login pages.
- Add live updates for quote/tape widgets when the backend supports it.

### 9. Infra And Deployment

Files:

- `Dockerfile`
- `infra/Dockerfile.api`
- `infra/gcp_commands.sh`
- `infra/gcp_commands_windows.ps1`
- `infra/gcp_deployment.md`
- `infra/`

Role:

- Container and cloud deployment notes for the FastAPI app.

What to improve:

- Use one production Dockerfile strategy.
- Keep deployment scripts API-only unless a separate frontend service is added.
- Move project-specific cloud IDs into environment variables.

---

## Suggested Fix Order

1. Clean foundation: dependency pinning, env templates, logging, config.
2. Make tests and CI trustworthy.
3. Harden data providers and caching.
4. Audit ML/regime for leakage and validation quality.
5. Make the API production-safe: CORS, cookies, errors, logging.
6. Refactor the terminal frontend into maintainable modules.
7. Deepen one differentiator: backtesting, portfolio factor risk, or grounded
   research.

The fastest product win is to polish the terminal UI and Strategy/Backtest Lab.
The highest credibility win is to prove the data/ML/risk layer is correct.
