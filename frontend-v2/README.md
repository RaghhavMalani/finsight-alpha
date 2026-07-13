# FinSight Terminal (frontend-v2)

The exact FinSight Terminal UI from Lovable, built with React 19, TanStack Start, Tailwind v4, R3F, and Recharts.
It replaces the legacy static `frontend/` and is connected to the FastAPI backend.

- Lovable project: https://lovable.dev/projects/4a94ca0a-cd78-49bb-a9b4-bf9bdc777edc
- Imported Lovable commit: `1846e1fa02fa72f55525b2754819ff890b0893ae`
- Live preview: https://id-preview--4a94ca0a-cd78-49bb-a9b4-bf9bdc777edc.lovable.app
- Design system: ../docs/DESIGN_SYSTEM.md · UX audit: ../docs/UX_AUDIT.md

## Integration state

SYNCED and API-connected:

- Market tape anchors the terminal to Finnhub when configured, with yfinance EOD fallback.
- Authentication uses the FastAPI register/login/session-cookie routes.
- Alternative data shows Open-Meteo weather, provider readiness, and `KAGGLE_DATA_DIR` inventory.
- Strategy runs are executed by `/strategy/run`; supported Lovable RSI, SMA, price/SMA, and momentum rules are translated automatically.
- Rich options, 3D, ML, and alternative-signal visualizations remain local analytical demos and are labeled accordingly.

## API configuration

During local development the browser defaults to `http://127.0.0.1:8000`. Set `VITE_API_BASE_URL` to override it.
In production the default is same-origin, which is the recommended setup for the session cookie.

## Deploy

`vite.config.ts` pins Nitro to the `vercel` preset outside Lovable's own preview sandbox.
Set the Vercel frontend service root to `frontend-v2` and route the FastAPI service under the same public origin.
Keeping the frontend and API on one origin avoids third-party-cookie failures. If they are intentionally separate, set `VITE_API_BASE_URL` and update the backend cookie policy for that cross-site deployment.

## Run

```bash
npm install
npm run dev
npm run build
```
