import { useEffect, useMemo, useRef, useState } from "react";
import { ArcGauge } from "./ArcGauge";
import { analystFor } from "@/lib/analyst";
import { viridis, fmt } from "@/lib/market";

type Contribution = { name: string; w: number; dir: "up" | "down" };
type Signal = {
  name: string;
  conf: number;
  dir: "up" | "down";
  note: string;
  because: Contribution[];
};

const SIGNALS: Signal[] = [
  {
    name: "Momentum · 20/50",
    conf: 0.82,
    dir: "up",
    note: "Trend intact, expanding breadth",
    because: [
      { name: "20D return", w: 0.41, dir: "up" },
      { name: "MA slope 50", w: 0.28, dir: "up" },
      { name: "Breadth A/D", w: 0.19, dir: "up" },
    ],
  },
  {
    name: "Mean rev · Z-score",
    conf: 0.34,
    dir: "down",
    note: "No extreme yet — patience",
    because: [
      { name: "Z(price,20)", w: 0.36, dir: "down" },
      { name: "Bollinger %B", w: 0.24, dir: "down" },
      { name: "RSI(14)", w: 0.18, dir: "up" },
    ],
  },
  {
    name: "Vol regime · HMM",
    conf: 0.61,
    dir: "up",
    note: "State 2 → 3 transition",
    because: [
      { name: "Realized vol 10D", w: 0.38, dir: "up" },
      { name: "IV rank", w: 0.25, dir: "up" },
      { name: "VIX term slope", w: 0.16, dir: "down" },
    ],
  },
  {
    name: "Order flow imbalance",
    conf: 0.71,
    dir: "up",
    note: "Buys +1.4σ vs 30D",
    because: [
      { name: "Signed volume", w: 0.44, dir: "up" },
      { name: "Ask-lift ratio", w: 0.27, dir: "up" },
      { name: "Trade size µ", w: 0.14, dir: "up" },
    ],
  },
];

const FEATURES = [
  { name: "20D return", w: 0.28 },
  { name: "RSI(14)", w: 0.21 },
  { name: "IV rank", w: 0.18 },
  { name: "Sector beta", w: 0.14 },
  { name: "Put/Call ratio", w: 0.11 },
  { name: "5D vol", w: 0.08 },
];

// Small ticking confidence trend per signal (visual only).
function useConfidenceTrend(base: number): number[] {
  const [arr, setArr] = useState<number[]>(() =>
    Array.from({ length: 24 }, (_, i) => Math.max(0, Math.min(1, base + Math.sin(i * 0.6) * 0.06)))
  );
  const ref = useRef(base);
  ref.current = base;
  useEffect(() => {
    const id = setInterval(() => {
      setArr((prev) => {
        const next = prev.slice(1);
        const jitter = (Math.random() - 0.5) * 0.05;
        next.push(Math.max(0, Math.min(1, ref.current + jitter)));
        return next;
      });
    }, 1200);
    return () => clearInterval(id);
  }, []);
  return arr;
}

