import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { TICKERS, type Instrument, fmt, fmtPct } from "@/lib/market";
import { MiniSparkline } from "./MiniSparkline";
import { subscribeDemoBook, type DemoPosition } from "@/lib/demoBook";
import { api, type NewsPayload, type TapeItem } from "@/lib/api";

const GICS = [
  { name: "Info Tech", symbol: "XLK" },
  { name: "Comms", symbol: "XLC" },
  { name: "Cons Discr", symbol: "XLY" },
  { name: "Cons Staples", symbol: "XLP" },
  { name: "Health Care", symbol: "XLV" },
  { name: "Financials", symbol: "XLF" },
  { name: "Industrials", symbol: "XLI" },
  { name: "Energy", symbol: "XLE" },
  { name: "Utilities", symbol: "XLU" },
  { name: "Real Estate", symbol: "XLRE" },
  { name: "Materials", symbol: "XLB" },
] as const;
const SECTOR_SYMBOLS = GICS.map((sector) => sector.symbol);
type TapePayload = { items: TapeItem[]; live: boolean };

function nowLine(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(now);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return `${date} · ${time} ET · New York market time`;
}

type SetupChip = { label: string; code: string; sym?: string };

export function HomeOverview({
  instruments,
  onOpenSymbol,
  onRun,
}: {
  instruments: Record<string, Instrument>;
  onOpenSymbol: (sym: string) => void;
  onRun?: (code: string, sym?: string) => void;
}) {
  const list = TICKERS.map((s) => instruments[s]).filter(Boolean);
  const spy = instruments["SPY"];
  const sectorTape = useQuery({
    queryKey: ["sector-tape", SECTOR_SYMBOLS],
    queryFn: () => api<TapePayload>(`/tape?symbols=${encodeURIComponent(SECTOR_SYMBOLS.join(","))}`),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const vixTape = useQuery({
    queryKey: ["vix-tape"],
    queryFn: () => api<TapePayload>("/tape?symbols=%5EVIX"),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const vix = vixTape.data?.items[0];

  const [positions, setPositions] = useState<DemoPosition[]>([]);
  useEffect(() => subscribeDemoBook(setPositions), []);

  const bookAgg = useMemo(() => {
    let notional = 0, prev = 0, pnl = 0;
    for (const p of positions) {
      const inst = instruments[p.symbol];
      if (!inst) continue;
      notional += inst.price * p.qty;
      prev += inst.prevClose * p.qty;
      pnl += (inst.price - inst.prevClose) * p.qty;
    }
    const pct = prev !== 0 ? (pnl / Math.abs(prev)) * 100 : 0;
    return { notional, pnl, pct };
  }, [positions, instruments]);

  const topMovers = useMemo(
    () => [...list].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 3),
    [list],
  );
  const moverSymbols = topMovers.map((inst) => inst.symbol);
  const moverNews = useQuery({
    queryKey: ["home-mover-news", moverSymbols],
    queryFn: () => Promise.all(moverSymbols.map((symbol) => api<NewsPayload>(`/news/${symbol}`))),
    enabled: moverSymbols.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const movers = useMemo(
    () =>
      topMovers.map((inst, index) => {
        const payload = moverNews.data?.[index];
        const first = (payload?.items?.[0] ?? payload?.headlines?.[0]) as
          | { title?: unknown }
          | undefined;
        const headline =
          typeof first?.title === "string"
            ? first.title
            : `Real ${inst.dataSource} quote · no recent provider catalyst`;
        return { inst, headline };
      }),
    [moverNews.data, topMovers],
  );

  const sectorReturns = useMemo(
    () =>
      GICS.flatMap((sector) => {
        const item = sectorTape.data?.items.find((quote) => quote.ticker === sector.symbol);
        if (!item || !Number.isFinite(item.change_pct)) return [];
        return [{ name: sector.name, symbol: sector.symbol, ret: item.change_pct * 100 }];
      })
        .sort((a, b) => b.ret - a.ret),
    [sectorTape.data],
  );


  const [dateLine, setDateLine] = useState("");
  useEffect(() => { setDateLine(nowLine()); }, []);

  // A deterministic summary derived only from provider quotes, news, and the local demo book.
  const briefFull = useMemo(() => {
    const spyPct = spy?.changePct ?? 0;
    const dir = spyPct >= 0.1 ? "is firm" : spyPct <= -0.1 ? "is heavy" : "is two-way";
    const outlier = movers[0]?.inst;
    const outlierTxt = outlier ? ` ${outlier.symbol} ${fmtPct(outlier.changePct)} is the outlier — ${movers[0].headline.toLowerCase()}` : "";
    const bookTxt = positions.length
      ? ` Your demo book is ${bookAgg.pct >= 0 ? "up" : "down"} ${Math.abs(bookAgg.pct).toFixed(2)}% on ${positions.length} positions.`
      : " The demo book is empty.";
    const sectorTxt = sectorReturns[0] ? ` ${sectorReturns[0].name} leads sectors at ${fmtPct(sectorReturns[0].ret)}.` : "";
    return `SPY ${fmtPct(spyPct)} — the tape ${dir}.${outlierTxt}.${bookTxt}${sectorTxt}`;
  }, [spy, movers, positions.length, bookAgg.pct, sectorReturns]);

  const [brief, setBrief] = useState("");
  useEffect(() => {
    let i = 0; setBrief("");
    const id = setInterval(() => {
      i++;
      setBrief(briefFull.slice(0, i));
      if (i >= briefFull.length) clearInterval(id);
    }, 12);
    return () => clearInterval(id);
  }, [briefFull]);

  // Navigation chips derived only from live quote values.
  const setups: SetupChip[] = useMemo(() => {
    const out: SetupChip[] = [];
    if (movers[0]) out.push({ label: `${movers[0].inst.symbol} ${fmtPct(movers[0].inst.changePct)} → inspect real quote`, code: "MK", sym: movers[0].inst.symbol });
    if (sectorReturns[0]) out.push({ label: `${sectorReturns[0].name} leads via ${sectorReturns[0].symbol} → cross-asset`, code: "CX", sym: sectorReturns[0].symbol });
    if (vix) out.push({ label: `VIX ${fmt(vix.last)} · ${fmtPct(vix.change_pct * 100)} → risk`, code: "RISK" });
    if (positions.length === 0) out.push({ label: `Empty book — inspect the demo → click P&L ribbon`, code: "" });
    return out.slice(0, 3);
  }, [movers, sectorReturns, vix, positions.length]);

  return (
    <div className="mx-auto flex h-full max-w-[980px] flex-col gap-5 overflow-y-auto px-8 py-6">
      {/* Date line */}
      <div className="font-serif text-[16px] italic text-muted-foreground">{dateLine}</div>

      {/* Brief */}
      <div className="border-l-2 border-primary/50 pl-4">
        <div className="mono-caps mb-1 flex items-center gap-2 text-[10px] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-live" />
          MARKET BRIEF · DATA-DERIVED
        </div>
        <div className="font-serif text-[22px] leading-[1.4] text-foreground">
          {brief}
          {brief.length < briefFull.length && <span className="inline-block h-5 w-2 bg-primary/70 align-middle animate-pulse-live" />}
        </div>
      </div>

      {/* Three instruments */}
      <div className="grid grid-cols-3 gap-6 border-y border-divider py-5">
        <InstrumentCell label="SPY" sublabel="S&P 500" inst={spy} onOpen={() => spy && onOpenSymbol("SPY")} />
        <VixCell quote={vix} />
        <BookCell notional={bookAgg.notional} pnl={bookAgg.pnl} pct={bookAgg.pct} count={positions.length} />
      </div>

      {/* What moved */}
      <div>
        <div className="mono-caps mb-2 text-[10px] text-primary">WHAT MOVED</div>
        <div className="divide-y divide-divider/60">
          {movers.map(({ inst, headline }) => {
            const up = inst.changePct >= 0;
            return (
              <button
                key={inst.symbol}
                onClick={() => onOpenSymbol(inst.symbol)}
                className="group flex w-full items-center gap-4 py-3 text-left transition hover:bg-raised px-1"
              >
                <span className="mono-caps w-16 shrink-0 border border-border bg-panel px-2 py-1 text-center text-[10px] text-primary group-hover:border-primary">{inst.symbol}</span>
                <span className={`mono-caps w-16 shrink-0 text-right font-mono text-[12px] tabular-nums ${up ? "text-up" : "text-down"}`}>{up ? "▲" : "▼"} {fmtPct(inst.changePct)}</span>
                <span className="font-serif text-[14px] leading-snug text-foreground">{headline}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Today's setup */}
      <div>
        <div className="mono-caps mb-2 text-[10px] text-primary">TODAY'S SETUP</div>
        <div className="flex flex-wrap gap-2">
          {setups.map((s, i) => (
            <button
              key={i}
              onClick={() => { if (s.sym) onOpenSymbol(s.sym); if (s.code && onRun) onRun(s.code, s.sym); }}
              className="mono-caps interactive group flex items-center gap-2 border border-border bg-panel px-3 py-2 text-[11px] text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <span className="text-primary/70 group-hover:text-primary">▸</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sector pulse — compact bottom strip */}
      <div className="mt-auto border-t border-divider pt-3">
        <div className="mono-caps mb-2 flex items-center justify-between text-[9px] text-faint">
          <span>SECTOR PULSE</span>
          <span>{sectorReturns.length ? `${sectorReturns[0].name} ${fmtPct(sectorReturns[0].ret)} · ${sectorReturns[sectorReturns.length - 1].name} ${fmtPct(sectorReturns[sectorReturns.length - 1].ret)}` : sectorTape.isPending ? "LOADING ETF QUOTES…" : "SECTOR DATA UNAVAILABLE"}</span>
        </div>
        <div className="flex items-stretch gap-0.5">
          {sectorReturns.map((s) => {
            const abs = Math.abs(s.ret);
            const w = Math.max(2, abs * 22);
            const up = s.ret >= 0;
            return (
              <div key={s.name} className="group relative flex-1" title={`${s.name} · ${fmtPct(s.ret)}`}>
                <div className="h-6 border border-divider/40 bg-background overflow-hidden">
                  <div
                    className={`h-full ${up ? "bg-up/60" : "bg-down/60"}`}
                    style={{ width: `${Math.min(100, w * 2)}%`, transition: "width 500ms cubic-bezier(0.16,1,0.3,1)" }}
                  />
                </div>
                <div className="mono-caps mt-1 truncate text-center text-[8.5px] text-faint group-hover:text-foreground">{s.name.slice(0,4)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InstrumentCell({ label, sublabel, inst, onOpen }: { label: string; sublabel: string; inst?: Instrument; onOpen: () => void }) {
  const up = (inst?.changePct ?? 0) >= 0;
  return (
    <button onClick={onOpen} className="text-left group">
      <div className="mono-caps text-[10px] text-primary">{label} <span className="text-faint">· {sublabel}</span></div>
      <div className="mt-1 font-mono text-[28px] tabular-nums text-foreground group-hover:text-primary transition">{inst ? fmt(inst.price) : "—"}</div>
      <div className="mt-1 flex items-center gap-3">
        <span className={`mono-caps text-[11px] tabular-nums ${up ? "text-up" : "text-down"}`}>{up ? "▲" : "▼"} {inst ? fmtPct(inst.changePct) : "—"}</span>
        {inst && <MiniSparkline history={inst.history.slice(-48)} up={up} width={80} height={22} color={up ? "#42C98B" : "#F06464"} />}
      </div>
    </button>
  );
}

function VixCell({ quote }: { quote?: TapeItem }) {
  const changePct = (quote?.change_pct ?? 0) * 100;
  const up = changePct >= 0;
  return (
    <div className="text-left">
      <div className="mono-caps text-[10px] text-primary">VIX <span className="text-faint">· {quote?.source ?? "UNAVAILABLE"}</span></div>
      <div className="mt-1 font-mono text-[28px] tabular-nums text-foreground">{quote ? fmt(quote.last) : "—"}</div>
      <div className="mono-caps mt-1 text-[11px] tabular-nums">
        <span className={up ? "text-down" : "text-up"}>{quote ? `${up ? "▲" : "▼"} ${fmtPct(changePct)}` : "QUOTE UNAVAILABLE"}</span>
      </div>
    </div>
  );
}


function BookCell({ notional, pnl, pct, count }: { notional: number; pnl: number; pct: number; count: number }) {
  const up = pnl >= 0;
  if (count === 0) {
    return (
      <div className="text-left">
        <div className="mono-caps text-[10px] text-primary">YOUR BOOK <span className="text-faint">· demo</span></div>
        <div className="mt-1 font-mono text-[28px] tabular-nums text-muted-foreground">—</div>
        <div className="mono-caps mt-1 text-[10px] text-faint">click P&amp;L ribbon → RESET DEMO</div>
      </div>
    );
  }
  return (
    <div className="text-left">
      <div className="mono-caps text-[10px] text-primary">YOUR BOOK <span className="text-faint">· {count} positions</span></div>
      <div className={`mt-1 font-mono text-[28px] tabular-nums ${up ? "text-up" : "text-down"}`}>
        {up ? "+" : "−"}${fmt(Math.abs(pnl), 0)}
      </div>
      <div className="mono-caps mt-1 text-[11px] tabular-nums">
        <span className={up ? "text-up" : "text-down"}>{up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%</span>
        <span className="ml-2 text-faint">${fmt(Math.abs(notional)/1000, 0)}k notional</span>
      </div>
    </div>
  );
}

