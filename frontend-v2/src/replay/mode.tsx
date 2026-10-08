import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";

export type DataMode = "replay" | "live";
let mode: DataMode = "replay";
let ticker = "SPY";
let pending = false;
const listeners = new Set<() => void>();
const tickerListeners = new Set<() => void>();
const subscribe = (callback: () => void) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};
export const getDataMode = () => mode;
export function localLiveAllowed() {
  return (
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) &&
    import.meta.env.VITE_ENABLE_LOCAL_LIVE === "true"
  );
}
export function useDataMode() {
  return useSyncExternalStore(subscribe, getDataMode, () => "replay" as const);
}
export async function changeDataMode(next: DataMode, client: QueryClient) {
  if (pending || next === mode || (next === "live" && !localLiveAllowed())) return;
  pending = true;
  try {
    await client.cancelQueries();
    client.clear();
    mode = next;
    listeners.forEach((listener) => listener());
  } finally {
    pending = false;
  }
}
export function setCurrentTicker(next: string) {
  if (ticker === next) return;
  ticker = next;
  tickerListeners.forEach((listener) => listener());
}
export function useCurrentTicker() {
  return useSyncExternalStore(
    (callback) => {
      tickerListeners.add(callback);
      return () => {
        tickerListeners.delete(callback);
      };
    },
    () => ticker,
    () => "SPY",
  );
}
