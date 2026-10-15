import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookDrawer } from "@/components/risk/BookDrawer";
import {
  admittedQuote,
  clearBookMarks,
  COMMODITIES,
  quoteSymbol,
  updateBookMarks,
  type QuotedMark,
} from "@/lib/book";
import { api, type TapeItem } from "@/lib/api";
import { subscribeDemoBook, type DemoPosition } from "@/lib/demoBook";
import { TICKERS, unavailableInstrument, type Instrument } from "@/lib/market";

export function PaperBook({ onClose }: { onClose: () => void }) {
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  useEffect(() => subscribeDemoBook(setPositions), []);
  const symbols = useMemo(
    () =>
      Array.from(
        new Set(
          [...positions.map((p) => p.symbol), ...Object.keys(COMMODITIES), ...TICKERS].map(
            quoteSymbol,
          ),
        ),
      ).slice(0, 30),
    [positions],
  );
  const symbolKey = symbols.join(",");
  const tape = useQuery({
    queryKey: ["risk-paper-editor-tape", symbolKey],
    queryFn: ({ signal }) =>
      api<{ items: TapeItem[] }>(`/tape?symbols=${encodeURIComponent(symbolKey)}`, { signal }),
    refetchInterval: 30_000,
    retry: 1,
  });
  const quotes = useMemo(() => {
    const result: Record<string, QuotedMark> = {};
    if (tape.isError) return result;
    for (const item of tape.data?.items ?? []) {
      const quote = {
        mark: item.last,
        source: item.source,
        quote_ts: item.quote_ts,
        live: item.live,
      };
      if (admittedQuote(quote)) result[item.ticker] = quote;
    }
    return result;
  }, [tape.data, tape.isError]);
  const instruments = useMemo(() => {
    const result: Record<string, Instrument> = {};
    for (const symbol of symbols) result[symbol] = unavailableInstrument(symbol);
    for (const item of tape.data?.items ?? []) {
      const quote = quotes[item.ticker];
      if (!quote) continue;
      const base = result[item.ticker] ?? unavailableInstrument(item.ticker);
      const prevClose =
        Number.isFinite(item.prev_close) && item.prev_close! > 0 ? item.prev_close! : item.last;
      result[item.ticker] = {
        ...base,
        price: quote.mark,
        prevClose,
        change: quote.mark - prevClose,
        changePct: (quote.mark / prevClose - 1) * 100,
        dataSource: quote.source,
        open: item.open ?? quote.mark,
        sessionHigh: item.high ?? quote.mark,
        sessionLow: item.low ?? quote.mark,
        vwap: quote.mark,
        volume: item.volume ?? 0,
      };
    }
    return result;
  }, [quotes, symbols, tape.data]);
  useEffect(() => {
    if (tape.isError) {
      clearBookMarks();
      return;
    }
    if (!tape.data) return;
    const snapshot: Record<string, QuotedMark> = {};
    for (const position of positions) {
      const quote = quotes[quoteSymbol(position.symbol)];
      if (quote) snapshot[position.symbol] = quote;
    }
    if (quotes.SPY) snapshot.SPY = quotes.SPY;
    updateBookMarks(snapshot);
  }, [positions, quotes, tape.data, tape.isError]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paper book"
        className="max-h-[86vh] w-full max-w-3xl overflow-auto"
      >
        <div className="border border-info/40 bg-panel p-3 text-xs text-muted-foreground">
          LOCAL_PAPER_BOOK. Observed quote subset; missing source or observation clock is excluded.
          {tape.isError && (
            <span className="text-down"> Quote request failed; coverage cleared.</span>
          )}
        </div>
        <BookDrawer
          positions={positions}
          instruments={instruments}
          quotes={quotes}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
