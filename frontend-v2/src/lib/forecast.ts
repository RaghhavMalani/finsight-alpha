// TFT-inspired multi-horizon forecast — simulated point + interval.
// Deterministic per symbol so the picture is stable.

import { annualVolOf, dailyHistory } from "@/lib/market";

export type Horizon = 1 | 5 | 21;
export const HORIZONS: Horizon[] = [1, 5, 21];
export const HORIZON_LABEL: Record<Horizon, string> = { 1: "1D", 5: "1W", 21: "1M" };

export type ForecastPoint = { t: number; p: number; lo?: number; hi?: number };
export type Attention = { name: string; weight: number };
export type HorizonAccuracy = { h: Horizon; mape: number; dirAcc: number };

export type Forecast = {
  history: ForecastPoint[]; // last N observed
  forecast: ForecastPoint[]; // N future points with lo/hi
  attention: Attention[];
  accuracy: HorizonAccuracy[];
  drift: number;
};

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

export function forecastFor(symbol: string): Forecast {
  const history = dailyHistory(symbol, 90).map((b) => ({ t: b.t, p: b.p }));
  const last = history[history.length - 1];
  const sigmaD = annualVolOf(symbol) / Math.sqrt(252);
  const r = rng(hash(symbol + ":tft"));
  // biased drift per ticker (deterministic)
  const drift = (r() - 0.45) * 0.006; // roughly ±0.6% daily
  const forecast: ForecastPoint[] = [];
  let p = last.p;
  const nAhead = 21;
  for (let i = 1; i <= nAhead; i++) {
    p = p * (1 + drift + (r() - 0.5) * sigmaD * 0.4);
    const band = sigmaD * Math.sqrt(i) * last.p * 1.96;
    forecast.push({ t: last.t + i * 86_400_000, p, lo: p - band, hi: p + band });
  }
  // Attention weights per ticker — deterministic but varying.
  const base: Attention[] = [
    { name: "price momentum", weight: 0.34 },
    { name: "vol regime",     weight: 0.22 },
    { name: "sector flow",    weight: 0.18 },
    { name: "rates",          weight: 0.14 },
    { name: "news sentiment", weight: 0.12 },
  ];
  const noise = base.map((a) => ({ ...a, weight: Math.max(0.03, a.weight + (r() - 0.5) * 0.14) }));
  const sum = noise.reduce((s, a) => s + a.weight, 0);
  const attention = noise.map((a) => ({ ...a, weight: a.weight / sum })).sort((a, b) => b.weight - a.weight);
  const accuracy: HorizonAccuracy[] = HORIZONS.map((h) => ({
    h,
    mape: 0.4 + h * 0.15 + r() * 0.4,       // % — grows with horizon
    dirAcc: Math.max(0.48, 0.62 - h * 0.005 - r() * 0.06),
  }));
  return { history, forecast, attention, accuracy, drift };
}
