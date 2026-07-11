// FinSight book — multi-asset simulated portfolio.
// Equities + commodities futures + option positions. All consistent, all mock.

import { seedInstrument, TICKERS } from "./market";
import { getDemoBook, subscribeDemoBook } from "./demoBook";


export type AssetClass = "EQUITY" | "COMMODITY" | "OPTION";

export type Position = {
  id: string;
  cls: AssetClass;
  symbol: string;
  name: string;
  qty: number;         // shares / contracts
  entry: number;
  mark: number;
  pnl: number;
  mv: number;          // market value (signed for shorts)
  gross: number;       // |mv|
  sector?: string;
  beta?: number;
  vol: number;         // annualized vol
  // options only
  optType?: "C" | "P";
  strike?: number;
  daysToExpiry?: number;
  delta?: number;      // per contract
  gamma?: number;
  vega?: number;
  theta?: number;
};

// ─── Commodity spec ──────────────────────────────────────────────────
export type CommodityCfg = {
  symbol: string;      // ticker
  name: string;
  contractSize: number;
  multiplier: number;  // $ per unit
  spot: number;
  vol: number;         // annualized
  curveShape: "contango" | "backwardation" | "flat";
  slope: number;       // %/month (positive=contango)
};

export const COMMODITIES: Record<string, CommodityCfg> = {
  GC: { symbol: "GC", name: "Gold",     contractSize: 100,   multiplier: 100,   spot: 2680.50, vol: 0.16, curveShape: "contango",      slope:  0.30 },
  CL: { symbol: "CL", name: "WTI Crude", contractSize: 1000, multiplier: 1000,  spot:   74.82, vol: 0.32, curveShape: "backwardation", slope: -0.85 },
  NG: { symbol: "NG", name: "Nat Gas",   contractSize: 10000, multiplier: 10000, spot:    3.42, vol: 0.55, curveShape: "contango",      slope:  1.80 },
  HG: { symbol: "HG", name: "Copper",    contractSize: 25000, multiplier: 25000, spot:    4.28, vol: 0.24, curveShape: "contango",      slope:  0.45 },
  SI: { symbol: "SI", name: "Silver",    contractSize: 5000,  multiplier: 5000,  spot:   31.65, vol: 0.28, curveShape: "backwardation", slope: -0.20 },
  W:  { symbol: "W",  name: "Wheat",     contractSize: 5000,  multiplier: 5000,  spot:    5.62, vol: 0.28, curveShape: "contango",      slope:  0.65 },
};

