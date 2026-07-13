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
 * Anchor the terminal model to the real market-data API. Each refresh replaces
 * the displayed snapshot with provider price, change, session range, and
 * volume fields when available; unsupported fields remain unavailable.
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
          item.prev_close ??
          (item.change_pct > -0.99 ? price / (1 + item.change_pct) : current.prevClose);
        const spreadBps = Math.max(1, current.annualVol * 30);
        const spread = Math.max(0.01, (price * spreadBps) / 10_000);

        next[item.ticker] = {
          ...current,
          prevClose,
          open: item.open ?? price,
          price,
          bid: price - spread / 2,
          ask: price + spread / 2,
          change: price - prevClose,
          changePct: item.change_pct * 100,
          sessionHigh: item.high ?? price,
          sessionLow: item.low ?? price,
          vwap: price,
          vwapSource: "UNAVAILABLE",
          dataSource: item.source === "FINNHUB" ? "FINNHUB" : "YFINANCE_EOD",
          volume: item.volume ?? 0,
          history: [{ t: Date.now(), p: price }],
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
