// FinSight simulated market engine — single shared source of truth.
// One session is created on module load. Every panel reads from it, so
// the whole terminal is internally consistent (price, IVs, MC drift,
// vol surface, correlations all derive from per-ticker `annualVol`).

export type Tick = { t: number; p: number; v?: number };

export type Instrument = {
  symbol: string;
  name: string;
  prevClose: number;
  open: number;
  price: number;
  bid: number;
  ask: number;
  change: number; // vs prevClose
  changePct: number; // vs prevClose
  sessionHigh: number;
  sessionLow: number;
  vwap: number;
  volume: number; // cumulative shares
  annualVol: number;
  beta: number;
  history: Tick[];
};

type Cfg = {
  name: string;
  prevClose: number;
  annualVol: number;
  beta: number;
  avgVolMM: number; // avg daily volume in millions of shares
};

const CFG: Record<string, Cfg> = {
  SPY:       { name: "SPDR S&P 500 ETF",    prevClose: 612.40,   annualVol: 0.12, beta: 1.00, avgVolMM: 75 },
  QQQ:       { name: "Invesco QQQ Trust",   prevClose: 548.11,   annualVol: 0.16, beta: 1.15, avgVolMM: 45 },
  AAPL:      { name: "Apple Inc.",          prevClose: 234.12,   annualVol: 0.22, beta: 1.10, avgVolMM: 58 },
  MSFT:      { name: "Microsoft Corp.",     prevClose: 448.70,   annualVol: 0.20, beta: 0.95, avgVolMM: 25 },
  NVDA:      { name: "NVIDIA Corp.",        prevClose: 178.44,   annualVol: 0.35, beta: 1.55, avgVolMM: 220 },
  TSLA:      { name: "Tesla, Inc.",         prevClose: 312.90,   annualVol: 0.45, beta: 1.75, avgVolMM: 95 },
  AMZN:      { name: "Amazon.com, Inc.",    prevClose: 214.55,   annualVol: 0.28, beta: 1.20, avgVolMM: 42 },
  META:      { name: "Meta Platforms",      prevClose: 612.31,   annualVol: 0.30, beta: 1.30, avgVolMM: 16 },
  GOOGL:     { name: "Alphabet Inc.",       prevClose: 198.12,   annualVol: 0.24, beta: 1.10, avgVolMM: 22 },
  IWM:       { name: "iShares Russell 2000", prevClose: 232.18,  annualVol: 0.19, beta: 1.15, avgVolMM: 32 },
  "BTC-USD": { name: "Bitcoin",             prevClose: 98450.20, annualVol: 0.65, beta: 0.40, avgVolMM: 8 },
};

export const TICKERS = Object.keys(CFG);
export function annualVolOf(symbol: string): number { return CFG[symbol]?.annualVol ?? 0.25; }
export function betaOf(symbol: string): number { return CFG[symbol]?.beta ?? 1.0; }
export function prevCloseOf(symbol: string): number { return CFG[symbol]?.prevClose ?? 100; }

