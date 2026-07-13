import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fmt, fmtPct, type Instrument } from "@/lib/market";
import { api, type TapeItem } from "@/lib/api";

export function DepthLadder({ instrument }: { instrument: Instrument }) {
  const dayRange = Math.max(instrument.sessionHigh - instrument.sessionLow, 0);
  const rangePosition =
    dayRange > 0
      ? Math.max(0, Math.min(100, ((instrument.price - instrument.sessionLow) / dayRange) * 100))
      : 50;
  const volume = instrument.volume > 0 ? instrument.volume.toLocaleString() : "UNAVAILABLE";

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mono-caps flex items-center justify-between text-[10px]">
        <span className="text-primary">PROVIDER QUOTE SNAPSHOT</span>
        <span className="text-faint">{instrument.dataSource}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 font-mono text-[12px]">
        <QuoteMetric label="LAST" value={fmt(instrument.price)} />
        <QuoteMetric label="CHANGE" value={fmtPct(instrument.changePct)} tone={instrument.changePct >= 0 ? "up" : "down"} />
        <QuoteMetric label="OPEN" value={fmt(instrument.open)} />
        <QuoteMetric label="PREV CLOSE" value={fmt(instrument.prevClose)} />
        <QuoteMetric label="DAY HIGH" value={fmt(instrument.sessionHigh)} />
        <QuoteMetric label="DAY LOW" value={fmt(instrument.sessionLow)} />
        <QuoteMetric label="VOLUME" value={volume} />
        <QuoteMetric label="LEVEL 2" value="NOT SUPPLIED" />
      </div>
      <div className="mt-5">
        <div className="mono-caps mb-1 flex justify-between text-[9px] text-faint">
          <span>{fmt(instrument.sessionLow)}</span>
          <span>SESSION RANGE</span>
          <span>{fmt(instrument.sessionHigh)}</span>
        </div>
        <div className="relative h-2 bg-divider">
          <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-primary" style={{ left: `${rangePosition}%` }} />
        </div>
      </div>
      <div className="mono-caps mt-auto border border-info/30 bg-info/5 p-3 text-[9px] leading-relaxed text-info">
        TRUE BID/ASK DEPTH REQUIRES A LEVEL 2 PROVIDER. NO ORDER-BOOK LEVELS ARE SYNTHESIZED.
      </div>
    </div>
  );
}

function QuoteMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <div className="mono-caps text-[9px] text-faint">{label}</div>
      <div className={tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground"}>{value}</div>
    </div>
  );
}

const SECTOR_ETFS = [
  { label: "Tech", symbol: "XLK" },
  { label: "Semis", symbol: "SOXX" },
  { label: "Financials", symbol: "XLF" },
  { label: "Energy", symbol: "XLE" },
  { label: "Health", symbol: "XLV" },
  { label: "Consumer", symbol: "XLY" },
  { label: "Industrials", symbol: "XLI" },
  { label: "Utilities", symbol: "XLU" },
  { label: "Materials", symbol: "XLB" },
  { label: "REITs", symbol: "XLRE" },
  { label: "Comms", symbol: "XLC" },
  { label: "Staples", symbol: "XLP" },
] as const;

type SectorTapePayload = { items: TapeItem[]; live: boolean };

export function SectorHeatmap() {
  const symbols = SECTOR_ETFS.map((sector) => sector.symbol);
  const tape = useQuery({
    queryKey: ["sector-heatmap", symbols],
    queryFn: () => api<SectorTapePayload>(`/tape?symbols=${encodeURIComponent(symbols.join(","))}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const cells = useMemo(
    () =>
      SECTOR_ETFS.flatMap((sector) => {
        const quote = tape.data?.items.find((item) => item.ticker === sector.symbol);
        return quote
          ? [{ ...sector, value: quote.change_pct * 100, source: quote.source ?? (quote.live ? "FINNHUB" : "YFINANCE_EOD") }]
          : [];
      }),
    [tape.data],
  );

  if (tape.isPending) {
    return <div className="mono-caps grid h-full place-items-center text-[10px] text-faint">LOADING REAL SECTOR ETF QUOTES…</div>;
  }
  if (tape.isError || !cells.length) {
    return <div className="mono-caps grid h-full place-items-center text-[10px] text-down">SECTOR ETF DATA UNAVAILABLE</div>;
  }

  return (
    <div className="grid h-full grid-cols-4 gap-[2px] p-1">
      {cells.map((cell) => {
        const t = Math.max(-3, Math.min(3, cell.value));
        const bg =
          t >= 0
            ? `rgba(66,201,139,${0.15 + (t / 3) * 0.55})`
            : `rgba(240,100,100,${0.15 + (-t / 3) * 0.55})`;
        return (
          <div
            key={cell.symbol}
            className="flex flex-col items-center justify-center p-1"
            style={{ background: bg }}
            title={`${cell.symbol} · ${cell.source}`}
          >
            <div className="mono-caps text-[9px] text-foreground">{cell.label}</div>
            <div className={`font-mono text-xs ${t >= 0 ? "text-up" : "text-down"}`}>
              {fmtPct(cell.value)}
            </div>
            <div className="mono-caps mt-0.5 text-[7px] text-faint">{cell.symbol}</div>
          </div>
        );
      })}
    </div>
  );
}

