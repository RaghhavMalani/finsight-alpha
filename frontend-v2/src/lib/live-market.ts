import { useQuery } from "@tanstack/react-query";
import { useEffect, type Dispatch, type SetStateAction } from "react";

import { api, type TapeItem } from "@/lib/api";
import { TICKERS, type Instrument, unavailableInstrument } from "@/lib/market";

type TapePayload = {
  items: TapeItem[];
  live: boolean;
};

export type LiveMarketStatus = {
  connected: boolean;
  source: "FINNHUB" | "EOD" | "UNAVAILABLE";
  count: number;
  error: string | null;
  asOf: string | null;
};

function quoteTime(value: TapeItem["quote_ts"], live: boolean): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const day = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (day && !live) {
    const parsed = Date.parse(`${day[1]}T16:00:00-04:00`);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAsOf(items: TapeItem[], live: boolean): string | null {
  const latest = items.reduce<number | null>((max, item) => {
    const value = quoteTime(item.quote_ts, item.live ?? live);
    return value == null ? max : max == null ? value : Math.max(max, value);
  }, null);
  if (latest == null) return null;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "2-digit",
  })
    .format(new Date(latest))
    .toUpperCase();
  const time = live
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(latest))
    : "16:00";
  return `${date} / ${time} ET`;
}

/**
 * Anchor the terminal model to the real market-data API. Each refresh replaces
 * the displayed snapshot with provider price, change, session range, and
 * volume fields when available; unsupported fields remain unavailable.
 */
export function useLiveMarket(
  setInstruments: Dispatch<SetStateAction<Record<string, Instrument>>>,
  symbols: string[] = TICKERS,
): LiveMarketStatus {
  const symbolKey = Array.from(
    new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
  )
    .slice(0, 30)
    .join(",");
  const tape = useQuery({
    queryKey: ["market-tape", symbolKey],
    queryFn: () => api<TapePayload>(`/tape?symbols=${encodeURIComponent(symbolKey)}`),
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

        const current = next[item.ticker] ?? unavailableInstrument(item.ticker);
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
          history: [
            ...current.history.filter((point) => Number.isFinite(point.p)).slice(-119),
            { t: Date.now(), p: price, v: item.volume ?? undefined },
          ],
        };
      }

      return next;
    });
  }, [setInstruments, tape.data]);

  return {
    connected: Boolean(tape.data?.items.length),
    source: tape.data?.live ? "FINNHUB" : tape.data?.items.length ? "EOD" : "UNAVAILABLE",
    count: tape.data?.items.length ?? 0,
    error: tape.error instanceof Error ? tape.error.message : null,
    asOf: tape.data?.items.length ? formatAsOf(tape.data.items, Boolean(tape.data.live)) : null,
  };
}
