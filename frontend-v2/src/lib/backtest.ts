// FinSight backtest engine — deterministic, runs against dailyHistory().
import { dailyHistory } from "./market";
import type { Strategy, Condition, Indicator, Op } from "./strategies";

export type Trade = { entryT: number; exitT: number; entryPx: number; exitPx: number; pnlPct: number; win: boolean };

export type BacktestResult = {
  ticker: string;
  strategy: string;
  bars: { t: number; p: number }[];
  equity: number[];       // strategy equity curve (start = 1)
  benchmark: number[];    // buy&hold equity curve (start = 1)
  drawdown: number[];     // strategy underwater curve (0..-1)
  trades: Trade[];
  stats: {
    cagr: number; sharpe: number; sortino: number; maxDD: number;
    winRate: number; profitFactor: number; trades: number; exposure: number;
  };
  monthlyReturns: { year: number; month: number; ret: number }[];
  oosStats: BacktestResult["stats"];
  oosStartIdx: number;
};

// ─── Indicators ──────────────────────────────────────────────────────
function sma(arr: number[], period: number, i: number) {
  if (i < period - 1) return NaN;
  let s = 0; for (let k = i - period + 1; k <= i; k++) s += arr[k];
  return s / period;
}
function rsi(arr: number[], period: number, i: number) {
  if (i < period) return NaN;
  let up = 0, dn = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const d = arr[k] - arr[k - 1];
    if (d > 0) up += d; else dn -= d;
  }
  if (up + dn === 0) return 50;
  const rs = up / Math.max(1e-9, dn);
  return 100 - 100 / (1 + rs);
}
function stddev(arr: number[], period: number, i: number, mean: number) {
  let s = 0; for (let k = i - period + 1; k <= i; k++) s += (arr[k] - mean) ** 2;
  return Math.sqrt(s / period);
}
function ind(idc: Indicator, prices: number[], i: number): number {
  switch (idc.kind) {
    case "PRICE": return prices[i];
    case "SMA": return sma(prices, idc.period, i);
    case "RSI": return rsi(prices, idc.period, i);
    case "MOMENTUM": return i < idc.period ? NaN : ((prices[i] - prices[i - idc.period]) / prices[i - idc.period]) * 100;
    case "BB": {
      const m = sma(prices, idc.period, i); if (isNaN(m)) return NaN;
      const sd = stddev(prices, idc.period, i, m);
      if (idc.band === "MID") return m;
      return idc.band === "UPPER" ? m + 2 * sd : m - 2 * sd;
    }
  }
}
function eval1(c: Condition, prices: number[], i: number): boolean {
  const L = ind(c.left, prices, i);
  const R = c.right.kind === "CONST" ? c.right.value : ind(c.right, prices, i);
  const Lp = ind(c.left, prices, i - 1);
  const Rp = c.right.kind === "CONST" ? c.right.value : ind(c.right, prices, i - 1);
  if (isNaN(L) || isNaN(R)) return false;
  switch (c.op as Op) {
    case ">": return L > R;
    case "<": return L < R;
    case ">=": return L >= R;
    case "<=": return L <= R;
    case "==": return Math.abs(L - R) < 1e-9;
    case "CROSS_UP": return !isNaN(Lp) && !isNaN(Rp) && Lp <= Rp && L > R;
    case "CROSS_DN": return !isNaN(Lp) && !isNaN(Rp) && Lp >= Rp && L < R;
  }
}