function boxMuller(): number {
  const u = Math.max(1e-9, Math.random());
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function generateSession(
  symbol: string,
  spyRet: number,
  forcedOutlier: number | null,
): Instrument {
  const cfg = CFG[symbol];
  const dailyVol = cfg.annualVol / Math.sqrt(252);
  let ret: number;
  if (forcedOutlier !== null) {
    ret = forcedOutlier;
  } else {
    // factor + idio
    const idio = boxMuller() * dailyVol * 0.85;
    ret = cfg.beta * spyRet + idio;
    // Soft-clip to ~±2.5% typical
    const cap = 0.025;
    if (Math.abs(ret) > cap) ret = Math.sign(ret) * (cap + (Math.abs(ret) - cap) * 0.35);
  }
  const prevClose = cfg.prevClose;
  const finalPrice = Math.max(0.01, prevClose * (1 + ret));

  // Small opening gap
  const openGap = boxMuller() * dailyVol * 0.25;
  const open = prevClose * (1 + openGap);

  // Brownian bridge from open -> finalPrice
  const N = 200;
  const stepVol = dailyVol / Math.sqrt(N);
  const path = new Array<number>(N);
  path[0] = Math.log(open);
  const endLog = Math.log(finalPrice);
  for (let i = 1; i < N; i++) {
    const remaining = N - i;
    const drift = (endLog - path[i - 1]) / remaining;
    path[i] = path[i - 1] + drift + boxMuller() * stepVol * 0.55;
  }
  path[N - 1] = endLog;

  // U-shaped volume
  const u = (i: number) => {
    const x = i / (N - 1);
    return 0.35 + 1.8 * (Math.pow(x - 0.5, 2) * 4);
  };
  const weights: number[] = [];
  let wsum = 0;
  for (let i = 0; i < N; i++) {
    const w = u(i);
    weights.push(w);
    wsum += w;
  }
  const totalShares = cfg.avgVolMM * 1_000_000 * (0.7 + Math.random() * 0.6);

  const now = Date.now();
  const openTime = now - 5.5 * 60 * 60 * 1000;
  const history: Tick[] = path.map((lp, i) => ({
    t: openTime + (i / (N - 1)) * 6.5 * 60 * 60 * 1000,
    p: Math.exp(lp),
    v: (weights[i] / wsum) * totalShares,
  }));
  const prices = history.map((h) => h.p);
  let sessionHigh = -Infinity;
  let sessionLow = Infinity;
  let dollarVol = 0;
  let shareVol = 0;
  for (let i = 0; i < history.length; i++) {
    const p = prices[i];
    const v = history[i].v || 0;
    if (p > sessionHigh) sessionHigh = p;
    if (p < sessionLow) sessionLow = p;
    dollarVol += p * v;
    shareVol += v;
  }
  const vwap = dollarVol / (shareVol || 1);
  const price = finalPrice;
  const spreadBps = Math.max(1, cfg.annualVol * 30);
  const spread = Math.max(0.01, (price * spreadBps) / 10000);
  return {
    symbol,
    name: cfg.name,
    prevClose,
    open,
    price,
    bid: price - spread / 2,
    ask: price + spread / 2,
    change: price - prevClose,
    changePct: ((price - prevClose) / prevClose) * 100,
    sessionHigh,
    sessionLow,
    vwap,
    volume: totalShares,
    annualVol: cfg.annualVol,
    beta: cfg.beta,
    history,
  };
}

export type Headline = {
  id: string;
  time: string;
  text: string;
  sym: string;
  sentiment: "pos" | "neg" | "neu";
};

const OUTLIER_TEMPLATES: Record<"pos" | "neg", string[]> = {
  pos: [
    "{sym} pops {p}% on datacenter guidance beat",
    "{sym} surges {p}% after analyst upgrade cycle",
    "{sym} rips {p}% on unusual call buying — dark-pool prints heavy",
    "{sym} +{p}% as sector rotation lifts leaders",
    "{sym} breaks out +{p}%; volume 3x 20d average",
  ],
  neg: [
    "{sym} slides {p}% on guidance cut; supply commentary softens",
    "{sym} -{p}% as short-interest ramps into event window",
    "{sym} dumps {p}% on dealer gamma unwind",
    "{sym} tumbles {p}% — put skew widens 4v intraday",
    "{sym} -{p}% as competitor undercuts pricing tier",
  ],
};

const BASE_HEADLINES = [
  { text: "Bid stack thickens on {sym}; MMs pulling offers", sent: "pos" as const },
  { text: "Sector rotation: capital flowing INTO semis, OUT of staples", sent: "neu" as const },
  { text: "{sym} implied vol compressing into earnings window", sent: "neu" as const },
  { text: "Dark pool print — {sym} 1.2M block crossed at midpoint", sent: "neu" as const },
  { text: "Macro tape: 10Y yields easing 4bps, risk-on tone", sent: "pos" as const },
  { text: "{sym} breaks 20D VWAP with rising delta imbalance", sent: "pos" as const },
  { text: "Cross-asset: DXY softening; commodities firm", sent: "neu" as const },
  { text: "Unusual gamma exposure on {sym} — dealers likely long", sent: "neu" as const },
  { text: "{sym} ETF creation basket rebalance — inflow tilt", sent: "pos" as const },
  { text: "Front-week straddle richens on {sym} — event pricing in", sent: "neu" as const },
  { text: "{sym} losing 50D moving average — momentum unwind", sent: "neg" as const },
];

function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

// Session bootstrap
type Session = {
  spyRet: number;
  instruments: Record<string, Instrument>;
  seedHeadlines: Headline[];
};

function bootstrap(): Session {
  const spyRet = boxMuller() * 0.008; // ~±0.8%
  // ~35% of sessions get one outlier ±4-6%
  let outlierSym: string | null = null;
  let outlierRet = 0;
  if (Math.random() < 0.35) {
    const pool = TICKERS.filter((s) => s !== "SPY" && s !== "QQQ" && s !== "BTC-USD");
    outlierSym = pool[Math.floor(Math.random() * pool.length)];
    const mag = 0.04 + Math.random() * 0.02;
    outlierRet = (Math.random() < 0.5 ? -1 : 1) * mag;
  }
  const instruments: Record<string, Instrument> = {};
  for (const s of TICKERS) {
    instruments[s] = generateSession(s, spyRet, s === outlierSym ? outlierRet : null);
  }
  // Force diversity: if <2 red or <2 green, resample idiosyncratic on a few
  let greens = 0;
  let reds = 0;
  for (const s of TICKERS) instruments[s].changePct >= 0 ? greens++ : reds++;
  if (greens < 2 || reds < 2) {
    // flip a couple mid-vol tickers
    const flipCandidates = ["AAPL", "MSFT", "GOOGL", "AMZN", "META"];
    for (const s of flipCandidates) {
      const inst = instruments[s];
      const flipped = generateSession(s, -spyRet * 0.5, null);
      instruments[s] = flipped;
      const gs = TICKERS.reduce((a, k) => a + (instruments[k].changePct >= 0 ? 1 : 0), 0);
      if (gs >= 2 && TICKERS.length - gs >= 2) break;
      void inst;
    }
  }

  // Seed headlines: outlier gets an explaining headline
  const seedHeadlines: Headline[] = [];
  const now = new Date(Date.now());
  if (outlierSym) {
    const inst = instruments[outlierSym];
    const pct = Math.abs(inst.changePct).toFixed(1);
    const templates = OUTLIER_TEMPLATES[inst.changePct >= 0 ? "pos" : "neg"];
    const tpl = templates[Math.floor(Math.random() * templates.length)];
    seedHeadlines.push({
      id: `outlier-${outlierSym}`,
      time: fmtTime(now),
      text: tpl.replace("{sym}", outlierSym).replace("{p}", pct),
      sym: outlierSym,
      sentiment: inst.changePct >= 0 ? "pos" : "neg",
    });
  }
  // Two more color headlines from top movers
  const ranked = [...TICKERS].sort((a, b) => Math.abs(instruments[b].changePct) - Math.abs(instruments[a].changePct));
  for (const s of ranked.slice(0, 3)) {
    if (s === outlierSym) continue;
    const inst = instruments[s];
    const sentiment: "pos" | "neg" | "neu" = inst.changePct > 0.5 ? "pos" : inst.changePct < -0.5 ? "neg" : "neu";
    const pool = BASE_HEADLINES.filter((h) => h.sent === sentiment || h.sent === "neu");
    const tpl = pool[Math.floor(Math.random() * pool.length)];
    seedHeadlines.push({
      id: `seed-${s}-${Math.random()}`,
      time: fmtTime(new Date(now.getTime() - Math.floor(Math.random() * 3 * 60_000))),
      text: tpl.text.replace("{sym}", s),
      sym: s,
      sentiment: tpl.sent,
    });
    if (seedHeadlines.length >= 4) break;
  }
  return { spyRet, instruments, seedHeadlines };
}

// Deterministic bootstrap: shadow Math.random with a seeded stream so SSR and
// client produce identical initial session state (prevents hydration mismatch).
// Subsequent ticks use real Math.random for lively motion.
const SESSION = (() => {
  const realRandom = Math.random;
  const realNow = Date.now;
  let seed = 0x9e3779b1;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Fixed epoch so SSR and client agree on history timestamps.
  Date.now = () => 1_720_000_000_000;
  try {
    return bootstrap();
  } finally {
    Math.random = realRandom;
    Date.now = realNow;
  }
})();

export function seedInstrument(symbol: string): Instrument {
  return SESSION.instruments[symbol] ?? generateSession(symbol, SESSION.spyRet, null);
}

export function nextTick(inst: Instrument): Instrument {
  // Small mean-reverting micro-jitter around current price with vol scale
  const stepVol = inst.annualVol / Math.sqrt(252) / Math.sqrt(200);
  const drift = (inst.vwap - inst.price) * 0.0005; // whisper of mean-rev to VWAP
  const jitter = boxMuller() * stepVol * inst.price * 0.6 + drift;
  const price = Math.max(0.01, inst.price + jitter);
  const spreadBps = Math.max(1, inst.annualVol * 30);
  const spread = Math.max(0.01, (price * spreadBps) / 10000);
  const lastTick = inst.history[inst.history.length - 1];
  const microVol = (lastTick.v ?? 1000) * (0.6 + Math.random() * 0.8);
  const history = [
    ...inst.history.slice(1),
    { t: Date.now(), p: price, v: microVol },
  ];
  const sessionHigh = Math.max(inst.sessionHigh, price);
  const sessionLow = Math.min(inst.sessionLow, price);
  return {
    ...inst,
    price,
    bid: price - spread / 2,
    ask: price + spread / 2,
    change: price - inst.prevClose,
    changePct: ((price - inst.prevClose) / inst.prevClose) * 100,
    sessionHigh,
    sessionLow,
    history,
  };
}

export function fmt(n: number, digits = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

// ─── Monte Carlo ──────────────────────────────────────────────────────
function randnSeeded(seed: number): number {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const b = Math.sin(seed * 78.233) * 43758.5453;
  const u = a - Math.floor(a);
  const v = b - Math.floor(b);
  return Math.sqrt(-2 * Math.log(u || 0.0001)) * Math.cos(2 * Math.PI * v);
}

export function monteCarloPaths(
  spot: number,
  mu: number,
  sigma: number,
  steps: number,
  paths: number,
): number[][] {
  const dt = 1 / 252;
  const out: number[][] = [];
  for (let p = 0; p < paths; p++) {
    const row: number[] = [spot];
    let cur = spot;
    for (let i = 1; i <= steps; i++) {
      const z = randnSeeded(p * 1000 + i + Math.random() * 999);
      cur = cur * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
      row.push(cur);
    }
    out.push(row);
  }
  return out;
}

export function percentileBands(paths: number[][], pcts = [5, 50, 95]): number[][] {
  const steps = paths[0].length;
  const bands: number[][] = pcts.map(() => []);
  for (let i = 0; i < steps; i++) {
    const col = paths.map((r) => r[i]).sort((a, b) => a - b);
    pcts.forEach((pc, idx) => {
      const k = Math.floor((pc / 100) * (col.length - 1));
      bands[idx].push(col[k]);
    });
  }
  return bands;
}

// ─── Intel feed ──────────────────────────────────────────────────────
export function seedHeadlines(): Headline[] {
  return SESSION.seedHeadlines.slice();
}

const TICK_HEADLINES = BASE_HEADLINES;

export function generateHeadline(): Headline {
  const sym = TICKERS[Math.floor(Math.random() * TICKERS.length)];
  const tpl = TICK_HEADLINES[Math.floor(Math.random() * TICK_HEADLINES.length)];
  const d = new Date();
  return {
    id: `${d.getTime()}-${Math.random()}`,
    time: fmtTime(d),
    text: tpl.text.replace("{sym}", sym),
    sym,
    sentiment: tpl.sent,
  };
}

// ─── Correlations ────────────────────────────────────────────────────
export function correlationMatrix(symbols: string[]): number[][] {
  // Use betas to build a plausible symmetric matrix: closer betas → higher ρ.
  const n = symbols.length;
  const m: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) m[i][j] = 1;
      else if (j > i) {
        const bi = betaOf(symbols[i]);
        const bj = betaOf(symbols[j]);
        const closeness = 1 - Math.min(1, Math.abs(bi - bj) / 1.5);
        const seedNoise = (Math.sin((symbols[i].charCodeAt(0) + symbols[j].charCodeAt(0)) * 12.9) + 1) / 2;
        m[i][j] = Math.max(-0.1, Math.min(0.95, 0.15 + closeness * 0.7 + (seedNoise - 0.5) * 0.1));
      } else m[i][j] = m[j][i];
    }
  }
  return m;
}

