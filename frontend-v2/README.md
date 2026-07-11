# FinSight Terminal (frontend-v2)

The new terminal UI, built on Lovable (React 19 + TanStack Start + Tailwind v4 + R3F + Recharts).
Replaces the legacy static `frontend/` (which stays until this app is wired to the FastAPI backend).

- Lovable project: https://lovable.dev/projects/4a94ca0a-cd78-49bb-a9b4-bf9bdc777edc
- Live preview:    https://id-preview--4a94ca0a-cd78-49bb-a9b4-bf9bdc777edc.lovable.app
- Design system:   ../docs/DESIGN_SYSTEM.md · UX audit: ../docs/UX_AUDIT.md

## Merge state

PULLED (buildable core scaffolding + engine):
  package.json, vite.config.ts, tsconfig.json
  src/server.ts, src/start.ts, src/router.tsx, src/styles.css
  src/routes/__root.tsx
  src/hooks/use-mobile.tsx
  src/lib/ — ALL 20 files: the complete quant engine (market, book/VaR/stress, backtest,
            strategies, vol-surface, greeks-surface, elasticity, dependencies, regimes,
            forecast, recommender, altdata, analyst, commands, demoBook + support).
            Verified: strict tsc, zero errors.

PENDING (fastest: one-click export, below):
  src/routes/{index,login,terminal,risk}.tsx
  src/lib/{altdata,analyst,backtest,book,commands,demoBook,dependencies,elasticity,
           forecast,greeks-surface,recommender,regimes,strategies,vol-surface}.ts
  src/components/terminal/* (47 files)
  src/components/ui/* (shadcn, 50 files)
  scripts/smoke.spec.py, components.json, eslint/prettier configs, public/favicon.ico
  (skip: bun.lock, .lovable/*, src/routeTree.gen.ts — regenerated automatically)

## Finish the merge (pick one)

1. GitHub sync (best, keeps two-way sync):
   Lovable editor → GitHub → Connect → Create repository (public)
   then: git clone <repo> /tmp/x && rsync -a --exclude .git /tmp/x/ frontend-v2/

2. Zip export:
   Lovable editor → project menu → Export / Download code
   unzip over this folder (overwrite all).

## Run

npm install
npm run dev        # http://localhost:8080 (vite prints the port)
npm run build      # production build
