// Historical elasticity model — for the DEPENDENCIES → IMPACT sub-mode.
// Deterministic per (parent, child) pair.

import { depsOf, type DepEdge, type DepType } from "@/lib/dependencies";

function hash(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}
function seedNormal(seed: number): number[] {
  const r = rng(seed);
  return Array.from({ length: 120 }, () => (r() + r() + r() + r() + r() + r() - 3));
}

export type Elasticity = {
  dep: DepEdge;
  beta: number;          // pct-change coefficient (child → parent)
  hitRate: number;       // 0..1
  lag: number;           // days
  scatter: { x: number; y: number }[]; // dep-return% vs parent-return%
  regressionMB: { m: number; b: number };
};

const SIGN: Record<DepType, number> = {
  supplier: +1,
  customer: +1,
  competitor: -1,
  sector: +1,
  index: +1,
};

export function elasticitiesFor(symbol: string): Elasticity[] {
  const edges = depsOf(symbol);
  return edges.map((e) => {
    const seed = hash(`${symbol}:${e.id}`);
    const r = rng(seed);
    // Base elasticity scaled by tie strength & type sign.
    const beta = SIGN[e.type] * (0.15 + e.strength * 0.75) * (0.7 + r() * 0.6);
    const hitRate = 0.5 + Math.abs(beta) * 0.35 + (r() - 0.5) * 0.1;
    const lag = e.type === "supplier" ? 0 : e.type === "customer" ? 1 : e.type === "competitor" ? 1 : 0;
    // Build scatter: normal noise around regression y = beta * x
    const xs = seedNormal(seed);
    const ys = seedNormal(seed + 1).map((n, i) => beta * xs[i] + n * 0.4);
    const scatter = xs.map((x, i) => ({ x, y: ys[i] }));
    return { dep: e, beta, hitRate: Math.min(0.97, Math.max(0.4, hitRate)), lag, scatter, regressionMB: { m: beta, b: 0 } };
  });
}

// Simple graph propagation: apply shock to a node, propagate outward.
// Since the graph is a curated star (focus → deps), we apply beta directly.
// Returns { [nodeId]: { impactPct, confidencePct } }.
export function propagateShock(focus: string, shockedNode: string, shockPct: number): Record<string, { impact: number; conf: number }> {
  const out: Record<string, { impact: number; conf: number }> = {};
  const focusEls = elasticitiesFor(focus);
  // If shocked node IS focus: shock is its own impact (100%).
  if (shockedNode === focus) {
    out[focus] = { impact: shockPct, conf: 0.99 };
    for (const e of focusEls) out[e.dep.id] = { impact: shockPct * (1 / (e.beta || 1)) * 0.4, conf: 0.35 };
    return out;
  }
  const dep = focusEls.find((e) => e.dep.id === shockedNode);
  if (!dep) return out;
  const focusImpact = dep.beta * shockPct;
  out[shockedNode] = { impact: shockPct, conf: 0.99 };
  out[focus] = { impact: focusImpact, conf: dep.hitRate };
  // Secondary — spillover to other dependencies via focus.
  for (const e of focusEls) {
    if (e.dep.id === shockedNode || e.dep.id === focus) continue;
    // spillover discounted heavily
    out[e.dep.id] = { impact: e.beta * focusImpact * 0.25, conf: dep.hitRate * e.hitRate * 0.7 };
  }
  return out;
}
