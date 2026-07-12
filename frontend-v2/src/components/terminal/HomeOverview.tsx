import { useEffect, useMemo, useState } from "react";
import { TICKERS, type Instrument, fmt, fmtPct, seedHeadlines, type Headline } from "@/lib/market";
import { MiniSparkline } from "./MiniSparkline";
import { subscribeDemoBook, type DemoPosition } from "@/lib/demoBook";

const GICS = [
  "Info Tech", "Comms", "Cons Discr", "Cons Staples", "Health Care",
  "Financials", "Industrials", "Energy", "Utilities", "Real Estate", "Materials",
];

function seededPct(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = (h * 16777619) >>> 0; }
  const rnd = (h % 1000) / 1000;
  return (rnd - 0.5) * 4;
}

function nowLine(): string {
  const d = new Date();
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const md  = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  // ~2:41 to close (16:00 ET)
  const now = new Date();
  const close = new Date(now); close.setHours(16, 0, 0, 0);
  let m = Math.round((close.getTime() - now.getTime()) / 60_000);
  if (m < 0) m += 24 * 60;
  const hh = Math.floor(m / 60), mm = m % 60;
  const dur = hh > 0 ? `${hh}:${String(mm).padStart(2,"0")}` : `${mm}m`;
  return `${day}, ${md} — markets open · ${dur} to the close.`;
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
  const qqq = instruments["QQQ"];

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

  const headlines: Headline[] = useMemo(() => seedHeadlines(), []);
  const movers = useMemo(() => {
    const sorted = [...list].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    return sorted.slice(0, 3).map((inst) => {
      const h = headlines.find((h) => h.sym === inst.symbol);
      return { inst, headline: h?.text ?? "flow leadership — no fresh catalyst on tape" };
    });
  }, [list, headlines]);

  const sectorReturns = useMemo(() =>
    GICS.map((s) => ({ name: s, ret: seededPct(s) })).sort((a, b) => b.ret - a.ret)
  , []);

  const [dateLine, setDateLine] = useState("");
  useEffect(() => { setDateLine(nowLine()); }, []);

  // AI DESK BRIEF — 3 sentences derived from state
  const briefFull = useMemo(() => {
    const spyPct = spy?.changePct ?? 0;
    const dir = spyPct >= 0.1 ? "opens firm" : spyPct <= -0.1 ? "opens heavy" : "opens two-way";
    const outlier = movers[0]?.inst;
    const outlierTxt = outlier ? ` ${outlier.symbol} ${fmtPct(outlier.changePct)} is the outlier — ${movers[0].headline.toLowerCase()}` : "";
    const bookTxt = positions.length
      ? ` Your book is ${bookAgg.pct >= 0 ? "up" : "down"} ${Math.abs(bookAgg.pct).toFixed(2)}% on ${positions.length} positions.`
      : " Your book is empty — pin a few names below to bring risk & recommendations to life.";
    const volTxt = qqq && Math.abs(qqq.changePct) < 0.4 ? " Realized vol is compressing; regime reads grinding." : " Realized vol is elevated; expect wider ranges into the bell.";
    return `SPY ${fmtPct(spyPct)} — the tape ${dir}.${outlierTxt}.${bookTxt}${volTxt}`;
  }, [spy, qqq, movers, positions.length, bookAgg.pct]);

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

  // TODAY'S SETUP chips derived from live state
  const setups: SetupChip[] = useMemo(() => {
    const out: SetupChip[] = [];
    if (movers[0]) out.push({ label: `${movers[0].inst.symbol} regime is aging → ML REGIMES`, code: "ML", sym: movers[0].inst.symbol });
    const rich = list.find((i) => i.annualVol > 0.45) ?? movers[1]?.inst;
    if (rich) out.push({ label: `IV rich on ${rich.symbol} → OC strategy builder`, code: "OC", sym: rich.symbol });
    out.push({ label: `CL backwardation steepening → RISK exposure`, code: "RISK" });
    if (positions.length === 0) out.push({ label: `Empty book — inspect the demo → click P&L ribbon`, code: "" });
    return out.slice(0, 3);
  }, [movers, list, positions.length]);

  return (
    <div className="mx-auto flex h-full max-w-[980px] flex-col gap-5 overflow-y-auto px-8 py-6">
      {/* Date line */}
      <div className="font-serif text-[16px] italic text-muted-foreground">{dateLine}</div>

      {/* Brief */}
      <div className="border-l-2 border-primary/50 pl-4">
        <div className="mono-caps mb-1 flex items-center gap-2 text-[10px] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-live" />
          AI DESK BRIEF
        </div>
        <div className="font-serif text-[22px] leading-[1.4] text-foreground">
          {brief}
          {brief.length < briefFull.length && <span className="inline-block h-5 w-2 bg-primary/70 align-middle animate-pulse-live" />}
        </div>
      </div>

      {/* Three instruments */}
      <div className="grid grid-cols-3 gap-6 border-y border-divider py-5">
        <InstrumentCell label="SPY" sublabel="S&P 500" inst={spy} onOpen={() => spy && onOpenSymbol("SPY")} />
        <VixCell />
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
          <span>{sectorReturns[0].name} +{sectorReturns[0].ret.toFixed(2)}% · {sectorReturns[sectorReturns.length-1].name} {sectorReturns[sectorReturns.length-1].ret.toFixed(2)}%</span>
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

function VixCell() {
  const [tick, setTick] = useState(0);
  useEffect(() => { setTick(Date.now()); const id = setInterval(() => setTick(Date.now()), 1400); return () => clearInterval(id); }, []);
  const value = 14.8 + (Math.sin((tick || 0) / 1e7) * 1.4);
  const chg = -0.35 + (Math.cos((tick || 0) / 1.2e7) * 0.6);
  const up = chg >= 0;
  return (
    <div className="text-left">
      <div className="mono-caps text-[10px] text-primary">VIX <span className="text-faint">· volatility</span></div>
      <div className="mt-1 font-mono text-[28px] tabular-nums text-foreground">{value.toFixed(2)}</div>
      <div className="mono-caps mt-1 text-[11px] tabular-nums">
        <span className={up ? "text-down" : "text-up"}>{up ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}</span>
        <span className="ml-2 text-faint">{up ? "fear bid" : "complacent"}</span>
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

