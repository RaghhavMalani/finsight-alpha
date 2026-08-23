# FinSight Alpha — Gap Review

Reviewed at commit `9ec8609` (plus a large uncommitted working tree). ~45k LOC across
`backend/` (4.5k), `src/` (19.5k), `frontend-v2/src/` (20.8k), `tests/` (3.8k).

The short version: **the surface area is impressive and the plumbing is mostly honest.
What's missing is depth in three places — statistical rigor in the ML/backtest layer,
production-grade runtime behaviour in the API, and a real information hierarchy in the UI.**
Right now the product is wide and thin. Every one of the 14 function codes works a little;
none of them would survive a professional user spending an hour in it.

---

## 1. Credibility gaps (fix these first — they undermine everything else)

### 1.1 Model selection happens on the test set
`src/ml/signal_modeling.py:70-80`

Five candidate models are trained, then sorted by **test-set** ROC-AUC, and the winner's
**test-set** ROC-AUC, Brier score and `model_edge` are what the UI reports as "the gated
out-of-sample result." That's selection bias: with 5 candidates you'll pick a 0.53 AUC out
of noise roughly half the time on random data. The `roc_auc < 0.52 → "No reliable edge found"`
gate is applied to the *maximum* of 5 tries, which is exactly the statistic that's inflated.

Fix: three-way chronological split (train / validation / test). Select on validation, report
on test, and never touch test again. Report the *number of candidates tried* alongside the
metric so the gate can be adjusted for multiple comparisons.

### 1.2 The walk-forward validator exists but isn't wired to anything the user sees
`src/ml/signal_walk_forward.py` implements expanding-window validation with fold tracking.
`backend/routes/ml.py` never calls it — it calls `train_signal_model_suite` (single split).
Your own README lists "make walk-forward validation visible in the UI" as an open item and
it still is. This is the single highest-leverage credibility win in the repo: the code is
already written.

### 1.3 Calibration is claimed in the field names but not implemented
`src/ml/signal_modeling.py:118-124`:
```python
"raw_probability_up": raw_prob,
"calibrated_probability_up": raw_prob,   # identical
"shrunk_probability_up": raw_prob,       # identical
"calibration_table": None,
```
Three names, one number. A random forest's `predict_proba` is badly calibrated by construction.
Either implement isotonic / Platt scaling on a held-out fold and ship a reliability diagram,
or delete the two aliases. Shipping a field called `calibrated_` that isn't is worse than not
having it.

### 1.4 Backtests have no costs
`backend/routes/backtest.py:120`: `strat_ret = pos.shift(1) * ret`. No commission, no spread,
no slippage, no borrow. An SMA-cross on NVDA at daily frequency is not cost-sensitive; an RSI
mean-reversion strategy at 30/70 thresholds absolutely is. Also:

- `fast`/`slow` are user-tunable over the **full sample** with no in/out-of-sample split —
  the UI lets a user overfit and shows them the overfit number as a result.
- `win_rate` is the fraction of *days* with positive return, not the fraction of *trades*
  that won. The label is wrong.
- Sharpe assumes rf = 0 (`src/config.py: RISK_FREE_RATE = 0.0`) with no note in the response.
- No validation that `slow > fast`.

Minimum viable fix: a `cost_bps` parameter applied on `pos.diff().abs()`, a fixed
train/test date split with the test-period stats reported separately, and per-trade P&L.

### 1.5 Hardcoded "insights" presented as analysis
`frontend-v2/src/routes/terminal.tsx:127-160` — the `INSIGHTS` map is static strings:

> "Tape prints skew to buyers — up 1.4× on the last 5-minute average."
> "Tech basket 60D ρ = 0.71, above 6-mo mean."

These render next to real computed panels with specific-looking numbers. A user cannot tell
which is which. You've clearly been disciplined about this elsewhere — the `truth-contract`
CI job literally greps for `BACKTESTED ·` and "fall back silently to sim" — so this looks
like an oversight rather than intent. Either compute them or delete them.

