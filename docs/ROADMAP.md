# FinSight Alpha — Improvement Game Plan

Goal: move from a "2–3 as a Bloomberg/Aladdin competitor" to a **solid 6–8**.
The gap is **data, real-time, scale/robustness, and depth** — not more tabs.

> Pricing below was accurate as of early 2025 — **verify current pricing/limits**
> before committing. Free tiers change often.

---

## Phase 0 — Lock the foundation (½ day, do this first)
Rating impact: prevents losing points; unblocks everything.

- `git init` + commit the current working version. Tag it `v0-working`.
- Get `pytest` green; add a GitHub Actions CI workflow (run tests on push).
- Add a `.env.example`, pin `requirements.txt`, write the README from
  `docs/PROJECT_OVERVIEW.md`.
- **Why:** institutional ≠ "works on my machine." A reviewer who hits a crash or
  finds no tests stops reading.

---

## Phase 1 — Real data + a real database  →  ~4.5
Effort: 1–2 weeks. **Highest leverage change in the whole plan.**

- Replace/augment `yfinance` behind your existing `src/data/providers/` pattern
  with a real provider (see table). Keep the abstraction so you can swap freely.
- Add **fundamentals** (balance sheet, income statement, ratios) — this makes your
  RAG, factor models, and screening run on *actual financials*.
- Add a **database**: PostgreSQL (or **TimescaleDB** for time-series) to cache
  prices/fundamentals instead of refetching. Add a scheduled ingestion job
  (cron / APScheduler / Prefect) — the pipeline you already scoped.
- Add **Redis** caching for hot endpoints (quote, tape).
- **Why:** free daily scraping is the #1 "amateur" signal. Real data + a DB makes
  *every existing feature* better at once.

---

## Phase 2 — Robustness + real-time  →  ~5.5–6
Effort: 1–2 weeks.

- **Deploy a live demo**: backend on Render/Fly/Railway, LLM pointed at Groq or
  Gemini (free tiers) instead of local Ollama. Dockerize it.
- **Streaming**: a WebSocket feed so quotes + tiles update live; intraday charts
  (lightweight-charts already supports it).
- **Error handling + monitoring**: structured logging, Sentry (free tier),
  graceful degradation everywhere.
- Pick **one deep differentiator** and finish it: the **Strategy Lab** →
  transaction costs + slippage + position sizing + stop-losses + **walk-forward
  optimization** (re-optimize each window, trade the next) + **Monte-Carlo trade
  resampling** for robustness.
- **Why:** real terminals are live, deployed, and don't fall over.

---

## Phase 3 — Institutional risk + multi-asset  →  ~6–8
Effort: 3–5 weeks. This is the actual Aladdin DNA.

- **Whole-portfolio risk** (your portfolio tab only sketches this): upload real
  holdings (hundreds of positions) → **factor risk model** (Barra-style: regress
  on style/sector factors), **ex-ante volatility & tracking error**, full **risk
  decomposition** (which factors/positions drive risk).
- **Stress testing / scenarios**: replay 2008, COVID-2020, the 2022 rate shock, a
  "NVDA −10%" shock — show portfolio P&L under each. *The* institutional feature.
- **Multi-asset**: real option chains (not synthetic), FX, a basic yield curve /
  fixed-income view (FRED gives you the curve for free).
- **Build the forecasting** you scoped (`docs/forecasting_hsmm_tft.md`): regime +
  a model that **beats baselines on walk-forward, with calibration**. Present the
  *evaluation rigor*, not an accuracy number. Add MLflow for model tracking.

---

## Data sources — free vs paid

| Source | Gives you | Free tier | Paid | Verdict |
|---|---|---|---|---|
| **SEC EDGAR** (already used) | US filings + **fundamentals** (XBRL `companyfacts`) | **Free, official, unlimited-ish** | — | **Use it.** Best free fundamentals for US names. |
| **FRED** (St. Louis Fed) | Macro, **rates, yield curve**, CPI, etc. | **Free, official** | — | **Use it.** Free yield curve = instant fixed-income view. |
| **Finnhub** | Real-time US quotes, news, some fundamentals | **Generous** (60 req/min, basic real-time) | ~$50+/mo | **Best free real-time.** Great Phase-2 pick. |
| **Tiingo** | EOD prices, fundamentals, news | **Free** (EOD, hobby/non-commercial) | ~$10–50/mo | Solid free EOD + cheap upgrade. |
| **Alpaca** | Real-time (IEX feed), trading API | **Free** with account (IEX feed) | Paid for full SIP feed | Good free real-time + paper trading. |
| **Polygon.io** | EOD/intraday, options, broad | **Free** (EOD only, 5/min, 2y) | ~$29–199/mo (real-time/intraday) | High quality; real-time is paid. |
| **Financial Modeling Prep** | Fundamentals, ratios, statements | **Free** (250 req/day) | ~$22–60/mo | Easy fundamentals API. |
| **Twelve Data** | Prices, indicators, FX | **Free** (800 req/day, 8/min) | Paid tiers | Decent generalist free tier. |
| **Alpha Vantage** | Prices, FX, news+sentiment | **Free but tiny** (~25 req/day now) | ~$50+/mo | Too limited now; skip for serious use. |
| **yfinance / Yahoo** (current) | Daily OHLCV, option chains, news | **Free** (unofficial scraping) | — | Fine for prototyping; flaky from cloud IPs. |
| **EODHD** | Very broad global EOD + fundamentals | trial only | ~$20–80/mo | Good if you want global breadth, paid. |
| **Databento / Bloomberg / Refinitiv** | Pro / tick / real institutional | — | $$$$ (institutional) | Not realistic for a solo project. |

**News specifically:** Finnhub (free), **Marketaux** (free 100/day), **GDELT**
(free, huge), NewsAPI (free 100/day dev). Real option chains for free ≈ yfinance
only; everything else (Polygon/Tradier/CBOE) is paid.

### Recommended **all-free** stack (gets you surprisingly far)
- **Filings + US fundamentals:** SEC EDGAR (already integrated)
- **Macro + yield curve:** FRED
- **Real-time-ish quotes:** Finnhub *or* Alpaca (IEX)
- **EOD prices/history:** Tiingo *or* keep yfinance
- **News:** Finnhub / Marketaux
- **Options:** yfinance (the only free real chain)

This free stack alone supports Phases 0–2 and most of Phase 3. The paid gaps are
**deep intraday history, full real-time SIP, and professional option chains** —
worth paying for only once everything else is solid.

---

## Suggested order of attack
1. **Phase 0** (½ day) — commit, tests, CI, README. Non-negotiable.
2. **Phase 1 data layer** — EDGAR fundamentals + FRED + a Postgres cache. Biggest
   single jump.
3. **Deploy** (Phase 2 start) — get a live URL with Groq as the LLM.
4. **One deep module** — finish the Strategy Lab properly.
5. **Phase 3** — portfolio factor risk + stress scenarios; then forecasting.

Do #1–#3 and you're a credible ~5–6. Add #4–#5 and you're a genuine 7–8.
