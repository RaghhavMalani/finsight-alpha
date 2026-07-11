// "Because your book holds X" style collaborative-filter recommendations
// and a naive stat-arb pair finder — all deterministic and simulated.

import { TICKERS, dailyHistory, correlationMatrix } from "@/lib/market";

export type FactorScore = { name: string; v: number }; // 0..1
export type Suggestion = {
  sym: string;
  similarity: number;    // 0..1
  diversificationDelta: number; // negative = adds diversification
  factors: FactorScore[]; // 5 axes
  because: string;
};

export type Pair = {
  a: string; b: string;
  correlation: number;   // long-run
  z: number;             // current spread z-score
  spread: number[];      // last 90D z-scores
  entryZ: number;
  exitZ: number;
  hint: string;
};

const FACTOR_AXES = ["momentum", "quality", "value", "growth", "volatility"];

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

function factorsFor(sym: string): FactorScore[] {
  const r = rng(hash(sym + ":factor"));
  return FACTOR_AXES.map((name) => ({ name, v: 0.15 + r() * 0.85 }));
}

export function recommendationsFor(book: string[]): { suggestions: Suggestion[]; pairs: Pair[] } {
  const universe = TICKERS.filter((t) => !book.includes(t));
  const bookFactors = book.map(factorsFor);
  const bookAvg = FACTOR_AXES.map((_, i) => bookFactors.reduce((s, f) => s + f[i].v, 0) / (book.length || 1));

  const scored = universe.map((sym) => {
    const f = factorsFor(sym);
    // Similarity = 1 - avg abs distance on factor axes.
    const dist = f.reduce((s, x, i) => s + Math.abs(x.v - bookAvg[i]), 0) / f.length;
    const similarity = Math.max(0, 1 - dist);
    // Diversification proxy — random-ish but biased by symbol hash.
    const r = rng(hash(sym + ":div"));
    const diversificationDelta = -0.05 - r() * 0.35;
    const strongest = [...f].sort((a, b) => b.v - a.v)[0];
    const because = `High ${strongest.name}. Adds ${diversificationDelta.toFixed(2)} correlation to book.`;
    return { sym, similarity, diversificationDelta, factors: f, because };
  }).sort((a, b) => b.similarity - a.similarity);

  const suggestions = scored.slice(0, 4);

  // Pairs — pick highest-correlation pairs from a subset, deterministic.
  const subset = TICKERS.filter((t) => t !== "BTC-USD").slice(0, 10);
  const M = correlationMatrix(subset);
  const cand: { a: string; b: string; c: number }[] = [];
  for (let i = 0; i < subset.length; i++)
    for (let j = i + 1; j < subset.length; j++)
      cand.push({ a: subset[i], b: subset[j], c: M[i][j] });
  cand.sort((x, y) => y.c - x.c);
  const pairs: Pair[] = cand.slice(0, 2).map(({ a, b, c }) => buildPair(a, b, c));
  return { suggestions, pairs };
}

function buildPair(a: string, b: string, c: number): Pair {
  const ha = dailyHistory(a, 90);
  const hb = dailyHistory(b, 90);
  // spread = log(a) - beta*log(b), where beta is a naive ratio.
  const beta = ha[0].p / hb[0].p;
  const raw = ha.map((x, i) => Math.log(x.p) - Math.log(hb[i].p * beta));
  const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
  const sd = Math.sqrt(raw.reduce((s, v) => s + (v - mean) ** 2, 0) / raw.length) || 1e-6;
  const spread = raw.map((v) => (v - mean) / sd);
  const z = spread[spread.length - 1];
  return {
    a, b,
    correlation: c,
    z,
    spread,
    entryZ: 2.0,
    exitZ: 0.5,
    hint: `ρ=${c.toFixed(2)} · Long ${z < 0 ? a : b} / Short ${z < 0 ? b : a} when |z|≥2, exit at 0.5.`,
  };
}
