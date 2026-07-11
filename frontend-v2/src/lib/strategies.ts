// Strategy templates + persistence for the STRAT builder and BT engine.

export type Op = ">" | "<" | ">=" | "<=" | "==" | "CROSS_UP" | "CROSS_DN";
export type Indicator =
  | { kind: "RSI"; period: number }
  | { kind: "SMA"; period: number }
  | { kind: "PRICE" }
  | { kind: "MOMENTUM"; period: number }
  | { kind: "BB"; period: number; band: "UPPER" | "LOWER" | "MID" };

export type Condition = { left: Indicator; op: Op; right: Indicator | { kind: "CONST"; value: number } };

export type Sizing =
  | { kind: "FIXED"; pct: number }             // % of equity
  | { kind: "VOL_TARGET"; targetVol: number }  // annualized vol target
  | { kind: "KELLY"; fraction: number };       // Kelly fraction

export type Strategy = {
  id: string;
  name: string;
  entry: Condition[];       // AND
  exit: Condition[];        // OR
  takeProfitPct?: number;
  stopLossPct?: number;
  sizing: Sizing;
  createdAt: number;
};

export const TEMPLATES: Strategy[] = [
  {
    id: "tpl-sma", name: "SMA Cross 20/50",
    entry: [{ left: { kind: "SMA", period: 20 }, op: "CROSS_UP", right: { kind: "SMA", period: 50 } }],
    exit:  [{ left: { kind: "SMA", period: 20 }, op: "CROSS_DN", right: { kind: "SMA", period: 50 } }],
    sizing: { kind: "FIXED", pct: 100 },
    createdAt: 0,
  },
  {
    id: "tpl-rsi", name: "RSI Mean Revert",
    entry: [{ left: { kind: "RSI", period: 14 }, op: "<", right: { kind: "CONST", value: 30 } }],
    exit:  [{ left: { kind: "RSI", period: 14 }, op: ">", right: { kind: "CONST", value: 55 } }],
    takeProfitPct: 6, stopLossPct: 4,
    sizing: { kind: "FIXED", pct: 100 },
    createdAt: 0,
  },
  {
    id: "tpl-mom", name: "Momentum 60D",
    entry: [{ left: { kind: "MOMENTUM", period: 60 }, op: ">", right: { kind: "CONST", value: 5 } }],
    exit:  [{ left: { kind: "MOMENTUM", period: 60 }, op: "<", right: { kind: "CONST", value: 0 } }],
    sizing: { kind: "VOL_TARGET", targetVol: 0.20 },
    createdAt: 0,
  },
  {
    id: "tpl-bb",  name: "BB Breakout",
    entry: [{ left: { kind: "PRICE" }, op: "CROSS_UP", right: { kind: "BB", period: 20, band: "UPPER" } }],
    exit:  [{ left: { kind: "PRICE" }, op: "CROSS_DN", right: { kind: "BB", period: 20, band: "MID" } }],
    stopLossPct: 5,
    sizing: { kind: "KELLY", fraction: 0.5 },
    createdAt: 0,
  },
];

const KEY = "finsight.strategies.v1";

export function listStrategies(): Strategy[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Strategy[];
  } catch { return []; }
}
export function saveStrategy(s: Strategy) {
  const all = listStrategies().filter((x) => x.id !== s.id);
  all.push(s);
  localStorage.setItem(KEY, JSON.stringify(all));
}
export function deleteStrategy(id: string) {
  localStorage.setItem(KEY, JSON.stringify(listStrategies().filter((x) => x.id !== id)));
}
