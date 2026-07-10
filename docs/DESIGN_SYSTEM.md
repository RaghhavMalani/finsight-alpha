# FinSight Design System v2 — "Terminal Noir"

Direction decoded from the four reference videos: Bloomberg Terminal density and
function-code UX (video 1), dark-quant scientific charting (video 2), and
cinematic serif landing-page storytelling (videos 3–4). One system, two moods:
**editorial noir** for marketing surfaces, **instrument panel** for the app.

---

## 1. Design Tokens

### Color

| Token | Value | Use |
|---|---|---|
| `bg.base` | `#050607` | App background (near-black) |
| `bg.panel` | `#0A0C0E` | Panel / card surfaces |
| `bg.raised` | `#11141A` | Hover surfaces, dropdowns |
| `line.strong` | `#252A2F` | Panel borders |
| `line.soft` | `#171B1F` | Dividers, grid lines |
| `accent.amber` | `#F0A929` | Primary — commands, focus, brand |
| `accent.amberDim` | `#8A631F` | Inactive amber, borders |
| `accent.amberGlow` | `rgba(240,169,41,.18)` | Glows, focus rings |
| `signal.up` | `#42C98B` | Positive ticks, gains |
| `signal.down` | `#F06464` | Negative ticks, losses, errors |
| `signal.info` | `#45B9D3` | Links, informational, cyan tape |
| `text.primary` | `#E7EAEC` | Data, headlines |
| `text.dim` | `#9AA2A9` | Labels, secondary |
| `text.faint` | `#636C74` | Hints, timestamps |
| `viz.viridis` | `#440154 → #21918C → #FDE725` | Chart gradients (vol surface, heatmaps, MC fans) |

Rule: color always encodes meaning in data surfaces. Amber = interactive,
green/red = direction, cyan = reference. Never decorative red/green.

### Typography

| Role | Face | Notes |
|---|---|---|
| Display (landing) | Cormorant Garamond / Playfair Display | Huge serif heroes, tight tracking, like the Meridian/EverSwap refs |
| UI / body | Inter | Labels, prose, nav |
| Data / mono | JetBrains Mono | Every number, ticker, code, table cell. Tabular numerals mandatory |

Scale: 12 / 13 / 14 / 16 / 20 / 28 / 40 / 64 / 96px. Data tables never below 12px.
Uppercase + `letter-spacing: 0.08em` for panel headers and function codes.

### Spacing, radius, elevation

- 4px base grid: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 96.
- Radius: `2px` inside the terminal (instruments are sharp), `8px` on landing cards.
- Elevation is **glow, not shadow**: focused panel gets a 1px amber border +
  `0 0 24px accent.amberGlow`. No soft grey drop shadows on dark surfaces.

### Motion

| Token | Value | Use |
|---|---|---|
| `dur.tick` | 120ms | Price flashes, hover states |
| `dur.fast` | 240ms | Panel focus, tabs, chips |
| `dur.base` | 400ms | Panel open/close, route fade |
| `dur.slow` | 800ms | Hero reveals, chart draw-in |
| `ease.out` | `cubic-bezier(0.16,1,0.3,1)` | Everything entering |
| `ease.inOut` | `cubic-bezier(0.65,0,0.35,1)` | Everything moving |

Signature moves: terminal **boot sequence** on login (staggered line-by-line),
**price flash** (bg pulses green/red 120ms on tick), **count-up numerals**,
**chart draw-in** (line paths animate stroke-dashoffset 800ms), **panel stagger**
(60ms cascade), landing **serif hero rise** + parallax. Respect
`prefers-reduced-motion`: swap all of it for opacity fades.

---

## 2. Components (states required for every one)

**Command Bar** — the soul of the terminal. Global, always focused on `/`.
Function codes: `HOME` `MK` (markets) `OC` (options chain) `MC` (monte carlo)
`ML` (signals) `CX` (correlations) `RISK` `SIGHT` (AI research). Autocomplete
dropdown with code + plain-English description. States: idle (ghost hint),
typing (amber caret), match (highlighted code), executed (green flash + toast),
unknown (shake 240ms + hint, never a dead end).

**Panel** — header bar (uppercase mono label, live badge, kebab), body, 1px
border. States: default / focused (amber glow) / loading (scanline shimmer, not
spinners) / error (red left rule + retry) / empty (see UX copy).