function SignalCard({ s, isOpen, onToggle }: { s: Signal; isOpen: boolean; onToggle: () => void }) {
  const trend = useConfidenceTrend(s.conf);
  return (
    <div className="border border-divider bg-raised p-3">
      <div className="mono-caps flex items-center justify-between text-[10px]">
        <span className="text-foreground">{s.name}</span>
        <span className={s.dir === "up" ? "text-up" : "text-down"}>
          {s.dir === "up" ? "▲ LONG" : "▼ SHORT"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <ArcGauge value={s.conf} dir={s.dir} size={96} label="conf" trend={trend} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted-foreground">{s.note}</div>
          <button
            onClick={onToggle}
            className="mono-caps interactive mt-2 inline-flex items-center gap-1 border border-border px-1.5 py-0.5 text-[9px] text-primary hover:border-primary"
          >
            <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
            BECAUSE
          </button>
        </div>
      </div>
      <div
        className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="min-h-0">
          <div className="mt-2 space-y-1.5 border-t border-divider pt-2">
            {s.because.map((b) => {
              const sign = b.dir === "up" ? "+" : "−";
              const col = b.dir === "up" ? "text-up" : "text-down";
              return (
                <div key={b.name} className="grid grid-cols-[110px_1fr_44px] items-center gap-2">
                  <span className="mono-caps text-[9px] text-muted-foreground">{b.name}</span>
                  <div className="h-2 bg-background">
                    <div
                      className="h-full bg-primary/80"
                      style={{
                        width: isOpen ? `${Math.min(100, b.w * 200)}%` : "0%",
                        transition: "width 700ms cubic-bezier(0.16,1,0.3,1)",
                      }}
                    />
                  </div>
                  <span className={`text-right font-mono text-[10px] tabular-nums ${col}`}>
                    {sign}
                    {(b.w * 100).toFixed(0)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MLSignals({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const analyst = useMemo(() => analystFor(symbol), [symbol]);

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="mono-caps text-[10px] text-primary">SIGNALS · {symbol}</div>
          {SIGNALS.map((s) => (
            <SignalCard
              key={s.name}
              s={s}
              isOpen={!!open[s.name]}
              onToggle={() => setOpen((o) => ({ ...o, [s.name]: !o[s.name] }))}
            />
          ))}
        </div>
        <div>
          <div className="mono-caps mb-3 text-[10px] text-primary">FEATURE IMPORTANCE</div>
          <div className="space-y-2">
            {FEATURES.map((f) => (
              <div key={f.name} className="grid grid-cols-[120px_1fr_40px] items-center gap-3">
                <span className="mono-caps text-[10px] text-muted-foreground">{f.name}</span>
                <div className="h-4 bg-raised">
                  <div className="h-full bg-primary/70" style={{ width: `${f.w * 300}%`, transition: "width 800ms cubic-bezier(0.16,1,0.3,1)" }} />
                </div>
                <span className="text-right font-mono text-[11px] tabular-nums text-foreground">{(f.w * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <div className="mono-caps mt-6 text-[10px] text-muted-foreground">MODEL · Gradient boost ensemble v3.2</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="border border-divider bg-raised px-3 py-2"><div className="mono-caps text-[9px] text-faint">ACC (walk-fwd)</div><div className="font-mono text-lg tabular-nums text-foreground">62.4%</div></div>
            <div className="border border-divider bg-raised px-3 py-2"><div className="mono-caps text-[9px] text-faint">SHARPE (SIM)</div><div className="font-mono text-lg tabular-nums text-up">1.87</div></div>
            <div className="border border-divider bg-raised px-3 py-2"><div className="mono-caps text-[9px] text-faint">MAX DD</div><div className="font-mono text-lg tabular-nums text-down">-8.4%</div></div>
          </div>
        </div>
      </div>

      {/* ─── ANALYST DECISION LAYER ─── */}
      <div className="mono-caps mt-6 flex items-center gap-2 border-b border-divider pb-2 text-[10px] text-primary">
        ANALYST DECISION LAYER · {symbol}
        <span className="ml-auto text-[9px] text-faint">simulated · internally consistent</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <AnalystConsensus a={analyst} />
        <FactorScorecard a={analyst} />
        <PeersTable a={analyst} />
      </div>
      <BullBear a={analyst} />
    </div>
  );
}

function AnalystConsensus({ a }: { a: ReturnType<typeof analystFor> }) {
  const total = a.ratings.buy + a.ratings.hold + a.ratings.sell;
  const bp = (a.ratings.buy/total)*100;
  const hp = (a.ratings.hold/total)*100;
  const sp = (a.ratings.sell/total)*100;
  const targetRange = a.target.high - a.target.low;
  const spotPos = ((a.price - a.target.low) / (targetRange || 1)) * 100;
  const avgPos = ((a.target.avg - a.target.low) / (targetRange || 1)) * 100;
  return (
    <div className="border border-divider bg-raised p-3">
      <div className="mono-caps text-[9px] text-faint">ANALYST CONSENSUS · {total} FIRMS</div>
      <div className="mt-2 flex h-2 overflow-hidden bg-background">
        <div style={{ width: `${bp}%`, background: "#42C98B" }} />
        <div style={{ width: `${hp}%`, background: "#636C74" }} />
        <div style={{ width: `${sp}%`, background: "#F06464" }} />
      </div>
      <div className="mono-caps mt-1 flex justify-between text-[9px]">
        <span className="text-up">BUY {a.ratings.buy}</span>
        <span className="text-muted-foreground">HOLD {a.ratings.hold}</span>
        <span className="text-down">SELL {a.ratings.sell}</span>
      </div>

      <div className="mt-4">
        <div className="mono-caps flex justify-between text-[9px] text-faint"><span>TARGET RANGE</span><span className={a.target.upsidePct >= 0 ? "text-up" : "text-down"}>{a.target.upsidePct >= 0 ? "▲" : "▼"} {a.target.upsidePct.toFixed(1)}%</span></div>
        <div className="relative mt-1 h-2 bg-background">
          <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-divider" />
          <div className="absolute top-0 h-full w-[3px] bg-info" style={{ left: `${spotPos}%`, transform: "translateX(-50%)" }} title={`Spot $${fmt(a.price)}`} />
          <div className="absolute top-0 h-full w-[3px] bg-primary" style={{ left: `${avgPos}%`, transform: "translateX(-50%)" }} title={`Avg target $${fmt(a.target.avg)}`} />
        </div>
        <div className="mono-caps mt-1 flex justify-between text-[9px] text-faint">
          <span>${fmt(a.target.low)}</span>
          <span>avg ${fmt(a.target.avg)}</span>
          <span>${fmt(a.target.high)}</span>
        </div>
      </div>

      <div className="mt-4 border-t border-divider pt-3">
        <div className="mono-caps flex items-baseline justify-between text-[9px] text-faint">
          <span>NEXT EARNINGS · {a.earnings.nextDate}</span>
          <span className="text-primary">±{a.earnings.impliedMovePct.toFixed(1)}% implied</span>
        </div>
        <div className="mono-caps mt-2 flex items-center gap-1 text-[9px] text-faint">
          <span>LAST 8Q</span>
          <div className="flex gap-1">
            {a.earnings.history.map((beat, i) => (
              <span key={i} className={`inline-flex h-3.5 w-3.5 items-center justify-center border ${beat ? "border-up text-up" : "border-down text-down"} text-[7px]`}>{beat ? "✓" : "✗"}</span>
            ))}
          </div>
          <span className="ml-auto text-foreground">{a.earnings.history.filter(Boolean).length}/8 beat</span>
        </div>
      </div>
    </div>
  );
}

function FactorScorecard({ a }: { a: ReturnType<typeof analystFor> }) {
  return (
    <div className="border border-divider bg-raised p-3">
      <div className="mono-caps text-[9px] text-faint">FACTOR SCORECARD · PERCENTILE RANK</div>
      <div className="mt-3 grid grid-cols-5 gap-1">
        {a.factors.map((f) => (
          <div key={f.name} className="flex flex-col items-center">
            <ArcGauge value={f.percentile / 100} dir={f.percentile >= 50 ? "up" : "down"} size={64} label={f.name} />
            <div className="mono-caps mt-1 font-mono text-[10px] text-foreground">{f.percentile}</div>
          </div>
        ))}
      </div>
      <div className="mono-caps mt-3 border-t border-divider pt-2 text-[9px] text-muted-foreground">
        Higher = ranks in top X% of universe on that factor.
      </div>
    </div>
  );
}

function PeersTable({ a }: { a: ReturnType<typeof analystFor> }) {
  const cols: { k: keyof typeof a.peers[number]; l: string; inv?: boolean; fmt: (v: number) => string }[] = [
    { k: "pe", l: "P/E", inv: true, fmt: (v) => v.toFixed(1) },
    { k: "evEbitda", l: "EV/EBITDA", inv: true, fmt: (v) => v.toFixed(1) },
    { k: "margin", l: "MARGIN %", fmt: (v) => v.toFixed(1) },
    { k: "ytd", l: "YTD %", fmt: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}` },
  ];
  const shade = (col: typeof cols[number], v: number) => {
    const vals = a.peers.map((p) => p[col.k] as number);
    const min = Math.min(...vals); const max = Math.max(...vals);
    let t = (v - min) / (max - min || 1);
    if (col.inv) t = 1 - t;
    return viridis(t * 0.85);
  };
  return (
    <div className="border border-divider bg-raised p-3">
      <div className="mono-caps text-[9px] text-faint">PEERS · VS COMPS</div>
      <div className="mono-caps mt-2 grid grid-cols-5 gap-1 text-[9px] text-faint">
        <span>SYM</span>{cols.map((c) => <span key={c.l} className="text-right">{c.l}</span>)}
      </div>
      {a.peers.map((p, i) => (
        <div key={p.sym} className={`grid grid-cols-5 gap-1 border-b border-divider/60 py-1 ${i === 0 ? "bg-primary/5" : ""}`}>
          <span className={`mono-caps text-[10px] ${i === 0 ? "text-primary" : "text-foreground"}`}>{p.sym}{i === 0 && " ●"}</span>
          {cols.map((c) => {
            const v = p[c.k] as number;
            return <span key={c.l} className="text-right font-mono text-[10px] tabular-nums" style={{ background: shade(c, v), color: "#0B0C0D", padding: "0 4px" }}>{c.fmt(v)}</span>;
          })}
        </div>
      ))}
    </div>
  );
}

function BullBear({ a }: { a: ReturnType<typeof analystFor> }) {
  const [bull, setBull] = useState(""); const [bear, setBear] = useState("");
  useEffect(() => {
    setBull(""); setBear("");
    let i = 0; const idB = setInterval(() => { i++; setBull(a.bull.slice(0, i)); if (i >= a.bull.length) clearInterval(idB); }, 12);
    let j = 0; const idBr = setInterval(() => { j++; setBear(a.bear.slice(0, j)); if (j >= a.bear.length) clearInterval(idBr); }, 12);
    return () => { clearInterval(idB); clearInterval(idBr); };
  }, [a]);
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="border-l-2 border-up bg-raised p-3">
        <div className="mono-caps mb-2 text-[10px] text-up">▲ BULL CASE</div>
        <div className="text-[11px] leading-relaxed text-foreground">{bull}<span className="animate-pulse">▊</span></div>
      </div>
      <div className="border-l-2 border-down bg-raised p-3">
        <div className="mono-caps mb-2 text-[10px] text-down">▼ BEAR CASE</div>
        <div className="text-[11px] leading-relaxed text-foreground">{bear}<span className="animate-pulse">▊</span></div>
      </div>
    </div>
  );
}

