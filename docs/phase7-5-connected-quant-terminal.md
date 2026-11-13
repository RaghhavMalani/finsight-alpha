# Phase 7.5 — Connected Quant Terminal

Status: shipped with M0 (PR #30). The approved scope is in
[`phase7-5-connected-quant-terminal-plan.md`](phase7-5-connected-quant-terminal-plan.md). The day-by-day
implementation and capacity reports that used to live here (1,272 lines, 27 Oct – 6 Nov 2026) are in git
history: `git log -p -- docs/phase7-5-connected-quant-terminal.md`.

## What it is

One terminal across Market, Regimes, Factors, Risk, Data, Research and Observatory, so an investigation keeps
its context as it moves between workspaces.

- **Typed investigation context** (`frontend-v2/src/app/terminal/context.ts`, `compatibility.ts`). Ticker,
  country, cutoff, Issue, sweep and panel live in the URL under a versioned codec. Contradictory inputs (an
  India ticker with a US country, a foreign anchor) are rejected, never silently resolved. Malformed or
  duplicated query keys fail before any workspace payload loads.
- **TerminalShell** (`TerminalShell.tsx`, `ContextBar.tsx`). One shell for every unpinned route. Risk and
  Factors keep their bounded readers through thin adapters. F5 and F7 stay with the browser.
- **Command line and palette** (`commands.ts`, `ForgeCommandPalette.tsx`). Ctrl/Cmd+K loads the palette on
  demand. Commands resolve against the same context codec as the URL.
- **Unified search** (`search.ts`) over every admitted artifact, current or retained history, with exact
  version choices. Results are bound to the query that produced them, so stale results cannot leak across
  edits.
- **Evidence links** (`links.ts`, `EvidenceLink.tsx`). Every cross-workspace link names its artifact, SHA-256
  and byte length; following it re-verifies the original.
- **Capability matrix** (`capabilities.ts`). Public Replay and Local Live expose different actions; the URL can
  never elevate mode.

## Navigation index

`frontend-v2/scripts/generate-terminal-index.mjs` derives the index from `public/replay-manifest.json` at
`npm ci` / `npm run build` time. It reads every referenced original, checks SHA-256, byte length, closed schema,
licence and availability, and only then emits metadata. Nothing it writes is committed.

| Output | Transport | Loaded |
|---|---|---|
| `seed` | JS module in the initial bundle | always |
| `market`, `regimes`, `risk`, `factors`, `recordings`, `history`, `search`, `observatory-window` | lazy JS chunks | on first use |
| `data`, `history-archive` | `public/terminal/<name>.<sha12>.json` + a reference (`url`, SHA-256, bytes) in a JS module | on first open of Data or retained history |

The static indexes are fetched once, checked for declared length and SHA-256 before parsing, then go through
the same `validateTerminalShard` path as every other shard. A missing, oversized, truncated or tampered file
makes that section say *unavailable* with the reason. It never shows partial records.

### Byte ceilings

Defined once in `frontend-v2/src/app/terminal/catalog.ts`.

| Constant | Value | Protects |
|---|---|---|
| `MAX_SEED_MODULE_BYTES` / `_GZIP_` | 48 KiB / 12 KiB | first paint; the seed is the only index on the initial path |
| `MAX_LAZY_MODULE_BYTES` / `_GZIP_` | 512 KiB / 128 KiB | runaway growth of on-demand metadata |
| `MAX_STATIC_TERMINAL_BYTES` | 2 MiB | runaway growth of the two static indexes |
| `MAX_RISK_ORIGINAL_BYTES` | 1 MiB | equals `ADMISSION_LIMIT` in `src/risk_manager/publication.py` |

Initial-load and first-interaction budgets in `verify-terminal-browser.mjs` apply to executable code only.

## Why it was blocked, and what changed in M0

Between 29 Oct and 6 Nov every daily Data publication added retained history, and each new epoch pushed one
of the generated modules over a per-module cap that had been set when the corpus was smaller (131,072 decoded /
32,768 gzip bytes). Each overflow was answered with a new lossless encoding (hash-fragment interning, layout
tables, a tenth module) and a report, and the next epoch broke it again. By 6 Nov the generator wrote nothing,
`npm ci` failed, and the Risk suite had 4 failures and 65 setup errors.

M0 treated those caps as tools rather than requirements:

1. **Data is data.** The two largest indexes moved to content-addressed static JSON. JS budgets now measure
   code; data has a separate runaway ceiling.
2. **One constant, one job.** `src/risk_manager/publication.py` used `LIMIT = 128 KiB` both to reject oversized
   receipts and to decide when to pack a sweep into the compact wire. Retained states reached 130,898 bytes, a
   fresh sweep's primary state crossed the line, and every sweep failed closed. It is now
   `ADMISSION_LIMIT` (1 MiB, ~8x current size) and `COMPACT_THRESHOLD` (128 KiB, unchanged, so every retained
   receipt keeps its exact wire format).
3. **Lazy metadata is not on the critical path.** Its ceilings were raised to runaway guards. The seed keeps
   its tight budget.

Every integrity check (SHA-256, byte length, closed schema, exact round-trip, licence, availability) is
unchanged. No retained artifact, manifest entry or frozen file changed.

## How to run

```bash
cd frontend-v2
npm ci                     # also generates the index
npm run build
node scripts/generate-terminal-index.mjs --check
node scripts/verify-terminal-context.mjs
node scripts/preview-built.mjs &           # http://127.0.0.1:4174 (PREVIEW_PORT to change)
node scripts/verify-terminal-browser.mjs --url http://127.0.0.1:4174
```

Backend Risk checks: `pytest -q tests/risk_manager` and `python scripts/verify_risk_manager.py`.

## Verified

Locally on 13 Nov 2026, on this branch merged with main `233def0`, in Chrome, Edge and Firefox where a browser is
involved. CI on the pushed head is the authority.

| Check | Result |
|---|---|
| `generate-terminal-index.mjs` and `--check` | pass; stale static files pruned, tampered/missing detected |
| `verify-terminal-context.mjs` | 644 checks pass (~2 min), incl. 16 static-transport sabotage cases, append-only manifest vs pinned mains, parent and merge-base |
| `verify-terminal-browser.mjs --static-index-only` | 15/15; tampered, 404, oversized, length-mismatch for both indexes, each confirmed to fail with its guard removed |
| `npm run verify:terminal:initial` | pass: Risk 204,494 B and Factors 185,452 B gzip initial JS (cap 224 KiB), terminal core 13,277 B (cap 24 KiB) |
| `pytest tests/risk_manager` | 253 passed, 0 errors (was 2 failed / 134 errors) |
| `scripts/verify_risk_manager.py` | VERIFIED; all 27 retained Risk files canonical and re-derive their own wire format |
| Every other `ci.yml` frontend step | pass, incl. Markets, Replay, Shell, Risk browser, Data, Regimes, Factors |
| `npm ci && npm run build` on a clean clone | pass |
| Frozen paths (`data/exports`, `eval`, `public/artifacts`, manifest) | unchanged by this branch |

## Knowingly left

- The generator still carries encodings that existed only to fit the old caps (fragment interning, layout
  tables, the history/history-archive split). They are lossless and tested, so removing them is a separate
  simplification, not a correctness fix.
- Search p95 on the static navigation benchmark measured 34–36 ms against a 30 ms target in October; it was not
  re-optimised here.
- No UI reads the Data static index yet (`loadTerminalShard("data")` has no caller). It is generated, verified
  and sabotage-tested, but either a workspace should consume it or it should be dropped.
- The full browser matrix (`verify-terminal-browser.mjs` without a stage flag; not run in CI) still fails on
  pre-existing product issues: the 623 KB replay manifest loads on Market and Data first paint, `/dynamics`
  ships 260 KB gzip of initial JS, and Risk/Factors render some 8–10 px text. These belong to the M3 interface
  work.
- The Phase 7.5 plan's comparison, preferences and export areas were never built.
- Risk and regime publication schedules remain disabled; D6 remains deferred. All six scientific claim flags
  remain false.
