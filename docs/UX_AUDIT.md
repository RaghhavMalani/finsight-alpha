# FinSight UX Audit — Research Synthesis & Handoff

**Method:** Session feedback synthesis | **Participant:** Owner (P1) | **Rounds:** 9 | **Date:** 2026-07-10

## Executive Summary

The owner consistently praises individual showpieces in aesthetic terms while rejecting
the whole experience ("the UX is ass"). The product accreted 13 function screens across
rapid passes; each pass added capability but diverged in layout, explanation, and polish.
The failure mode is coherence, not capability. Three regressions (blank RISK, /terminal
crash, collapsed rail) compounded distrust.

## Key Themes

**T1 — Coherence deficit (9/9 rounds).** Parts praised ("VS is sexy", "OC amazing",
"home page sexy as fuck"), whole rejected ("6/10", "7/10", "UX is ass"). Bespoke panels,
tabs, charts, and states diverged per screen. → One enforced contract: Panel, Tabs,
ChartFrame, table, state patterns.

**T2 — Explanation deficit (5 rounds).** "I still didn't understand what is that" (MC, twice),
"why is this there... no logic" (P&L ribbon), "no definition, no abnormality" (OC),
"give information". Screens that explain themselves (post-redesign MC, OC) get praised.
→ Every screen: one plain-English header line; every viz: insight strip; every metric: ⓘ.

**T3 — Quality bar = cinematic showpieces (6 rounds).** "Insane", "sexy", "crazy" for hero /
VS / CX / OC; "boring", "looks copied", "badly cooked" for BT / STRAT / sector treemap.
Generic dashboard layouts read as failure regardless of function. → One signature element
per screen, dominant in the layout.

**T4 — Regressions destroy trust (3 incidents).** "You degraded so badly... full screen is
blank" (RISK, CSS height bug); /terminal crash (IWM missing from engine CFG); collapsed
right rail (zero-height flip wrapper). Each followed a pass that "passed" typecheck.
→ Permanent Playwright smoke suite walking all screens, failing on error boundaries,
blank panels, and pageerrors.

**T5 — Decision support over display (4 rounds).** "Helping to make better decisions",
"software helping in risk management", asked for strategies, analyst data, hedge
suggestions. → Every panel terminates in an actionable readout or jump chip.

## Insights → Opportunities

| Insight | Opportunity | Impact | Effort |
|---|---|---|---|
| Parts loved, whole rejected | System enforcement sweep | High | Med |
| Unexplained = rejected | Narrative layer everywhere | High | Low |
| Generic = "copied" | Signature-moment audit per screen | High | Med |
| Regressions ship unseen | Visual regression suite in repo | High | Low |
| Displays ≠ decisions | Jump chips + actionable readouts | Med | Low |

## Handoff Contract (enforced app-wide)

**Panel:** 24px header — mono-caps label · source badge (LIVE/SIM) · group badge (A/B) ·
toolbar chips · ⓘ · maximize. Body padding `8px`. States: default / focused (amber ring +
glow) / loading (scanline) / error (red left rule + retry + human copy) / empty (teaching
copy naming the command). No bespoke panel variants permitted.

**Tabs:** single underline-chip component (CX/ML/RISK unified).

**ChartFrame:** shared axes (`--divider` grid), crosshair with snap + mono readout chip,
insight-strip slot at bottom (cyan left rule). All 2D charts render inside it.

**Tables:** mono tabular numerals, right-aligned numerics, 2-decimal prices, thousands
separators, 26–28px rows, hover raise, sticky headers.

**Type:** 10/12/13/16/20px in-app; serif only in hero-level statements (landing, HOME
brief, dossier headline, 404). Spacing on the 4px scale only.

**Motion:** 120/240/400/800ms, `cubic-bezier(0.16,1,0.3,1)`; transform/opacity only;
`prefers-reduced-motion` honored.

**Narrative:** every function screen opens with one plain-English line — what you're
looking at + the question it answers. Every major viz ends in an AI insight strip.
Minimum 8 cross-function jump chips wired.

**Verification:** `scripts/smoke.spec` walks landing → login → terminal → all 13
functions → drawers/tabs; fails on error-boundary text, panel bodies under 40px height,
or console pageerrors. Run on every change.

## Questions for Further Research

Whether the 13-function rail should collapse into grouped sections (MARKETS / QUANT /
MANAGE / AI); whether QUANT preset default matches actual usage once real users arrive.
