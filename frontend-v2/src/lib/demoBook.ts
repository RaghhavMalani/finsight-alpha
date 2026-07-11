// Reactive user-editable demo book, persisted to localStorage.
// Read by PnlRibbon, HomeOverview, MLDiscover, and RISK (via book.ts).

import { seedInstrument } from "./market";

export type DemoPosition = { symbol: string; qty: number; entry: number };

const KEY = "finsight.demoBook.v1";

function makeDefaults(): DemoPosition[] {
  const raw: Array<{ symbol: string; qty: number }> = [
    { symbol: "NVDA",  qty:  320 },
    { symbol: "AAPL",  qty:  180 },
    { symbol: "MSFT",  qty:  120 },
    { symbol: "META",  qty:   60 },
    { symbol: "GOOGL", qty:  140 },
    { symbol: "AMZN",  qty: -100 },
    { symbol: "TSLA",  qty:  -80 },
    { symbol: "SPY",   qty:   90 },
    { symbol: "QQQ",   qty:   60 },
    { symbol: "IWM",   qty:  -40 },
    { symbol: "BTC-USD", qty: 2 },
  ];
  return raw.map((p) => {
    const inst = seedInstrument(p.symbol);
    const drift = Math.sin(p.symbol.charCodeAt(0) * 3) * 0.04;
    return { ...p, entry: +(inst.prevClose * (1 + drift)).toFixed(2) };
  });
}

const DEFAULTS = makeDefaults();

function load(): DemoPosition[] {
  if (typeof window === "undefined") return DEFAULTS.map((p) => ({ ...p }));
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS.map((p) => ({ ...p }));
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return DEFAULTS.map((p) => ({ ...p }));
    return arr.filter(
      (p: unknown): p is DemoPosition =>
        !!p && typeof (p as DemoPosition).symbol === "string" &&
        typeof (p as DemoPosition).qty === "number" &&
        typeof (p as DemoPosition).entry === "number",
    );
  } catch { return DEFAULTS.map((p) => ({ ...p })); }
}

let positions: DemoPosition[] = load();
const subs = new Set<(p: DemoPosition[]) => void>();

function persist() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(positions)); } catch { /* ignore */ }
}
function emit() { persist(); subs.forEach((fn) => fn(positions)); }

export function getDemoBook() { return positions; }
export function subscribeDemoBook(fn: (p: DemoPosition[]) => void) {
  subs.add(fn); fn(positions);
  return () => { subs.delete(fn); };
}
export function addDemoPosition(p: DemoPosition) {
  const existing = positions.find((x) => x.symbol === p.symbol);
  if (existing) {
    positions = positions.map((x) => x.symbol === p.symbol ? { ...x, qty: x.qty + p.qty } : x);
  } else {
    positions = [...positions, p];
  }
  emit();
}
export function removeDemoPosition(symbol: string) {
  positions = positions.filter((p) => p.symbol !== symbol);
  emit();
}
export function updateDemoPosition(symbol: string, patch: Partial<DemoPosition>) {
  positions = positions.map((p) => p.symbol === symbol ? { ...p, ...patch } : p);
  emit();
}
export function clearDemoBook() { positions = []; emit(); }
export function resetDemoBook() { positions = DEFAULTS.map((p) => ({ ...p })); emit(); }
