# Phase 0 — Markets Overview

The rescue is already on `main` through PR #19. This completes its missing Overview at `/markets` and `/markets/$ticker`, using the existing Markets contracts, query hooks, charts, provider interface and shell.

## What changed

- Instrument search covers Yahoo-listed US, NSE and BSE names, with keyboard selection and direct ticker entry. Static route names such as `RISK` use `/markets?ticker=RISK`; lowercase ticker paths redirect to uppercase.
- Each quote has its own source and observation time. Finnhub quotes and Yahoo daily fallbacks can coexist in the same watchlist. Missing quotes, prices and volume remain unavailable.
- Candlesticks and volume cover 1D, 5D, 1M, 3M, 6M, YTD, 1Y and 5Y. Intraday bar starts retain the exchange timezone; daily bars use trading dates; 5Y aggregates full weeks from daily data. Prices are split- and dividend-adjusted, and the latest bar may still be forming.
- A browser-local watchlist starts with SPY, QQQ, AAPL, MSFT, NVDA and RELIANCE.NS. It survives reloads, handles blocked storage in memory, and accepts at most 30 valid, unique symbols.
- Long-running APIs now resolve the default end date per request. Intraday Yahoo calls share the existing download lock and have a 60-second cache. Empty bar responses and unavailable search sources return explicit errors.

## Contract and browser verification

`scripts/export_markets_fixtures.py` produces 22 explicitly simulated test fixtures by calling real route functions with seeded stand-ins. Their historical, intraday, live-quote and daily-fallback responses never contain downloaded vendor prices. The Python shape check and 118 frontend checks cover the adapters, malformed data, quote timestamps, weekly aggregation, watchlist normalization, candle geometry and exchange-local formatting.

All eight `frontend-v2/scripts/verify-*.mjs` pass. Lint, TypeScript and the production build pass. The production browser checks pass 48 Markets views at 1440 and 390 pixels, including data, 503, 401, search selection, watchlist persistence, ticker casing, route-name collisions and invalid symbols; 18 Observatory views pass the label-overlap regression check.

## Real-data screenshots

Captured on 7 October 2026, around 13:25 IST, from the local production build and API. The viewport width is asserted before each capture. A scratch SQLite database holds the throwaway sign-in account; credentials and sessions are never written to the repository.

- [SPY at 1440 pixels](overview-spy-1440.png)
- [SPY at 390 pixels](overview-spy-390.png)
- [RELIANCE.NS at 1440 pixels](overview-reliance-ns-1440.png)

At capture time the SPY quote was Finnhub's latest observation from the prior US close; its timestamp says 6 October, 20:00 UTC. RELIANCE.NS showed a Yahoo daily quote dated 6 October alongside the current NSE intraday session. Fetch time and observation time are separate, and neither is presented as the other.

To recapture, start the API with `APP_ENV=development`, `DATABASE_URL` pointing at a new scratch SQLite file, and `CORS_ORIGINS=http://127.0.0.1:4174`. From `frontend-v2`, build, run `node scripts/preview-built.mjs`, then `node scripts/capture-markets.mjs`. The capture script requires a local API and asserts that the quote, chart and watchlist have loaded with no unavailable state or horizontal page overflow.

## Postable result

FinSight's market desk now starts with a searchable US and India ticker Overview, adjusted candlesticks and a persistent watchlist. The real-data check shows a Finnhub quote for SPY and a Yahoo daily fallback for RELIANCE.NS, each carrying its own observation time. Unavailable values stay missing, and incomplete bars are labelled; these engineering checks make no trading-performance claim.

Record 30–60 seconds: open `/markets`, then `/markets/SPY`; switch 1D → 1Y → 5Y; search `reliance` and select `RELIANCE.NS`; remove and add it to the watchlist; open it from its watchlist link; finish on `/markets/SPY` at 390 pixels. The production target after merge is [the Markets desk](https://finsight-alpha-web.vercel.app/markets); the [repository](https://github.com/RaghhavMalani/finsight-alpha) contains the implementation and test evidence.

Anonymous Replay mode, the F1–F10 shell, exchange/currency modelling and server-synced watchlists belong to later phases. The existing unlocked `Ticker.history` call in `pricing._yahoo_spot` remains a separate follow-up.