export function viridis(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const stops = [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ];
  const idx = t * (stops.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r},${g},${bl})`;
}

// ─── Daily history for longer timeframes ─────────────────────────────
function symHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}
function seedRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function seedBM(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Deterministic daily bar history that ends AT prevClose (so 1D chart continues seamlessly). */
export function dailyHistory(symbol: string, days: number): Tick[] {
  const cfg = CFG[symbol];
  if (!cfg) return [];
  const rng = seedRng(symHash(symbol) ^ (days * 2654435761));
  const dailyVol = cfg.annualVol / Math.sqrt(252);
  const drift = 0.00025; // ~6%/yr
  const rets: number[] = [];
  for (let i = 0; i < days; i++) rets.push(drift + seedBM(rng) * dailyVol);
  // integrate then shift so last close == prevClose
  let cur = 0;
  const path: number[] = [0];
  for (let i = 1; i < days; i++) { cur += rets[i]; path.push(cur); }
  const shift = Math.log(cfg.prevClose) - path[path.length - 1];
  const now = Date.now();
  const oneDay = 24 * 3600 * 1000;
  return path.map((lp, i) => ({
    t: now - (days - 1 - i) * oneDay,
    p: Math.exp(lp + shift),
    v: cfg.avgVolMM * 1_000_000 * (0.6 + rng() * 0.8),
  }));
}

/** Bucket ticks to fixed-count OHLC candles. */
export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export function bucketCandles(ticks: Tick[], count: number): Candle[] {
  if (ticks.length < 2 || count < 1) return [];
  const size = Math.max(1, Math.floor(ticks.length / count));
  const out: Candle[] = [];
  for (let i = 0; i < ticks.length; i += size) {
    const slice = ticks.slice(i, Math.min(ticks.length, i + size));
    if (!slice.length) continue;
    let h = -Infinity, l = Infinity, v = 0;
    for (const s of slice) { if (s.p > h) h = s.p; if (s.p < l) l = s.p; v += s.v ?? 0; }
    out.push({ t: slice[0].t, o: slice[0].p, h, l, c: slice[slice.length - 1].p, v });
  }
  return out;
}