### 1.6 Bid/ask is fabricated and not labelled
`frontend-v2/src/lib/live-market.ts:92-101`:
```ts
const spreadBps = Math.max(1, current.annualVol * 30);
bid: price - spread / 2,
ask: price + spread / 2,
```
`annualVol` comes from a hardcoded table in `market.ts` (SPY 0.12, NVDA 0.35). So the bid/ask
in a "terminal" is `last ± f(a constant)`. VWAP gets `vwapSource: "UNAVAILABLE"` — good, you
already have the labelling mechanism. Bid/ask should get `"DERIVED"` or be hidden. Same for
the hardcoded `prevClose` table (SPY 612.40, NVDA 178.44) that renders before the first tape
response lands — those are stale numbers shown as prices.

---

## 2. Engine / data layer

| Gap | Where | Why it matters |
|---|---|---|
| `except (ProviderError, Exception)` | `tape.py:69,102`, `graph.py:149,253`, `factors.py:52` | This is just `except Exception`. Provider failure, auth failure, and a typo all become "symbol silently missing from the tape." |
| 109 bare `except Exception` across `backend/` + `src/` | repo-wide | Failures are invisible. `ml.py:98` swallows the entire benchmark fetch with `except Exception: pass` — the model then trains without beta/correlation features and reports nothing about it. |
| 3 of 14 outbound HTTP calls lack timeouts | `src/data/`, `src/rag/` | One hung provider pins a request thread until the platform kills it. |
| yfinance is the hard-coded default everywhere | `MarketDataService("yfinance")` appears literally in `risk.py`, `ml.py`, `backtest.py`, `tape.py` | The provider abstraction in `src/data/providers/` exists but the routes bypass it. Switching provider means editing 10 route files. |
| Caches are per-process dicts | `ml.py:_cache`, `tape.py:_live_cache` | On Vercel serverless (your production topology) every cold start is an empty cache and every concurrent instance has its own. The 30-min ML cache effectively doesn't exist in production. |
| SQLite cache under `/tmp` on Vercel | `src/config.py:_DEFAULT_DATA_DIR` | Same problem — ephemeral, per-instance. You need Redis/Upstash or Postgres-backed caching. |
| No dependency pinning | `requirements.txt` — 0 of 71 lines pinned | `pandas`/`scikit-learn`/`yfinance` unpinned means a silent numerical change breaks reproducibility and your validation report. |
| No provider health surfacing | `src/data/pipeline_health.py` exists | Users can't see *why* a panel is empty. "UNAVAILABLE" without a reason is a dead end. |

**Options/vol surface**: worth auditing that IV is taken from provider-reported IV vs solved
from mid — `OptionsChain.tsx` mentions "reported IV," which is provider-dependent and often
stale/wrong for illiquid strikes. Max pain and OI walls computed off bad IV are decoration.

---

## 3. Backend / API

**63 of 65 endpoints are sync `def`.** FastAPI runs those on a 40-thread pool. Your heavy
endpoints — `/ml/signal/{ticker}` (trains 5 models), `/risk/dashboard`, Monte Carlo, RAG —
each hold a thread for seconds. Forty concurrent users is a hard wall, and one user hammering
`/ml/signal` across tickers is a self-inflicted DoS. There is no job queue, no request
timeout, no concurrency cap, and no cancellation.

What's missing:

- **No rate limiting anywhere.** `/auth/login` is unthrottled → credential stuffing. `/agent`
  runs up to 8 LLM tool calls per request with no per-user quota → an authenticated user can
  spend your Azure budget in a loop.
- **No request timeout / circuit breaker** on provider calls.
- **No idempotency or job model** for long work. `/ml/signal` should return a job id and let
  the UI poll or stream, not block for 5-10 seconds behind a serverless function limit.
- **SSE streaming is fake on the default path.** `agent.py:104-115` — the legacy ReAct loop
  runs to completion, then emits all tool steps and the *entire answer as one token event*.
  The UI shows a streaming affordance for a response that arrived at once.
- **No structured request logging** (method, path, latency, user, org, error_id). You have
  the error_id correlation handler in `main.py` — extend it to a middleware that logs every
  request.