**Tape** — infinite marquee of tickers, pausable on hover, click pins to watchlist.

**Data table** — row hover raises bg, sorted column gets amber caret, price
cells flash on change, sticky header.

**Buttons** — primary (amber fill, black text), secondary (amber outline),
ghost (dim → amber on hover), destructive (red outline). All: hover lift 1px,
active press, disabled 40% + no pointer, loading = label swaps to mono ellipsis
animation, never width jump.

**Inputs** — dark field, 1px line.strong, amber focus ring + glow, inline
validation on blur, error text below in red with fix instruction.

**Chips / badges** — LIVE (pulsing green dot), DELAYED (amber), SIM (cyan) data-source badges on every panel.

**Toast** — bottom-right, mono, 4s, max 3 stacked, progress rule underneath.

---

## 3. Page specs

**Landing (`/`)** — cinematic noir. Full-bleed near-black hero, faint animated
market-line topography in background, giant serif headline, amber underline
accent, live simulated tape across the fold, scroll sections that alternate
serif editorial statements with live instrument previews (mini vol surface,
MC fan, signal cards) drawing in on scroll. Footer CTA repeats the hero.

**Login (`/login`)** — centered instrument card on black, boot-sequence intro
(`AUTHENTICATING… • SESSION KEY … • MARKET LINK …`), amber focus states,
register flips the card.

**Terminal (`/terminal`)** — the workstation. Top bar: brand, command bar,
clock (mono, seconds), connection chip. Left rail: function codes. Center
stage: chart + depth + tape. Right rail: watchlist, news/intel, AI SIGHT
panel. Bottom: status bar with command count + latency. Panels swap by
function code with 400ms stagger. Keyboard-first: `/` focus, `Esc` blur,
`↑↓` history, `Enter` execute.

**Risk (`/risk`)** — VaR cards (count-up), correlation heatmap (viridis),
contribution bars, MC portfolio fan chart, optimizer form → animated result.

---

## 4. UX Copy (voice: calm desk operator — precise, human, never robotic)

| Context | Copy |
|---|---|
| Command hint (idle) | `Type / to command · try MK for markets` |
| Unknown command | `No function ‘XYZ’. Closest match: MC — Monte Carlo. Enter to run it.` |
| Empty watchlist | `Nothing pinned yet. Click any ticker on the tape to track it here.` |
| Panel loading | `Pulling the latest…` (then skeleton) |
| Slow load (>3s) | `Still working — market data can take a moment.` |
| Error (data) | `Couldn’t reach the data feed. Your layout is untouched. Retry` |
| Login error | `That combination didn’t match. Check the email, or reset your password.` |
| Empty AI panel | `Ask anything about a ticker — earnings, risk, momentum. Try “why is NVDA moving”.` |
| Destructive confirm | `Clear this layout? Your watchlist stays. — Clear layout / Keep it` |
| Success toast | `MC 10,000 paths complete · 1.2s` |
| Logout | `Session closed. Markets keep moving — see you back on the desk.` |
| Landing hero | `The market, in focus.` sub: `FinSight is a research terminal for people who take their own view — live analytics, options, risk, and AI research on one desk.` |
| Primary CTA | `Open the terminal` (never “Submit”/“Get started”) |

Copy rules: verbs first on buttons, name the object in confirmations, every
error says what happened + what to do, no jargon on landing, no cuteness in
the terminal.

---

## 5. v2.1 — Next-gen additions (shipped)

**VS · 3D vol surface** — React Three Fiber; viridis mesh + amber wireframe, labeled STRIKE/EXPIRY/IV axes, auto-rotate until first interaction, orbit drag + scroll zoom, raycast hover → mono readout chip. Per-ticker deterministic smile/skew.

**⌘K command palette** — global; fuzzy function codes + natural language ("monte carlo nvda" → MC·NVDA). Recents on empty query, ↑↓/Enter, green execute pulse. Shares one parser with the `/` command bar.

**Focus mode dossier** — Enter on any ticker: workspace blurs/scales back 400ms; odometer price, session sparkline ribbon, fundamentals grid, IV rank dial, options strip, typed AI brief. Esc collapses.