export function futuresCurve(sym: string): { month: number; label: string; price: number }[] {
  const c = COMMODITIES[sym];
  if (!c) return [];
  const months = 12;
  const now = new Date();
  const monthNames = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const label = `${monthNames[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
    const drift = (c.slope / 100) * (i + 1);
    // small curvature so it's not linear
    const curv = Math.sin(i / 3) * (Math.abs(c.slope) / 100) * 0.25;
    const price = c.spot * (1 + drift + curv);
    return { month: i, label, price };
  });
}

// ─── Build book ──────────────────────────────────────────────────────
function bs(spot: number, K: number, T: number, sigma: number, r: number, type: "C" | "P") {
  // Black-Scholes with rough greeks
  const s = spot, k = K, t = Math.max(0.001, T);
  const sqT = Math.sqrt(t);
  const d1 = (Math.log(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * sqT);
  const d2 = d1 - sigma * sqT;
  const N = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
  const n = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const price = type === "C"
    ? s * N(d1) - k * Math.exp(-r * t) * N(d2)
    : k * Math.exp(-r * t) * N(-d2) - s * N(-d1);
  const delta = type === "C" ? N(d1) : N(d1) - 1;
  const gamma = n(d1) / (s * sigma * sqT);
  const vega = s * n(d1) * sqT * 0.01; // per 1 vol pt
  const theta = (-(s * n(d1) * sigma) / (2 * sqT)
    - (type === "C" ? 1 : -1) * r * k * Math.exp(-r * t) * (type === "C" ? N(d2) : N(-d2))) / 365;
  return { price, delta, gamma, vega, theta };
}
function erf(x: number) {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

const EQUITY_SECTORS: Record<string, string> = {
  NVDA: "Technology", AAPL: "Technology", MSFT: "Technology", META: "Comm Svcs",
  GOOGL: "Comm Svcs", AMZN: "Cons Disc.", TSLA: "Cons Disc.", SPY: "Broad", QQQ: "Technology", "BTC-USD": "Crypto",
};
const COMMODITY_SECTOR: Record<string, string> = {
  GC: "Precious", SI: "Precious", CL: "Energy", NG: "Energy", HG: "Metals", W: "Agri",
};

export type Book = {
  positions: Position[];
  nav: number;
  gross: number;
  net: number;
  long: number;
  short: number;
  pnlDay: number;
  updatedAt: number;
};

const NAV_BASE = 10_000_000;

// Positions template — realistic sizing on a $10M book
const TEMPLATE = {
  equities: [
    { sym: "NVDA", qty:  8000, entryOffset: -0.062 },
    { sym: "AAPL", qty:  4200, entryOffset:  0.018 },
    { sym: "MSFT", qty:  1800, entryOffset: -0.024 },
    { sym: "META", qty:  1400, entryOffset:  0.041 },
    { sym: "GOOGL", qty: 3400, entryOffset: -0.011 },
    { sym: "AMZN", qty: -2200, entryOffset:  0.032 },  // short
    { sym: "TSLA", qty: -1800, entryOffset:  0.058 },  // short
    { sym: "SPY",  qty:  1200, entryOffset:  0.007 },
  ],
  commodities: [
    { sym: "GC",  qty:  8 },
    { sym: "CL",  qty: 20 },
    { sym: "NG",  qty: -15 }, // short
    { sym: "HG",  qty: 10 },
    { sym: "SI",  qty:  6 },
  ],
  options: [
    { under: "SPY",  type: "P" as const, strikeOffset: -0.03, dte: 30, qty: -15 }, // short put — collect premium
    { under: "NVDA", type: "C" as const, strikeOffset:  0.05, dte: 45, qty:  25 }, // long call
  ],
};

function buildPositions(): Position[] {
  const out: Position[] = [];
  const insts: Record<string, ReturnType<typeof seedInstrument>> = {};
  for (const s of TICKERS) insts[s] = seedInstrument(s);

  // Equities — pull from the shared demo book so RISK reads user edits.
  let equityPositions: Array<{ symbol: string; qty: number; entry: number }> = getDemoBook();
  if (!equityPositions.length) {
    equityPositions = TEMPLATE.equities.map((e) => {
      const inst = insts[e.sym];
      const entry = (inst?.prevClose ?? 100) * (1 + e.entryOffset);
      return { symbol: e.sym, qty: e.qty, entry };
    });
  }
  for (const e of equityPositions) {
    const inst = insts[e.symbol];
    if (!inst) continue;
    const mv = e.qty * inst.price;
    out.push({
      id: `EQ-${e.symbol}`, cls: "EQUITY", symbol: e.symbol, name: inst.name,
      qty: e.qty, entry: e.entry, mark: inst.price,
      pnl: (inst.price - e.entry) * e.qty,
      mv, gross: Math.abs(mv),
      sector: EQUITY_SECTORS[e.symbol] ?? "Other",
      beta: inst.beta, vol: inst.annualVol,
    });
  }

  // Commodities futures
  for (const c of TEMPLATE.commodities) {
    const cfg = COMMODITIES[c.sym];
    if (!cfg) continue;
    // small mark drift so P&L isn't 0
    const drift = (Math.sin((cfg.spot * 13) % 6.28)) * 0.008;
    const mark = cfg.spot * (1 + drift);
    const entry = cfg.spot * (1 - drift * 0.7);
    const mv = c.qty * mark * cfg.multiplier;
    out.push({
      id: `CM-${c.sym}`, cls: "COMMODITY", symbol: c.sym, name: cfg.name,
      qty: c.qty, entry, mark,
      pnl: (mark - entry) * c.qty * cfg.multiplier,
      mv, gross: Math.abs(mv),
      sector: COMMODITY_SECTOR[c.sym] ?? "Commodities",
      beta: 0.15, vol: cfg.vol,
    });
  }

  // Options
  for (const o of TEMPLATE.options) {
    const inst = insts[o.under];
    if (!inst) continue;
    const strike = Math.round(inst.price * (1 + o.strikeOffset));
    const T = o.dte / 365;
    const g = bs(inst.price, strike, T, inst.annualVol, 0.045, o.type);
    const entryPrice = g.price * (o.qty > 0 ? 0.86 : 1.12); // pretend we entered richer
    const mv = o.qty * g.price * 100;
    out.push({
      id: `OP-${o.under}-${o.type}${strike}`, cls: "OPTION",
      symbol: `${o.under} ${o.type}${strike} ${o.dte}D`,
      name: `${o.under} ${o.type === "C" ? "Call" : "Put"} $${strike} ${o.dte}D`,
      qty: o.qty, entry: entryPrice, mark: g.price,
      pnl: (g.price - entryPrice) * o.qty * 100,
      mv, gross: Math.abs(mv),
      sector: "Options",
      beta: inst.beta, vol: inst.annualVol,
      optType: o.type, strike, daysToExpiry: o.dte,
      delta: g.delta * o.qty * 100,
      gamma: g.gamma * o.qty * 100,
      vega: g.vega * o.qty * 100,
      theta: g.theta * o.qty * 100,
    });
  }

  return out;
}

function summarize(positions: Position[]): Book {
  let long = 0, short = 0, pnlDay = 0;
  for (const p of positions) {
    if (p.mv >= 0) long += p.mv; else short += p.mv;
    pnlDay += p.pnl;
  }
  const gross = long + Math.abs(short);
  const net = long + short;
  return {
    positions,
    nav: NAV_BASE + pnlDay,
    gross, net, long, short, pnlDay,
    updatedAt: Date.now(),
  };
}

// ─── Live book with hedge overlays ────────────────────────────────────
type HedgeOverlay = { id: string; positions: Position[] };
let baseBook = summarize(buildPositions());
let overlays: HedgeOverlay[] = [];

type Sub = (b: Book) => void;
const subs = new Set<Sub>();

export function getBook(): Book {
  if (!overlays.length) return baseBook;
  const all = [...baseBook.positions];
  for (const o of overlays) all.push(...o.positions);
  return summarize(all);
}

export function subscribe(fn: Sub) {
  subs.add(fn);
  fn(getBook());
  return () => { subs.delete(fn); };
}
function emit() {
  const b = getBook();
  subs.forEach((s) => s(b));
}

export function applyHedge(id: string, positions: Position[]) {
  overlays = [...overlays.filter((o) => o.id !== id), { id, positions }];
  emit();
}
export function removeHedge(id: string) {
  overlays = overlays.filter((o) => o.id !== id);
  emit();
}
export function activeHedges(): string[] { return overlays.map((o) => o.id); }

export function resetBook() {
  baseBook = summarize(buildPositions());
  overlays = [];
  emit();
}

// Rebuild base book whenever the shared demo book changes so RISK follows edits.
subscribeDemoBook(() => {
  baseBook = summarize(buildPositions());
  emit();
});

// ─── Risk math ────────────────────────────────────────────────────────
export type VaRMethod = "PARAMETRIC" | "HISTORICAL" | "MONTE_CARLO";

function normInv(p: number) {
  // Beasley-Springer / Moro
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  let q, r, x;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  else if (p <= 1 - pl) { q = p - 0.5; r = q*q; x = (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
  else { q = Math.sqrt(-2 * Math.log(1-p)); x = -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  return x;
}

/** Portfolio 1-day dollar sigma using position-level vols and rough correlation. */
export function portfolioSigma(positions: Position[]): number {
  const sig1d = (p: Position) => (p.vol / Math.sqrt(252)) * Math.abs(p.mv);
  // Assume avg correlation 0.35 for equities, 0.15 across classes
  let total = 0, n = 0;
  const s = positions.map(sig1d);
  const cls = positions.map((p) => p.cls);
  for (let i = 0; i < s.length; i++) {
    for (let j = 0; j < s.length; j++) {
      const rho = i === j ? 1 : (cls[i] === cls[j] ? 0.35 : 0.10);
      total += s[i] * s[j] * rho;
    }
    n++;
  }
  return Math.sqrt(Math.max(0, total));
}

export function var1d(book: Book, method: VaRMethod, conf: number): { var: number; es: number } {
  const sigma = portfolioSigma(book.positions);
  const z = Math.abs(normInv(1 - conf));
  const paramVar = z * sigma;
  const paramES = sigma * Math.exp(-0.5 * z * z) / (Math.sqrt(2 * Math.PI) * (1 - conf));
  if (method === "PARAMETRIC") return { var: paramVar, es: paramES };
  if (method === "HISTORICAL") {
    // simulate 500 fat-tailed daily P&Ls
    const rng = mulberry32(42);
    const pnls: number[] = [];
    for (let i = 0; i < 500; i++) {
      const z = studentT(rng, 5);
      pnls.push(z * sigma);
    }
    pnls.sort((a, b) => a - b);
    const k = Math.floor((1 - conf) * pnls.length);
    const v = Math.abs(pnls[k]);
    const tail = pnls.slice(0, Math.max(1, k)).reduce((a, b) => a + b, 0) / Math.max(1, k);
    return { var: v, es: Math.abs(tail) };
  }
  // MONTE_CARLO
  const rng = mulberry32(1337);
  const N = 2000;
  const pnls: number[] = [];
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (const p of book.positions) {
      const z = boxMuller(rng);
      s += z * (p.vol / Math.sqrt(252)) * p.mv;
    }
    pnls.push(s);
  }
  pnls.sort((a, b) => a - b);
  const k = Math.floor((1 - conf) * N);
  return { var: Math.abs(pnls[k]), es: Math.abs(pnls.slice(0, Math.max(1, k)).reduce((a, b) => a + b, 0) / Math.max(1, k)) };
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function boxMuller(rng: () => number) {
  const u = Math.max(1e-9, rng()); const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function studentT(rng: () => number, df: number) {
  // approx: gaussian / sqrt(chi2/df)
  const z = boxMuller(rng);
  let chi = 0;
  for (let i = 0; i < df; i++) { const g = boxMuller(rng); chi += g * g; }
  return z / Math.sqrt(chi / df);
}

/** Marginal VaR contribution per position (approx via component vol). */
export function riskContributions(book: Book): { pos: Position; contribPct: number; dollar: number }[] {
  const sigmas = book.positions.map((p) => (p.vol / Math.sqrt(252)) * Math.abs(p.mv));
  const total = sigmas.reduce((a, b) => a + b, 0) || 1;
  return book.positions.map((p, i) => ({
    pos: p,
    contribPct: sigmas[i] / total,
    dollar: sigmas[i] * 1.65, // ~95% single-name
  }));
}

/** Aggregate net greeks across option positions. */
export function netGreeks(book: Book): { delta: number; gamma: number; vega: number; theta: number } {
  let delta = 0, gamma = 0, vega = 0, theta = 0;
  for (const p of book.positions) {
    if (p.cls !== "OPTION") continue;
    delta += p.delta ?? 0; gamma += p.gamma ?? 0; vega += p.vega ?? 0; theta += p.theta ?? 0;
  }
  return { delta, gamma, vega, theta };
}

// ─── Stress scenarios ────────────────────────────────────────────────
export type ScenarioShock = {
  equityPct?: number;   // e.g. -0.15 = -15%
  ratesBp?: number;
  oilPct?: number;
  goldPct?: number;
  volMult?: number;     // multiplier on option vega P&L
};
export const SCENARIOS: Record<string, { label: string; shock: ScenarioShock }> = {
  CRISIS08: { label: "2008 CRISIS",  shock: { equityPct: -0.28, ratesBp: -150, oilPct: -0.35, goldPct: 0.08, volMult: 2.5 } },
  COVID:    { label: "COVID CRASH",  shock: { equityPct: -0.20, ratesBp: -100, oilPct: -0.45, goldPct: 0.05, volMult: 3.0 } },
  RATES100: { label: "RATES +100BP", shock: { equityPct: -0.06, ratesBp:  100, oilPct: -0.02, goldPct: -0.04, volMult: 1.3 } },
  OIL20:    { label: "OIL +20%",     shock: { equityPct: -0.02, ratesBp:   20, oilPct:  0.20, goldPct: 0.02, volMult: 1.1 } },
  TECH15:   { label: "TECH -15%",    shock: { equityPct: -0.15, ratesBp:    0, oilPct:  0.00, goldPct: 0.03, volMult: 1.4 } },
};

export function stress(book: Book, shock: ScenarioShock): { total: number; byPos: { pos: Position; pnl: number }[] } {
  const byPos = book.positions.map((p) => {
    let pnl = 0;
    if (p.cls === "EQUITY") {
      const b = p.beta ?? 1;
      pnl = (shock.equityPct ?? 0) * b * p.mv;
    } else if (p.cls === "COMMODITY") {
      if (p.symbol === "CL" || p.symbol === "NG") pnl = (shock.oilPct ?? 0) * p.mv;
      else if (p.symbol === "GC" || p.symbol === "SI") pnl = (shock.goldPct ?? 0) * p.mv;
      else pnl = (shock.equityPct ?? 0) * 0.4 * p.mv;
    } else if (p.cls === "OPTION") {
      const dS = (shock.equityPct ?? 0) * (p.beta ?? 1);
      const under = Math.abs(p.mv) / 100 * 20; // rough
      const dP = (p.delta ?? 0) * dS * under + 0.5 * (p.gamma ?? 0) * dS * dS * under * under;
      const vegaPnl = (p.vega ?? 0) * (((shock.volMult ?? 1) - 1) * 20);
      pnl = dP + vegaPnl;
    }
    return { pos: p, pnl };
  });
  const total = byPos.reduce((a, b) => a + b.pnl, 0);
  return { total, byPos };
}

// ─── Trade volumes (turnover) ────────────────────────────────────────
export function tradeVolumes(days: number): { t: number; turnover: number; trades: number }[] {
  const now = Date.now();
  const rng = mulberry32(9);
  const out: { t: number; turnover: number; trades: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const base = 1_800_000 + boxMuller(rng) * 500_000 + Math.sin(i / 5) * 400_000;
    const spike = rng() < 0.08 ? 2_500_000 * rng() : 0;
    out.push({ t: now - i * 86_400_000, turnover: Math.max(200_000, base + spike), trades: 40 + Math.floor(rng() * 60) });
  }
  return out;
}

export function largestTrades(): { time: string; sym: string; side: "BUY" | "SELL"; qty: number; px: number; notional: number }[] {
  const now = Date.now();
  const rng = mulberry32(21);
  const insts: Record<string, ReturnType<typeof seedInstrument>> = {};
  for (const s of TICKERS) insts[s] = seedInstrument(s);
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const sym = TICKERS[Math.floor(rng() * TICKERS.length)];
    const inst = insts[sym];
    const qty = Math.round(500 + rng() * 4500);
    const side: "BUY" | "SELL" = rng() > 0.5 ? "BUY" : "SELL";
    const px = inst.price * (1 + (rng() - 0.5) * 0.002);
    const t = new Date(now - i * 12 * 60000);
    rows.push({
      time: `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`,
      sym, side, qty, px, notional: qty * px,
    });
  }
  return rows.sort((a,b) => b.notional - a.notional);
}