- **No API versioning.** `/tape`, `/quote`, `/ml/...` at the root. Adding a breaking change
  means breaking every deployed frontend.
- **Auth is thin for a multi-tenant product.** No password reset, no email verification, no
  MFA, no session revocation (stateless HMAC tokens can't be revoked before their 7-day
  expiry — a leaked cookie is valid for a week), no audit log of who queried what. For a
  product with `sql/004_enforce_tenant_rls.sql` and org grants, that's a mismatch in maturity.
- `DEFAULT_ORGANIZATION_SLUG` as a global env var is a stopgap you've documented — the
  frontend has no org selector at all yet.

---

## 4. Frontend — UI

**Bundle**: `vol-surface` chunk is **1.03 MB**, `terminal` is 363 KB, `index` is 297 KB.
That's three.js + react-three-fiber + drei. The 3D surfaces are the most impressive thing in
the product and the most expensive thing to load. They should be lazy-loaded behind the VS/GR/MC
function codes only (some of this is already split — verify nothing pulls three.js into the
initial terminal chunk), and there should be a 2D fallback (contour/heatmap) that renders in
50 KB for users who don't need to orbit a surface.

**Accessibility is essentially absent.** Across 20.8k lines of frontend:

- `aria-live`: **0** — every price update, alert fire, and toast is silent to screen readers
- `alt=`: **0**
- `focus-visible`: **0** — with a keyboard-driven terminal, this is the big one. `Panel` sets
  `outline-none` on a `tabIndex={0}` section (`Panel.tsx:78`), so tabbing gives no visible focus.
- `role=`: 3 total
- Contrast: `--faint` and `text-[8px]`/`text-[9px]` labels appear throughout `terminal.css`.
  8px monospace at low-contrast grey will fail WCAG AA badly. Bloomberg gets away with dense
  small type because it's high-contrast; yours is dense *and* low-contrast.

**Responsive**: two media queries total (`terminal.css:14`), one Tailwind breakpoint prefix in
all of `terminal.tsx`. The 12-column grid collapses to `grid-column: 1/-1` below 760px, which
means on a phone you get 14 full-width stacked panels with 3D canvases. Either build a real
mobile view (watchlist + quote + one chart) or gate mobile with an honest "this is a desktop
product" screen. Right now it's neither.

**No error boundaries.** `ErrorBoundary`: 0 occurrences. There's a TanStack route-level
`errorComponent` in `__root.tsx`, but that's whole-page — one panel throwing on malformed
provider data blanks the entire terminal to "The desk hit an exception." In a 14-panel grid,
failure must be per-panel.

**Loading/empty/error coverage is uneven** (queries / loading states / error states per file):

```
HomeOverview.tsx      9 queries · 3 loading · 0 error handling   ← the default screen
Watchlist.tsx         2 queries · 0 loading · 0 error
CommandPalette.tsx    2 queries · 0 loading · 0 error
PriceChart.tsx        3 queries · 0 loading · 1 error
RiskLiveCommandCenter 3 queries · 2 loading · 0 error
```

`HomeOverview` is the first thing every user sees and it has zero error handling across nine
network calls. `Panel`'s only loading affordance is a `scanline-overlay` — there are no
skeletons anywhere (`Skeleton`: 0), so slow panels show stale-or-empty rather than "loading."

**Design system drift**: `styles.css` is 293 lines, `terminal.css` is 14 minified lines, and
Tailwind arbitrary values (`text-[8px]`, `text-[10px]`, `rgba(240,169,41,0.18)`) are sprinkled
inline throughout. The amber `#F0A929` is hardcoded in at least three places. There's no token
layer, so a theme change is a find-and-replace.

---

## 5. Frontend — UX and flow

**The onboarding cliff.** A new user lands on `/terminal`, gets `HOME` with NVDA active, and
faces 14 two-letter codes (MK, OC, MC, GR, ML, CX, VS, BT, STRAT, ALT, RISK, SIGHT, NEWS,
ALERTS). You've built `SpotlightTour`, `HintTicker`, `KeyboardOverlay`, and per-panel
`EXPLAINERS` — genuinely good work — but they're all *reference* material. There's no task.
The strongest thing you could add is a guided first-run flow with an actual outcome:
"pick a ticker → see its signal → check the regime → run a backtest → here's what you learned."
Bloomberg's onboarding is a training course; yours needs a 90-second version of one.

