import { useEffect, useMemo, useState } from "react";
import { runBacktest, type BacktestResult } from "@/lib/backtest";
import { TEMPLATES, listStrategies, type Strategy } from "@/lib/strategies";
import { TICKERS, fmt, viridis } from "@/lib/market";
import { toast } from "sonner";

function useCountUp(target: number, duration = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let start: number | null = null; let raf = 0;
    function step(ts: number) {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      setV(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

const MONTHS = ["J","F","M","A","M","J","J","A","S","O","N","D"];

export function BTPanel({ activeSymbol, preloadStrategy }: { activeSymbol: string; preloadStrategy?: Strategy }) {
  const saved = listStrategies();
  const allStrats = [...TEMPLATES, ...saved];
  const [stratId, setStratId] = useState<string>(preloadStrategy?.id ?? TEMPLATES[0].id);
  const [ticker, setTicker] = useState(activeSymbol);
  const [years, setYears] = useState<1 | 3 | 5>(3);
  const [showOOS, setShowOOS] = useState(true);
  const [runId, setRunId] = useState(0);
  const [running, setRunning] = useState(false);
  const [_phase, setPhase] = useState<"idle" | "loading" | "exec" | "compute" | "done">("done");
  const [lines, setLines] = useState<string[]>([]);
  void _phase;
  const strat = allStrats.find((s) => s.id === stratId) ?? TEMPLATES[0];

  const result = useMemo(() => runBacktest(strat, ticker, years), [strat, ticker, years, runId]);

  function run() {
    setRunning(true);
    setPhase("loading");
    setLines([`Loading ${years * 252} sessions of ${ticker}…`]);
    setTimeout(() => {
      setPhase("exec");
      setLines((L) => [...L, `Executing ${result.trades.length} trades…`]);
    }, 380);
    setTimeout(() => {
      setPhase("compute");
      setLines((L) => [...L, "Computing risk-adjusted stats…"]);
    }, 760);
    setTimeout(() => {
      setRunId((n) => n + 1);
      setPhase("done");
      setRunning(false);
      setLines((L) => [...L, `Done · ${result.trades.length} trades.`]);
      toast.success(`Backtest complete · Sharpe ${result.stats.sharpe.toFixed(2)}`);
    }, 1160);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Toolbar
        strategyId={stratId} strategies={allStrats} onStrategy={setStratId}
        ticker={ticker} onTicker={setTicker}
        years={years} onYears={setYears}
        showOOS={showOOS} onOOS={setShowOOS}
        running={running} onRun={run}
      />
      {running && (
        <div className="mono-caps border-b border-primary/40 bg-primary/5 px-3 py-2 text-[10px]">
          {lines.map((l, i) => (
            <div key={i} className="text-primary" style={{ animation: "fade-in 220ms ease-out both", opacity: 0.9 }}>
              <span className="text-faint">›</span> {l}
            </div>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12"><EquityChart key={runId} r={result} showOOS={showOOS} /></div>
          <div className="col-span-12"><UnderwaterChart r={result} showOOS={showOOS} /></div>
          <div className="col-span-12"><PriceWithTrades r={result} /></div>
          <div className="col-span-7"><StatsGrid r={result} showOOS={showOOS} runId={runId} /></div>
          <div className="col-span-5"><MonthlyHeatmap r={result} /></div>
        </div>
        <div className="mono-caps mt-4 border-l-2 border-primary bg-primary/5 px-3 py-2 text-[11px] text-foreground" style={{ animation: `fade-in 400ms ease-out both`, animationDelay: "300ms" }} key={runId}>
          <span className="text-primary">VERDICT · </span>{verdict(result)}
        </div>
      </div>
    </div>
  );
}


function verdict(r: BacktestResult) {
  const is = r.stats.sharpe;
  const oos = r.oosStats.sharpe;
  const decay = oos < is * 0.6;
  const beats = r.equity[r.equity.length - 1] > r.benchmark[r.benchmark.length - 1];
  const parts = [];
  parts.push(beats ? "Beats buy-hold on total return." : "Underperforms buy-hold on total return.");
  parts.push(`IS Sharpe ${is.toFixed(2)} → OOS Sharpe ${oos.toFixed(2)}${decay ? " — edge decays out-of-sample, likely overfit." : " — edge holds out-of-sample."}`);
  if (Math.abs(r.stats.maxDD) > 0.30) parts.push(`Deep drawdowns (${(r.stats.maxDD*100).toFixed(0)}%) — sizing / stops need review.`);
  return parts.join(" ");
}

function Toolbar({ strategyId, strategies, onStrategy, ticker, onTicker, years, onYears, showOOS, onOOS, running, onRun }: {
  strategyId: string; strategies: Strategy[]; onStrategy: (id: string) => void;
  ticker: string; onTicker: (s: string) => void;
  years: 1 | 3 | 5; onYears: (y: 1 | 3 | 5) => void;
  showOOS: boolean; onOOS: (b: boolean) => void;
  running: boolean; onRun: () => void;
}) {
  return (
    <div className="mono-caps flex flex-wrap items-center gap-2 border-b border-divider bg-panel px-3 py-2 text-[10px]">
      <span className="text-faint">STRATEGY</span>
      <select value={strategyId} onChange={(e) => onStrategy(e.target.value)} className="interactive border border-border bg-background px-2 py-1 text-[10px] text-foreground">
        {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <span className="ml-2 text-faint">TICKER</span>
      <select value={ticker} onChange={(e) => onTicker(e.target.value)} className="interactive border border-border bg-background px-2 py-1 text-[10px] text-foreground">
        {TICKERS.filter((t) => t !== "BTC-USD").map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <span className="ml-2 text-faint">PERIOD</span>
      <div className="flex gap-0.5">
        {([1,3,5] as const).map((y) => (
          <button key={y} onClick={() => onYears(y)} className={`interactive border px-2 py-1 ${years === y ? "border-primary text-primary bg-primary/10" : "border-border text-faint hover:text-foreground"}`}>{y}Y</button>
        ))}
      </div>
      <button onClick={() => onOOS(!showOOS)} className={`interactive ml-2 border px-2 py-1 ${showOOS ? "border-info text-info" : "border-border text-faint hover:text-foreground"}`}>WALK-FWD 70/30</button>
      <button onClick={onRun} disabled={running} className="mono-caps interactive ml-auto border border-primary bg-primary/10 px-4 py-1 text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-40">
        {running ? "RUNNING…" : "RUN ▶"}
      </button>
    </div>
  );
}

function EquityChart({ r, showOOS }: { r: BacktestResult; showOOS: boolean }) {
  const n = r.equity.length;
  const max = Math.max(...r.equity, ...r.benchmark);
  const min = Math.min(...r.equity, ...r.benchmark);
  const s = (v: number, i: number) => {
    const x = (i / (n - 1)) * 1000;
    const y = 140 - ((v - min) / (max - min || 1)) * 130 - 5;
    return `${x},${y}`;
  };
  const oosX = showOOS ? (r.oosStartIdx / (n - 1)) * 1000 : 0;
  const stratPts = r.equity.map((v, i) => s(v, i)).join(" ");
  const benchPts = r.benchmark.map((v, i) => s(v, i)).join(" ");
  return (
    <div className="border border-divider bg-panel">
      <div className="mono-caps flex items-center justify-between border-b border-divider px-3 py-1.5 text-[10px]">
        <span className="text-primary">EQUITY CURVE · {r.ticker} · {r.strategy}</span>
        <span className="flex gap-3 text-[9px]">
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-primary" />STRATEGY</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-muted-foreground" />BUY & HOLD</span>
          {showOOS && <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 bg-info/20" />OOS</span>}
        </span>
      </div>
      <svg viewBox="0 0 1000 140" className="h-40 w-full" preserveAspectRatio="none">
        {showOOS && <rect x={oosX} y={0} width={1000 - oosX} height={140} fill="#45B9D3" opacity={0.08} />}
        <polyline points={benchPts} fill="none" stroke="#636C74" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <polyline points={stratPts} fill="none" stroke="#F0A929" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
          style={{ strokeDasharray: 4000, strokeDashoffset: 0, animation: "draw-bt 800ms cubic-bezier(0.16,1,0.3,1) both" }} />
        <line x1={0} y1={140 - ((1 - min)/(max-min||1))*130 - 5} x2={1000} y2={140 - ((1 - min)/(max-min||1))*130 - 5} stroke="#171B1F" strokeDasharray="2 3" />
        <style>{`@keyframes draw-bt { from { stroke-dashoffset: 4000 } to { stroke-dashoffset: 0 } }`}</style>
      </svg>
    </div>
  );
}

function UnderwaterChart({ r, showOOS }: { r: BacktestResult; showOOS: boolean }) {
  const n = r.drawdown.length;
  const min = Math.min(...r.drawdown, -0.01);
  const s = (v: number, i: number) => {
    const x = (i / (n - 1)) * 1000;
    const y = ((v - 0) / (min || -0.01)) * 55;
    return `${x},${y}`;
  };
  const pts = `0,0 ${r.drawdown.map((v, i) => s(v, i)).join(" ")} 1000,0`;
  const oosX = showOOS ? (r.oosStartIdx / (n - 1)) * 1000 : 0;
  return (
    <div className="border border-divider bg-panel">
      <div className="mono-caps flex items-center justify-between border-b border-divider px-3 py-1.5 text-[10px]">
        <span className="text-primary">UNDERWATER · DRAWDOWN</span>
        <span className="text-down">MAX {(r.stats.maxDD * 100).toFixed(1)}%</span>
      </div>
      <svg viewBox="0 0 1000 60" className="h-14 w-full" preserveAspectRatio="none">
        {showOOS && <rect x={oosX} y={0} width={1000 - oosX} height={60} fill="#45B9D3" opacity={0.08} />}
        <polygon points={pts} fill="#F06464" opacity={0.35} />
      </svg>
    </div>
  );
}

function PriceWithTrades({ r }: { r: BacktestResult }) {
  const n = r.bars.length;
  const max = Math.max(...r.bars.map((b) => b.p));
  const min = Math.min(...r.bars.map((b) => b.p));
  const s = (v: number, i: number) => {
    const x = (i / (n - 1)) * 1000;
    const y = 100 - ((v - min) / (max - min || 1)) * 90 - 5;
    return { x, y };
  };
  const pts = r.bars.map((b, i) => { const p = s(b.p, i); return `${p.x},${p.y}`; }).join(" ");
  const tByT = new Map<number, number>();
  r.bars.forEach((b, i) => tByT.set(b.t, i));
  return (
    <div className="border border-divider bg-panel">
      <div className="mono-caps flex items-center justify-between border-b border-divider px-3 py-1.5 text-[10px]">
        <span className="text-primary">{r.ticker} · TRADE MARKERS</span>
        <span className="text-faint">{r.trades.length} TRADES</span>
      </div>
      <svg viewBox="0 0 1000 100" className="h-24 w-full" preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke="#E7EAEC" strokeWidth={0.8} vectorEffect="non-scaling-stroke" opacity={0.7} />
        {r.trades.map((t, i) => {
          const eI = tByT.get(t.entryT); const xI = tByT.get(t.exitT);
          if (eI === undefined || xI === undefined) return null;
          const e = s(t.entryPx, eI); const x = s(t.exitPx, xI);
          return (
            <g key={i}>
              <text x={e.x} y={e.y + 8} fontSize={7} fill="#42C98B" textAnchor="middle">▲</text>
              <text x={x.x} y={x.y - 3} fontSize={7} fill={t.win ? "#42C98B" : "#F06464"} textAnchor="middle">▼</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StatsGrid({ r, showOOS, runId }: { r: BacktestResult; showOOS: boolean; runId: number }) {
  const cells = [
    { l: "CAGR", v: r.stats.cagr * 100, fmt: (v: number) => `${v.toFixed(1)}%`, oos: r.oosStats.cagr * 100 },
    { l: "SHARPE", v: r.stats.sharpe, fmt: (v: number) => v.toFixed(2), oos: r.oosStats.sharpe },
    { l: "SORTINO", v: r.stats.sortino, fmt: (v: number) => v.toFixed(2), oos: r.oosStats.sortino },
    { l: "MAX DD", v: r.stats.maxDD * 100, fmt: (v: number) => `${v.toFixed(1)}%`, oos: r.oosStats.maxDD * 100 },
    { l: "WIN RATE", v: r.stats.winRate * 100, fmt: (v: number) => `${v.toFixed(0)}%`, oos: r.oosStats.winRate * 100 },
    { l: "PROFIT FACTOR", v: Math.min(9.99, r.stats.profitFactor), fmt: (v: number) => v.toFixed(2), oos: Math.min(9.99, r.oosStats.profitFactor) },
    { l: "TRADES", v: r.stats.trades, fmt: (v: number) => v.toFixed(0), oos: r.oosStats.trades },
    { l: "EXPOSURE", v: r.stats.exposure * 100, fmt: (v: number) => `${v.toFixed(0)}%`, oos: r.oosStats.exposure * 100 },
  ];
  return (
    <div className="border border-divider bg-panel">
      <div className="mono-caps flex items-center justify-between border-b border-divider px-3 py-1.5 text-[10px]">
        <span className="text-primary">STATISTICS</span>
        {showOOS && <span className="text-info">OOS SHOWN</span>}
      </div>
      <div className="grid grid-cols-4 gap-2 p-3">
        {cells.map((c) => (
          <StatCell key={c.l + runId} label={c.l} value={c.v} oos={showOOS ? c.oos : undefined} fmt={c.fmt} />
        ))}
      </div>
    </div>
  );
}
function StatCell({ label, value, oos, fmt }: { label: string; value: number; oos?: number; fmt: (v: number) => string }) {
  const v = useCountUp(value);
  const color = value < 0 || (label === "MAX DD" && value < 0) ? "text-down" : label === "SHARPE" || label === "SORTINO" ? (value > 1 ? "text-up" : "text-foreground") : "text-foreground";
  return (
    <div className="border border-divider bg-raised px-2 py-1.5">
      <div className="mono-caps text-[8px] text-faint">{label}</div>
      <div className={`font-mono text-lg tabular-nums ${color}`}>{fmt(v)}</div>
      {oos !== undefined && <div className="mono-caps text-[8px] text-info">OOS {fmt(oos)}</div>}
    </div>
  );
}

function MonthlyHeatmap({ r }: { r: BacktestResult }) {
  const years = Array.from(new Set(r.monthlyReturns.map((m) => m.year))).sort();
  const grid: Record<string, number> = {};
  r.monthlyReturns.forEach((m) => { grid[`${m.year}-${m.month}`] = m.ret; });
  const all = r.monthlyReturns.map((m) => m.ret);
  const absMax = Math.max(...all.map((v) => Math.abs(v)), 0.001);
  return (
    <div className="border border-divider bg-panel">
      <div className="mono-caps border-b border-divider px-3 py-1.5 text-[10px] text-primary">MONTHLY RETURNS</div>
      <div className="p-3">
        <div className="mono-caps grid text-[8px] text-faint" style={{ gridTemplateColumns: `28px repeat(12, 1fr)` }}>
          <span></span>
          {MONTHS.map((m, i) => <span key={i} className="text-center">{m}</span>)}
        </div>
        {years.map((y) => (
          <div key={y} className="grid" style={{ gridTemplateColumns: `28px repeat(12, 1fr)` }}>
            <span className="mono-caps text-[8px] text-faint self-center">{String(y).slice(-2)}</span>
            {MONTHS.map((_, mi) => {
              const v = grid[`${y}-${mi}`];
              const t = v !== undefined ? (v + absMax) / (2 * absMax) : NaN;
              const bg = isNaN(t) ? "#0B0C0D" : viridis(t);
              return (
                <div key={mi} title={v !== undefined ? `${y}-${mi+1} · ${(v*100).toFixed(2)}%` : "—"} className="m-[1px] h-4" style={{ background: bg }} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