**Replay time machine** — scrubber under HOME/MK chart (09:30–16:00), 1×/4×/16×; price, OHLC stats, depth ladder, and tape rewind in sync (seeded RNG); cyan REPLAY chip swaps for LIVE; snap-to-live flashes green.

**CX web view** — HEATMAP ↔ WEB toggle; d3-force graph, node size = vol, edge color/thickness = correlation sign/|ρ|, drag nodes, hover isolates, double-click → dossier. (Mount fix: useLayoutEffect + RAF + ResizeObserver.)

**Informative layer** — ⓘ on every panel flips (3D, 400ms) to What/Why/How explainer copy; AI INSIGHT strips under charts (cyan left rule); ML cards get BECAUSE expander (top-3 feature hbars); `?` keyboard overlay; 3-step spotlight tour on first visit (SVG mask cutouts, pointer-events none, dismissal persisted).

**Workspace presets** — DESK · QUANT · RESEARCH in status bar, 60ms cascade on switch, persisted. Watchlist mini-sparklines + session P&L ribbon. `CRT` command toggles scanline/phosphor overlay.

**v2.2 — Realism + UX pack** — Shared market engine (`src/lib/market.ts`): prevClose anchoring, factor model (SPY beta + idiosyncratic noise), per-ticker annualized vols (SPY 12% → TSLA 45%) consumed consistently by chart/OC/VS/MC, U-shaped volume, cent-level spreads, mixed red/green board, realistic book P&L (±0.2–1.5% notional). QUANT preset default. Added: price alerts + ALERTS rail section, compare overlay (`NVDA VS AAPL`), panel maximize ⛶, right-click ticker context menus, watchlist typeahead add, volume bars + VWAP + session high/low ghosts, market-state clock with countdown, 1–9 hotkeys (Alt shows hints), sentiment chips on intel headlines.

**v2.3 — Final pass** — Color discipline: neutral prices, dim-gray sparklines, Δ% is the only color carrier. Sectors strip fills rail voids; tabular number alignment everywhere; P&L ribbon gains intraday sparkline + day-range bar. Chart engine: LINE/AREA/CANDLES, 1D/1W/1M/1Y, LOG scale, TRENDLINE + FIB drawing tools (per-ticker persistence). Bloomberg-style linked ticker groups A (amber) / B (cyan) with header badges + relink flash. Landing hero embeds a live interactive mini-terminal (working MK/MC/VS command bar, engine-driven, non-interactive on mobile).

**v2.4 — Desk feel overhaul** — GridStage with draggable amber splitters (double-click resets); density pass (8px panel padding, 26–28px rows, slim 24px headers, Δ$/VOL watchlist columns, 10-level depth, inline OC IV/Δ + expiry/range filters). Interaction physics: global `.interactive` hover/press states, cursor click ripple, per-cell up/down flashes, panel focus rings (Tab cycles), idle shimmer after 30s. Discoverability: panel header toolbars, status-bar hint ticker + ⌘K/? chips, 5-step tour with `TOUR` replay command. SIGHT rebuilt as streaming research chat with prompt chips + cited ticker chips; ML signals use arc gauges + confidence trend sparklines.

**v3.0 — Risk-management product** — 12 functions: HOME MK OC MC GR ML CX VS BT STRAT RISK SIGHT (hotkeys 1–9 0 - =). MC rebuilt as rotatable 3D probability landscape (R3F, RUN sweep animation, probability arc gauges, ES). GR = 3D greeks surfaces (Δ Γ V Θ selector). OC intelligence: volume/OI heat bars, UNUSUAL flags, CALL/PUT walls (also ghosted on MK chart), max pain + P/C + IV rank strip, column definitions, strategy-builder drawer with interactive payoff diagrams and click-to-add legs. CX: MATRIX · WEB · DEPENDENCIES (per-ticker radial dependency network, curated supplier/customer/competitor data). HOME: index strip, sector treemap, movers, breadth gauges, typed AI desk brief. MK: EMA/BB/VWAP/RSI indicators, volume profile, news markers. RISK: multi-asset book (equities + GC CL NG HG SI W futures + options) with VaR suite (parametric/historical/MC), contribution treemap, net-greeks gauges, exposure + trade volumes + futures curves, STRESS LAB scenario waterfalls, HEDGE suggester with live APPLY. BT: template/saved strategies, equity vs benchmark, underwater chart, trade markers, stats grid, monthly heatmap, IS/OOS walk-forward. STRAT: visual rule builder (entry/exit/sizing blocks, Kelly slider), live signal preview, saved strategies feed BT. ML: analyst consensus (ratings bar, price targets, expected move, EPS beat history), factor scorecard, peers table, bull/bear cases. CRT removed.