**No persistence of anything the user does.** `localStorage` holds `finsight.preset` and
little else. Watchlist, alerts, book positions, layout, and active function all reset on
reload. A research terminal whose state evaporates is a demo, not a tool. This is a backend
feature (user preferences table) more than a frontend one, and it's the single biggest
"is this real software" signal.

**Alerts are ephemeral and client-side.** `terminal.tsx:250-290` — the alert engine runs in a
`useEffect` against polled prices. Close the tab, lose the alerts. No server-side evaluation,
no email/push. An alert that only fires while you're watching the screen defeats the purpose.

**30-second polling presented as LIVE.** `live-market.ts` uses `refetchInterval: 30_000`, and
the Panel header shows a pulsing `LIVE` dot. `WebSocket`: 0 occurrences. For a terminal
positioning itself on live data, 30s polling with a live indicator overpromises. Finnhub has
a websocket on the free tier. Either use it or label it "30s snapshot."

**Intraday chart is built from poll history.** `live-market.ts:105-108` appends one point per
30s poll to a 120-point buffer — so the intraday price chart is a 60-minute stub that starts
empty on load and can't survive a refresh. There's no intraday bars endpoint.

**The login page is theatre.** `login.tsx:16-21` — a fake boot sequence ("MARKET DATA … OK",
"SESSION KEY … OK") gated at 380ms per line, plus a `LIVE` pulse dot on a page with no data.
That's ~1.7 seconds of forced delay before a returning user can type. Charming once, friction
forever. Make it skippable on second visit, and drop the LIVE indicator.

**No cross-panel narrative.** You built panel link-groups (A/B) which is a great primitive,
but nothing uses it to tell a story. The killer flow for this product is: *ML says BUY → why?
→ feature importance → what regime are we in → does this survive a backtest → what's the risk
→ what does the news say.* Right now those are seven manual navigations with no thread. One
"Research this ticker" button that walks that chain and produces a one-page verdict would be
worth more than the next five panels.

**No export.** No CSV, no PDF, no shareable link, no screenshot. Research that can't leave the
tool doesn't get used. `data/exports/` exists server-side but nothing in the UI reaches it.

**No undo / no confirm on destructive actions**, and `terminal.css` sets
`button:disabled{cursor:wait}` globally — a disabled button is not always a pending one.

**Keyboard shortcuts collide with typing.** Number keys 1-9/0/-/= fire function codes when
not in an input (`terminal.tsx:295-310`), but the check is `tagName === INPUT/TEXTAREA` only —
any custom focusable widget (your `tabIndex={0}` panels, contenteditable-ish components) will
swallow digits into navigation.

---

## 6. Testing and CI

- **265 Python tests** — genuinely good coverage of the engine (pricing, VaR, regime, RAG,
  intelligence, licensing). This is the strongest part of the repo.
- **Zero frontend tests.** No vitest, no testing-library, no Playwright. 20.8k lines of the
  most user-visible code has no automated check beyond `tsc --noEmit`.
- **CI lints exactly two files**: `npx eslint src/components/terminal/StockIntelligencePanel.tsx
  src/components/terminal/MonteCarloPanel.tsx`. Everything else is unlinted. `npm run lint`
  exists — use it.
- **API tests are offline-only by design** — routing and schema shape, not behaviour. No
  contract tests against recorded provider fixtures, so a yfinance response-shape change
  breaks production with a green CI.
- **No numerical regression tests on the validation suite.** `scripts/run_validation_suite.py`
  writes `validation_report.json` — that should be a golden file compared in CI, otherwise a
  refactor can silently shift VaR by 3% and nobody notices.
- The `truth-contract` job is a genuinely clever idea. Extend it: grep for `Math.random` in
  panel components, for hardcoded price constants, for `LIVE` without a source badge.
