// HSMM (hidden semi-Markov) style regime detection — simulated.
// Deterministic per symbol so the tape is stable across renders.

import { dailyHistory, annualVolOf } from "@/lib/market";

export type RegimeKind = "LOW_VOL_BULL" | "HIGH_VOL_BEAR" | "CHOP" | "CRISIS";

export type RegimeSpan = { start: number; end: number; kind: RegimeKind };

export const REGIME_META: Record<RegimeKind, { label: string; color: string; short: string }> = {
  LOW_VOL_BULL:  { label: "LOW-VOL BULL",  color: "#42C98B", short: "BULL" },
  HIGH_VOL_BEAR: { label: "HIGH-VOL BEAR", color: "#F06464", short: "BEAR" },
  CHOP:          { label: "CHOP",          color: "#F0A929", short: "CHOP" },
  CRISIS:        { label: "CRISIS",        color: "#B58BF0", short: "CRISIS" },
};

const KINDS: RegimeKind[] = ["LOW_VOL_BULL", "HIGH_VOL_BEAR", "CHOP", "CRISIS"];

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

export type RegimeAnalysis = {
  bars: { t: number; p: number }[];
  spans: RegimeSpan[];
  current: RegimeSpan;
  age: number;                // days in current span
  medianStay: Record<RegimeKind, number>;
  expectedRemaining: number;  // days remaining in current
  transitionMatrix: number[][]; // 4x4 row-stochastic
  transitionRisk: number;     // 0..1 heuristic
};

export function analyzeRegime(symbol: string, days = 252): RegimeAnalysis {
  const bars = dailyHistory(symbol, days);
  const vol = annualVolOf(symbol);
  const r = rng(hash(symbol + ":regimes"));
  // Median stay influenced by vol; higher vol = shorter regimes.
  const medianStay: Record<RegimeKind, number> = {
    LOW_VOL_BULL: Math.round(48 - vol * 60),  // e.g. sigma 0.25 → ~33
    HIGH_VOL_BEAR: Math.round(22 - vol * 20),
    CHOP: 15,
    CRISIS: 8,
  };
  // Ensure minimums.
  (Object.keys(medianStay) as RegimeKind[]).forEach((k) => medianStay[k] = Math.max(6, medianStay[k]));

  // Sample sequence of spans covering days.
  const spans: RegimeSpan[] = [];
  let cursor = 0;
  let cur: RegimeKind = "LOW_VOL_BULL";
  while (cursor < bars.length) {
    // duration ~ Gamma-ish (sum of 3 exponentials => less variance)
    const m = medianStay[cur];
    const dur = Math.max(3, Math.round(m * (0.6 + 1.4 * r())));
    const end = Math.min(bars.length, cursor + dur);
    spans.push({ start: cursor, end, kind: cur });
    cursor = end;
    if (cursor >= bars.length) break;
    // choose next regime via biased transitions.
    const roll = r();
    if (cur === "LOW_VOL_BULL") cur = roll < 0.55 ? "CHOP" : roll < 0.9 ? "HIGH_VOL_BEAR" : "CRISIS";
    else if (cur === "HIGH_VOL_BEAR") cur = roll < 0.4 ? "CHOP" : roll < 0.85 ? "LOW_VOL_BULL" : "CRISIS";
    else if (cur === "CRISIS") cur = roll < 0.7 ? "HIGH_VOL_BEAR" : "CHOP";
    else /* CHOP */ cur = roll < 0.5 ? "LOW_VOL_BULL" : roll < 0.85 ? "HIGH_VOL_BEAR" : "CRISIS";
  }
  const current = spans[spans.length - 1];
  const age = bars.length - current.start;
  const expectedRemaining = Math.max(1, Math.round(medianStay[current.kind] - age * 0.6));
  // Transition matrix — empirical from spans; smoothed.
  const M: number[][] = KINDS.map(() => KINDS.map(() => 0.02));
  for (let i = 0; i < spans.length - 1; i++) {
    M[KINDS.indexOf(spans[i].kind)][KINDS.indexOf(spans[i + 1].kind)] += 1;
  }
  const norm = M.map((row) => {
    const s = row.reduce((a, b) => a + b, 0);
    return row.map((v) => v / (s || 1));
  });
  // Transition risk = age / median → 0..~1
  const transitionRisk = Math.max(0, Math.min(1, age / (medianStay[current.kind] * 1.2)));
  return { bars, spans, current, age, medianStay, expectedRemaining, transitionMatrix: norm, transitionRisk };
}

export const REGIME_KINDS = KINDS;