**v3.1 — Fix + redesign pass** — RISK blank-screen regression fixed (h-screen container bug, visually verified). MC reframed around its question: plain-English header ("10,000 simulated futures — where could the price realistically go?"), elegant fan with p5/p25/p75/p95 bands, BEAR/BASE/BULL scenario cards with probabilities and human sentences, WHAT IS THIS explainer, 3D demoted to toggle. HOME treemap → SECTOR PULSE diverging-bar board. BT → lab: typed run sequence, equity race vs benchmark with live differential, staggered stat tiles, VERDICT banner, trade scrubber, rolling Sharpe. STRAT → wired instrument: pulsing circuit connectors, per-condition live mini-charts with ARMED/IDLE states, overfit HEALTH meter.

**v3.2 — Intelligence layer** — ML tabs: SIGNALS · REGIMES (HSMM ribbon, transition matrix, duration bars) · FORECAST (TFT multi-horizon cones + attention weights + MAPE) · DISCOVER (recommender cards with factor radars, stat-arb pairs with z-score bands). New ALT function: six alt-data signals (shipping congestion, weather/degree-days, TSLA deliveries, card spend, satellite parking, web traffic) each with correlation, lead-lag, and backtested hit rate. CX IMPACT: per-dependency elasticity table with regression scatters + SHOCK SIMULATOR (slider → animated propagation through the graph, per-node impact estimates). VS: ATM term structure, 25Δ skew by expiry, IV−RV rich/cheap readout, IV rank. GR: 6 surfaces (+VANNA/CHARM), dealer GEX profile with gamma-flip level, ATM greeks-by-expiry table, position greeks calculator with plain-English P&L lines. Rail: HOME MK OC MC GR ML CX VS ALT BT STRAT RISK SIGHT.

**v3.3 — Book logic + desk brief** — Demo book is now a first-class, user-editable store (`demoBook.ts`): P&L ribbon labeled "DEMO BOOK · click to inspect", click opens BookDrawer (positions table, add via typeahead, adjust qty, CLEAR with teaching empty state, RESET DEMO), persisted, and consumed live by P&L/RISK/DISCOVER; tour gained a book step. Right-rail collapse regression fixed (panel flip wrapper had zero-height absolute layout → proper flex min-height). HOME rebuilt as THE DESK BRIEF: serif date + market state line, typed AI brief, three instruments (SPY/VIX/BOOK), WHAT MOVED with explaining headlines, TODAY'S SETUP clickable play chips, compact sector pulse strip. OC: EXPECTED MOVE chip + cone overlay on the price chart, IV SMILE per-expiry mini-chart.

**v4.0 — Coherence overhaul** (see docs/UX_AUDIT.md for the full synthesis + handoff contract) — One enforced contract app-wide: Panel gains `subtitle` (plain-English narrative line) + `source` badge props; unified tabs; shared insight strip with cross-function JUMP chips (`jumpTo` helper wires ≥8 links: OC walls → GR GEX, regimes → MC, ALT → dossier…); every function screen carries a narrative subtitle; signature elements amplified (ALT hero signal card, ML regime ribbon). SSR hydration root-causes fixed (deterministic session bootstrap via Math.random/Date.now shim; client-only time/random renders). Permanent regression suite: `scripts/smoke.spec.py` walks landing → terminal → all 13 hotkeys → P&L drawer → RISK tabs, failing on error boundaries, sub-40px panel bodies, or pageerrors.

---

## 6. Accessibility

Contrast ≥ 4.5:1 for all text on `bg.base/panel` (all tokens above pass),
never color-only direction (▲▼ glyphs accompany green/red), full keyboard
map, visible amber focus ring everywhere, `prefers-reduced-motion` honored,
tape pauses on hover/focus.
