// Black-Scholes greeks surface generator (call option). Returns a grid
// values indexed by [expiryIdx][strikeIdx], plus meta.

import { annualVolOf } from "@/lib/market";

export type Greek = "DELTA" | "GAMMA" | "VEGA" | "THETA" | "VANNA" | "CHARM";

function normPdf(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
function normCdf(x: number) {
  // Abramowitz & Stegun approx
  const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937,
    b4 = -1.821255978, b5 = 1.330274429, p = 0.2316419;
  const a = Math.abs(x);
  const t = 1 / (1 + p * a);
  const y = 1 - normPdf(a) * (b1 * t + b2 * t * t + b3 * t ** 3 + b4 * t ** 4 + b5 * t ** 5);
  return x >= 0 ? y : 1 - y;
}

export type GreeksSurface = {
  strikes: number[]; // % moneyness offsets
  expiries: number[]; // days
  values: number[][]; // values[expiryIdx][strikeIdx]
  min: number;
  max: number;
  greek: Greek;
};

export function generateGreeksSurface(symbol: string, spot: number, greek: Greek): GreeksSurface {
  const sigma = annualVolOf(symbol);
  const r = 0.045;
  const strikes: number[] = [];
  for (let k = -25; k <= 25; k += 2.5) strikes.push(k);
  const expiries = [7, 14, 30, 45, 60, 90, 120, 180, 270, 365];

  const values: number[][] = expiries.map((days) => {
    const T = Math.max(1 / 365, days / 365);
    return strikes.map((kPct) => {
      const K = spot * (1 + kPct / 100);
      const d1 = (Math.log(spot / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      switch (greek) {
        case "DELTA":
          return normCdf(d1);
        case "GAMMA":
          return normPdf(d1) / (spot * sigma * Math.sqrt(T));
        case "VEGA":
          return (spot * normPdf(d1) * Math.sqrt(T)) / 100;
        case "THETA":
          return (
            -(spot * normPdf(d1) * sigma) / (2 * Math.sqrt(T)) / 365 -
            r * K * Math.exp(-r * T) * normCdf(d2) / 365
          );
        case "VANNA":
          // dDelta/dVol — per 1% vol
          return -(normPdf(d1) * d2 / sigma) / 100;
        case "CHARM":
          // dDelta/dTime — per day, long call
          return -normPdf(d1) * (2 * (r) * T - d2 * sigma * Math.sqrt(T)) / (2 * T * sigma * Math.sqrt(T)) / 365;
      }
    });
  });

  let min = Infinity, max = -Infinity;
  for (const row of values) for (const v of row) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { strikes, expiries, values, min, max, greek };
}

export const GREEK_EXPLAINER: Record<Greek, string> = {
  DELTA: "Delta rises from 0 to 1 as calls move deep ITM. The transition sharpens with time decay — the ridge steepens near expiry.",
  GAMMA: "Gamma peaks at-the-money and collapses with time. Short-dated ATM strikes concentrate pin risk — the ridge is the dealer's problem.",
  VEGA: "Vega is largest for long-dated ATM strikes — sensitivity to vol scales with √T. The surface tilts UP with expiry.",
  THETA: "Theta bleeds accelerate as expiry approaches, worst at-the-money. The ridge dives negative near the front — that's the daily rent.",
  VANNA: "Vanna links delta and vol — when vol jumps, ITM/OTM deltas move opposite. Dealers with vanna exposure hedge in bursts.",
  CHARM: "Charm is delta bleed per day — quiet in the middle, violent near expiry ATM. It's why pin-risk hedges get expensive Friday afternoon.",
};