// ─── Runner ──────────────────────────────────────────────────────────
export function runBacktest(strat: Strategy, ticker: string, years: number): BacktestResult {
  const days = Math.max(60, Math.round(252 * years));
  const bars = dailyHistory(ticker, days);
  const prices = bars.map((b) => b.p);
  const n = prices.length;
  const oosStartIdx = Math.floor(n * 0.7);

  const equity: number[] = [1];
  const benchmark: number[] = [1];
  const drawdown: number[] = [0];
  let peak = 1;
  let inPos = false;
  let entryPx = 0;
  let entryT = 0;
  const trades: Trade[] = [];
  let exposureBars = 0;
  const dailyRet: number[] = [0];

  for (let i = 1; i < n; i++) {
    const p = prices[i];
    const bhRet = (p - prices[i - 1]) / prices[i - 1];
    benchmark.push(benchmark[i - 1] * (1 + bhRet));

    let ret = 0;
    if (inPos) {
      ret = (p - prices[i - 1]) / prices[i - 1];
      exposureBars++;
      const pnl = (p - entryPx) / entryPx;
      const exitByRule = strat.exit.some((c) => eval1(c, prices, i));
      const exitByTP = strat.takeProfitPct !== undefined && pnl * 100 >= strat.takeProfitPct;
      const exitBySL = strat.stopLossPct !== undefined && pnl * 100 <= -strat.stopLossPct;
      if (exitByRule || exitByTP || exitBySL) {
        trades.push({ entryT, exitT: bars[i].t, entryPx, exitPx: p, pnlPct: pnl * 100, win: pnl > 0 });
        inPos = false;
      }
    } else {
      if (strat.entry.every((c) => eval1(c, prices, i))) {
        inPos = true; entryPx = p; entryT = bars[i].t;
      }
    }
    // sizing scale
    let scale = 1;
    if (strat.sizing.kind === "FIXED") scale = strat.sizing.pct / 100;
    else if (strat.sizing.kind === "VOL_TARGET" && i > 20) {
      const lookback = 20;
      let ss = 0;
      for (let k = i - lookback + 1; k <= i; k++) {
        const r = (prices[k] - prices[k-1]) / prices[k-1];
        ss += r * r;
      }
      const realized = Math.sqrt(ss / lookback) * Math.sqrt(252);
      scale = Math.min(2, strat.sizing.targetVol / Math.max(0.05, realized));
    } else if (strat.sizing.kind === "KELLY") scale = strat.sizing.fraction;
    const stratRet = ret * scale;
    dailyRet.push(stratRet);
    equity.push(equity[i - 1] * (1 + stratRet));
    if (equity[i] > peak) peak = equity[i];
    drawdown.push(equity[i] / peak - 1);
  }

  // Close open trade
  if (inPos) trades.push({ entryT, exitT: bars[n-1].t, entryPx, exitPx: prices[n-1], pnlPct: ((prices[n-1] - entryPx)/entryPx)*100, win: prices[n-1] > entryPx });

  const stats = computeStats(equity, dailyRet, drawdown, trades, exposureBars, n);
  const oosDaily = dailyRet.slice(oosStartIdx);
  const oosEquity = [1]; let opeak = 1; const oosDD = [0];
  for (let k = 0; k < oosDaily.length; k++) {
    oosEquity.push(oosEquity[k] * (1 + oosDaily[k]));
    if (oosEquity[k+1] > opeak) opeak = oosEquity[k+1];
    oosDD.push(oosEquity[k+1] / opeak - 1);
  }
  const oosTrades = trades.filter((t) => t.entryT >= bars[oosStartIdx].t);
  const oosExposure = oosDaily.filter((r) => r !== 0).length;
  const oosStats = computeStats(oosEquity, oosDaily, oosDD, oosTrades, oosExposure, oosDaily.length);

  // Monthly returns
  const monthly = new Map<string, number>();
  for (let i = 1; i < n; i++) {
    const d = new Date(bars[i].t);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    monthly.set(key, (monthly.get(key) ?? 0) + Math.log(1 + dailyRet[i]));
  }
  const monthlyReturns = [...monthly.entries()].map(([k, v]) => {
    const [y, m] = k.split("-").map(Number);
    return { year: y, month: m, ret: Math.exp(v) - 1 };
  }).sort((a, b) => a.year - b.year || a.month - b.month);

  return {
    ticker, strategy: strat.name,
    bars: bars.map((b) => ({ t: b.t, p: b.p })),
    equity, benchmark, drawdown, trades, stats, monthlyReturns,
    oosStats, oosStartIdx,
  };
}

function computeStats(equity: number[], daily: number[], drawdown: number[], trades: Trade[], exposureBars: number, n: number) {
  const totalRet = equity[equity.length - 1] - 1;
  const years = Math.max(0.1, n / 252);
  const cagr = Math.pow(equity[equity.length - 1], 1 / years) - 1;
  const active = daily.filter((r) => r !== 0);
  const mean = active.reduce((a, b) => a + b, 0) / (active.length || 1);
  const std = Math.sqrt(active.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, active.length - 1));
  const sharpe = std > 0 ? (mean * 252) / (std * Math.sqrt(252)) : 0;
  const dn = active.filter((r) => r < 0);
  const dstd = Math.sqrt(dn.reduce((a, b) => a + b * b, 0) / Math.max(1, dn.length));
  const sortino = dstd > 0 ? (mean * 252) / (dstd * Math.sqrt(252)) : 0;
  const maxDD = Math.min(...drawdown, 0);
  const wins = trades.filter((t) => t.win);
  const losses = trades.filter((t) => !t.win);
  const gross = wins.reduce((a, b) => a + b.pnlPct, 0);
  const lossSum = Math.abs(losses.reduce((a, b) => a + b.pnlPct, 0));
  const profitFactor = lossSum > 0 ? gross / lossSum : (gross > 0 ? 99 : 0);
  return {
    cagr, sharpe, sortino, maxDD,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor, trades: trades.length,
    exposure: exposureBars / Math.max(1, n),
  };
  void totalRet;
}
