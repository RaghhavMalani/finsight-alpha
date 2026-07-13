import { useQuery } from "@tanstack/react-query";
import { useEffect, type Dispatch, type SetStateAction } from "react";

import { api, type TapeItem } from "@/lib/api";
import { TICKERS, type Instrument, seedInstrument } from "@/lib/market";

type TapePayload = {
  items: TapeItem[];
  live: boolean;
};

export type LiveMarketStatus = {
  connected: boolean;
  source: "FINNHUB" | "EOD" | "SIM";
  count: number;
  error: string | null;
};

/**
 * Anchor Lovable's rich terminal model to the real market-data API. The UI's
 * micro-ticks can continue between refreshes, but every refresh resets price,
 * change, spread, high/low and history to an actual live or EOD observation.
 */
export function useLiveMarket(
  setInstruments: Dispatch<SetStateAction<Record<string, Instrument>>>,
): LiveMarketStatus {
  const tape = useQuery({
    queryKey: ["market-tape", TICKERS.join(",")],
    queryFn: () => api<TapePayload>(`/tape?symbols=${encodeURIComponent(TICKERS.join(","))}`),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  useEffect(() => {
    if (!tape.data?.items.length) return;

    setInstruments((previous) => {
      const next = { ...previous };

      for (const item of tape.data.items) {
        if (!Number.isFinite(item.last) || !Number.isFinite(item.change_pct)) continue;

        const current = next[item.ticker] ?? seedInstrument(item.ticker);
        const price = item.last;
        const prevClose =
          item.change_pct > -0.99 ? price / (1 + item.change_pct) : current.prevClose;
        const spreadBps = Math.max(1, current.annualVol * 30);
        const spread = Math.max(0.01, (price * spreadBps) / 10_000);
        const lastTick = current.history[current.history.length - 1];

        next[item.ticker] = {
          ...current,
          prevClose,
          open: prevClose,
          price,
          bid: price - spread / 2,
          ask: price + spread / 2,
          change: price - prevClose,
          changePct: item.change_pct * 100,
          sessionHigh: Math.max(prevClose, price),
          sessionLow: Math.min(prevClose, price),
          vwap: price,
          history: [...current.history.slice(1), { t: Date.now(), p: price, v: lastTick?.v }],
        };
      }

      return next;
    });
  }, [setInstruments, tape.data]);

  return {
    connected: Boolean(tape.data?.items.length),
    source: tape.data?.live ? "FINNHUB" : tape.data?.items.length ? "EOD" : "SIM",
    count: tape.data?.items.length ?? 0,
    error: tape.error instanceof Error ? tape.error.message : null,
  };
}
