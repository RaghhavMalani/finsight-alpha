import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/terminal/Panel";
import { ArcGauge } from "@/components/terminal/ArcGauge";
import { fmt, viridis } from "@/lib/market";
import {
  getBook, subscribe, applyHedge, removeHedge, activeHedges, resetBook,
  var1d, riskContributions, netGreeks, stress, tradeVolumes, largestTrades,
  futuresCurve, COMMODITIES, type Book, type VaRMethod, SCENARIOS,
  type Position,
} from "@/lib/book";
import { toast } from "sonner";

export const Route = createFileRoute("/risk")({
  head: () => ({
    meta: [
      { title: "Risk desk — FinSight" },
      { name: "description", content: "Multi-asset VaR, exposure, stress lab and hedge suggestions." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RiskDesk,
});

function useCountUp(target: number, duration = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let start: number | null = null; let raf = 0;
    function step(ts: number) {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(target * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

type Tab = "OVERVIEW" | "EXPOSURE" | "STRESS" | "HEDGE";

function RiskDesk() {
  const [tab, setTab] = useState<Tab>("OVERVIEW");
  const [book, setBook] = useState<Book>(getBook);
  useEffect(() => subscribe(setBook), []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-divider bg-panel px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="mono-caps text-sm text-primary">FinSight</Link>
          <span className="mono-caps text-[10px] text-muted-foreground">RISK MANAGER</span>
          <div className="mono-caps flex items-center gap-3 text-[10px]">
            <span className="text-faint">NAV</span>
            <span className="font-mono text-foreground">${(book.nav/1e6).toFixed(2)}M</span>
            <span className="text-faint">DAY P&L</span>
            <span className={`font-mono ${book.pnlDay >= 0 ? "text-up" : "text-down"}`}>{book.pnlDay >= 0 ? "+" : "-"}${fmt(Math.abs(book.pnlDay))}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(["OVERVIEW","EXPOSURE","STRESS","HEDGE"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`mono-caps interactive border px-3 py-1 text-[10px] ${tab === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{t}</button>
          ))}
        </div>
        <Link to="/terminal" className="mono-caps text-[10px] text-muted-foreground hover:text-primary">← TERMINAL</Link>
      </header>

      <main className="flex-1 overflow-hidden p-2">
        {tab === "OVERVIEW" && <OverviewTab book={book} />}
        {tab === "EXPOSURE" && <ExposureTab book={book} />}
        {tab === "STRESS" && <StressTab book={book} />}
        {tab === "HEDGE" && <HedgeTab book={book} />}
      </main>
    </div>
  );
}

// ══════ OVERVIEW ══════════════════════════════════════════════════════
function OverviewTab({ book }: { book: Book }) {
  const [method, setMethod] = useState<VaRMethod>("HISTORICAL");
  const [conf, setConf] = useState<0.95 | 0.99>(0.95);
  const { var: varDollar, es } = useMemo(() => var1d(book, method, conf), [book, method, conf]);
  const varAnimated = useCountUp(varDollar);
  const esAnimated = useCountUp(es);
  const contribs = useMemo(() => riskContributions(book).sort((a,b) => b.contribPct - a.contribPct), [book]);
  const g = netGreeks(book);

  // Concentration alerts
  const bySector = new Map<string, number>();
  for (const p of book.positions) {
    bySector.set(p.sector ?? "Other", (bySector.get(p.sector ?? "Other") ?? 0) + p.gross);
  }
  const topSector = [...bySector.entries()].sort((a,b) => b[1] - a[1])[0];
  const topPct = topSector ? topSector[1] / book.gross : 0;

  const VAR_LIMIT = 500_000;

  return (
    <div className="grid h-full grid-cols-12 grid-rows-6 gap-2">
      {/* VaR suite */}
      <Panel code="VAR" title="Value-at-Risk · 1-day" className="col-span-6 row-span-3">
        <div className="p-3">
          <div className="mono-caps mb-3 flex items-center gap-1 text-[9px]">
            {(["PARAMETRIC","HISTORICAL","MONTE_CARLO"] as VaRMethod[]).map((m) => (
              <button key={m} onClick={() => setMethod(m)} className={`interactive border px-2 py-1 ${method === m ? "border-primary text-primary bg-primary/10" : "border-border text-faint hover:text-foreground"}`}>{m.replace("_"," ")}</button>
            ))}
            <div className="ml-auto flex gap-1">
              {([0.95, 0.99] as const).map((c) => (
                <button key={c} onClick={() => setConf(c)} className={`interactive border px-2 py-1 ${conf === c ? "border-primary text-primary bg-primary/10" : "border-border text-faint hover:text-foreground"}`}>{(c*100).toFixed(0)}%</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mono-caps text-[9px] text-faint">1D VaR {(conf*100).toFixed(0)}%</div>
              <div className="mt-1 font-mono text-4xl text-down">−${fmt(varAnimated, 0)}</div>
              <div className="mono-caps mt-1 text-[9px] text-faint">{((varAnimated/book.nav)*100).toFixed(2)}% OF NAV</div>
            </div>
            <div>
              <div className="mono-caps text-[9px] text-faint">EXPECTED SHORTFALL</div>
              <div className="mt-1 font-mono text-4xl text-down">−${fmt(esAnimated, 0)}</div>
              <div className="mono-caps mt-1 text-[9px] text-faint">AVG LOSS IN TAIL</div>
            </div>
          </div>
          <div className="mt-6">
            <div className="mono-caps mb-2 flex justify-between text-[9px] text-faint"><span>VAR CAPACITY</span><span>{((varDollar / VAR_LIMIT)*100).toFixed(0)}% OF ${(VAR_LIMIT/1000).toFixed(0)}K LIMIT</span></div>
            <div className="h-3 border border-divider bg-background">
              <div className={`h-full ${varDollar > VAR_LIMIT ? "bg-down" : varDollar > VAR_LIMIT*0.8 ? "bg-primary" : "bg-up"}`} style={{ width: `${Math.min(100, (varDollar/VAR_LIMIT)*100)}%`, transition: "width 700ms cubic-bezier(0.16,1,0.3,1)" }} />
            </div>
          </div>
        </div>
      </Panel>

      {/* Net greeks */}
      <Panel code="GRK" title="Portfolio greeks" className="col-span-6 row-span-3">
        <div className="grid grid-cols-4 gap-2 p-3">
          {[
            { l: "DELTA", v: g.delta / 1000, u: "k" },
            { l: "GAMMA", v: g.gamma, u: "" },
            { l: "VEGA",  v: g.vega, u: "" },
            { l: "THETA", v: g.theta, u: "" },
          ].map((x) => {
            const dir: "up" | "down" = x.v >= 0 ? "up" : "down";
            const norm = Math.min(1, Math.abs(x.v) / (x.l === "DELTA" ? 5 : 500));
            return (
              <div key={x.l} className="flex flex-col items-center border border-divider bg-raised p-2">
                <ArcGauge value={norm} dir={dir} size={90} label={x.l} />
                <div className="mono-caps mt-1 font-mono text-[11px] text-foreground">{x.v >= 0 ? "+" : ""}{fmt(x.v, x.l === "GAMMA" ? 2 : 1)}{x.u}</div>
              </div>
            );
          })}
        </div>
        <div className="mono-caps border-t border-divider px-3 py-2 text-[9px] text-muted-foreground">
          Aggregate across {book.positions.filter(p => p.cls === "OPTION").length} option position{book.positions.filter(p => p.cls === "OPTION").length === 1 ? "" : "s"} · dollar delta shown per 1pt underlier.
        </div>
      </Panel>

      {/* Contribution treemap */}
      <Panel code="CTR" title="VaR contribution" className="col-span-8 row-span-3">
        <ContribTreemap items={contribs} />
      </Panel>

      {/* Alerts */}
      <Panel code="ALT" title="Concentration & alerts" className="col-span-4 row-span-3">
        <div className="space-y-2 p-3 text-[11px]">
          <AlertRow tone={topPct > 0.4 ? "warn" : "ok"} label={`${topSector?.[0] ?? "—"} · ${(topPct*100).toFixed(0)}% of gross`} sub={topPct > 0.4 ? "Concentration above 40% threshold" : "Within concentration budget"} />
          <AlertRow tone={Math.abs(g.delta) > 5000 ? "warn" : "ok"} label={`Net delta ${g.delta >= 0 ? "+" : ""}${fmt(g.delta,0)}`} sub={Math.abs(g.delta) > 5000 ? "High directional bias" : "Delta within neutral band"} />
          <AlertRow tone={varDollar > VAR_LIMIT * 0.8 ? "warn" : "ok"} label={`VaR utilisation ${((varDollar/VAR_LIMIT)*100).toFixed(0)}%`} sub="Limit $500k · 95% confidence" />
          <AlertRow tone={book.positions.some(p => p.cls === "COMMODITY" && p.symbol === "NG") ? "info" : "ok"} label="NG position active" sub="Short exposure — hedges natgas spike risk" />
        </div>
      </Panel>
    </div>
  );
}

function AlertRow({ tone, label, sub }: { tone: "ok" | "warn" | "info"; label: string; sub: string }) {
  const c = tone === "warn" ? "text-primary border-primary/50" : tone === "info" ? "text-info border-info/40" : "text-up border-up/40";
  const dot = tone === "warn" ? "bg-primary" : tone === "info" ? "bg-info" : "bg-up";
  return (
    <div className={`border-l-2 bg-raised px-2 py-1.5 ${c}`}>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="mono-caps text-[10px] text-foreground">{label}</span>
      </div>
      <div className="mono-caps mt-0.5 text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function ContribTreemap({ items }: { items: ReturnType<typeof riskContributions> }) {
  const [isolated, setIsolated] = useState<string | null>(null);
  const total = items.reduce((a, b) => a + b.contribPct, 0);
  // Simple slice-and-dice layout
  const rows: { items: typeof items; sum: number }[] = [];
  let cur: typeof items = [];
  let cursum = 0;
  const target = total / 3;
  for (const it of items) {
    cur.push(it); cursum += it.contribPct;
    if (cursum >= target && rows.length < 2) {
      rows.push({ items: cur, sum: cursum }); cur = []; cursum = 0;
    }
  }
  if (cur.length) rows.push({ items: cur, sum: cursum });
  const heights = rows.map((r) => (r.sum / total) * 100);

  return (
    <div className="flex h-full flex-col p-2">
      <div className="flex-1 flex flex-col gap-1">
        {rows.map((row, ri) => (
          <div key={ri} className="flex flex-1 gap-1" style={{ height: `${heights[ri]}%` }}>
            {row.items.map((it) => {
              const wPct = (it.contribPct / row.sum) * 100;
              const t = Math.min(1, it.contribPct * 5);
              const active = isolated === it.pos.id;
              const dim = isolated && !active;
              return (
                <button
                  key={it.pos.id}
                  onClick={() => setIsolated(active ? null : it.pos.id)}
                  className="relative overflow-hidden border border-background text-left transition"
                  style={{ width: `${wPct}%`, background: viridis(t), opacity: dim ? 0.25 : 1 }}
                  title={`${it.pos.symbol} · ${(it.contribPct*100).toFixed(1)}% of risk · $${fmt(it.dollar,0)}`}
                >
                  <div className="absolute inset-0 p-1.5">
                    <div className="mono-caps text-[10px] text-black/80 font-bold">{it.pos.symbol}</div>
                    <div className="font-mono text-[10px] text-black/70">{(it.contribPct*100).toFixed(1)}%</div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {isolated && (
        <div className="mono-caps mt-2 border-t border-divider pt-2 text-[9px] text-muted-foreground">
          ISOLATED · {items.find(x => x.pos.id === isolated)?.pos.name} · click again to reset
        </div>
      )}
    </div>
  );
}

// ══════ EXPOSURE ══════════════════════════════════════════════════════
function ExposureTab({ book }: { book: Book }) {
  const gross = book.gross, net = book.net, long = book.long, short = -book.short;
  const byClass = new Map<string, { long: number; short: number }>();
  const bySector = new Map<string, { long: number; short: number }>();
  for (const p of book.positions) {
    const a = byClass.get(p.cls) ?? { long: 0, short: 0 };
    if (p.mv >= 0) a.long += p.mv; else a.short += p.mv;
    byClass.set(p.cls, a);
    const s = bySector.get(p.sector ?? "Other") ?? { long: 0, short: 0 };
    if (p.mv >= 0) s.long += p.mv; else s.short += p.mv;
    bySector.set(p.sector ?? "Other", s);
  }

  return (
    <div className="grid h-full grid-cols-12 grid-rows-6 gap-2">
      <Panel code="EXP" title="Gross / net / long / short" className="col-span-4 row-span-2">
        <div className="space-y-3 p-3">
          <StatRow label="GROSS" value={`$${(gross/1e6).toFixed(2)}M`} />
          <StatRow label="NET" value={`${net>=0?"+":"-"}$${(Math.abs(net)/1e6).toFixed(2)}M`} tone={net>=0?"up":"down"} />
          <StatRow label="LONG" value={`+$${(long/1e6).toFixed(2)}M`} tone="up" />
          <StatRow label="SHORT" value={`−$${(short/1e6).toFixed(2)}M`} tone="down" />
          <StatRow label="LEVERAGE" value={`${(gross/book.nav).toFixed(2)}×`} />
        </div>
      </Panel>

      <Panel code="CLS" title="By asset class" className="col-span-4 row-span-2">
        <DivergingBars rows={[...byClass.entries()].map(([k, v]) => ({ label: k, long: v.long, short: v.short }))} />
      </Panel>

      <Panel code="SEC" title="By sector" className="col-span-4 row-span-2">
        <DivergingBars rows={[...bySector.entries()].map(([k, v]) => ({ label: k, long: v.long, short: v.short }))} />
      </Panel>

      <Panel code="FAC" title="Factor exposures · z-score" className="col-span-4 row-span-4">
        <FactorPanel book={book} />
      </Panel>

      <Panel code="TVL" title="Trade volumes · 30D turnover" className="col-span-4 row-span-4">
        <TradeVolumesPanel />
      </Panel>

      <Panel code="COM" title="Commodities · futures curves" className="col-span-4 row-span-4">
        <CommoditiesPanel />
      </Panel>
    </div>
  );
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const c = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground";
  return (
    <div className="flex items-baseline justify-between border-b border-divider py-1">
      <span className="mono-caps text-[10px] text-faint">{label}</span>
      <span className={`font-mono text-lg ${c}`}>{value}</span>
    </div>
  );
}

function DivergingBars({ rows }: { rows: { label: string; long: number; short: number }[] }) {
  const max = Math.max(...rows.map((r) => Math.max(r.long, Math.abs(r.short))), 1);
  return (
    <div className="space-y-2 p-3">
      {rows.map((r) => {
        const lp = (r.long / max) * 50;
        const sp = (Math.abs(r.short) / max) * 50;
        return (
          <div key={r.label} className="grid grid-cols-[70px_1fr] items-center gap-2">
            <span className="mono-caps text-[9px] text-foreground truncate" title={r.label}>{r.label}</span>
            <div className="relative h-4 bg-background">
              <div className="absolute left-1/2 top-0 h-full w-px bg-divider" />
              <div className="absolute right-1/2 top-0 h-full bg-down/70" style={{ width: `${sp}%`, transition: "width 600ms cubic-bezier(0.16,1,0.3,1)" }} />
              <div className="absolute left-1/2 top-0 h-full bg-up/70" style={{ width: `${lp}%`, transition: "width 600ms cubic-bezier(0.16,1,0.3,1)" }} />
            </div>
          </div>
        );
      })}
      <div className="mono-caps mt-2 flex justify-between text-[8px] text-faint"><span>SHORT</span><span>LONG</span></div>
    </div>
  );
}

function FactorPanel({ book }: { book: Book }) {
  const eqs = book.positions.filter((p) => p.cls === "EQUITY");
  const totalGross = eqs.reduce((a, b) => a + b.gross, 0) || 1;
  const wBeta = eqs.reduce((a, b) => a + (b.beta ?? 1) * (b.mv / totalGross), 0);
  // Fake plausible tilts
  const factors = [
    { name: "BETA",     z: (wBeta - 1) * 2.5 },
    { name: "MOMENTUM", z: 1.2 },
    { name: "VALUE",    z: -0.7 },
    { name: "SIZE",     z: 0.4 },
    { name: "QUALITY",  z: 0.9 },
    { name: "LOW VOL",  z: -1.1 },
  ];
  return (
    <div className="space-y-3 p-3">
      {factors.map((f) => {
        const clamped = Math.max(-3, Math.min(3, f.z));
        const pct = ((clamped + 3) / 6) * 100;
        return (
          <div key={f.name}>
            <div className="mono-caps flex justify-between text-[9px] text-faint"><span>{f.name}</span><span className={f.z >= 0 ? "text-up" : "text-down"}>{f.z >= 0 ? "+" : ""}{f.z.toFixed(2)}σ</span></div>
            <div className="relative mt-1 h-2 bg-background">
              <div className="absolute left-1/2 top-0 h-full w-px bg-divider" />
              <div className="absolute top-0 h-full w-[3px] bg-primary" style={{ left: `${pct}%`, transform: "translateX(-50%)", transition: "left 600ms cubic-bezier(0.16,1,0.3,1)" }} />
            </div>
            <div className="mono-caps flex justify-between text-[8px] text-faint"><span>−3</span><span>0</span><span>+3</span></div>
          </div>
        );
      })}
    </div>
  );
}

function TradeVolumesPanel() {
  const days = useMemo(() => tradeVolumes(30), []);
  const trades = useMemo(() => largestTrades(), []);
  const max = Math.max(...days.map((d) => d.turnover));
  return (
    <div className="flex h-full flex-col">
      <div className="p-3 pb-2">
        <div className="mono-caps mb-1 text-[9px] text-faint">DAILY TURNOVER · LAST 30 SESSIONS</div>
        <svg viewBox="0 0 400 90" className="h-24 w-full">
          {days.map((d, i) => {
            const bh = (d.turnover / max) * 80;
            const x = (i / days.length) * 400;
            const w = 400 / days.length - 1;
            return <rect key={i} x={x} y={85 - bh} width={w} height={bh} fill="#F0A929" opacity={i === days.length - 1 ? 1 : 0.55} />;
          })}
          <line x1={0} y1={85} x2={400} y2={85} stroke="#171B1F" />
        </svg>
        <div className="mono-caps mt-1 flex justify-between text-[8px] text-faint">
          <span>${(days[0].turnover/1e6).toFixed(2)}M</span>
          <span>TODAY ${(days[days.length-1].turnover/1e6).toFixed(2)}M</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto border-t border-divider">
        <div className="mono-caps sticky top-0 grid grid-cols-[60px_60px_50px_1fr_90px] gap-2 border-b border-divider bg-panel px-3 py-1.5 text-[9px] text-faint">
          <span>TIME</span><span>SYM</span><span>SIDE</span><span className="text-right">QTY</span><span className="text-right">NOTIONAL</span>
        </div>
        {trades.map((t, i) => (
          <div key={i} className="grid grid-cols-[60px_60px_50px_1fr_90px] gap-2 border-b border-divider/60 px-3 py-1 font-mono text-[10px] tabular-nums">
            <span className="text-faint">{t.time}</span>
            <span className="text-primary">{t.sym}</span>
            <span className={t.side === "BUY" ? "text-up" : "text-down"}>{t.side}</span>
            <span className="text-right text-foreground">{t.qty.toLocaleString()}</span>
            <span className="text-right text-foreground">${(t.notional/1000).toFixed(0)}k</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommoditiesPanel() {
  const list = Object.values(COMMODITIES);
  const [sym, setSym] = useState<string>("CL");
  const curve = useMemo(() => futuresCurve(sym), [sym]);
  const cfg = COMMODITIES[sym];
  const min = Math.min(...curve.map((c) => c.price));
  const max = Math.max(...curve.map((c) => c.price));
  const shape = cfg.curveShape;
  const insight = shape === "contango" ? `${sym} in CONTANGO — future months trade above spot; carry cost / storage / weak near-term demand.` :
                  shape === "backwardation" ? `${sym} in BACKWARDATION — near-term supply tightness, longs earn positive roll yield.` :
                  `${sym} curve is FLAT — no dominant carry or squeeze signal.`;
  return (
    <div className="flex h-full flex-col p-3">
      <div className="mono-caps mb-2 flex flex-wrap gap-1 text-[9px]">
        {list.map((c) => (
          <button key={c.symbol} onClick={() => setSym(c.symbol)} className={`interactive border px-2 py-0.5 ${sym === c.symbol ? "border-primary text-primary bg-primary/10" : "border-border text-faint hover:text-foreground"}`}>{c.symbol}</button>
        ))}
      </div>
      <div className="mono-caps flex items-baseline justify-between text-[10px]">
        <span className="text-foreground">{cfg.name}</span>
        <span className="font-mono text-primary">${fmt(cfg.spot, 2)} spot</span>
      </div>
      <svg viewBox="0 0 400 140" className="mt-2 h-32 w-full" preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <line key={i} x1={0} y1={t * 120 + 10} x2={400} y2={t * 120 + 10} stroke="#171B1F" />
        ))}
        <polyline
          points={curve.map((c, i) => {
            const x = (i / (curve.length - 1)) * 380 + 10;
            const y = 130 - ((c.price - min) / (max - min || 1)) * 120;
            return `${x},${y}`;
          }).join(" ")}
          fill="none" stroke="#F0A929" strokeWidth={1.5}
        />
        {curve.map((c, i) => {
          const x = (i / (curve.length - 1)) * 380 + 10;
          const y = 130 - ((c.price - min) / (max - min || 1)) * 120;
          return <circle key={i} cx={x} cy={y} r={i === 0 ? 3 : 2} fill={i === 0 ? "#F0A929" : "#636C74"} />;
        })}
      </svg>
      <div className="mono-caps mt-1 grid grid-cols-6 gap-1 text-[8px] text-faint">
        {curve.slice(0, 6).map((c) => <span key={c.label} className="text-center">{c.label}</span>)}
      </div>
      <div className="mono-caps mt-3 border-t border-divider pt-2 text-[10px] text-muted-foreground">{insight}</div>
    </div>
  );
}

// ══════ STRESS LAB ═════════════════════════════════════════════════════
function StressTab({ book }: { book: Book }) {
  const [scenario, setScenario] = useState<string>("CRISIS08");
  const [custom, setCustom] = useState({ equityPct: -0.10, ratesBp: 0, oilPct: 0, volMult: 1.5 });
  const isCustom = scenario === "CUSTOM";
  const shock = isCustom ? { equityPct: custom.equityPct, ratesBp: custom.ratesBp, oilPct: custom.oilPct, volMult: custom.volMult } : SCENARIOS[scenario].shock;
  const res = useMemo(() => stress(book, shock), [book, shock]);
  const baseVar = useMemo(() => var1d(book, "HISTORICAL", 0.99), [book]);
  const stressedVar = baseVar.var + Math.abs(res.total) * 0.2;
  const dd = useCountUp(Math.abs(res.total));
  const sortedByLoss = [...res.byPos].sort((a, b) => a.pnl - b.pnl);

  return (
    <div className="grid h-full grid-cols-12 grid-rows-6 gap-2">
      <Panel code="SCN" title="Scenario" className="col-span-3 row-span-6">
        <div className="flex h-full flex-col p-3">
          <div className="mono-caps mb-2 text-[9px] text-faint">PRESET</div>
          <div className="space-y-1">
            {Object.entries(SCENARIOS).map(([k, v]) => (
              <button key={k} onClick={() => setScenario(k)} className={`interactive w-full border px-2 py-2 text-left mono-caps text-[10px] ${scenario === k ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:border-primary/50"}`}>{v.label}</button>
            ))}
            <button onClick={() => setScenario("CUSTOM")} className={`interactive w-full border px-2 py-2 text-left mono-caps text-[10px] ${scenario === "CUSTOM" ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:border-primary/50"}`}>CUSTOM SLIDERS</button>
          </div>
          {isCustom && (
            <div className="mt-4 space-y-3 border-t border-divider pt-3">
              <Slider label="EQUITY SHOCK" value={custom.equityPct*100} min={-40} max={40} step={1} fmt={(v)=>`${v>=0?"+":""}${v.toFixed(0)}%`} onChange={(v) => setCustom({...custom, equityPct: v/100})} />
              <Slider label="RATES Δ (BP)" value={custom.ratesBp} min={-200} max={200} step={5} fmt={(v)=>`${v>=0?"+":""}${v.toFixed(0)}bp`} onChange={(v) => setCustom({...custom, ratesBp: v})} />
              <Slider label="OIL SHOCK" value={custom.oilPct*100} min={-50} max={50} step={1} fmt={(v)=>`${v>=0?"+":""}${v.toFixed(0)}%`} onChange={(v) => setCustom({...custom, oilPct: v/100})} />
              <Slider label="VOL MULT" value={custom.volMult} min={0.5} max={5} step={0.1} fmt={(v)=>`${v.toFixed(1)}×`} onChange={(v) => setCustom({...custom, volMult: v})} />
            </div>
          )}
        </div>
      </Panel>

      <Panel code="DD" title="Estimated drawdown" className="col-span-5 row-span-2">
        <div className="flex h-full flex-col items-center justify-center p-3">
          <div className="mono-caps text-[10px] text-faint">PORTFOLIO IMPACT</div>
          <div className={`font-mono text-6xl ${res.total >= 0 ? "text-up" : "text-down"}`}>{res.total >= 0 ? "+" : "−"}${fmt(dd, 0)}</div>
          <div className="mono-caps mt-1 text-[10px] text-muted-foreground">{((res.total/book.nav)*100).toFixed(2)}% OF NAV · POST-SHOCK NAV ${((book.nav+res.total)/1e6).toFixed(2)}M</div>
        </div>
      </Panel>

      <Panel code="VAR" title="VaR: before → after" className="col-span-4 row-span-2">
        <div className="flex h-full items-center justify-around p-3">
          <div className="text-center">
            <div className="mono-caps text-[9px] text-faint">CURRENT 1D 99% VaR</div>
            <div className="mt-1 font-mono text-2xl text-foreground">−${fmt(baseVar.var, 0)}</div>
          </div>
          <div className="text-2xl text-primary">→</div>
          <div className="text-center">
            <div className="mono-caps text-[9px] text-faint">POST-STRESS VaR</div>
            <div className="mt-1 font-mono text-2xl text-down">−${fmt(stressedVar, 0)}</div>
            <div className="mono-caps mt-1 text-[9px] text-primary">+{((stressedVar/baseVar.var - 1)*100).toFixed(0)}%</div>
          </div>
        </div>
      </Panel>

      <Panel code="WF" title="P&L waterfall by position" className="col-span-9 row-span-4">
        <PnlWaterfall rows={sortedByLoss} />
      </Panel>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <div>
      <div className="mono-caps flex justify-between text-[9px] text-faint"><span>{label}</span><span className="text-primary">{fmt(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </div>
  );
}

function PnlWaterfall({ rows }: { rows: { pos: Position; pnl: number }[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  return (
    <div className="h-full overflow-y-auto p-3">
      {rows.map((r) => {
        const pct = (Math.abs(r.pnl) / max) * 45;
        const isNeg = r.pnl < 0;
        return (
          <div key={r.pos.id} className="grid grid-cols-[110px_1fr_90px] items-center gap-2 border-b border-divider/60 py-1">
            <span className="mono-caps truncate text-[10px] text-foreground" title={r.pos.symbol}>{r.pos.symbol}</span>
            <div className="relative h-4 bg-background">
              <div className="absolute left-1/2 top-0 h-full w-px bg-divider" />
              {isNeg ? (
                <div className="absolute right-1/2 top-0 h-full bg-down/80" style={{ width: `${pct}%`, transition: "width 500ms cubic-bezier(0.16,1,0.3,1)" }} />
              ) : (
                <div className="absolute left-1/2 top-0 h-full bg-up/80" style={{ width: `${pct}%`, transition: "width 500ms cubic-bezier(0.16,1,0.3,1)" }} />
              )}
            </div>
            <span className={`text-right font-mono text-[10px] tabular-nums ${isNeg ? "text-down" : "text-up"}`}>{isNeg ? "−" : "+"}${fmt(Math.abs(r.pnl), 0)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ══════ HEDGE ═════════════════════════════════════════════════════════
function HedgeTab({ book }: { book: Book }) {
  const baseVar = useMemo(() => var1d(book, "HISTORICAL", 0.95), [book]);
  const g = netGreeks(book);
  const [active, setActive] = useState<Set<string>>(new Set(activeHedges()));

  const suggestions = useMemo(() => {
    const list: {
      id: string; title: string; note: string; cost: number;
      varAfter: number; positions: Position[];
    }[] = [];
    // Short ES futures
    const eqExposure = book.positions.filter((p) => p.cls === "EQUITY").reduce((a, b) => a + b.mv, 0);
    if (eqExposure > 500_000) {
      const qty = -Math.round(eqExposure / (5500 * 50));
      list.push({
        id: "SHORT-ES",
        title: `Short ${Math.abs(qty)} ES futures`,
        note: "Broad equity beta hedge — cuts systematic exposure without touching cash equities.",
        cost: 0,
        varAfter: baseVar.var * 0.69,
        positions: [{
          id: "HDG-ES", cls: "COMMODITY", symbol: "ES", name: "E-mini S&P 500 future",
          qty, entry: 5500, mark: 5500, pnl: 0, mv: qty * 5500 * 50, gross: Math.abs(qty * 5500 * 50),
          sector: "Hedge", beta: 1.0, vol: 0.14,
        }],
      });
    }
    // SPY put wing
    list.push({
      id: "SPY-PUT",
      title: "SPY 590P × 10 (30D)",
      note: "Caps tail loss at −$8.2k · convex protection against gap-down events.",
      cost: 4200,
      varAfter: baseVar.var * 0.82,
      positions: [{
        id: "HDG-SPY-P", cls: "OPTION", symbol: "SPY P590 30D", name: "SPY $590 Put · 30D",
        qty: 10, entry: 4.20, mark: 4.20, pnl: 0, mv: 10 * 4.20 * 100, gross: 10 * 4.20 * 100,
        sector: "Options", beta: 1.0, vol: 0.16,
        optType: "P", strike: 590, daysToExpiry: 30,
        delta: -350, gamma: 45, vega: 120, theta: -35,
      }],
    });
    // Gold long
    list.push({
      id: "GOLD-LONG",
      title: "Long 4 GC futures",
      note: "Diversifier — gold historically bid in risk-off + rate-cut regimes.",
      cost: 0,
      varAfter: baseVar.var * 0.94,
      positions: [{
        id: "HDG-GC", cls: "COMMODITY", symbol: "GC", name: "Gold future (hedge)",
        qty: 4, entry: 2680, mark: 2680, pnl: 0, mv: 4 * 2680 * 100, gross: 4 * 2680 * 100,
        sector: "Precious", beta: 0.1, vol: 0.16,
      }],
    });
    // Delta neutralize
    if (Math.abs(g.delta) > 2000) {
      const dir = g.delta > 0 ? "SHORT" : "LONG";
      const qty = Math.round(Math.abs(g.delta) / 500) * (g.delta > 0 ? -1 : 1);
      list.push({
        id: "DELTA-NEUTRAL",
        title: `${dir} ${Math.abs(qty)} SPY shares`,
        note: `Zeros net delta (currently ${g.delta >= 0 ? "+" : ""}${fmt(g.delta,0)}) · isolates alpha from market direction.`,
        cost: 0,
        varAfter: baseVar.var * 0.88,
        positions: [{
          id: "HDG-DELTA", cls: "EQUITY", symbol: "SPY", name: "SPY (delta hedge)",
          qty, entry: 612, mark: 612, pnl: 0, mv: qty * 612, gross: Math.abs(qty * 612),
          sector: "Broad", beta: 1.0, vol: 0.12,
        }],
      });
    }
    return list;
  }, [book, baseVar.var, g.delta]);

  function toggleApply(s: typeof suggestions[number]) {
    if (active.has(s.id)) {
      removeHedge(s.id);
      setActive(new Set(activeHedges()));
      toast(`Removed hedge · ${s.title}`);
    } else {
      applyHedge(s.id, s.positions);
      setActive(new Set(activeHedges()));
      toast.success(`Applied · ${s.title}`);
    }
  }
  function reset() {
    resetBook();
    setActive(new Set());
    toast("Book reset to base positions");
  }

  return (
    <div className="grid h-full grid-cols-12 gap-2">
      <Panel code="HDG" title={`Suggested hedges · ${suggestions.length}`} className="col-span-9">
        <div className="space-y-2 p-3">
          {suggestions.map((s) => {
            const isOn = active.has(s.id);
            const reduction = ((baseVar.var - s.varAfter) / baseVar.var) * 100;
            return (
              <div key={s.id} className={`grid grid-cols-[1fr_auto] items-center gap-4 border px-3 py-3 ${isOn ? "border-primary bg-primary/5" : "border-divider bg-raised"}`}>
                <div>
                  <div className="mono-caps text-[11px] text-foreground">{s.title}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{s.note}</div>
                  <div className="mono-caps mt-2 flex gap-4 text-[9px] text-faint">
                    <span>COST <span className="text-foreground">${fmt(s.cost, 0)}</span></span>
                    <span>VAR AFTER <span className="text-down">−${fmt(s.varAfter, 0)}</span></span>
                    <span>REDUCTION <span className="text-up">−{reduction.toFixed(0)}%</span></span>
                  </div>
                </div>
                <button onClick={() => toggleApply(s)} className={`mono-caps interactive border px-4 py-2 text-[10px] ${isOn ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary hover:bg-primary/10"}`}>
                  {isOn ? "REMOVE" : "APPLY"}
                </button>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel code="LIVE" title="Live book state" className="col-span-3">
        <div className="space-y-3 p-3">
          <div>
            <div className="mono-caps text-[9px] text-faint">VaR 95% · LIVE</div>
            <div className="font-mono text-2xl text-down">−${fmt(baseVar.var, 0)}</div>
          </div>
          <div>
            <div className="mono-caps text-[9px] text-faint">NET DELTA</div>
            <div className={`font-mono text-xl ${g.delta >= 0 ? "text-up" : "text-down"}`}>{g.delta >= 0 ? "+" : ""}{fmt(g.delta, 0)}</div>
          </div>
          <div>
            <div className="mono-caps text-[9px] text-faint">ACTIVE HEDGES</div>
            <div className="mt-1 space-y-1">
              {active.size === 0 && <div className="mono-caps text-[9px] text-faint">— none —</div>}
              {[...active].map((id) => <div key={id} className="mono-caps text-[10px] text-primary">✓ {id}</div>)}
            </div>
          </div>
          <button onClick={reset} className="mono-caps interactive w-full border border-border px-2 py-2 text-[10px] text-muted-foreground hover:border-primary hover:text-primary">RESET BOOK</button>
        </div>
      </Panel>
    </div>
  );
}