- **69 uses of `any`** in the frontend — mostly at the API boundary, which is exactly where
  types matter most. Generate types from the FastAPI OpenAPI schema (`openapi-typescript`)
  and the frontend/backend contract stops drifting by hand.

---

## 7. Repo hygiene / process

- **247 files with 72k insertions uncommitted.** Every backend route, every test, the README,
  CI config — all modified in the working tree. Whatever this is (a large refactor, a
  line-ending normalization), it means no reviewable history for the current state of the
  product and no way to bisect a regression. Commit it in logical chunks before anything else.
- `data/cache.db`, `data/finsight_users.db`, and 20+ `pytest-full-tmp/` artifacts are on disk
  in the repo folder. CI blocks committing `*.db` (good) but they shouldn't be sitting there.
- **README is stale in the direction of self-criticism.** It says "Lock down CORS instead of
  `allow_origin_regex='.*'`" — you already did (`main.py:96`, `config.CORS_ORIGINS` with
  production validation). It says "Add a CI workflow" — `.github/workflows/ci.yml` exists.
  Fix the README so it describes the current state; a doc that overstates your problems is as
  bad as one that hides them.
- Two Dockerfiles (`Dockerfile`, `infra/Dockerfile.api`) plus Vercel serverless plus GCP Cloud
  Run notes. Three deployment stories, one of which is live. Pick one and archive the rest.
- No `CONTRIBUTING`, no ADRs, no changelog. For a project this size with this much design
  intent (the truth-contract, the license policy, the snapshot immutability), the *reasoning*
  isn't written down anywhere someone could find it.

---

## 8. Product positioning — the thing nobody will tell you

You have 14 function codes, each about 20% as deep as its commercial equivalent. The market
does not reward that. The question a user asks is not "does it have a vol surface" — it's
"is there one thing here I can't get anywhere else."

Candidates you're closest to:

1. **Grounded research with source lineage.** `src/intelligence/snapshots.py` +
   `src/data/license_policy.py` + immutable raw snapshots + tenant grants is genuinely
   differentiated work. Nobody in the retail/prosumer tier does evidence provenance properly.
   This is your moat and it's buried under the 3D graphics.
2. **Honest ML signals.** Not "our model says BUY" but "here's a signal, here's its
   walk-forward record, here's the regime it works in, here's why it's suppressed today."
   The suppression logic in `signal_engine.py` is the right instinct — but it needs §1.1-1.3
   fixed to be trustworthy.
3. **The news → transmission → KPI → scenario chain** in `NewsImpactPanel`. That's a real
   analytical product if the causal links are earned rather than asserted.

The 3D Monte Carlo landscape and greek surfaces are beautiful and will win a demo. They will
not win a second session. Budget accordingly.

---

## Suggested order

**Week 1 — stop the bleeding**
1. Commit the working tree in reviewable chunks.
2. Delete or compute the hardcoded `INSIGHTS`; label derived bid/ask; remove stale hardcoded prices.
3. Pin `requirements.txt`.
4. Turn on full `npm run lint` in CI.

**Weeks 2-4 — credibility**
5. Three-way split + walk-forward wired into `/ml/signal` and surfaced in `MLPanel`.
6. Real calibration or delete the aliases.
7. Transaction costs + in/out-of-sample split in `/backtest`.
8. Golden-file regression test on the validation suite.

**Weeks 4-8 — make it a tool, not a demo**
9. Persist watchlist / alerts / layout server-side; server-side alert evaluation.
10. Per-panel error boundaries + skeletons + error states (start with `HomeOverview`).
11. Rate limiting, request logging, and a job model for `/ml` and `/risk`.
12. Redis-backed cache (the in-process dicts do nothing on serverless).

**Ongoing**
13. Focus-visible, aria-live on price/alert regions, contrast audit.
14. Lazy-load three.js; 2D fallbacks for the surfaces.
15. Generate frontend types from OpenAPI; kill the 69 `any`s.
16. Pick one deployment story.
17. Pick one differentiator and go three times deeper on it than anything else.
