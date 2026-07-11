// Simulated but internally consistent analyst data for the active ticker.
import { seedInstrument, annualVolOf } from "./market";

function h(s: string): number {
  let hh = 2166136261;
  for (let i = 0; i < s.length; i++) { hh ^= s.charCodeAt(i); hh = (hh * 16777619) >>> 0; }
  return hh;
}
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

export type AnalystView = {
  ticker: string;
  price: number;
  ratings: { buy: number; hold: number; sell: number };
  target: { low: number; avg: number; high: number; upsidePct: number };
  earnings: { nextDate: string; impliedMovePct: number; history: boolean[] };
  factors: { name: string; percentile: number }[];
  peers: { sym: string; pe: number; evEbitda: number; margin: number; ytd: number }[];
  bull: string;
  bear: string;
};

const PEERS: Record<string, string[]> = {
  NVDA: ["AMD","AVGO","INTC"], AAPL: ["MSFT","GOOGL","META"], MSFT: ["AAPL","GOOGL","AMZN"],
  META: ["GOOGL","SNAP","PINS"], GOOGL: ["META","MSFT","AMZN"], AMZN: ["MSFT","GOOGL","WMT"],
  TSLA: ["GM","F","RIVN"], SPY: ["IVV","VOO","QQQ"], QQQ: ["SPY","IWM","XLK"],
  "BTC-USD": ["ETH","SOL","MSTR"],
};
const BULL: Record<string, string> = {
  NVDA: "Datacenter capex remains multi-year secular; hyperscaler orders locked into 2027, Blackwell margins expanding, sovereign AI TAM adds a second leg.",
  AAPL: "Services annuity growing high-teens; Apple Intelligence rollout re-ignites iPhone upgrade super-cycle; buyback pace still accretive.",
  MSFT: "Copilot ARR ramping; Azure share of enterprise AI workloads compounding; margin structure resilient into inference deflation.",
};
const BEAR: Record<string, string> = {
  NVDA: "Concentration risk — top 4 customers = 40% of revenue; if hyperscaler ROI on GenAI capex disappoints, order cadence resets sharply.",
  AAPL: "China smartphone share ceding to Huawei/Xiaomi; regulatory pressure on services take-rate; hardware refresh cycle stretching.",
  MSFT: "OpenAI compute obligations weigh on FCF; Azure decel could accelerate if enterprise pilots don't convert to production spend.",
};

export function analystFor(ticker: string): AnalystView {
  const inst = seedInstrument(ticker);
  const r = rng(h(ticker));
  const total = 20 + Math.floor(r() * 15);
  const buyPct = 0.45 + r() * 0.35;
  const sellPct = 0.05 + r() * 0.15;
  const buy = Math.round(total * buyPct);
  const sell = Math.round(total * sellPct);
  const hold = total - buy - sell;
  const upside = -0.05 + r() * 0.30; // -5% .. +25%
  const avg = inst.price * (1 + upside);
  const spread = inst.price * (0.05 + r() * 0.10);
  const low = avg - spread;
  const high = avg + spread * 1.5;

  const nextD = new Date(Date.now() + (10 + Math.floor(r() * 60)) * 86_400_000);
  const impliedMove = annualVolOf(ticker) * 100 * Math.sqrt((14) / 252);
  const history = Array.from({ length: 8 }, () => r() > 0.28);

  const factors = [
    { name: "VALUE", percentile: Math.round(r() * 100) },
    { name: "GROWTH", percentile: Math.round(40 + r() * 60) },
    { name: "MOMENTUM", percentile: Math.round(50 + r() * 50) },
    { name: "QUALITY", percentile: Math.round(30 + r() * 70) },
    { name: "LOW VOL", percentile: Math.round(r() * 60) },
  ];

  const peerSyms = PEERS[ticker] ?? PEERS["SPY"];
  const peers = [ticker, ...peerSyms].map((s) => {
    const pr = rng(h(s + "peer"));
    return {
      sym: s,
      pe: 12 + pr() * 45,
      evEbitda: 8 + pr() * 25,
      margin: 8 + pr() * 40,
      ytd: -20 + pr() * 60,
    };
  });

  return {
    ticker, price: inst.price,
    ratings: { buy, hold, sell },
    target: { low, avg, high, upsidePct: ((avg - inst.price) / inst.price) * 100 },
    earnings: {
      nextDate: `${String(nextD.getMonth()+1).padStart(2,"0")}/${String(nextD.getDate()).padStart(2,"0")}`,
      impliedMovePct: impliedMove,
      history,
    },
    factors,
    peers,
    bull: BULL[ticker] ?? `${ticker}: catalysts include product cycle acceleration, margin expansion from operating leverage, and secular demand tailwinds priced conservatively at current multiples.`,
    bear: BEAR[ticker] ?? `${ticker}: risks include competitive intensity compressing margins, macro sensitivity to rate regime, and multiple derating if growth decelerates below sell-side model.`,
  };
}
