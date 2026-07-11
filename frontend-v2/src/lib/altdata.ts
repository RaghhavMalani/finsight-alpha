// Alternative-data signals — simulated but internally consistent, deterministic per key.

export type AltKind = "SHIPPING" | "WEATHER" | "EV" | "CARD" | "SATELLITE" | "WEB";

export type AltSignal = {
  kind: AltKind;
  title: string;
  unit: string;
  ticker: string;
  correlation: number;   // signed, absolute up to ~0.7
  leadWeeks: number;     // positive = signal leads
  hitRate: number;       // 0..1
  thesis: string;
  series: { t: number; v: number }[]; // last ~60 weekly points
  overlayTicker?: { sym: string; series: { t: number; v: number }[] };
  callout: string;
  lastValue: number;
  changePct: number;     // vs prior period
};

function hash(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

function ar1(n: number, mean: number, amp: number, seed: number, trend = 0): number[] {
  const r = rng(seed);
  const out: number[] = [];
  let v = mean;
  for (let i = 0; i < n; i++) {
    v = mean + 0.8 * (v - mean) + (r() - 0.5) * amp + trend * i / n;
    out.push(v);
  }
  return out;
}

function series(seed: string, n: number, base: number, amp: number, trend = 0): { t: number; v: number }[] {
  const arr = ar1(n, base, amp, hash(seed), trend);
  const now = Date.now();
  return arr.map((v, i) => ({ t: now - (n - i - 1) * 7 * 86_400_000, v }));
}

export function altSignals(): AltSignal[] {
  const sh = series("shipping", 60, 100, 12, +18); // rising congestion
  const shOverlay = series("shipping.amzn", 60, 220, 6, +8);
  const shLast = sh[sh.length - 1].v;

  const we = series("weather", 60, 0, 2.5, +1.2); // HDD anomaly rising
  const weOverlay = series("weather.ng", 60, 3.5, 0.35, +0.3);

  const ev = series("evdeliveries", 24, 350_000, 55_000, +40_000); // Monthly TSLA deliveries (Ks)
  const evOverlay = series("evdeliveries.tsla", 24, 235, 25, +18);

  const card = series("cardspend", 60, 100, 2.4, -3); // discretionary softening
  const cardOverlay = series("cardspend.amzn", 60, 215, 6, -4);

  const sat = series("satellite", 60, 62, 4.5, +6); // parking lot fill %
  const satOverlay = series("satellite.wmt", 60, 165, 5, +6);

  const web = series("webtraffic", 60, 100, 8, +14);
  const webOverlay = series("webtraffic.meta", 60, 480, 15, +25);

  const pctChange = (arr: { v: number }[]) => {
    const n = arr.length;
    return ((arr[n - 1].v - arr[Math.max(0, n - 8)].v) / (arr[Math.max(0, n - 8)].v || 1)) * 100;
  };

  return [
    {
      kind: "SHIPPING", title: "Port congestion index · LA/LB", unit: "index",
      ticker: "AMZN", correlation: -0.61, leadWeeks: 3, hitRate: 0.68,
      thesis: "Congestion adds freight cost and delays inventory turns — margin pressure on retail 3 weeks out.",
      series: sh, overlayTicker: { sym: "AMZN", series: shOverlay },
      callout: `Congestion ${shLast.toFixed(0)} · above 5Y avg`,
      lastValue: shLast, changePct: pctChange(sh),
    },
    {
      kind: "WEATHER", title: "Heating-degree-day anomaly · US", unit: "σ",
      ticker: "NG=F", correlation: 0.72, leadWeeks: 2, hitRate: 0.74,
      thesis: "Colder-than-normal draws natgas storage; +1σ HDD historically lifts NG ~4% over 2 weeks.",
      series: we, overlayTicker: { sym: "NG", series: weOverlay },
      callout: `Anomaly ${we[we.length - 1].v.toFixed(1)}σ · cold-biased`,
      lastValue: we[we.length - 1].v, changePct: pctChange(we),
    },
    {
      kind: "EV", title: "Monthly EV deliveries · TSLA", unit: "units",
      ticker: "TSLA", correlation: 0.58, leadWeeks: 4, hitRate: 0.63,
      thesis: "Delivery surprise leads quarter — investor reaction typically prices in 3-4 weeks post-print.",
      series: ev, overlayTicker: { sym: "TSLA", series: evOverlay },
      callout: `Latest ${(ev[ev.length - 1].v / 1000).toFixed(0)}k · +${pctChange(ev).toFixed(1)}% QoQ`,
      lastValue: ev[ev.length - 1].v, changePct: pctChange(ev),
    },
    {
      kind: "CARD", title: "Consumer discretionary card spend", unit: "index",
      ticker: "AMZN", correlation: 0.66, leadWeeks: 2, hitRate: 0.71,
      thesis: "Card spend leads reported retail sales; softness precedes downward revisions.",
      series: card, overlayTicker: { sym: "AMZN", series: cardOverlay },
      callout: `Spend index ${card[card.length - 1].v.toFixed(0)} · softening`,
      lastValue: card[card.length - 1].v, changePct: pctChange(card),
    },
    {
      kind: "SATELLITE", title: "Retail parking-lot fill %", unit: "%",
      ticker: "WMT", correlation: 0.54, leadWeeks: 3, hitRate: 0.66,
      thesis: "Fill % is a proxy for foot-traffic — leads same-store-sales surprise by ~3 weeks.",
      series: sat, overlayTicker: { sym: "WMT", series: satOverlay },
      callout: `Fill ${sat[sat.length - 1].v.toFixed(0)}% · above 90D avg`,
      lastValue: sat[sat.length - 1].v, changePct: pctChange(sat),
    },
    {
      kind: "WEB", title: "Site-visit growth · top platforms", unit: "%",
      ticker: "META", correlation: 0.49, leadWeeks: 5, hitRate: 0.61,
      thesis: "Traffic growth is a leading indicator of ad-revenue surprise; +5% growth ↔ +2% rev surprise probability.",
      series: web, overlayTicker: { sym: "META", series: webOverlay },
      callout: `Traffic +${pctChange(web).toFixed(1)}% MoM`,
      lastValue: web[web.length - 1].v, changePct: pctChange(web),
    },
  ];
}
