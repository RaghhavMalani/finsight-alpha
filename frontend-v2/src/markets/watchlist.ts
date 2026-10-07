import { useSyncExternalStore } from "react";
import { DEFAULT_WATCHLIST, normalizeTicker, parseWatchlist } from "./contracts";

const KEY = "finsight.markets.watchlist.v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached = DEFAULT_WATCHLIST;
let memory: string[] | null = null;
function snapshot() {
  if (typeof window === "undefined") return DEFAULT_WATCHLIST;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try { cached = raw === null ? DEFAULT_WATCHLIST : parseWatchlist(JSON.parse(raw)); }
      catch { cached = DEFAULT_WATCHLIST; }
    }
    return memory ?? cached;
  } catch { return memory ?? cached; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) { memory = null; listener(); }
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
export function setWatchlist(tickers: string[]) {
  const next = parseWatchlist(tickers);
  memory = next;
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); memory = null; }
  catch { /* Private browsing can refuse storage; keep the list for this session. */ }
  listeners.forEach((listener) => listener());
}
export function toggleWatchlist(ticker: string) {
  const symbol = normalizeTicker(ticker);
  if (!symbol) return;
  const current = snapshot();
  setWatchlist(current.includes(symbol) ? current.filter((t) => t !== symbol) : [...current, symbol]);
}
export function useWatchlist() {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_WATCHLIST);
}
